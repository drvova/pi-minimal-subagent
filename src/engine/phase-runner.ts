import type { AgentConfig } from "../agents/agents.ts";
import { matchAgentByDescription, selectAgent } from "../delegation/policy.ts";
import type { PhaseResult, WorkflowRun } from "../runs/types.ts";
import type { WorkflowDefinition, WorkflowTask } from "../workflows/types.ts";
import { appendRunEvent } from "../runs/persistence.ts";
import type { Settings } from "../settings/settings.ts";
import { now, spawnPiTask } from "./spawn.ts";

export async function runPhase(
  cwd: string,
  phase: WorkflowDefinition["phases"][number],
  agents: AgentConfig[],
  settings: Settings,
  run: WorkflowRun,
  signal?: AbortSignal,
  dryRun = false,
): Promise<PhaseResult> {
  const phaseResult = run.phaseResults.find((p) => p.phaseId === phase.id)!;
  phaseResult.status = "running";
  phaseResult.startedAt = now();

  appendRunEvent(cwd, run.id, {
    timestamp: now(), type: "phase_started", runId: run.id, phaseId: phase.id,
    message: `Phase "${phase.name}" started with ${phase.tasks.length} tasks`,
  });

  const concurrency = Math.max(1, phase.concurrency || 1);
  const tasks = [...phase.tasks];

  while (tasks.length > 0) {
    if (signal?.aborted) break;
    const batch = tasks.splice(0, concurrency);
    const batchPromises = batch.map(async (task) => {
      if (signal?.aborted) {
        const tr = phaseResult.taskResults.find((t) => t.taskId === task.id)!;
        tr.status = "aborted"; return tr;
      }
      if (dryRun) {
        const tr = phaseResult.taskResults.find((t) => t.taskId === task.id)!;
        tr.status = "completed"; tr.exitCode = 0; tr.completedAt = now();
        tr.response = `[DRY RUN] Would execute: agent=${task.agent}, task="${task.task}"`;
        return tr;
      }
      let agent = agents.find((a) => a.name === task.agent);
      if (!agent && task.agent === "auto") {
        const routed = settings.delegation?.agentRouting ? selectAgent(task.task, settings.delegation.agentRouting, agents) : null;
        agent = routed ?? matchAgentByDescription(task.task, agents);
      }
      if (!agent) {
        const tr = phaseResult.taskResults.find((t) => t.taskId === task.id)!;
        tr.status = "failed"; tr.errorMessage = `Agent "${task.agent}" not found`; tr.completedAt = now();
        appendRunEvent(cwd, run.id, {
          timestamp: now(), type: "task_failed", runId: run.id,
          phaseId: phase.id, taskId: task.id,
          message: `Agent "${task.agent}" not found`,
        });
        return tr;
      }
      appendRunEvent(cwd, run.id, {
        timestamp: now(), type: "task_started", runId: run.id,
        phaseId: phase.id, taskId: task.id,
      });
      const result = await spawnPiTask(cwd, task, agent, settings, signal);
      const existing = phaseResult.taskResults.find((t) => t.taskId === task.id)!;
      Object.assign(existing, result);
      appendRunEvent(cwd, run.id, {
        timestamp: now(),
        type: result.status === "completed" ? "task_completed" : "task_failed",
        runId: run.id, phaseId: phase.id, taskId: task.id,
        message: result.status === "completed" ? result.response?.slice(0, 200) : result.errorMessage,
      });
      return result;
    });
    await Promise.all(batchPromises);
  }

  const allDone = phaseResult.taskResults.every((t) => t.status === "completed" || t.status === "needs_attention");
  const anyFailed = phaseResult.taskResults.some((t) => t.status === "failed");
  const anyAborted = phaseResult.taskResults.some((t) => t.status === "aborted");
  if (anyAborted) phaseResult.status = "aborted";
  else if (allDone) phaseResult.status = "completed";
  else if (anyFailed) phaseResult.status = "failed";
  else phaseResult.status = "completed";
  phaseResult.completedAt = now();

  appendRunEvent(cwd, run.id, {
    timestamp: now(),
    type: phaseResult.status === "completed" ? "phase_completed" : "phase_failed",
    runId: run.id, phaseId: phase.id,
    message: `Phase "${phase.name}" ${phaseResult.status}`,
  });
  return phaseResult;
}
