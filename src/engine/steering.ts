// Mid-run steering — track running subagents and support message injection.
// Steers by aborting + restarting with steering context, since Pi processes
// don't support stdin-based mid-run message injection.

import { emitSubagentSteered } from "./events.ts";

interface ActiveSubagent {
  agent: string;
  task: string;
  pid: number;
  startedAt: string;
  cwd: string;
  abort: AbortController;
}

const activeAgents = new Map<string, ActiveSubagent>();

function key(cwd: string, agent: string): string {
  return `${cwd}::${agent}`;
}

export function registerActive(cwd: string, agent: string, task: string, pid: number, abort: AbortController): void {
  const k = key(cwd, agent);
  // Abort previous agent with same key if still running
  const prev = activeAgents.get(k);
  if (prev) {
    try { prev.abort.abort(); } catch { /* already aborted */ }
  }
  activeAgents.set(k, {
    agent, task, pid, startedAt: new Date().toISOString(), cwd, abort,
  });
}

export function unregisterActive(cwd: string, agent: string): void {
  activeAgents.delete(key(cwd, agent));
}

export function getActive(cwd: string, agent: string): ActiveSubagent | undefined {
  return activeAgents.get(key(cwd, agent));
}

export function listActive(cwd: string): ActiveSubagent[] {
  return Array.from(activeAgents.values()).filter((a) => a.cwd === cwd);
}

export interface SteerResult {
  steered: boolean;
  previousTask: string;
  newTask: string;
  agent: string;
  reason: string;
}

export function steerSubagent(cwd: string, agent: string, message: string, reason: string): SteerResult | null {
  const active = getActive(cwd, agent);
  if (!active) return null;

  // Abort the running subagent
  try { active.abort.abort(); } catch { /* already aborted */ }
  unregisterActive(cwd, agent);

  // Build new task with steering context prepended
  const newTask = `[STEERED: ${reason}]\n${message}\n\n--- Original task ---\n${active.task}`;

  emitSubagentSteered(agent, agent, active.task, reason, cwd);

  return {
    steered: true,
    previousTask: active.task,
    newTask,
    agent,
    reason,
  };
}
