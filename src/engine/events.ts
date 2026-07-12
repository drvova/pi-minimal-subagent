// Event bus facade — typed lifecycle events for subagent activity.
// Other extensions listen via pi.events.on('subagent:*', handler).

interface SubagentEventData {
  agent: string;
  task: string;
  model?: string;
  timestamp: string;
  cwd: string;
}

interface SubagentCompletedData extends SubagentEventData {
  exitCode: number;
  cost?: number;
  turns?: number;
}

interface SubagentFailedData extends SubagentEventData {
  exitCode: number;
  errorMessage?: string;
}

interface SubagentSteeredData extends SubagentEventData {
  fromAgent: string;
  toAgent: string;
  reason: string;
}

type EventBus = { emit(channel: string, data: unknown): void };

let bus: EventBus | undefined;

export function setEventBus(events: EventBus): void {
  bus = events;
}

function emit(channel: string, data: unknown): void {
  bus?.emit(channel, data);
}

function now(): string {
  return new Date().toISOString();
}

// ─── Subagent lifecycle ──────────────────────────────────────

export function emitSubagentCreated(agent: string, task: string, model: string | undefined, cwd: string): void {
  emit("subagent:created", { agent, task, model, timestamp: now(), cwd });
}

export function emitSubagentStarted(agent: string, task: string, cwd: string): void {
  emit("subagent:started", { agent, task, timestamp: now(), cwd });
}

export function emitSubagentCompleted(agent: string, task: string, exitCode: number, cost: number | undefined, turns: number | undefined, cwd: string): void {
  emit("subagent:completed", { agent, task, exitCode, cost, turns, timestamp: now(), cwd });
}

export function emitSubagentFailed(agent: string, task: string, exitCode: number, errorMessage: string | undefined, cwd: string): void {
  emit("subagent:failed", { agent, task, exitCode, errorMessage, timestamp: now(), cwd });
}

export function emitSubagentSteered(fromAgent: string, toAgent: string, task: string, reason: string, cwd: string): void {
  emit("subagent:steered", { agent: toAgent, fromAgent, toAgent, task, reason, timestamp: now(), cwd });
}

export function emitSubagentCompacted(agent: string, task: string, cwd: string): void {
  emit("subagent:compacted", { agent, task, timestamp: now(), cwd });
}

// ─── Workflow lifecycle ──────────────────────────────────────

export function emitWorkflowStarted(workflowId: string, workflowName: string, phaseCount: number, cwd: string): void {
  emit("workflow:started", { workflowId, workflowName, phaseCount, timestamp: now(), cwd });
}

export function emitWorkflowCompleted(workflowId: string, workflowName: string, phaseCount: number, cwd: string): void {
  emit("workflow:completed", { workflowId, workflowName, phaseCount, timestamp: now(), cwd });
}

export function emitWorkflowFailed(workflowId: string, workflowName: string, error: string, cwd: string): void {
  emit("workflow:failed", { workflowId, workflowName, error, timestamp: now(), cwd });
}

// ─── Goal loop lifecycle ─────────────────────────────────────

export function emitGoalLoopStarted(goal: string, workerAgent: string, judgeAgent: string, maxTurns: number, cwd: string): void {
  emit("goal:started", { goal, workerAgent, judgeAgent, maxTurns, timestamp: now(), cwd });
}

export function emitGoalLoopCompleted(goal: string, turns: number, totalCost: number, cwd: string): void {
  emit("goal:completed", { goal, turns, totalCost, timestamp: now(), cwd });
}

export function emitGoalLoopFailed(goal: string, reason: string, cwd: string): void {
  emit("goal:failed", { goal, reason, timestamp: now(), cwd });
}
