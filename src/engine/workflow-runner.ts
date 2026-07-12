import type { AgentConfig } from "../agents/agents.ts";
import type { RunStatus, WorkflowRun } from "../runs/types.ts";
import type { WorkflowDefinition } from "../workflows/types.ts";
import { appendRunEvent, saveRun, updateRun } from "../runs/persistence.ts";
import type { Settings } from "../settings/settings.ts";
import { now } from "./spawn.ts";
import { runPhase } from "./phase-runner.ts";
import { emitWorkflowCompleted, emitWorkflowFailed, emitWorkflowStarted } from "./events.ts";

export interface EngineOptions {
  cwd: string;
  workflow: WorkflowDefinition;
  agents: AgentConfig[];
  settings: Settings;
  signal?: AbortSignal;
  onPhaseStart?: (phaseId: string) => void;
  onPhaseComplete?: (phaseId: string) => void;
  onTaskComplete?: (taskId: string) => void;
  dryRun?: boolean;
  /** Pre-generated run ID (e.g. from startBackgroundRun) — single source of truth. */
  runId?: string;
}

function generateRunId(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createRun(workflow: WorkflowDefinition, runId?: string): WorkflowRun {
  return {
    id: runId ?? generateRunId(),
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: "pending",
    phaseResults: workflow.phases.map((phase) => ({
      phaseId: phase.id,
      phaseName: phase.name,
      status: "pending" as RunStatus,
      startedAt: now(),
      taskResults: phase.tasks.map((task) => ({
        taskId: task.id, agent: task.agent, task: task.task,
        status: "pending" as RunStatus,
      })),
    })),
    startedAt: now(),
  };
}

export async function runWorkflow(opts: EngineOptions): Promise<WorkflowRun> {
  const { cwd, workflow, agents, settings, signal, dryRun } = opts;
  const run = createRun(workflow, opts.runId);
  run.status = "running";
  saveRun(cwd, run);
  emitWorkflowStarted(workflow.id, workflow.name, workflow.phases.length, cwd);

  appendRunEvent(cwd, run.id, {
    timestamp: now(), type: "run_started", runId: run.id,
    message: `Workflow "${workflow.name}" started (${workflow.phases.length} phases)`,
  });

  try {
    if (signal?.aborted) throw new Error("Aborted");
    for (const phase of workflow.phases) {
      if (signal?.aborted) break;
      opts.onPhaseStart?.(phase.id);
      await runPhase(cwd, phase, agents, settings, run, signal, dryRun);
      opts.onPhaseComplete?.(phase.id);
      const phaseResult = run.phaseResults.find((p) => p.phaseId === phase.id)!;
      if (phaseResult.status === "failed") {
        run.status = "failed"; run.completedAt = now();
        run.error = `Phase "${phase.name}" failed`;
        updateRun(cwd, run);
        appendRunEvent(cwd, run.id, { timestamp: now(), type: "run_failed", runId: run.id, message: run.error });
        return run;
      }
      if (phaseResult.status === "aborted") {
        run.status = "aborted"; run.completedAt = now();
        updateRun(cwd, run);
        appendRunEvent(cwd, run.id, { timestamp: now(), type: "run_aborted", runId: run.id, message: "Workflow aborted" });
        return run;
      }
      updateRun(cwd, run);
    }
    run.status = "completed"; run.completedAt = now();
    updateRun(cwd, run);
    appendRunEvent(cwd, run.id, { timestamp: now(), type: "run_completed", runId: run.id, message: `Workflow "${workflow.name}" completed successfully` });
    emitWorkflowCompleted(workflow.id, workflow.name, workflow.phases.length, cwd);
    return run;
  } catch (err) {
    run.status = "failed"; run.completedAt = now();
    run.error = err instanceof Error ? err.message : String(err);
    updateRun(cwd, run);
    appendRunEvent(cwd, run.id, { timestamp: now(), type: "run_failed", runId: run.id, message: run.error });
    emitWorkflowFailed(workflow.id, workflow.name, run.error!, cwd);
    return run;
  }
}
