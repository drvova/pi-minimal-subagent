import { type SubagentResult } from "../execution/types.ts";
import { isResultError, isResultSuccess } from "../execution/result-utils.ts";
import { inlinePreview } from "./render-format.ts";

export function status(result: SubagentResult): "running" | "success" | "error" {
  if (result.exitCode === -1) return "running";
  if (isResultSuccess(result)) return "success";
  if (isResultError(result)) return "error";
  return "error";
}

export function statusIcon(result: SubagentResult, fg: (color: any, text: string) => string): string {
  const current = status(result);
  if (current === "running") return fg("warning", "…");
  if (current === "error") return fg("error", "×");
  return fg("success", "✓");
}

export function statusLabel(current: "running" | "success" | "error"): string {
  if (current === "running") return "running";
  if (current === "success") return "completed";
  return "failed";
}

export function toolIcon(tool: any, fg: (color: any, text: string) => string): string {
  if (tool?.status === "running") return fg("warning", "…");
  if (tool?.status === "error" || tool?.isError) return fg("error", "×");
  return fg("success", "✓");
}

export function toolLabel(tool: any): string {
  return tool?.displayText || tool?.toolName || "tool";
}

export function toolErrorSuffix(tool: any, fg: (color: any, text: string) => string): string {
  if (tool?.status !== "error" && !tool?.isError) return "";
  if (typeof tool.latestText !== "string" || !tool.latestText.trim()) return "";
  return fg("error", ` — ${inlinePreview(tool.latestText)}`);
}

export function totalToolExecutions(result: SubagentResult): number {
  const stored = Array.isArray(result.toolExecutions) ? result.toolExecutions.length : 0;
  return typeof result.toolExecutionCount === "number" ? Math.max(result.toolExecutionCount, stored) : stored;
}

export function hasUnifiedActivities(result: SubagentResult): boolean {
  return Array.isArray(result.activities) && result.activities.length > 0;
}

export function latestToolWithPreview(result: SubagentResult): any | undefined {
  const activities = hasUnifiedActivities(result) ? result.activities! : [];
  for (let i = activities.length - 1; i >= 0; i--) {
    const activity = activities[i];
    if (activity?.type === "tool" && activity.status === "running" && activity.latestText) return activity;
  }
  const tools = Array.isArray(result.toolExecutions) ? result.toolExecutions : [];
  for (let i = tools.length - 1; i >= 0; i--) {
    const tool = tools[i];
    if (tool?.status === "running" && tool.latestText) return tool;
  }
  return undefined;
}
