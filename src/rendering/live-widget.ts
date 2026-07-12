// Persistent above-editor live widget — animated spinners, live tool activity,
// token counts, colored status icons. Registered via pi.setWidget().

import { Container, Spacer, Text } from "@mariozechner/pi-tui";
import { fmtCount, fmtModelProvider } from "./render-format.ts";

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

// ─── State builders ────────────────────────────────────────────

export function buildRunningState(
  agent: string,
  task: string,
  model: string | undefined,
  startedAt: string,
): LiveAgentState {
  return {
    agent, task, status: "running", model,
    inputTokens: 0, outputTokens: 0, cost: 0, turns: 0, startedAt,
  };
}

export function buildCompletedState(
  agent: string,
  task: string,
  model: string | undefined,
  inputTokens: number,
  outputTokens: number,
  cost: number,
  turns: number,
): LiveAgentState {
  return {
    agent, task, status: "completed", model,
    inputTokens, outputTokens, cost, turns,
    startedAt: new Date().toISOString(),
  };
}

export function buildFailedState(
  agent: string,
  task: string,
  model: string | undefined,
  error: string,
): LiveAgentState {
  return {
    agent, task, status: "failed", model,
    inputTokens: 0, outputTokens: 0, cost: 0, turns: 0,
    startedAt: new Date().toISOString(),
  };
}
