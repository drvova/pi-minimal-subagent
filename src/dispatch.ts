// Action handler dispatcher — routes to execution and CRUD handlers.
// CRUD handlers in ./dispatch-crud.ts

import type { AgentConfig } from "./agents/agents.ts";
import { discoverAgents } from "./agents/agents.ts";
import type { DelegationDecision } from "./delegation/policy.ts";
import { evaluatePolicy, formatComplexityReport, selectAgent } from "./delegation/policy.ts";
import { startBackgroundRun } from "./engine/background.ts";
import { emitSubagentSteered, setEventBus } from "./engine/events.ts";
import { runGoalLoop } from "./engine/goal-runner.ts";
import { listActive, registerActive, steerSubagent, unregisterActive } from "./engine/steering.ts";
import { runWorkflow } from "./engine/workflow-runner.ts";
import { getResultSummaryText } from "./execution/progress.js";
import { listWorkflows } from "./workflows/persistence.ts";
import { emptyUsage, isResultError } from "./execution/result-utils.ts";
import { runSubagent } from "./execution/runner.ts";
import type { SubagentDetails, SubagentResult } from "./execution/types.ts";
import { resolveSettings } from "./settings/settings.ts";
import {
  handleAgentCreate, handleAgentDelete, handleAgentList, handleAgentUpdate,
  handleTeamCreate, handleTeamDelete, handleTeamList, handleTeamUpdate,
  handleWorkflowCreate, handleWorkflowDelete, handleWorkflowList, handleWorkflowUpdate,
} from "./dispatch-crud.ts";
import { handleRunAbort, handleRunList, handleRunStatus } from "./dispatch-runs.ts";

function makeDetails(results: SubagentResult[], extra?: Omit<SubagentDetails, "results">): any {
  return { results, ...extra };
}
function failedResult(agent: string, task: string, message: string): SubagentResult {
  return { agent, agentSource: "unknown", task, exitCode: 1, messages: [], response: "", stderr: message, usage: emptyUsage(), stopReason: "error", errorMessage: message };
}
function anySignal(signals: AbortSignal[]): AbortSignal {
  const c = new AbortController();
  for (const s of signals) { if (s.aborted) { c.abort(s.reason); return c.signal; } s.addEventListener("abort", () => c.abort(s.reason), { once: true }); }
  return c.signal;
}

type ToolResult = { content: Array<{ type: "text"; text: string }>; details: any; isError?: boolean };

export async function dispatchAction(
  action: string, params: Record<string, any>,
  cwd: string, signal: AbortSignal | undefined,
  onUpdate: any, pi: any,
): Promise<ToolResult> {
  setEventBus(pi.events);
  const a = action || "run";

  // ─── Execution ────────────────────────────────────────
  if (a === "run") return handleRun(params, cwd, signal, onUpdate);
  if (a === "run-workflow") return handleWorkflowRun(params, cwd, signal);
  if (a === "run-goal") return handleGoalRun(params, cwd, signal);
  if (a === "steer") return handleSteer(params, cwd);

  // ─── CRUD ─────────────────────────────────────────────
  if (a === "workflows") return handleWorkflowList(cwd);
  if (a === "workflow-create") return handleWorkflowCreate(params, cwd);
  if (a === "workflow-update") return handleWorkflowUpdate(params, cwd);
  if (a === "workflow-delete") return handleWorkflowDelete(params, cwd);
  if (a === "teams") return handleTeamList(cwd);
  if (a === "team-create") return handleTeamCreate(params, cwd);
  if (a === "team-update") return handleTeamUpdate(params, cwd);
  if (a === "team-delete") return handleTeamDelete(params, cwd);
  if (a === "agents") return handleAgentList(cwd);
  if (a === "agent-create") return handleAgentCreate(params, cwd);
  if (a === "agent-update") return handleAgentUpdate(params, cwd);
  if (a === "agent-delete") return handleAgentDelete(params, cwd);
  if (a === "runs") return handleRunList(cwd);
  if (a === "run-status") return handleRunStatus(params, cwd);
  if (a === "run-abort") return handleRunAbort(params);

  return { content: [{ type: "text", text: `Unknown action "${a}".` }], details: {}, isError: true };
}

// ─── Subagent run ──────────────────────────────────────────

async function handleRun(params: any, cwd: string, signal: any, onUpdate: any): Promise<ToolResult> {
  if (!params.agent || !params.task) return err("action=run requires agent and task.");
  const discovery = discoverAgents(cwd);
  const settings = resolveSettings(cwd);
  const policy = settings.delegation;
  let delegation: DelegationDecision | undefined;
  if (policy) {
    delegation = evaluatePolicy(params.task, policy);
    if (delegation && !delegation.delegate && params.agent === "auto") {
      return { content: [{ type: "text", text: `Task below threshold. ${delegation.reason}\n\n${formatComplexityReport(delegation.complexity)}` }], details: makeDetails([], { availableAgents: discovery.agents.map((x: any) => x.name), projectAgentsDir: discovery.projectAgentsDir, delegation, policyActive: true }) };
    }
  }
  let agent: AgentConfig | undefined = discovery.agents.find((c: any) => c.name === params.agent);
  if (!agent && params.agent === "auto" && policy?.agentRouting) {
    const routed = selectAgent(params.task!, policy.agentRouting, discovery.agents);
    if (routed) emitSubagentSteered("auto", routed.name, params.task!, "policy routing", cwd);
    agent = routed ?? discovery.agents[0] as any;
  }
  if (!agent) {
    const names = discovery.agents.map((x: any) => x.name);
    const msg = names.length ? `Unknown agent "${params.agent}". Available: ${names.join(", ")}.` : "No agents found.";
    return { content: [{ type: "text", text: msg }], details: makeDetails([failedResult(params.agent, params.task!, msg)], { availableAgents: names, projectAgentsDir: discovery.projectAgentsDir }), isError: true };
  }

  // Frontmatter is authoritative — tool params only fill unspecified fields
  const effectiveAgent: AgentConfig = { ...agent };
  if (!effectiveAgent.model && params.model) effectiveAgent.model = params.model;
  if (!effectiveAgent.thinking && params.thinking) effectiveAgent.thinking = params.thinking;
  if (!effectiveAgent.skills?.length && params.skills) effectiveAgent.skills = params.skills.split(",").map((s: string) => s.trim()).filter(Boolean);
  if (!effectiveAgent.extensions?.length && params.extensions) effectiveAgent.extensions = params.extensions.split(",").map((s: string) => s.trim()).filter(Boolean);
  const steerCtrl = new AbortController();
  const linkedSignal = signal ? anySignal([signal, steerCtrl.signal]) : steerCtrl.signal;
  registerActive(cwd, effectiveAgent.name, params.task!, 0, steerCtrl);
  const result = await runSubagent({ cwd, agent: effectiveAgent, task: params.task!, settings, signal: linkedSignal, onUpdate, makeDetails: (r: any) => makeDetails(r, { projectAgentsDir: discovery.projectAgentsDir, delegation, policyActive: policy?.autoDelegate ?? false }) });
  unregisterActive(cwd, effectiveAgent.name);
  if (isResultError(result)) {
    return { content: [{ type: "text", text: `Subagent ${result.stopReason || "failed"}: ${getResultSummaryText(result)}` }], details: makeDetails([result], { projectAgentsDir: discovery.projectAgentsDir }), isError: true };
  }
  return { content: [{ type: "text", text: getResultSummaryText(result) }], details: makeDetails([result], { projectAgentsDir: discovery.projectAgentsDir }) };
}

// ─── Workflow run ──────────────────────────────────────────

async function handleWorkflowRun(params: any, cwd: string, signal: any): Promise<ToolResult> {
  if (!params.workflowId) return err("action=run-workflow requires workflowId.");
  const settings = resolveSettings(cwd);
  const discovery = discoverAgents(cwd);
  const wf = listWorkflows(cwd).find((w: any) => w.id === params.workflowId);
  if (!wf) return { content: [{ type: "text", text: `Workflow "${params.workflowId}" not found.` }], details: {} };
  if (params.background || params.run_in_background) {
    const { runId, error } = startBackgroundRun(cwd, params.workflowId!, { dryRun: params.dryRun });
    if (error) return { content: [{ type: "text", text: error }], details: {}, isError: true };
    return { content: [{ type: "text", text: `Workflow "${wf.name}" started in background.\nRun ID: ${runId}` }], details: { runId, notification: { runId, workflowName: wf.name, status: "running" } } };
  }
  const run = await runWorkflow({ cwd, workflow: wf, agents: discovery.agents, settings, signal, dryRun: params.dryRun });
  return { content: [{ type: "text", text: `Workflow: ${run.workflowName} — ${run.status}` }], details: { run } };
}

// ─── Goal run ──────────────────────────────────────────────

async function handleGoalRun(params: any, cwd: string, signal: any): Promise<ToolResult> {
  if (!params.goal || !params.workerAgent || !params.judgeAgent) return err("action=run-goal requires goal, workerAgent, judgeAgent.");
  const discovery = discoverAgents(cwd);
  const settings = resolveSettings(cwd);
  const worker = discovery.agents.find((x: any) => x.name === params.workerAgent);
  if (!worker) return err(`Worker agent "${params.workerAgent}" not found.`);
  const judge = discovery.agents.find((x: any) => x.name === params.judgeAgent);
  if (!judge) return err(`Judge agent "${params.judgeAgent}" not found.`);
  const gr = await runGoalLoop({ cwd, config: { team: params.team || "default", goal: params.goal!, workerAgent: params.workerAgent!, judgeAgent: params.judgeAgent!, maxTurns: params.maxTurns ?? 0, budget: params.budget }, workerAgent: worker, judgeAgent: judge, settings, signal, dryRun: params.dryRun });
  return { content: [{ type: "text", text: `Goal: ${gr.goal} — ${gr.status}` }], details: { run: gr } };
}

// ─── Steer ─────────────────────────────────────────────────

function handleSteer(params: any, cwd: string): ToolResult {
  if (!params.agent || !params.task) return err("action=steer requires agent and task.");
  const r = steerSubagent(cwd, params.agent!, params.task!, params.name || "manual steer");
  if (!r) return { content: [{ type: "text", text: `No active subagent "${params.agent}" found. Active: ${listActive(cwd).map((a: any) => a.agent).join(", ") || "(none)"}` }], details: {} };
  return { content: [{ type: "text", text: `Steered "${params.agent}": ${r.reason}\nNew task: ${r.newTask.slice(0, 200)}` }], details: { steered: r } };
}

// ─── Helpers ───────────────────────────────────────────────

function err(msg: string): ToolResult {
  return { content: [{ type: "text", text: msg }], details: {}, isError: true };
}
