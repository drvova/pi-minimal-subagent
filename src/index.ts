import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { AgentConfig } from "./agents/agents.ts";
import { discoverAgents } from "./agents/agents.ts";
import { createAgent, removeAgent, updateAgent } from "./agents/manager.ts";
import type { DelegationDecision } from "./delegation/policy.ts";
import { evaluatePolicy, formatComplexityReport, selectAgent } from "./delegation/policy.ts";
import { abortBackgroundRun, startBackgroundRun } from "./engine/background.ts";
import { runGoalLoop } from "./engine/goal-runner.ts";
import { runWorkflow } from "./engine/workflow-runner.ts";
import { runSubagent } from "./execution/runner.ts";
import { getResultSummaryText } from "./execution/progress.js";
import { type SubagentDetails, type SubagentResult } from "./execution/types.ts";
import { emptyUsage, isResultError } from "./execution/result-utils.ts";
import { renderSubagentCall, renderSubagentResult } from "./rendering/render.ts";
import { resolveSettings } from "./settings/settings.ts";
import { listRuns, getRun } from "./runs/persistence.ts";
import { createTeam, removeTeam, updateTeam } from "./teams/manager.ts";
import { listTeams } from "./teams/persistence.ts";
import { createWorkflow, removeWorkflow, updateWorkflow } from "./workflows/manager.ts";
import { listWorkflows } from "./workflows/persistence.ts";

function makeDetails(results: SubagentResult[], extra?: Omit<SubagentDetails, "results">): SubagentDetails {
  return { results, ...extra };
}

function failedResult(agent: string, task: string, message: string): SubagentResult {
  return { agent, agentSource: "unknown", task, exitCode: 1, messages: [], response: "", stderr: message, usage: emptyUsage(), stopReason: "error", errorMessage: message };
}

function fmtErrors(errors: Array<{ field: string; message: string }>): string {
  return errors.map((e) => `  ${e.field}: ${e.message}`).join("\n");
}

const Params = Type.Object({
  action: Type.String({ description: "run | run-workflow | run-goal | workflows | workflow-create | workflow-update | workflow-delete | teams | team-create | team-update | team-delete | agents | agent-create | agent-update | agent-delete | runs | run-status | run-abort" }),
  agent: Type.Optional(Type.String({})), task: Type.Optional(Type.String({})),
  workflowId: Type.Optional(Type.String({})), dryRun: Type.Optional(Type.Boolean({})), background: Type.Optional(Type.Boolean({})),
  goal: Type.Optional(Type.String({})), workerAgent: Type.Optional(Type.String({})), judgeAgent: Type.Optional(Type.String({})), maxTurns: Type.Optional(Type.Number({})), budget: Type.Optional(Type.Number({})),
  id: Type.Optional(Type.String({})), name: Type.Optional(Type.String({})), description: Type.Optional(Type.String({})), systemPrompt: Type.Optional(Type.String({})), model: Type.Optional(Type.String({})),
  skills: Type.Optional(Type.String({})), extensions: Type.Optional(Type.String({})), thinking: Type.Optional(Type.String({})),
  phases: Type.Optional(Type.String({})), team: Type.Optional(Type.String({})), members: Type.Optional(Type.String({})),
  runId: Type.Optional(Type.String({})),
});

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "subagent", label: "Subagent",
    description: "Unified subagent tool. Run agents, workflows, goal loops. Manage agents, teams, workflows. Check run status. Use action parameter to select operation.",
    parameters: Params,
    renderCall: renderSubagentCall,
    renderResult: renderSubagentResult,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const cwd = ctx.cwd;
      const a = params.action?.trim().toLowerCase() || "run";

      // ─── run ─────────────────────────────────────────────────
      if (a === "run") {
        if (!params.agent || !params.task) return { content: [{ type: "text" as const, text: "action=run requires agent and task." }], details: {}, isError: true };
        const discovery = discoverAgents(cwd);
        const settings = resolveSettings(cwd);
        const policy = settings.delegation;
        let delegation: DelegationDecision | undefined;
        if (policy) {
          delegation = evaluatePolicy(params.task, policy);
          if (delegation && !delegation.delegate && params.agent === "auto") {
            return { content: [{ type: "text" as const, text: `Task below threshold. ${delegation.reason}\n\n${formatComplexityReport(delegation.complexity)}` }], details: makeDetails([], { availableAgents: discovery.agents.map((x) => x.name), projectAgentsDir: discovery.projectAgentsDir, delegation, policyActive: true }) };
          }
        }
        let agent: AgentConfig | undefined = discovery.agents.find((c) => c.name === params.agent);
        if (!agent && params.agent === "auto" && policy?.agentRouting) {
          agent = selectAgent(params.task!, policy.agentRouting, discovery.agents) ?? discovery.agents[0];
        }
        if (!agent) {
          const names = discovery.agents.map((x) => x.name);
          const msg = names.length ? `Unknown agent "${params.agent}". Available: ${names.join(", ")}.` : "No agents found.";
          return { content: [{ type: "text" as const, text: msg }], details: makeDetails([failedResult(params.agent, params.task!, msg)], { availableAgents: names, projectAgentsDir: discovery.projectAgentsDir }), isError: true };
        }
        const result = await runSubagent({ cwd, agent, task: params.task!, settings, signal, onUpdate, makeDetails: (r) => makeDetails(r, { projectAgentsDir: discovery.projectAgentsDir, delegation, policyActive: policy?.autoDelegate ?? false }) });
        if (isResultError(result)) {
          return { content: [{ type: "text" as const, text: `Subagent ${result.stopReason || "failed"}: ${getResultSummaryText(result)}` }], details: makeDetails([result], { projectAgentsDir: discovery.projectAgentsDir }), isError: true };
        }
        return { content: [{ type: "text" as const, text: getResultSummaryText(result) }], details: makeDetails([result], { projectAgentsDir: discovery.projectAgentsDir }) };
      }

      // ─── run-workflow ────────────────────────────────────────
      if (a === "run-workflow") {
        if (!params.workflowId) return { content: [{ type: "text" as const, text: "action=run-workflow requires workflowId." }], details: {}, isError: true };
        const settings = resolveSettings(cwd);
        const discovery = discoverAgents(cwd);
        const wfs = listWorkflows(cwd);
        const wf = wfs.find((w) => w.id === params.workflowId);
        if (!wf) return { content: [{ type: "text" as const, text: `Workflow "${params.workflowId}" not found.` }], details: {} };
        if (params.background) {
          const { runId, error } = startBackgroundRun(cwd, params.workflowId!, { dryRun: params.dryRun });
          if (error) return { content: [{ type: "text" as const, text: error }], details: {}, isError: true };
          return { content: [{ type: "text" as const, text: `Workflow "${wf.name}" started in background.\nRun ID: ${runId}` }], details: {} };
        }
        const run = await runWorkflow({ cwd, workflow: wf, agents: discovery.agents, settings, signal, dryRun: params.dryRun });
        const lines = [`Workflow: ${run.workflowName}`, `Status: ${run.status}`, run.completedAt ? `Completed: ${run.completedAt}` : "", "Phases:"];
        for (const p of run.phaseResults) {
          lines.push(`  ${p.status} ${p.phaseName}:`);
          for (const t of p.taskResults) lines.push(`    ${t.status === "completed" ? "\u2713" : t.status === "failed" ? "\u00d7" : "\u2026"} ${t.agent}: ${t.response?.slice(0, 120) || t.errorMessage || "(no output)"}`);
        }
        if (run.error) lines.push(`\nError: ${run.error}`);
        return { content: [{ type: "text" as const, text: lines.filter(Boolean).join("\n") }], details: {} };
      }

      // ─── run-goal ────────────────────────────────────────────
      if (a === "run-goal") {
        if (!params.goal || !params.workerAgent || !params.judgeAgent) return { content: [{ type: "text" as const, text: "action=run-goal requires goal, workerAgent, judgeAgent." }], details: {}, isError: true };
        const discovery = discoverAgents(cwd);
        const settings = resolveSettings(cwd);
        const worker = discovery.agents.find((x) => x.name === params.workerAgent);
        if (!worker) return { content: [{ type: "text" as const, text: `Worker agent "${params.workerAgent}" not found.` }], details: {}, isError: true };
        const judge = discovery.agents.find((x) => x.name === params.judgeAgent);
        if (!judge) return { content: [{ type: "text" as const, text: `Judge agent "${params.judgeAgent}" not found.` }], details: {}, isError: true };
        const gr = await runGoalLoop({ cwd, config: { team: params.team || "default", goal: params.goal!, workerAgent: params.workerAgent!, judgeAgent: params.judgeAgent!, maxTurns: params.maxTurns || 5, budget: params.budget }, workerAgent: worker, judgeAgent: judge, settings, signal, dryRun: params.dryRun });
        const lines = [`Goal: ${gr.goal}`, `Status: ${gr.status}`, `Turns: ${gr.turns.length}/${gr.maxTurns}`, `Cost: $${gr.totalCost.toFixed(4)}`, gr.completedAt ? `Completed: ${gr.completedAt}` : "", "", "Turns:"];
        for (const t of gr.turns) { lines.push(`  Turn ${t.turnNumber}: ${t.judgeVerdict}`); lines.push(`    Judge: ${t.judgeReason}`); }
        return { content: [{ type: "text" as const, text: lines.filter(Boolean).join("\n") }], details: {} };
      }

      // ─── workflows ───────────────────────────────────────────
      if (a === "workflows") {
        const wfs = listWorkflows(cwd);
        if (!wfs.length) return { content: [{ type: "text" as const, text: "No workflows defined." }], details: {} };
        return { content: [{ type: "text" as const, text: wfs.map((w) => `${w.name} (${w.id})\n  ${w.description}\n  ${w.phases.length} phases, ${w.phases.reduce((s, p) => s + p.tasks.length, 0)} tasks${w.team ? `, team: ${w.team}` : ""}`).join("\n\n") }], details: {} };
      }
      if (a === "workflow-create") {
        if (!params.name || !params.description || !params.phases) return { content: [{ type: "text" as const, text: "workflow-create requires name, description, phases." }], details: {}, isError: true };
        let phases: unknown; try { phases = JSON.parse(params.phases!); } catch { return { content: [{ type: "text" as const, text: "phases must be valid JSON." }], details: {}, isError: true }; }
        const r = createWorkflow(cwd, { name: params.name!, description: params.description!, phases: phases as never, team: params.team });
        if (r.errors.length) return { content: [{ type: "text" as const, text: `Validation errors:\n${fmtErrors(r.errors)}` }], details: {}, isError: true };
        return { content: [{ type: "text" as const, text: `Workflow "${r.workflow!.name}" created (${r.workflow!.id}).` }], details: {} };
      }
      if (a === "workflow-update") {
        if (!params.id) return { content: [{ type: "text" as const, text: "workflow-update requires id." }], details: {}, isError: true };
        const input: Record<string, unknown> = {};
        if (params.name !== undefined) input.name = params.name;
        if (params.description !== undefined) input.description = params.description;
        if (params.phases !== undefined) { try { input.phases = JSON.parse(params.phases); } catch { return { content: [{ type: "text" as const, text: "phases must be valid JSON." }], details: {}, isError: true }; } }
        if (params.team !== undefined) input.team = params.team;
        const r = updateWorkflow(cwd, params.id!, input as never);
        if (r.errors.length) return { content: [{ type: "text" as const, text: `Validation errors:\n${fmtErrors(r.errors)}` }], details: {}, isError: true };
        return { content: [{ type: "text" as const, text: `Workflow "${r.workflow!.name}" updated.` }], details: {} };
      }
      if (a === "workflow-delete") {
        if (!params.id) return { content: [{ type: "text" as const, text: "workflow-delete requires id." }], details: {}, isError: true };
        const r = removeWorkflow(cwd, params.id!);
        if (!r.deleted) return { content: [{ type: "text" as const, text: r.error! }], details: {}, isError: true };
        return { content: [{ type: "text" as const, text: "Workflow deleted." }], details: {} };
      }

      // ─── teams ───────────────────────────────────────────────
      if (a === "teams") {
        const teams = listTeams(cwd);
        if (!teams.length) return { content: [{ type: "text" as const, text: "No teams defined." }], details: {} };
        return { content: [{ type: "text" as const, text: teams.map((t) => `${t.name}\n  ${t.description}\n  Members:\n${t.members.map((m) => `    ${m.agent}: ${m.role}`).join("\n")}`).join("\n\n") }], details: {} };
      }
      if (a === "team-create") {
        if (!params.name || !params.description || !params.members) return { content: [{ type: "text" as const, text: "team-create requires name, description, members." }], details: {}, isError: true };
        let members: unknown; try { members = JSON.parse(params.members!); } catch { return { content: [{ type: "text" as const, text: "members must be valid JSON." }], details: {}, isError: true }; }
        const r = createTeam(cwd, { name: params.name!, description: params.description!, members: members as never });
        if (r.errors.length) return { content: [{ type: "text" as const, text: `Validation errors:\n${fmtErrors(r.errors)}` }], details: {}, isError: true };
        return { content: [{ type: "text" as const, text: `Team "${r.team!.name}" created.` }], details: {} };
      }
      if (a === "team-update") {
        if (!params.name) return { content: [{ type: "text" as const, text: "team-update requires name." }], details: {}, isError: true };
        const input: Record<string, unknown> = {};
        if (params.description !== undefined) input.description = params.description;
        if (params.members !== undefined) { try { input.members = JSON.parse(params.members); } catch { return { content: [{ type: "text" as const, text: "members must be valid JSON." }], details: {}, isError: true }; } }
        const r = updateTeam(cwd, params.name!, input as never);
        if (r.errors.length) return { content: [{ type: "text" as const, text: `Validation errors:\n${fmtErrors(r.errors)}` }], details: {}, isError: true };
        return { content: [{ type: "text" as const, text: `Team "${r.team!.name}" updated.` }], details: {} };
      }
      if (a === "team-delete") {
        if (!params.name) return { content: [{ type: "text" as const, text: "team-delete requires name." }], details: {}, isError: true };
        const r = removeTeam(cwd, params.name!);
        if (!r.deleted) return { content: [{ type: "text" as const, text: r.error! }], details: {}, isError: true };
        return { content: [{ type: "text" as const, text: "Team deleted." }], details: {} };
      }

      // ─── agents ──────────────────────────────────────────────
      if (a === "agents") {
        const discovery = discoverAgents(cwd);
        if (!discovery.agents.length) return { content: [{ type: "text" as const, text: "No agents found." }], details: {} };
        return { content: [{ type: "text" as const, text: discovery.agents.map((ag) => `${ag.name} (${ag.source}) — ${ag.description}`).join("\n") }], details: {} };
      }
      if (a === "agent-create") {
        if (!params.name || !params.description || !params.systemPrompt) return { content: [{ type: "text" as const, text: "agent-create requires name, description, systemPrompt." }], details: {}, isError: true };
        const r = createAgent(cwd, { name: params.name!, description: params.description!, systemPrompt: params.systemPrompt!, model: params.model, skills: params.skills?.split(",").map((s) => s.trim()).filter(Boolean), extensions: params.extensions?.split(",").map((s) => s.trim()).filter(Boolean), thinking: params.thinking });
        if (r.errors.length) return { content: [{ type: "text" as const, text: `Errors:\n${fmtErrors(r.errors)}` }], details: {}, isError: true };
        return { content: [{ type: "text" as const, text: `Agent "${params.name}" created.` }], details: {} };
      }
      if (a === "agent-update") {
        if (!params.name) return { content: [{ type: "text" as const, text: "agent-update requires name." }], details: {}, isError: true };
        const input: Record<string, unknown> = {};
        if (params.description !== undefined) input.description = params.description;
        if (params.systemPrompt !== undefined) input.systemPrompt = params.systemPrompt;
        if (params.model !== undefined) input.model = params.model || undefined;
        if (params.skills !== undefined) input.skills = params.skills.split(",").map((s) => s.trim()).filter(Boolean);
        if (params.extensions !== undefined) input.extensions = params.extensions.split(",").map((s) => s.trim()).filter(Boolean);
        if (params.thinking !== undefined) input.thinking = params.thinking;
        const r = updateAgent(cwd, params.name!, input as never);
        if (r.errors.length) return { content: [{ type: "text" as const, text: `Errors:\n${fmtErrors(r.errors)}` }], details: {}, isError: true };
        return { content: [{ type: "text" as const, text: `Agent "${params.name}" updated.` }], details: {} };
      }
      if (a === "agent-delete") {
        if (!params.name) return { content: [{ type: "text" as const, text: "agent-delete requires name." }], details: {}, isError: true };
        const r = removeAgent(cwd, params.name!);
        if (!r.deleted) return { content: [{ type: "text" as const, text: r.error! }], details: {}, isError: true };
        return { content: [{ type: "text" as const, text: "Agent deleted." }], details: {} };
      }

      // ─── runs / run-status / run-abort ───────────────────────
      if (a === "runs") {
        const runs = listRuns(cwd);
        if (!runs.length) return { content: [{ type: "text" as const, text: "No runs found." }], details: {} };
        return { content: [{ type: "text" as const, text: runs.map((r) => `${r.status === "completed" ? "\u2713" : r.status === "running" ? "\u2026" : "\u00d7"} ${r.workflowName} (${r.runId})\n  ${r.phaseCount} phases, ${r.taskCount} tasks | ${r.startedAt}`).join("\n\n") }], details: {} };
      }
      if (a === "run-status") {
        if (!params.runId) return { content: [{ type: "text" as const, text: "run-status requires runId." }], details: {}, isError: true };
        const run = getRun(cwd, params.runId!);
        if (!run) return { content: [{ type: "text" as const, text: "Run not found." }], details: {} };
        const lines = [`Run: ${run.id}`, `Workflow: ${run.workflowName}`, `Status: ${run.status}`, run.completedAt ? `Completed: ${run.completedAt}` : "", run.error ? `Error: ${run.error}` : "", "Phases:"];
        for (const p of run.phaseResults) {
          lines.push(`  ${p.status} ${p.phaseName}:`);
          for (const t of p.taskResults) lines.push(`    ${t.status === "completed" ? "\u2713" : "\u00d7"} ${t.agent}: ${t.response?.slice(0, 100) || t.errorMessage || ""}`);
        }
        return { content: [{ type: "text" as const, text: lines.filter(Boolean).join("\n") }], details: {} };
      }
      if (a === "run-abort") {
        if (!params.runId) return { content: [{ type: "text" as const, text: "run-abort requires runId." }], details: {}, isError: true };
        return { content: [{ type: "text" as const, text: abortBackgroundRun(params.runId!) ? "Abort signal sent." : "Run not found." }], details: {} };
      }

      return { content: [{ type: "text" as const, text: `Unknown action "${a}". Actions: run, run-workflow, run-goal, workflows, workflow-create/update/delete, teams, team-create/update/delete, agents, agent-create/update/delete, runs, run-status, run-abort.` }], details: {}, isError: true };
    },
  });
}
