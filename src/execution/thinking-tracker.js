/**
 * Thinking state tracking — extracted from activity-tracker.js.
 * Manages thinking activity lifecycle: creation, delta tracking, completion.
 */

import { addActivity, nextActivityOrder } from "./activity-tracker.js";

function latestRunningThinkingActivity(result) {
  const activities = Array.isArray(result.activities) ? result.activities : [];
  for (let i = activities.length - 1; i >= 0; i--) {
    const activity = activities[i];
    if (activity?.type === "thinking" && activity.status === "running") return activity;
  }
  return undefined;
}

export function createThinkingActivity(result) {
  return addActivity(result, {
    type: "thinking", status: "running", chars: 0,
    activityOrder: nextActivityOrder(result),
  });
}

export function ensureLatestThinkingActivity(result) {
  return latestRunningThinkingActivity(result) || createThinkingActivity(result);
}

export function syncThinkingState(result, activity) {
  result.thinking = {
    status: activity.status, chars: activity.chars, activityOrder: activity.activityOrder,
  };
  return result.thinking;
}
