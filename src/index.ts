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
import { setEventBus, emitSubagentSteered } from "./engine/events.ts";
import { listActive, registerActive, steerSubagent, unregisterActive } from "./engine/steering.ts";
import { runSubagent } from "./execution/runner.ts";
import { getResultSummaryText } from "./execution/progress.js";
import { type SubagentDetails, type SubagentResult } from "./execution/types.ts";
import { emptyUsage, isResultError } from "./execution/result-utils.ts";
import { renderSubagentCall, renderSubagentResult } from "./rendering/render.ts";
import { renderCompletionNotification, renderGoalWidget, renderWorkflowWidget } from "./rendering/widgets.ts";
import { initLiveWidget } from "./rendering/live-widget.ts";
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

function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) { controller.abort(s.reason); return controller.signal; }
    s.addEventListener("abort", () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}

const Params = Type.Object({
  action: Type.String({ description: "run | run-workflow | run-goal | steer | workflows | workflow-create | workflow-update | workflow-delete | teams | team-create | team-update | team-delete | agents | agent-create | agent-update | agent-delete | runs | run-status | run-abort" }),
  agent: Type.Optional(Type.String({ description: "Agent name or 'auto' for policy-driven selection." })),
  task: Type.Optional(Type.String({ description: "Prompt / task for the agent." })),
  description: Type.Optional(Type.String({ description: "Short 3-5 word summary shown in UI." })),
  model: Type.Optional(Type.String({ description: "Model override — provider/modelId or fuzzy name." })),
  thinking: Type.Optional(Type.String({ description: "Thinking level: off, minimal, low, medium, high, xhigh." })),
  maxTurns: Type.Optional(Type.Number({ description: "Max agentic turns. Omit or 0 for unlimited (default)." })),
  run_in_background: Type.Optional(Type.Boolean({ description: "Run without blocking. Use run-status to check." })),
  background: Type.Optional(Type.Boolean({})),
  resume: Type.Optional(Type.String({ description: "Agent ID to resume a previous session." })),
  inherit_context: Type.Optional(Type.Boolean({ description: "Fork parent conversation context into agent." })),
  workflowId: Type.Optional(Type.String({})),
  dryRun: Type.Optional(Type.Boolean({ description: "Scaffold phases without spawning real Pi processes." })),
  goal: Type.Optional(Type.String({})), workerAgent: Type.Optional(Type.String({})), judgeAgent: Type.Optional(Type.String({})), budget: Type.Optional(Type.Number({})),
  id: Type.Optional(Type.String({})), name: Type.Optional(Type.String({})), systemPrompt: Type.Optional(Type.String({})),
  skills: Type.Optional(Type.String({ description: "Comma-separated skill names." })),
  extensions: Type.Optional(Type.String({ description: "Comma-separated extension refs." })),
  phases: Type.Optional(Type.String({ description: "JSON array of phases." })),
  team: Type.Optional(Type.String({})), members: Type.Optional(Type.String({ description: "JSON array of {agent, role} objects." })),
  runId: Type.Optional(Type.String({ description: "Run/agent ID for status checks." })),
  agent_id: Type.Optional(Type.String({ description: "Alias for runId — agent ID to check." })),
  wait: Type.Optional(Type.Boolean({ description: "Wait for completion (run-status)." })),
  verbose: Type.Optional(Type.Boolean({ description: "Include full conversation log (run-status)." })),
});

export default function (pi: ExtensionAPI) {
  initLiveWidget(pi);

  pi.registerTool({
    name: "subagent", label: "Subagent",
    description: "Unified subagent tool. Run agents, workflows, goal loops. Manage agents, teams, workflows. Check run status. Use action parameter to select operation.",
    parameters: Params,
    renderCall: renderSubagentCall,
    renderResult: (toolResult: any, opts: any, theme: any) => {
      const detailRun = toolResult?.details?.run;
      const notification = toolResult?.details?.notification;

      // Completion notification: compact box, expandable to full widget
      if (notification && detailRun) {
        return renderCompletionNotification(notification, detailRun, theme, opts?.expanded);
      }

      if (detailRun?.phaseResults) return renderWorkflowWidget(detailRun, theme);
      if (detailRun?.turns) return renderGoalWidget(detailRun, theme);
      return renderSubagentResult(toolResult, opts, theme);
    },

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const cwd = ctx.cwd;
      const a = params.action?.trim().toLowerCase() || "run";
      setEventBus(pi.events);

      // Emit steered event when delegation policy redirects agent
      const emitSteered = (from: string, to: string, task: string, reason: string) => {
        emitSubagentSteered(from, to, task, reason, cwd);
      };
      void emitSteered;

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
          const routed = selectAgent(params.task!, policy.agentRouting, discovery.agents);
          if (routed) emitSubagentSteered("auto", routed.name, params.task!, "policy routing", cwd);
          agent = routed ?? discovery.agents[0];
        }
        if (!agent) {
          const names = discovery.agents.map((x) => x.name);
          const msg = names.length ? `Unknown agent "${params.agent}". Available: ${names.join(", ")}.` : "No agents found.";
          return { content: [{ type: "text" as const, text: msg }], details: makeDetails([failedResult(params.agent, params.task!, msg)], { availableAgents: names, projectAgentsDir: discovery.projectAgentsDir }), isError: true };
        }
        // Register for potential mid-run steering
        const steerController = new AbortController();
        const linkedSignal = signal ? anySignal([signal, steerController.signal]) : steerController.signal;
        registerActive(cwd, agent.name, params.task!, 0, steerController);

        const result = await runSubagent({ cwd, agent, task: params.task!, settings, signal: linkedSignal, onUpdate, makeDetails: (r) => makeDetails(r, { projectAgentsDir: discovery.projectAgentsDir, delegation, policyActive: policy?.autoDelegate ?? false }) });
        unregisterActive(cwd, agent.name);

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
        if (params.background || params.run_in_background) {
          const { runId, error } = startBackgroundRun(cwd, params.workflowId!, { dryRun: params.dryRun });
          if (error) return { content: [{ type: "text" as const, text: error }], details: {}, isError: true };
          return { content: [{ type: "text" as const, text: `Workflow "${wf.name}" started in background.\nRun ID: ${runId}` }], details: { runId, notification: { runId, workflowName: wf.name, status: "running" } } };
        }
        const run = await runWorkflow({ cwd, workflow: wf, agents: discovery.agents, settings, signal, dryRun: params.dryRun });
        return { content: [{ type: "text" as const, text: `Workflow: ${run.workflowName} — ${run.status}` }], details: { run } };
      }

      // ─── steer ─────────────────────────────────────────────
      if (a === "steer") {
        if (!params.agent || !params.task) return { content: [{ type: "text" as const, text: "action=steer requires agent and task (steering message)." }], details: {}, isError: true };
        const steerResult = steerSubagent(cwd, params.agent!, params.task!, params.name || "manual steer");
        if (!steerResult) return { content: [{ type: "text" as const, text: `No active subagent "${params.agent}" found. Active: ${listActive(cwd).map(a => a.agent).join(", ") || "(none)"}` }], details: {} };
        return { content: [{ type: "text" as const, text: `Steered "${params.agent}": ${steerResult.reason}\nNew task: ${steerResult.newTask.slice(0, 200)}` }], details: { steered: steerResult } };
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
        const gr = await runGoalLoop({ cwd, config: { team: params.team || "default", goal: params.goal!, workerAgent: params.workerAgent!, judgeAgent: params.judgeAgent!, maxTurns: params.maxTurns ?? 0, budget: params.budget }, workerAgent: worker, judgeAgent: judge, settings, signal, dryRun: params.dryRun });
        const lines = [`Goal: ${gr.goal}`, `Status: ${gr.status}`, `Turns: ${gr.turns.length}${gr.maxTurns > 0 ? `/${gr.maxTurns}` : " (unlimited)"}`, `Cost: $${gr.totalCost.toFixed(4)}`, gr.completedAt ? `Completed: ${gr.completedAt}` : "", "", "Turns:"];
        for (const t of gr.turns) { lines.push(`  Turn ${t.turnNumber}: ${t.judgeVerdict}`); lines.push(`    Judge: ${t.judgeReason}`); }
        return { content: [{ type: "text" as const, text: `Goal: ${gr.goal} — ${gr.status}` }], details: { run: gr } };
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
        const agentId = params.agent_id || params.runId;
        if (!agentId) return { content: [{ type: "text" as const, text: "run-status requires runId or agent_id." }], details: {}, isError: true };

        // Wait for completion if requested
        if (params.wait) {
          let run: any = null;
          for (let i = 0; i < 120; i++) {
            run = getRun(cwd, agentId!);
            if (!run || run.status === "completed" || run.status === "failed" || run.status === "aborted") break;
            await new Promise(r => setTimeout(r, 1000));
          }
          if (!run) return { content: [{ type: "text" as const, text: "Run not found." }], details: {} };
          const lines = [`Workflow: ${run.workflowName}`, `Status: ${run.status}`, run.completedAt ? `Completed: ${run.completedAt}` : ""];
          if (params.verbose) {
            for (const p of run.phaseResults) {
              lines.push(`  ${p.phaseName}:`);
              for (const t of p.taskResults) lines.push(`    ${t.status} ${t.agent}: ${t.response || t.errorMessage || ""}`);
            }
          }
          return { content: [{ type: "text" as const, text: lines.filter(Boolean).join("\n") }], details: { run } };
        }

        const run = getRun(cwd, agentId!);
        if (!run) return { content: [{ type: "text" as const, text: "Run not found." }], details: {} };

        const taskCount = run.phaseResults.reduce((s: number, p: any) => s + p.taskResults.length, 0);
        const firstResponse = run.phaseResults[0]?.taskResults[0]?.response || "";

        const notification = {
          runId: run.id,
          workflowName: run.workflowName,
          status: run.status,
          phaseCount: run.phaseResults.length,
          taskCount,
          preview: firstResponse.slice(0, 100),
        };

        return { content: [{ type: "text" as const, text: `${run.workflowName} — ${run.status}` }], details: { run, notification } };
      }
      if (a === "run-abort") {
        const agentId = params.agent_id || params.runId;
        if (!agentId) return { content: [{ type: "text" as const, text: "run-abort requires runId or agent_id." }], details: {}, isError: true };
        return { content: [{ type: "text" as const, text: abortBackgroundRun(agentId!) ? "Abort signal sent." : "Run not found." }], details: {} };
      }

      return { content: [{ type: "text" as const, text: `Unknown action "${a}". Actions: run, run-workflow, run-goal, workflows, workflow-create/update/delete, teams, team-create/update/delete, agents, agent-create/update/delete, runs, run-status, run-abort.` }], details: {}, isError: true };
    },
  });
}
