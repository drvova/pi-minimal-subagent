/**
 * Activity/tool/thinking tracking — state management for subagent event processing.
 * Extracted from runner-events.js. Depends on format-utils.js for tool preview formatting.
 */

import {
  MAX_TOOL_ARGS_PREVIEW_CHARS,
  stringifyPreview,
  formatToolCallPreview,
  extractResultText,
} from "./format-utils.js";

const MAX_STORED_TOOL_EXECUTIONS = 25;
const MAX_STORED_ACTIVITIES = 50;

function maxActivityOrder(result) {
  const orders = [];
  if (typeof result?.thinking?.activityOrder === "number") orders.push(result.thinking.activityOrder);
  if (Array.isArray(result?.activities)) {
    for (const activity of result.activities) {
      if (typeof activity?.activityOrder === "number") orders.push(activity.activityOrder);
    }
  }
  if (Array.isArray(result?.toolExecutions)) {
    for (const tool of result.toolExecutions) {
      if (typeof tool?.activityOrder === "number") orders.push(tool.activityOrder);
    }
  }
  return orders.length > 0 ? Math.max(...orders) : 0;
}

export function nextActivityOrder(result) {
  if (!Object.prototype.hasOwnProperty.call(result, "__activityOrder")) {
    Object.defineProperty(result, "__activityOrder", {
      value: maxActivityOrder(result),
      enumerable: false, configurable: false, writable: true,
    });
  }
  result.__activityOrder += 1;
  return result.__activityOrder;
}

function ensureActivities(result) {
  if (!Array.isArray(result.activities)) result.activities = [];
  return result.activities;
}

export function addActivity(result, activity) {
  const activities = ensureActivities(result);
  const totalBefore = typeof result.activityCount === "number"
    ? result.activityCount : activities.length;
  result.activityCount = totalBefore + 1;
  activities.push(activity);
  while (activities.length > MAX_STORED_ACTIVITIES) activities.shift();
  return activity;
}

function findToolActivity(result, toolCallId) {
  if (!toolCallId || !Array.isArray(result.activities)) return undefined;
  return result.activities.find((a) => a?.type === "tool" && a.toolCallId === toolCallId);
}

export function syncToolActivity(result, tool) {
  if (!tool || typeof tool !== "object") return undefined;
  let activity = findToolActivity(result, tool.toolCallId);
  if (!activity) {
    activity = { type: "tool", ...tool, activityOrder: tool.activityOrder || nextActivityOrder(result) };
    addActivity(result, activity);
  } else {
    Object.assign(activity, tool, { type: "tool" });
  }
  return activity;
}

export function latestActivity(result) {
  const activities = Array.isArray(result.activities) ? result.activities : [];
  return activities[activities.length - 1];
}

function ensureToolExecutions(result) {
  if (!Array.isArray(result.toolExecutions)) result.toolExecutions = [];
  return result.toolExecutions;
}

function findToolExecution(result, event) {
  const toolExecutions = ensureToolExecutions(result);
  const toolCallId = typeof event.toolCallId === "string" ? event.toolCallId : undefined;
  let tool = toolCallId ? toolExecutions.find((e) => e.toolCallId === toolCallId) : undefined;
  if (!tool) {
    const totalBefore = typeof result.toolExecutionCount === "number"
      ? result.toolExecutionCount : toolExecutions.length;
    result.toolExecutionCount = totalBefore + 1;
    tool = {
      toolCallId: toolCallId || `unknown-${result.toolExecutionCount}`,
      toolName: typeof event.toolName === "string" ? event.toolName : "tool",
      status: "running", updates: 0,
      activityOrder: nextActivityOrder(result),
    };
    toolExecutions.push(tool);
    while (toolExecutions.length > MAX_STORED_TOOL_EXECUTIONS) toolExecutions.shift();
  }
  if (typeof event.toolName === "string") tool.toolName = event.toolName;
  if (Object.prototype.hasOwnProperty.call(event, "args")) {
    tool.argsPreview = stringifyPreview(event.args, MAX_TOOL_ARGS_PREVIEW_CHARS);
    tool.displayText = formatToolCallPreview(tool.toolName, event.args);
  }
  if (!tool.displayText) tool.displayText = tool.toolName;
  return tool;
}

export function processToolExecutionEvent(event, result) {
  const tool = findToolExecution(result, event);
  switch (event.type) {
    case "tool_execution_start":
      tool.status = "running"; tool.isError = false; tool.latestText = "";
      syncToolActivity(result, tool);
      return true;
    case "tool_execution_update":
      tool.status = "running"; tool.isError = false;
      tool.updates = (tool.updates || 0) + 1;
      const latestText = extractResultText(event.partialResult);
      if (latestText) tool.latestText = latestText;
      syncToolActivity(result, tool);
      return true;
    case "tool_execution_end":
      tool.status = event.isError ? "error" : "completed";
      tool.isError = Boolean(event.isError);
      const endText = extractResultText(event.result);
      if (endText) tool.latestText = endText;
      syncToolActivity(result, tool);
      return true;
    default:
      return false;
  }
}
