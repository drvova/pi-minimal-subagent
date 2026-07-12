// CRUD action handlers — workflows, teams, agents, runs.
// Imported by dispatch.ts.

import { discoverAgents } from "./agents/agents.ts";
import { createAgent, removeAgent, updateAgent } from "./agents/manager.ts";
import { abortBackgroundRun } from "./engine/background.ts";
import { getRun, listRuns } from "./runs/persistence.ts";
import { createTeam, removeTeam, updateTeam } from "./teams/manager.ts";
import { listTeams } from "./teams/persistence.ts";
import { createWorkflow, removeWorkflow, updateWorkflow } from "./workflows/manager.ts";
import { listWorkflows } from "./workflows/persistence.ts";

type ToolResult = { content: Array<{ type: "text"; text: string }>; details: any; isError?: boolean };

function err(msg: string): ToolResult {
  return { content: [{ type: "text", text: msg }], details: {}, isError: true };
}

function fmtErrors(errors: Array<{ field: string; message: string }>): string {
  return errors.map((e) => `  ${e.field}: ${e.message}`).join("\n");
}

// ─── Workflow CRUD ─────────────────────────────────────────

export function handleWorkflowList(cwd: string): ToolResult {
  const wfs = listWorkflows(cwd);
  if (!wfs.length) return { content: [{ type: "text", text: "No workflows defined." }], details: {} };
  return { content: [{ type: "text", text: wfs.map((w: any) => `${w.name} (${w.id})\n  ${w.description}\n  ${w.phases.length} phases, ${w.phases.reduce((s: number, p: any) => s + p.tasks.length, 0)} tasks${w.team ? `, team: ${w.team}` : ""}`).join("\n\n") }], details: {} };
}
export function handleWorkflowCreate(params: any, cwd: string): ToolResult {
  if (!params.name || !params.description || !params.phases) return err("workflow-create requires name, description, phases.");
  let phases: unknown; try { phases = JSON.parse(params.phases!); } catch { return err("phases must be valid JSON."); }
  const r = createWorkflow(cwd, { name: params.name!, description: params.description!, phases: phases as any, team: params.team });
  if (r.errors.length) return { content: [{ type: "text", text: `Validation errors:\n${fmtErrors(r.errors)}` }], details: {}, isError: true };
  return { content: [{ type: "text", text: `Workflow "${r.workflow!.name}" created (${r.workflow!.id}).` }], details: {} };
}
export function handleWorkflowUpdate(params: any, cwd: string): ToolResult {
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
export function handleWorkflowDelete(params: any, cwd: string): ToolResult {
  if (!params.id) return err("workflow-delete requires id.");
  const r = removeWorkflow(cwd, params.id!);
  return r.deleted ? { content: [{ type: "text", text: "Workflow deleted." }], details: {} } : { content: [{ type: "text", text: r.error! }], details: {}, isError: true };
}

// ─── Team CRUD ─────────────────────────────────────────────

export function handleTeamList(cwd: string): ToolResult {
  const teams = listTeams(cwd);
  if (!teams.length) return { content: [{ type: "text", text: "No teams defined." }], details: {} };
  return { content: [{ type: "text", text: teams.map((t: any) => `${t.name}\n  ${t.description}\n  Members:\n${t.members.map((m: any) => `    ${m.agent}: ${m.role}`).join("\n")}`).join("\n\n") }], details: {} };
}
export function handleTeamCreate(params: any, cwd: string): ToolResult {
  if (!params.name || !params.description || !params.members) return err("team-create requires name, description, members.");
  let members: unknown; try { members = JSON.parse(params.members!); } catch { return err("members must be valid JSON."); }
  const r = createTeam(cwd, { name: params.name!, description: params.description!, members: members as any });
  if (r.errors.length) return { content: [{ type: "text", text: `Validation errors:\n${fmtErrors(r.errors)}` }], details: {}, isError: true };
  return { content: [{ type: "text", text: `Team "${r.team!.name}" created.` }], details: {} };
}
export function handleTeamUpdate(params: any, cwd: string): ToolResult {
  if (!params.name) return err("team-update requires name.");
  const input: Record<string, unknown> = {};
  if (params.description !== undefined) input.description = params.description;
  if (params.members !== undefined) { try { input.members = JSON.parse(params.members); } catch { return err("members must be valid JSON."); } }
  const r = updateTeam(cwd, params.name!, input as never);
  if (r.errors.length) return { content: [{ type: "text", text: `Validation errors:\n${fmtErrors(r.errors)}` }], details: {}, isError: true };
  return { content: [{ type: "text", text: `Team "${r.team!.name}" updated.` }], details: {} };
}
export function handleTeamDelete(params: any, cwd: string): ToolResult {
  if (!params.name) return err("team-delete requires name.");
  const r = removeTeam(cwd, params.name!);
  return r.deleted ? { content: [{ type: "text", text: "Team deleted." }], details: {} } : { content: [{ type: "text", text: r.error! }], details: {}, isError: true };
}

// ─── Agent CRUD ────────────────────────────────────────────

export function handleAgentList(cwd: string): ToolResult {
  const discovery = discoverAgents(cwd);
  if (!discovery.agents.length) return { content: [{ type: "text", text: "No agents found." }], details: {} };
  return { content: [{ type: "text", text: discovery.agents.map((ag: any) => `${ag.name} (${ag.source}) — ${ag.description}`).join("\n") }], details: {} };
}
export function handleAgentCreate(params: any, cwd: string): ToolResult {
  if (!params.name || !params.description || !params.systemPrompt) return err("agent-create requires name, description, systemPrompt.");
  const r = createAgent(cwd, { name: params.name!, description: params.description!, systemPrompt: params.systemPrompt!, model: params.model, skills: params.skills?.split(",").map((s: string) => s.trim()).filter(Boolean), extensions: params.extensions?.split(",").map((s: string) => s.trim()).filter(Boolean), thinking: params.thinking });
  if (r.errors.length) return { content: [{ type: "text", text: `Errors:\n${fmtErrors(r.errors)}` }], details: {}, isError: true };
  return { content: [{ type: "text", text: `Agent "${params.name}" created.` }], details: {} };
}
export function handleAgentUpdate(params: any, cwd: string): ToolResult {
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
export function handleAgentDelete(params: any, cwd: string): ToolResult {
  if (!params.name) return err("agent-delete requires name.");
  const r = removeAgent(cwd, params.name!);
  return r.deleted ? { content: [{ type: "text", text: "Agent deleted." }], details: {} } : { content: [{ type: "text", text: r.error! }], details: {}, isError: true };
}

// ─── Runs ──────────────────────────────────────────────────

export function handleRunList(cwd: string): ToolResult {
  const runs = listRuns(cwd);
  if (!runs.length) return { content: [{ type: "text", text: "No runs found." }], details: {} };
  return { content: [{ type: "text", text: runs.map((r: any) => `${r.status === "completed" ? "\u2713" : r.status === "running" ? "\u2026" : "\u00d7"} ${r.workflowName} (${r.runId})\n  ${r.phaseCount} phases, ${r.taskCount} tasks | ${r.startedAt}`).join("\n\n") }], details: {} };
}
export async function handleRunStatus(params: any, cwd: string): Promise<ToolResult> {
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
export function handleRunAbort(params: any): ToolResult {
  const agentId = params.agent_id || params.runId;
  if (!agentId) return err("run-abort requires runId or agent_id.");
  return { content: [{ type: "text", text: abortBackgroundRun(agentId!) ? "Abort signal sent." : "Run not found." }], details: {} };
}
