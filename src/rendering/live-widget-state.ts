// Live widget state builders — extracted from live-widget.ts.
// Pure factory functions for creating LiveAgentState objects.

import type { LiveAgentState } from "./live-widget.ts";

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
