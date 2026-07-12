// Execution action handlers — extracted from dispatch.ts.
// handleRun, handleWorkflowRun, handleGoalRun, handleSteer, handleGSD.

import type { AgentConfig } from "./agents/agents.ts";
import { discoverAgents } from "./agents/agents.ts";
import type { DelegationDecision } from "./delegation/policy.ts";
import { evaluatePolicy, formatComplexityReport, selectAgent } from "./delegation/policy.ts";
import { startBackgroundRun } from "./engine/background.ts";
import { emitSubagentSteered } from "./engine/events.ts";
import { runGSDCycle } from "./engine/gsd-runner.ts";
import { runGoalLoop } from "./engine/goal-runner.ts";
import { listActive, registerActive, steerSubagent, unregisterActive } from "./engine/steering.ts";
import { runWorkflow } from "./engine/workflow-runner.ts";
import { getResultSummaryText } from "./execution/progress.js";
import { emptyUsage, isResultError } from "./execution/result-utils.ts";
import { runSubagent } from "./execution/runner.ts";
import type { SubagentDetails, SubagentResult } from "./execution/types.ts";
import { resolveSettings } from "./settings/settings.ts";
import { getRun } from "./runs/persistence.ts";
import { listWorkflows } from "./workflows/persistence.ts";

type ToolResult = { content: Array<{ type: "text"; text: string }>; details: any; isError?: boolean };

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
function err(msg: string): ToolResult {
  return { content: [{ type: "text", text: msg }], details: {}, isError: true };
}

/** Extract recent user/assistant conversation text from Pi's session manager for inherit_context. */
export function extractParentContext(sessionManager: any, maxChars = 6000): string {
  const branch = sessionManager?.getBranch?.() ?? [];
  const parts: string[] = [];
  for (const entry of branch) {
    const m = entry?.message;
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    const text = typeof m.content === "string"
      ? m.content
      : Array.isArray(m.content) ? m.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n") : "";
    if (text.trim()) parts.push(`${m.role}: ${text.trim()}`);
  }
  const joined = parts.join("\n\n");
  return joined.length > maxChars ? joined.slice(-maxChars) : joined;
}

export async function handleRun(params: any, cwd: string, signal: any, onUpdate: any): Promise<ToolResult> {
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
    agent = routed ?? (discovery.agents[0] || undefined);
  }
  if (!agent) {
    const names = discovery.agents.map((x: any) => x.name);
    const msg = params.agent === "auto"
      ? `agent "auto" requires a delegation policy with agentRouting (settings key "pi-minimal-subagent".delegation). Available agents: ${names.join(", ") || "(none)"}.`
      : names.length ? `Unknown agent "${params.agent}". Available: ${names.join(", ")}.` : "No agents found.";
    return { content: [{ type: "text", text: msg }], details: makeDetails([failedResult(params.agent, params.task!, msg)], { availableAgents: names, projectAgentsDir: discovery.projectAgentsDir }), isError: true };
  }
  const effectiveAgent: AgentConfig = { ...agent };
  if (!effectiveAgent.model && params.model) effectiveAgent.model = params.model;
  if (!effectiveAgent.thinking && params.thinking) effectiveAgent.thinking = params.thinking;
  if (!effectiveAgent.skills?.length && params.skills) effectiveAgent.skills = params.skills.split(",").map((s: string) => s.trim()).filter(Boolean);
  if (!effectiveAgent.extensions?.length && params.extensions) effectiveAgent.extensions = params.extensions.split(",").map((s: string) => s.trim()).filter(Boolean);
  let task: string = params.task!;
  if (params.resume) {
    const prior = getRun(cwd, params.resume);
    if (!prior) return err(`resume: run "${params.resume}" not found.`);
    const priorOut = (prior.phaseResults ?? []).flatMap((ph: any) => ph.taskResults ?? []).map((t: any) => t.response).filter(Boolean).join("\n");
    task = `[RESUMING run ${params.resume}]\nPrior output:\n${priorOut.slice(-4000)}\n\nContinue: ${task}`;
  }
  if (params._parentContext) task = `[PARENT CONTEXT]\n${params._parentContext}\n\n[TASK]\n${task}`;
  const steerCtrl = new AbortController();
  const linkedSignal = signal ? anySignal([signal, steerCtrl.signal]) : steerCtrl.signal;
  const activeId = registerActive(cwd, effectiveAgent.name, task, 0, steerCtrl);
  const result = await runSubagent({ cwd, agent: effectiveAgent, task, settings, signal: linkedSignal, onUpdate, makeDetails: (r: any) => makeDetails(r, { projectAgentsDir: discovery.projectAgentsDir, delegation, policyActive: policy?.autoDelegate ?? false }) });
  unregisterActive(activeId);
  if (isResultError(result)) {
    return { content: [{ type: "text", text: `Subagent ${result.stopReason || "failed"}: ${getResultSummaryText(result)}` }], details: makeDetails([result], { projectAgentsDir: discovery.projectAgentsDir }), isError: true };
  }
  return { content: [{ type: "text", text: getResultSummaryText(result) }], details: makeDetails([result], { projectAgentsDir: discovery.projectAgentsDir }) };
}

export async function handleWorkflowRun(params: any, cwd: string, signal: any): Promise<ToolResult> {
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

export async function handleGoalRun(params: any, cwd: string, signal: any): Promise<ToolResult> {
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

export async function handleSteer(params: any, cwd: string, signal: any, onUpdate: any): Promise<ToolResult> {
  if (!params.agent || !params.task) return err("action=steer requires agent and task.");
  const r = steerSubagent(cwd, params.agent!, params.task!, params.name || "manual steer");
  if (!r) return { content: [{ type: "text", text: `No active subagent "${params.agent}" found. Active: ${listActive(cwd).map((a: any) => a.agent).join(", ") || "(none)"}` }], details: {} };
  // Restart with the steered task (abort half already done by steerSubagent)
  const restarted = await handleRun({ ...params, task: r.newTask, resume: undefined, _parentContext: undefined }, cwd, signal, onUpdate);
  restarted.details = { ...restarted.details, steered: r };
  return restarted;
}

export async function handleGSD(params: any, cwd: string, signal: any): Promise<ToolResult> {
  if (!params.task) return err("action=gsd requires task (feature description).");
  const settings = resolveSettings(cwd);
  const run = await runGSDCycle({ cwd, feature: params.task!, settings, signal, dryRun: params.dryRun, plannerAgent: params.plannerAgent, executorAgent: params.executorAgent, reviewerAgent: params.reviewerAgent });
  const lines = [`GSD Cycle: ${run.feature.slice(0, 80)}`, `Status: ${run.status}`, `Cost: $${run.totalCost.toFixed(4)}`, "", "Phases:"];
  for (const p of run.phases) {
    lines.push(`  ${p.status === "completed" ? "\u2713" : "\u00d7"} ${p.name} (${p.agent}): ${p.response.slice(0, 120)}`);
  }
  return { content: [{ type: "text", text: lines.filter(Boolean).join("\n") }], details: { gsd: run } };
}
