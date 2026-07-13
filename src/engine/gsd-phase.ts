// GSD single-phase execution — one subagent call with dry-run + abort support.

import type { AgentConfig } from "../agents/agents.ts";
import type { Settings } from "../settings/settings.ts";
import { now, spawnForTask } from "./spawn.ts";
import { emitSubagentCompleted, emitSubagentCreated, emitSubagentFailed } from "./events.ts";

export interface GSDPhase {
  name: string;
  agent: string;
  status: "pending" | "running" | "completed" | "failed";
  response: string;
  usage: { input: number; output: number; cost: number };
  startedAt: string;
  completedAt?: string;
}

export async function runPhase(
  cwd: string,
  name: string,
  agentName: string,
  agents: AgentConfig[],
  prompt: string,
  settings: Settings,
  dryRun: boolean,
  signal?: AbortSignal,
): Promise<GSDPhase> {
  const phase: GSDPhase = {
    name, agent: agentName, status: "running", response: "",
    usage: { input: 0, output: 0, cost: 0 },
    startedAt: now(),
  };

  const agent = agents.find(a => a.name === agentName);
  if (!agent) {
    phase.status = "failed";
    phase.response = `Agent "${agentName}" not found.`;
    phase.completedAt = now();
    return phase;
  }

  if (dryRun) {
    phase.status = "completed";
    phase.response = `[DRY RUN] Phase "${name}" would run agent ${agentName} with prompt: ${prompt.slice(0, 100)}...`;
    phase.completedAt = now();
    return phase;
  }

  emitSubagentCreated(agentName, prompt.slice(0, 200), agent.model, cwd);

  const result = await spawnForTask(cwd, prompt, agent, settings, signal);
  phase.response = result.response;
  phase.usage = result.usage;
  phase.status = result.response ? "completed" : "failed";
  phase.completedAt = now();

  if (phase.status === "completed") {
    emitSubagentCompleted(agentName, prompt.slice(0, 200), 0, result.usage.cost, 1, cwd);
  } else {
    emitSubagentFailed(agentName, prompt.slice(0, 200), 1, "No response", cwd);
  }

  return phase;
}
