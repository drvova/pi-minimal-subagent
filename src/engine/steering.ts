// Mid-run steering — track running subagents and support message injection.
// Steers by aborting + restarting with steering context, since Pi processes
// don't support stdin-based mid-run message injection.

import { emitSubagentSteered } from "./events.ts";

interface ActiveSubagent {
  id: string;
  agent: string;
  task: string;
  pid: number;
  startedAt: string;
  cwd: string;
  abort: AbortController;
}

const activeAgents = new Map<string, ActiveSubagent>();
let seq = 0;

export function registerActive(cwd: string, agent: string, task: string, pid: number, abort: AbortController): string {
  const id = `${agent}-${++seq}`;
  activeAgents.set(id, {
    id, agent, task, pid, startedAt: new Date().toISOString(), cwd, abort,
  });
  return id;
}

export function unregisterActive(id: string): void {
  activeAgents.delete(id);
}

export function getActive(cwd: string, agent: string): ActiveSubagent | undefined {
  let latest: ActiveSubagent | undefined;
  for (const a of activeAgents.values()) {
    if (a.cwd === cwd && a.agent === agent && (!latest || a.startedAt >= latest.startedAt)) latest = a;
  }
  return latest;
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
  unregisterActive(active.id);

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
