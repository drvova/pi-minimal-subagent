// Styled completion notification box — extracted from widgets.ts.
// Compact themed box with icon, stats, result preview, expandable to full widget.

import { Container, Text } from "@mariozechner/pi-tui";
import type { RunStatus } from "../runs/types.ts";
import { icon, progressBar, statusColor } from "./widgets-shared.ts";
import { renderWorkflowWidget } from "./widgets.ts";
import { renderGoalWidget } from "./widgets-goal.ts";

export interface NotificationData {
  runId: string;
  workflowName?: string;
  goal?: string;
  status: RunStatus | string;
  phaseCount?: number;
  taskCount?: number;
  turnCount?: number;
  maxTurns?: number;
  cost?: number;
  preview?: string;
}

export function renderCompletionNotification(data: NotificationData, run: any, theme: any, expanded: boolean) {
  const fg = theme.fg.bind(theme);
  const container = new Container();
  const sIco = icon(data.status);
  const color = statusColor(data.status);

  if (expanded) {
    if (run?.phaseResults) return renderWorkflowWidget(run, theme);
    if (run?.turns) return renderGoalWidget(run, theme);
  }

  const W = 42;
  container.addChild(new Text(`${fg("border", "┌")}${fg("border", "─".repeat(W))}${fg("border", "┐")}`, 0, 0));

  const label = data.workflowName ? `workflow: ${data.workflowName}` : data.goal ? `goal: ${data.goal!.slice(0, 30)}` : "run";
  container.addChild(new Text(`${fg("border", "│")} ${fg(color, sIco)} ${fg("toolTitle", theme.bold(data.status))} ${fg("dim", label)}`, 0, 0));

  const stats: string[] = [];
  if (data.phaseCount) stats.push(`${data.phaseCount} phases`);
  if (data.taskCount) stats.push(`${data.taskCount} tasks`);
  if (data.turnCount) stats.push(`${data.turnCount}/${data.maxTurns || "?"} turns`);
  if (data.cost !== undefined) stats.push(`$${data.cost.toFixed(4)}`);
  if (stats.length) container.addChild(new Text(`${fg("border", "│")}  ${fg("dim", stats.join(" · "))}`, 0, 0));

  if (data.preview) {
    const p = data.preview.slice(0, 100).replace(/\n/g, " ");
    container.addChild(new Text(`${fg("border", "│")}  ${fg("dim", p)}`, 0, 0));
  }

  container.addChild(new Text(`${fg("border", "│")}  ${fg("muted", "[expand] for full results")}`, 0, 0));
  container.addChild(new Text(`${fg("border", "└")}${fg("border", "─".repeat(W))}${fg("border", "┘")}`, 0, 0));

  return container;
}
