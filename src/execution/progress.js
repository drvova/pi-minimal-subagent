/**
 * Output text generators — final assistant text, progress text, summary text.
 * Activity-listing formatters live in ./progress-format.js.
 */

import { formatToolProgress } from "./progress-format.js";

export function getFinalAssistantText(messages) {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.role !== "assistant" || !Array.isArray(message.content)) continue;
    const text = message.content
      .filter((part) => part?.type === "text" && typeof part.text === "string" && part.text.length > 0)
      .map((part) => part.text)
      .join("");
    if (text) return text;
  }
  return "";
}

export function getForkProgressText(result) {
  const finalText = getFinalAssistantText(result?.messages);
  if (finalText) return finalText;
  const toolProgress = formatToolProgress(result);
  if (toolProgress) return toolProgress;
  if (typeof result?.errorMessage === "string" && result.errorMessage.trim()) {
    return result.errorMessage.trim();
  }
  return "(running...)";
}

export const getSubagentProgressText = getForkProgressText;

export function getResultSummaryText(result) {
  const finalText = getFinalAssistantText(result?.messages);
  if (finalText) return finalText;
  if (typeof result?.errorMessage === "string" && result.errorMessage.trim()) {
    return result.errorMessage.trim();
  }
  const isError = (typeof result?.exitCode === "number" && result.exitCode > 0)
    || result?.stopReason === "error" || result?.stopReason === "aborted";
  if (isError && typeof result?.stderr === "string" && result.stderr.trim()) {
    return result.stderr.trim();
  }
  return "(no output)";
}
