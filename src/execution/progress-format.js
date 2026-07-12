/**
 * Activity-listing formatters — extracted from progress.js.
 * Format tool progress, activity summaries, thinking progress for display.
 */

import { formatCount, MAX_INLINE_ERROR_PREVIEW_CHARS, truncateInline } from "./format-utils.js";

// Use Pi's built-in truncateLine when available (Bun runtime); fall back to custom truncateInline
var peekLine = truncateInline;
try { var piModule = require("@mariozechner/pi-coding-agent"); if (piModule.truncateLine) peekLine = function(t,n) { return piModule.truncateLine(t,n).text; }; } catch(e) {}

function getLatestRelevantToolExecution(result) {
  const activities = Array.isArray(result?.activities) ? result.activities : [];
  for (let i = activities.length - 1; i >= 0; i--) {
    const activity = activities[i];
    if (activity?.type === "tool" && activity.status === "running") return activity;
  }
  for (let i = activities.length - 1; i >= 0; i--) {
    const activity = activities[i];
    if (activity?.type === "tool") return activity;
  }
  const toolExecutions = Array.isArray(result?.toolExecutions) ? result.toolExecutions : [];
  for (let i = toolExecutions.length - 1; i >= 0; i--) {
    if (toolExecutions[i]?.status === "running") return toolExecutions[i];
  }
  return toolExecutions[toolExecutions.length - 1];
}

function formatToolStatusIcon(tool) {
  if (tool?.status === "running") return "…";
  if (tool?.status === "error") return "×";
  return "✓";
}

function formatToolErrorSuffix(tool) {
  if (tool?.status !== "error" && !tool?.isError) return "";
  if (typeof tool.latestText !== "string" || !tool.latestText.trim()) return "";
  return ` — ${peekLine(tool.latestText, MAX_INLINE_ERROR_PREVIEW_CHARS)}`;
}

function formatThinkingActivityProgress(thinking) {
  if (!thinking || typeof thinking !== "object") return "";
  const icon = thinking.status === "running" ? "…" : "✓";
  const chars = typeof thinking.chars === "number" ? thinking.chars : 0;
  const label = chars > 0
    ? `thinking ${formatCount(chars)} chars`
    : thinking.status === "running" ? "thinking..." : "thinking";
  return `${icon} ${label}`;
}

function getActivityOrder(item, fallback) {
  return typeof item?.activityOrder === "number" ? item.activityOrder : fallback;
}

function formatActivityProgress(activity) {
  if (activity?.type === "thinking") return formatThinkingActivityProgress(activity);
  if (activity?.type === "tool") {
    return `${formatToolStatusIcon(activity)} ${activity.displayText || activity.toolName || "tool"}${formatToolErrorSuffix(activity)}`;
  }
  return "";
}

function legacyActivities(result) {
  const activities = [];
  if (result?.thinking) activities.push({ ...result.thinking, type: "thinking" });
  const toolExecutions = Array.isArray(result?.toolExecutions) ? result.toolExecutions : [];
  for (const tool of toolExecutions) activities.push({ ...tool, type: "tool" });
  activities.sort((a, b) => getActivityOrder(a, 0) - getActivityOrder(b, 0));
  return activities;
}

function getStoredActivities(result) {
  const activities = Array.isArray(result?.activities) && result.activities.length > 0
    ? result.activities : legacyActivities(result);
  return activities.filter((a) => a && typeof a === "object");
}

function totalActivities(result, storedActivities) {
  if (typeof result?.activityCount === "number") {
    return Math.max(result.activityCount, storedActivities.length);
  }
  if (Array.isArray(result?.activities) && result.activities.length > 0) return storedActivities.length;
  const totalTools = typeof result?.toolExecutionCount === "number"
    ? Math.max(result.toolExecutionCount, Array.isArray(result?.toolExecutions) ? result.toolExecutions.length : 0)
    : Array.isArray(result?.toolExecutions) ? result.toolExecutions.length : 0;
  return totalTools + (result?.thinking ? 1 : 0);
}

export function formatToolProgress(result) {
  const storedActivities = getStoredActivities(result);
  const lines = [];
  const toShow = storedActivities.slice(-10);
  const skipped = Math.max(0, totalActivities(result, storedActivities) - toShow.length);
  if (skipped > 0) lines.push(`... ${skipped} earlier activit${skipped === 1 ? "y" : "ies"}`);
  for (const activity of toShow) {
    const line = formatActivityProgress(activity);
    if (line) lines.push(line);
  }
  const activeTool = getLatestRelevantToolExecution(result);
  if (activeTool?.latestText && activeTool.status !== "error" && !activeTool.isError) {
    lines.push(activeTool.latestText);
  }
  return lines.join("\n").trim();
}
