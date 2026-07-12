// Persistent above-editor live widget — animated spinners, live tool activity,
// token counts, colored status icons. Registered via pi.setWidget().

import { Container, Spacer, Text } from "@mariozechner/pi-tui";
import { fmtCount, fmtModelProvider } from "./render-format.ts";
import { buildFailedState, buildRunningState } from "./live-widget-state.ts";

// ─── Animation ─────────────────────────────────────────────────

const SPINNER_FRAMES = ["◌", "◍", "◉", "◎"];
const SPINNER_FAST = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// ─── Live state ────────────────────────────────────────────────

export interface LiveAgentState {
  agent: string;
  task: string;
  status: "running" | "completed" | "failed";
  model?: string;
  currentTool?: string;
  toolPreview?: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  turns: number;
  startedAt: string;
}

export interface LiveWidgetState {
  agents: LiveAgentState[];
  error?: string;
}

export let state: LiveWidgetState = { agents: [] };

export function updateLiveState(newState: LiveWidgetState): void {
  state = newState;
}

// ─── Widget component ──────────────────────────────────────────

export function createLiveWidget(tui: any, theme: any) {
  let frame = 0;
  let interval: ReturnType<typeof setInterval> | null = null;

  const render = () => {
    const container = new Container();
    const fg = theme.fg.bind(theme);

    // Error line
    if (state.error) {
      container.addChild(new Text(fg("error", `✗ ${state.error}`), 0, 0));
      return container;
    }

    // No agents running
    if (state.agents.length === 0) {
      container.addChild(new Text(fg("dim", "no active subagents"), 0, 0));
      return container;
    }

    // Render each agent
    for (const agent of state.agents) {
      const spin = SPINNER_FAST[frame % SPINNER_FAST.length];
      const statusIcon = agent.status === "running" ? fg("warning", spin)
        : agent.status === "completed" ? fg("success", "✓")
        : fg("error", "✗");

      // Main line: [spinner] subagent: name — task preview
      const taskPreview = agent.task.slice(0, 60);
      container.addChild(new Text(
        `${statusIcon} ${fg("toolTitle", theme.bold("subagent"))}: ${fg("dim", agent.agent)} — ${fg("dim", taskPreview)}`,
        0, 0,
      ));

      // Stats line: model | tokens | cost | turns
      const stats: string[] = [];
      if (agent.model) stats.push(fg("dim", agent.model));
      if (agent.inputTokens) stats.push(fg("dim", `↑${fmtCount(agent.inputTokens)}`));
      if (agent.outputTokens) stats.push(fg("dim", `↓${fmtCount(agent.outputTokens)}`));
      if (agent.cost > 0) stats.push(fg("dim", `$${agent.cost.toFixed(4)}`));
      if (agent.turns) stats.push(fg("dim", `${agent.turns}t`));

      if (stats.length) {
        container.addChild(new Text(`  ${stats.join("  ")}`, 0, 0));
      }

      // Tool activity line
      if (agent.currentTool && agent.toolPreview) {
        const toolIcon = "  ⚙";
        container.addChild(new Text(
          `${fg("dim", toolIcon)} ${fg("dim", agent.currentTool)}: ${fg("toolOutput", agent.toolPreview.slice(0, 80))}`,
          0, 0,
        ));
      }
    }

    return container;
  };

  // Start animation
  interval = setInterval(() => { frame++; }, 100);

  const component = render();
  (component as any).dispose = () => {
    if (interval) { clearInterval(interval); interval = null; }
  };

  return component;
}

// ─── Widget init ────────────────────────────────────────────────

export function initLiveWidget(pi: any): void {
  let widgetRegistered = false;

  pi.events.on("subagent:created", (data: any) => {
    updateLiveState({ agents: [buildRunningState(data.agent, data.task, data.model, data.timestamp)] });
  });
  pi.events.on("subagent:completed", () => updateLiveState({ agents: [] }));
  pi.events.on("subagent:failed", (data: any) => {
    updateLiveState({ agents: [buildFailedState(data.agent, data.task, data.model, data.errorMessage || "failed")] });
  });

  pi.on("context", (_event: any, ctx: any) => {
    if (!widgetRegistered && ctx?.setWidget) {
      ctx.setWidget("subagent-live", (tui: any, theme: any) => createLiveWidget(tui, theme), { placement: "aboveEditor" });
      widgetRegistered = true;
    }
  });
}
