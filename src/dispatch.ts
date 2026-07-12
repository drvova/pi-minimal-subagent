// Action handler dispatcher — routes to execution and CRUD handlers.
// Execution handlers in ./dispatch-exec.ts, CRUD in ./dispatch-crud.ts, runs in ./dispatch-runs.ts

import { setEventBus } from "./engine/events.ts";
import { handleGSD, handleGoalRun, handleRun, handleSteer, handleWorkflowRun } from "./dispatch-exec.ts";
import {
  handleAgentCreate, handleAgentDelete, handleAgentList, handleAgentUpdate,
  handleTeamCreate, handleTeamDelete, handleTeamList, handleTeamUpdate,
  handleWorkflowCreate, handleWorkflowDelete, handleWorkflowList, handleWorkflowUpdate,
} from "./dispatch-crud.ts";
import { handleRunAbort, handleRunList, handleRunStatus } from "./dispatch-runs.ts";

type ToolResult = { content: Array<{ type: "text"; text: string }>; details: any; isError?: boolean };

type ActionHandler = () => Promise<ToolResult>;

export async function dispatchAction(
  action: string,
  params: Record<string, any>,
  cwd: string,
  signal: AbortSignal | undefined,
  onUpdate: any,
  pi: { events?: any } | undefined,
): Promise<ToolResult> {
  if (pi?.events) setEventBus(pi.events);
  const a = action || "run";

  const handlers: Record<string, () => Promise<ToolResult>> = {
    "run": () => handleRun(params, cwd, signal, onUpdate),
    "run-workflow": () => handleWorkflowRun(params, cwd, signal),
    "run-goal": () => handleGoalRun(params, cwd, signal),
    "gsd": () => handleGSD(params, cwd, signal),
    "steer": () => handleSteer(params, cwd, signal, onUpdate),
    "workflows": () => handleWorkflowList(cwd),
    "workflow-create": () => handleWorkflowCreate(params, cwd),
    "workflow-update": () => handleWorkflowUpdate(params, cwd),
    "workflow-delete": () => handleWorkflowDelete(params, cwd),
    "teams": () => handleTeamList(cwd),
    "team-create": () => handleTeamCreate(params, cwd),
    "team-update": () => handleTeamUpdate(params, cwd),
    "team-delete": () => handleTeamDelete(params, cwd),
    "agents": () => handleAgentList(cwd),
    "agent-create": () => handleAgentCreate(params, cwd),
    "agent-update": () => handleAgentUpdate(params, cwd),
    "agent-delete": () => handleAgentDelete(params, cwd),
    "runs": () => handleRunList(cwd),
    "run-status": () => handleRunStatus(params, cwd),
    "run-abort": () => handleRunAbort(params),
  };

  const handler = handlers[a];
  if (!handler) {
    return { content: [{ type: "text", text: `Unknown action "${a}".` }], details: {}, isError: true };
  }
  return handler();
}
