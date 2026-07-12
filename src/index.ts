import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { dispatchAction } from "./dispatch.ts";
import { renderSubagentCall, renderSubagentResult } from "./rendering/render.ts";
import { renderGSDWidget, renderGoalWidget, renderWorkflowWidget } from "./rendering/widgets.ts";
import { renderCompletionNotification } from "./rendering/widgets-notify.ts";
import { initLiveWidget } from "./rendering/live-widget.ts";

const Params = Type.Object({
  action: Type.String({ description: "gsd | run | run-workflow | run-goal | steer | workflows | workflow-create | workflow-update | workflow-delete | teams | team-create | team-update | team-delete | agents | agent-create | agent-update | agent-delete | runs | run-status | run-abort" }),
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
    description: "Unified subagent tool. Run agents, workflows, goal loops. Manage agents, teams, workflows. Check run status.",
    parameters: Params,
    renderCall: renderSubagentCall,
    renderResult: (toolResult: any, opts: any, theme: any) => {
      const dr = toolResult?.details?.run;
      const n = toolResult?.details?.notification;
      if (n && dr) return renderCompletionNotification(n, dr, theme, opts?.expanded);
      if (dr?.phaseResults) return renderWorkflowWidget(dr, theme);
      if (dr?.turns) return renderGoalWidget(dr, theme);
      const gsd = toolResult?.details?.gsd;
      if (gsd?.phases) return renderGSDWidget(gsd, theme);
      return renderSubagentResult(toolResult, opts, theme);
    },
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      return dispatchAction(params.action || "run", params as any, ctx.cwd, signal, onUpdate, pi);
    },
  });
}
