import type { SubagentResult } from "../execution/types.ts";

export const COLLAPSED_ACTIVITY_COUNT = 8;
export const COLLAPSED_OUTPUT_LINES = 3;
export const MAX_TASK_PREVIEW_CHARS = 72;
export const MAX_TEXT_PREVIEW_CHARS = 2000;
export const MAX_ERROR_PREVIEW_CHARS = 4000;
export const MAX_INLINE_ERROR_PREVIEW_CHARS = 160;

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

export function preview(value: unknown, maxChars: number): string {
  if (typeof value !== "string" || !value.trim()) return "...";
  return truncate(value.replace(/\s+/g, " ").trim(), maxChars);
}

export function textPreview(text: string, maxChars = MAX_TEXT_PREVIEW_CHARS): string {
  return truncate(text.trim().split(/\r?\n/).slice(0, COLLAPSED_OUTPUT_LINES).join("\n"), maxChars);
}

export function inlinePreview(text: string, maxChars = MAX_INLINE_ERROR_PREVIEW_CHARS): string {
  return truncate(text.replace(/\s+/g, " ").trim(), maxChars);
}

export function fmtCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1000) return String(Math.round(n));
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function fmtModelProvider(result: SubagentResult): string {
  const provider = result.provider?.trim();
  const model = result.model?.trim();
  if (provider && model) return model.startsWith(`${provider}/`) ? model : `${provider}/${model}`;
  return model || provider || "";
}

export function fmtUsage(result: SubagentResult): string {
  const usage = result.usage;
  if (!usage) return "";
  const parts: string[] = [];
  if (usage.turns) parts.push(`${usage.turns} turn${usage.turns === 1 ? "" : "s"}`);
  if (usage.input) parts.push(`↑${fmtCount(usage.input)}`);
  if (usage.output) parts.push(`↓${fmtCount(usage.output)}`);
  if (usage.cacheRead) parts.push(`R${fmtCount(usage.cacheRead)}`);
  if (usage.cacheWrite) parts.push(`W${fmtCount(usage.cacheWrite)}`);
  if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
  const modelProvider = fmtModelProvider(result);
  if (modelProvider) parts.push(modelProvider);
  return parts.join(" ");
}

export function getPrimaryResult(toolResult: any): SubagentResult | undefined {
  const results = toolResult?.details?.results;
  return Array.isArray(results) && results.length > 0 ? results[0] : undefined;
}

export function getFallbackText(toolResult: any): string {
  const content = toolResult?.content;
  if (!Array.isArray(content)) return "(no output)";
  const text = content.find((part: any) => part?.type === "text" && typeof part.text === "string");
  return text?.text || "(no output)";
}
