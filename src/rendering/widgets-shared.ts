// Shared helpers for widget renderers — icons, colors, progress bars, token display.

import { fmtCount } from "./render-format.ts";
import type { RunStatus } from "../runs/types.ts";

export function icon(status: RunStatus | string): string {
  switch (status) {
    case "completed": case "achieved": return "✓";
    case "failed": case "error": case "blocked": return "✗";
    case "running": case "pending": return "…";
    case "aborted": return "⊘";
    case "needs_attention": return "!";
    default: return "•";
  }
}

export function statusColor(status: RunStatus | string): string {
  switch (status) {
    case "completed": case "achieved": return "success";
    case "failed": case "error": case "blocked": return "error";
    case "running": return "warning";
    case "aborted": return "error";
    case "needs_attention": return "warning";
    default: return "muted";
  }
}

export function progressBar(completed: number, total: number, width = 20): string {
  if (total === 0) return "";
  const done = Math.round((completed / total) * width);
  return `[${"█".repeat(done)}${"░".repeat(width - done)}] ${completed}/${total}`;
}

export function tokenDisplay(usage: Record<string, number>, fg: (c: any, t: string) => string): string {
  const parts: string[] = [];
  if (usage.input) parts.push(fg("dim", `↑${fmtCount(usage.input)}`));
  if (usage.output) parts.push(fg("dim", `↓${fmtCount(usage.output)}`));
  if (usage.cost) parts.push(fg("dim", `$${usage.cost.toFixed(4)}`));
  return parts.join(" ");
}
