// Pi child-process argument builders + timestamp helper (leaf module, no engine deps).

import type { AgentConfig } from "../agents/agents.ts";
import type { Settings } from "../settings/settings.ts";
import type { WorkflowTask } from "../workflows/types.ts";

export function now(): string {
  return new Date().toISOString();
}

function baseArgs(agent: AgentConfig, settings: Settings): string[] {
  const args = ["--mode", "json", "-p", "--no-session"];
  if (settings.extensions !== null) args.push("--no-extensions");
  const extensions = [...new Set([...(settings.extensions ?? []), ...(agent.extensions ?? [])])];
  for (const ext of extensions) args.push("--extension", ext);
  const model = agent.model ?? settings.model;
  if (model) args.push("--model", model);
  if (agent.thinking) args.push("--thinking", agent.thinking);
  if (agent.skills?.length) for (const skill of agent.skills) args.push("--skill", skill);
  return args;
}

export function buildChildArgs(task: WorkflowTask, agent: AgentConfig, settings: Settings): string[] {
  const args = baseArgs(agent, settings);
  args.push(task.task);
  return args;
}

export function buildArgsForTask(task: string, agent: AgentConfig, settings: Settings): string[] {
  const args = baseArgs(agent, settings);
  args.push(task);
  return args;
}
