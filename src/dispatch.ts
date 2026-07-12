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

export async function dispatchAction(
  action: string, params: Record<string, any>,
  cwd: string, signal: AbortSignal | undefined,
  onUpdate: any, pi: any,
): Promise<ToolResult> {
  setEventBus(pi.events);
  const a = action || "run";

  if (a === "run") return handleRun(params, cwd, signal, onUpdate);
  if (a === "run-workflow") return handleWorkflowRun(params, cwd, signal);
  if (a === "run-goal") return handleGoalRun(params, cwd, signal);
  if (a === "gsd") return handleGSD(params, cwd, signal);
  if (a === "steer") return handleSteer(params, cwd);

  if (a === "workflows") return handleWorkflowList(cwd);
  if (a === "workflow-create") return handleWorkflowCreate(params, cwd);
  if (a === "workflow-update") return handleWorkflowUpdate(params, cwd);
  if (a === "workflow-delete") return handleWorkflowDelete(params, cwd);
  if (a === "teams") return handleTeamList(cwd);
  if (a === "team-create") return handleTeamCreate(params, cwd);
  if (a === "team-update") return handleTeamUpdate(params, cwd);
  if (a === "team-delete") return handleTeamDelete(params, cwd);
  if (a === "agents") return handleAgentList(cwd);
  if (a === "agent-create") return handleAgentCreate(params, cwd);
  if (a === "agent-update") return handleAgentUpdate(params, cwd);
  if (a === "agent-delete") return handleAgentDelete(params, cwd);
  if (a === "runs") return handleRunList(cwd);
  if (a === "run-status") return handleRunStatus(params, cwd);
  if (a === "run-abort") return handleRunAbort(params);

  return { content: [{ type: "text", text: `Unknown action "${a}".` }], details: {}, isError: true };
}
