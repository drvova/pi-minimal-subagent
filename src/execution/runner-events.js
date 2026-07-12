/**
 * Event dispatch — routes Pi JSON mode events to message tracking and activity tracking.
 * Message tracking: ./message-tracker.js
 * Activity/tool/thinking tracking: ./activity-tracker.js
 */

import { addMessageUsage, addMessagesUsage } from "./message-tracker.js";
import { latestActivity, processToolExecutionEvent } from "./activity-tracker.js";
import { createThinkingActivity, ensureLatestThinkingActivity, syncThinkingState } from "./thinking-tracker.js";

function processMessageUpdateEvent(event, result) {
  const assistantEvent = event.assistantMessageEvent;
  if (!assistantEvent || typeof assistantEvent !== "object") return false;

  switch (assistantEvent.type) {
    case "thinking_start": {
      const currentLatest = latestActivity(result);
      const activity = currentLatest?.type === "thinking" && currentLatest.status === "running"
        ? currentLatest
        : createThinkingActivity(result);
      activity.status = "running";
      syncThinkingState(result, activity);
      return true;
    }
    case "thinking_delta": {
      const activity = ensureLatestThinkingActivity(result);
      activity.status = "running";
      if (typeof assistantEvent.delta === "string") {
        activity.chars += assistantEvent.delta.length;
      }
      syncThinkingState(result, activity);
      return true;
    }
    case "thinking_end": {
      const activity = ensureLatestThinkingActivity(result);
      activity.status = "completed";
      if (typeof assistantEvent.content === "string") {
        activity.chars = assistantEvent.content.length;
      }
      syncThinkingState(result, activity);
      return true;
    }
    default:
      return false;
  }
}

export function processPiEvent(event, result) {
  if (!event || typeof event !== "object") return false;

  switch (event.type) {
    case "message_update":
      return processMessageUpdateEvent(event, result);

    case "message_end":
      return addMessageUsage(result, event.message);

    case "turn_end": {
      let changed = false;
      if (addMessageUsage(result, event.message)) changed = true;
      if (addMessagesUsage(result, event.toolResults)) changed = true;
      return changed;
    }

    case "agent_end":
      result.sawAgentEnd = true;
      return addMessagesUsage(result, event.messages);

    case "tool_execution_start":
    case "tool_execution_update":
    case "tool_execution_end":
      return processToolExecutionEvent(event, result);

    default:
      return false;
  }
}

export function processPiJsonLine(line, result) {
  if (!line.trim()) return false;
  let event;
  try { event = JSON.parse(line); } catch { return false; }
  return processPiEvent(event, result);
}
