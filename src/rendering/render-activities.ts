import { Container, Spacer, Text } from "@mariozechner/pi-tui";
import { type SubagentResult } from "../execution/types.ts";
import {
  fmtCount,
  MAX_ERROR_PREVIEW_CHARS,
  MAX_TEXT_PREVIEW_CHARS,
  textPreview,
  truncate,
} from "./render-format.ts";
import {
  hasUnifiedActivities,
  latestToolWithPreview,
  toolErrorSuffix,
  toolIcon,
  toolLabel,
  totalToolExecutions,
} from "./render-status.ts";

export function thinkingLine(thinking: any, fg: (color: any, text: string) => string): string {
  if (!thinking) return "";
  const icon = thinking.status === "running" ? fg("warning", "…") : fg("success", "✓");
  const chars = typeof thinking.chars === "number" ? thinking.chars : 0;
  const label = chars > 0
    ? `thinking ${fmtCount(chars)} chars`
    : thinking.status === "running" ? "thinking..." : "thinking";
  return `${icon} ${fg("toolOutput", label)}`;
}

export function activityOrder(item: any, fallback: number): number {
  return typeof item?.activityOrder === "number" ? item.activityOrder : fallback;
}

export function legacyActivities(result: SubagentResult): any[] {
  const activities: any[] = [];
  if (result.thinking) activities.push({ ...result.thinking, type: "thinking" });
  const tools = Array.isArray(result.toolExecutions) ? result.toolExecutions : [];
  for (const tool of tools) activities.push({ ...tool, type: "tool" });
  activities.sort((a, b) => activityOrder(a, 0) - activityOrder(b, 0));
  return activities;
}

export function storedActivities(result: SubagentResult): any[] {
  return hasUnifiedActivities(result) ? result.activities! : legacyActivities(result);
}

export function totalActivityCount(result: SubagentResult, stored: any[]): number {
  if (typeof result.activityCount === "number") return Math.max(result.activityCount, stored.length);
  if (hasUnifiedActivities(result)) return stored.length;
  return totalToolExecutions(result) + (result.thinking ? 1 : 0);
}

export function activityLine(activity: any, fg: (color: any, text: string) => string): string {
  if (activity?.type === "thinking") return thinkingLine(activity, fg);
  if (activity?.type === "tool") {
    return `${toolIcon(activity, fg)} ${fg(activity?.status === "error" ? "error" : "toolOutput", toolLabel(activity))}${toolErrorSuffix(activity, fg)}`;
  }
  return "";
}

export function renderActivityLines(
  result: SubagentResult,
  fg: (color: any, text: string) => string,
  limit?: number,
): string {
  const activities = storedActivities(result);
  const lines: string[] = [];
  const toShow = limit ? activities.slice(-limit) : activities;
  const skipped = Math.max(0, totalActivityCount(result, activities) - toShow.length);
  if (skipped > 0) lines.push(fg("muted", `... ${skipped} earlier activit${skipped === 1 ? "y" : "ies"}`));
  for (const activity of toShow) {
    const line = activityLine(activity, fg);
    if (line) lines.push(line);
  }
  const previewTool = latestToolWithPreview(result);
  if (previewTool?.latestText) {
    lines.push("");
    lines.push(fg("toolOutput", textPreview(previewTool.latestText, MAX_TEXT_PREVIEW_CHARS)));
  }
  return lines.join("\n").trimEnd();
}

export function errorText(result: SubagentResult): string {
  const message = result.errorMessage?.trim() || result.stderr?.trim() || "";
  return message ? truncate(message, MAX_ERROR_PREVIEW_CHARS) : "";
}

export function addSection(container: any, title: string, child: any, fg: (color: any, text: string) => string) {
  container.addChild(new Spacer(1));
  container.addChild(new Text(fg("muted", title), 0, 0));
  container.addChild(child);
}
