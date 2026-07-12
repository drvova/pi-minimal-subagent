// Action handler dispatcher — extracted from index.ts.
// Each handler function takes (params, cwd, signal, onUpdate, pi) and returns a tool result.

import type { AgentConfig } from "./agents/agents.ts";
import { discoverAgents } from "./agents/agents.ts";
import { createAgent, removeAgent, updateAgent } from "./agents/manager.ts";
import type { DelegationDecision } from "./delegation/policy.ts";
import { evaluatePolicy, formatComplexityReport, selectAgent } from "./delegation/policy.ts";
import { abortBackgroundRun, startBackgroundRun } from "./engine/background.ts";
import { emitSubagentSteered, setEventBus } from "./engine/events.ts";
import { runGoalLoop } from "./engine/goal-runner.ts";
import { listActive, registerActive, steerSubagent, unregisterActive } from "./engine/steering.ts";
import { runWorkflow } from "./engine/workflow-runner.ts";
import { getResultSummaryText } from "./execution/progress.js";
import { emptyUsage, isResultError } from "./execution/result-utils.ts";
import { runSubagent } from "./execution/runner.ts";
import type { SubagentDetails, SubagentResult } from "./execution/types.ts";
import { getRun, listRuns } from "./runs/persistence.ts";
import { resolveSettings } from "./settings/settings.ts";
import { createTeam, removeTeam, updateTeam } from "./teams/manager.ts";
import { listTeams } from "./teams/persistence.ts";
import { createWorkflow, removeWorkflow, updateWorkflow } from "./workflows/manager.ts";
import { listWorkflows } from "./workflows/persistence.ts";

function makeDetails(results: SubagentResult[], extra?: Omit<SubagentDetails, "results">): any {
  return { results, ...extra };
}
function failedResult(agent: string, task: string, message: string): SubagentResult {
  return { agent, agentSource: "unknown", task, exitCode: 1, messages: [], response: "", stderr: message, usage: emptyUsage(), stopReason: "error", errorMessage: message };
}
function fmtErrors(errors: Array<{ field: string; message: string }>): string {
  return errors.map((e) => `  ${e.field}: ${e.message}`).join("\n");
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

  // ─── run ───────────────────────────────────────────────
  if (a === "run") return handleRun(params, cwd, signal, onUpdate);

  // ─── run-workflow ──────────────────────────────────────
  if (a === "run-workflow") return handleWorkflowRun(params, cwd, signal);

  // ─── run-goal ──────────────────────────────────────────
  if (a === "run-goal") return handleGoalRun(params, cwd, signal);

  // ─── steer ─────────────────────────────────────────────
  if (a === "steer") return handleSteer(params, cwd);

  // ─── workflows CRUD ────────────────────────────────────
  if (a === "workflows") return handleWorkflowList(cwd);
  if (a === "workflow-create") return handleWorkflowCreate(params, cwd);
  if (a === "workflow-update") return handleWorkflowUpdate(params, cwd);
  if (a === "workflow-delete") return handleWorkflowDelete(params, cwd);

  // ─── teams CRUD ────────────────────────────────────────
  if (a === "teams") return handleTeamList(cwd);
  if (a === "team-create") return handleTeamCreate(params, cwd);
  if (a === "team-update") return handleTeamUpdate(params, cwd);
  if (a === "team-delete") return handleTeamDelete(params, cwd);

  // ─── agents CRUD ───────────────────────────────────────
  if (a === "agents") return handleAgentList(cwd);
  if (a === "agent-create") return handleAgentCreate(params, cwd);
  if (a === "agent-update") return handleAgentUpdate(params, cwd);
  if (a === "agent-delete") return handleAgentDelete(params, cwd);

  // ─── runs ──────────────────────────────────────────────
  if (a === "runs") return handleRunList(cwd);
  if (a === "run-status") return handleRunStatus(params, cwd);
  if (a === "run-abort") return handleRunAbort(params);

  return { content: [{ type: "text", text: `Unknown action "${a}". Actions: run, run-workflow, run-goal, workflows, workflow-create/update/delete, teams, team-create/update/delete, agents, agent-create/update/delete, runs, run-status, run-abort.` }], details: {}, isError: true };
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
  const steerCtrl = new AbortController();
  const linkedSignal = signal ? anySignal([signal, steerCtrl.signal]) : steerCtrl.signal;
  registerActive(cwd, agent.name, params.task!, 0, steerCtrl);
  const result = await runSubagent({ cwd, agent, task: params.task!, settings, signal: linkedSignal, onUpdate, makeDetails: (r: any) => makeDetails(r, { projectAgentsDir: discovery.projectAgentsDir, delegation, policyActive: policy?.autoDelegate ?? false }) });
  unregisterActive(cwd, agent.name);
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

// ─── Workflow CRUD ─────────────────────────────────────────

function handleWorkflowList(cwd: string): ToolResult {
  const wfs = listWorkflows(cwd);
  if (!wfs.length) return { content: [{ type: "text", text: "No workflows defined." }], details: {} };
  return { content: [{ type: "text", text: wfs.map((w: any) => `${w.name} (${w.id})\n  ${w.description}\n  ${w.phases.length} phases, ${w.phases.reduce((s: number, p: any) => s + p.tasks.length, 0)} tasks${w.team ? `, team: ${w.team}` : ""}`).join("\n\n") }], details: {} };
}
function handleWorkflowCreate(params: any, cwd: string): ToolResult {
  if (!params.name || !params.description || !params.phases) return err("workflow-create requires name, description, phases.");
  let phases: unknown; try { phases = JSON.parse(params.phases!); } catch { return err("phases must be valid JSON."); }
  const r = createWorkflow(cwd, { name: params.name!, description: params.description!, phases: phases as any, team: params.team });
  if (r.errors.length) return { content: [{ type: "text", text: `Validation errors:\n${fmtErrors(r.errors)}` }], details: {}, isError: true };
  return { content: [{ type: "text", text: `Workflow "${r.workflow!.name}" created (${r.workflow!.id}).` }], details: {} };
}
function handleWorkflowUpdate(params: any, cwd: string): ToolResult {
  if (!params.id) return err("workflow-update requires id.");
  const input: Record<string, unknown> = {};
  if (params.name !== undefined) input.name = params.name;
  if (params.description !== undefined) input.description = params.description;
  if (params.phases !== undefined) { try { input.phases = JSON.parse(params.phases); } catch { return err("phases must be valid JSON."); } }
  if (params.team !== undefined) input.team = params.team;
  const r = updateWorkflow(cwd, params.id!, input as never);
  if (r.errors.length) return { content: [{ type: "text", text: `Validation errors:\n${fmtErrors(r.errors)}` }], details: {}, isError: true };
  return { content: [{ type: "text", text: `Workflow "${r.workflow!.name}" updated.` }], details: {} };
}
function handleWorkflowDelete(params: any, cwd: string): ToolResult {
  if (!params.id) return err("workflow-delete requires id.");
  const r = removeWorkflow(cwd, params.id!);
  return r.deleted ? { content: [{ type: "text", text: "Workflow deleted." }], details: {} } : { content: [{ type: "text", text: r.error! }], details: {}, isError: true };
}

// ─── Team CRUD ─────────────────────────────────────────────

function handleTeamList(cwd: string): ToolResult {
  const teams = listTeams(cwd);
  if (!teams.length) return { content: [{ type: "text", text: "No teams defined." }], details: {} };
  return { content: [{ type: "text", text: teams.map((t: any) => `${t.name}\n  ${t.description}\n  Members:\n${t.members.map((m: any) => `    ${m.agent}: ${m.role}`).join("\n")}`).join("\n\n") }], details: {} };
}
function handleTeamCreate(params: any, cwd: string): ToolResult {
  if (!params.name || !params.description || !params.members) return err("team-create requires name, description, members.");
  let members: unknown; try { members = JSON.parse(params.members!); } catch { return err("members must be valid JSON."); }
  const r = createTeam(cwd, { name: params.name!, description: params.description!, members: members as any });
  if (r.errors.length) return { content: [{ type: "text", text: `Validation errors:\n${fmtErrors(r.errors)}` }], details: {}, isError: true };
  return { content: [{ type: "text", text: `Team "${r.team!.name}" created.` }], details: {} };
}
function handleTeamUpdate(params: any, cwd: string): ToolResult {
  if (!params.name) return err("team-update requires name.");
  const input: Record<string, unknown> = {};
  if (params.description !== undefined) input.description = params.description;
  if (params.members !== undefined) { try { input.members = JSON.parse(params.members); } catch { return err("members must be valid JSON."); } }
  const r = updateTeam(cwd, params.name!, input as never);
  if (r.errors.length) return { content: [{ type: "text", text: `Validation errors:\n${fmtErrors(r.errors)}` }], details: {}, isError: true };
  return { content: [{ type: "text", text: `Team "${r.team!.name}" updated.` }], details: {} };
}
function handleTeamDelete(params: any, cwd: string): ToolResult {
  if (!params.name) return err("team-delete requires name.");
  const r = removeTeam(cwd, params.name!);
  return r.deleted ? { content: [{ type: "text", text: "Team deleted." }], details: {} } : { content: [{ type: "text", text: r.error! }], details: {}, isError: true };
}

// ─── Agent CRUD ────────────────────────────────────────────

function handleAgentList(cwd: string): ToolResult {
  const discovery = discoverAgents(cwd);
  if (!discovery.agents.length) return { content: [{ type: "text", text: "No agents found." }], details: {} };
  return { content: [{ type: "text", text: discovery.agents.map((ag: any) => `${ag.name} (${ag.source}) — ${ag.description}`).join("\n") }], details: {} };
}
function handleAgentCreate(params: any, cwd: string): ToolResult {
  if (!params.name || !params.description || !params.systemPrompt) return err("agent-create requires name, description, systemPrompt.");
  const r = createAgent(cwd, { name: params.name!, description: params.description!, systemPrompt: params.systemPrompt!, model: params.model, skills: params.skills?.split(",").map((s: string) => s.trim()).filter(Boolean), extensions: params.extensions?.split(",").map((s: string) => s.trim()).filter(Boolean), thinking: params.thinking });
  if (r.errors.length) return { content: [{ type: "text", text: `Errors:\n${fmtErrors(r.errors)}` }], details: {}, isError: true };
  return { content: [{ type: "text", text: `Agent "${params.name}" created.` }], details: {} };
}
function handleAgentUpdate(params: any, cwd: string): ToolResult {
  if (!params.name) return err("agent-update requires name.");
  const input: Record<string, unknown> = {};
  if (params.description !== undefined) input.description = params.description;
  if (params.systemPrompt !== undefined) input.systemPrompt = params.systemPrompt;
  if (params.model !== undefined) input.model = params.model || undefined;
  if (params.skills !== undefined) input.skills = params.skills.split(",").map((s: string) => s.trim()).filter(Boolean);
  if (params.extensions !== undefined) input.extensions = params.extensions.split(",").map((s: string) => s.trim()).filter(Boolean);
  if (params.thinking !== undefined) input.thinking = params.thinking;
  const r = updateAgent(cwd, params.name!, input as never);
  if (r.errors.length) return { content: [{ type: "text", text: `Errors:\n${fmtErrors(r.errors)}` }], details: {}, isError: true };
  return { content: [{ type: "text", text: `Agent "${params.name}" updated.` }], details: {} };
}
function handleAgentDelete(params: any, cwd: string): ToolResult {
  if (!params.name) return err("agent-delete requires name.");
  const r = removeAgent(cwd, params.name!);
  return r.deleted ? { content: [{ type: "text", text: "Agent deleted." }], details: {} } : { content: [{ type: "text", text: r.error! }], details: {}, isError: true };
}

// ─── Runs ──────────────────────────────────────────────────

function handleRunList(cwd: string): ToolResult {
  const runs = listRuns(cwd);
  if (!runs.length) return { content: [{ type: "text", text: "No runs found." }], details: {} };
  return { content: [{ type: "text", text: runs.map((r: any) => `${r.status === "completed" ? "\u2713" : r.status === "running" ? "\u2026" : "\u00d7"} ${r.workflowName} (${r.runId})\n  ${r.phaseCount} phases, ${r.taskCount} tasks | ${r.startedAt}`).join("\n\n") }], details: {} };
}
async function handleRunStatus(params: any, cwd: string): Promise<ToolResult> {
  const agentId = params.agent_id || params.runId;
  if (!agentId) return err("run-status requires runId or agent_id.");
  if (params.wait) {
    let run: any = null;
    for (let i = 0; i < 120; i++) {
      run = getRun(cwd, agentId!);
      if (!run || run.status === "completed" || run.status === "failed" || run.status === "aborted") break;
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!run) return { content: [{ type: "text", text: "Run not found." }], details: {} };
    const lines = [`Workflow: ${run.workflowName}`, `Status: ${run.status}`, run.completedAt ? `Completed: ${run.completedAt}` : ""];
    if (params.verbose) for (const p of run.phaseResults) { lines.push(`  ${p.phaseName}:`); for (const t of p.taskResults) lines.push(`    ${t.status} ${t.agent}: ${t.response || t.errorMessage || ""}`); }
    return { content: [{ type: "text", text: lines.filter(Boolean).join("\n") }], details: { run } };
  }
  const run = getRun(cwd, agentId!);
  if (!run) return { content: [{ type: "text", text: "Run not found." }], details: {} };
  const taskCount = run.phaseResults.reduce((s: number, p: any) => s + p.taskResults.length, 0);
  const notification = { runId: run.id, workflowName: run.workflowName, status: run.status, phaseCount: run.phaseResults.length, taskCount, preview: (run.phaseResults[0]?.taskResults[0]?.response || "").slice(0, 100) };
  return { content: [{ type: "text", text: `${run.workflowName} — ${run.status}` }], details: { run, notification } };
}
function handleRunAbort(params: any): ToolResult {
  const agentId = params.agent_id || params.runId;
  if (!agentId) return err("run-abort requires runId or agent_id.");
  return { content: [{ type: "text", text: abortBackgroundRun(agentId!) ? "Abort signal sent." : "Run not found." }], details: {} };
}

// ─── Helpers ───────────────────────────────────────────────

function err(msg: string): ToolResult {
  return { content: [{ type: "text", text: msg }], details: {}, isError: true };
}
