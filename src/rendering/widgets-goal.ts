// Goal loop widget — extracted from widgets.ts.
// Renders multi-turn worker+judge goal results with verdict and cost display.

import { Container, Spacer, Text } from "@mariozechner/pi-tui";
import type { GoalRun } from "../engine/goal-types.ts";
import { fmtCount } from "./render-format.ts";
import { icon, progressBar, statusColor } from "./widgets-shared.ts";

export function renderGoalWidget(run: GoalRun, theme: any) {
  const fg = theme.fg.bind(theme);
  const container = new Container();

  const sIco = icon(run.status === "achieved" ? "completed" : run.status === "running" ? "running" : "failed");

  container.addChild(new Text(
    `${fg(statusColor(run.status), sIco)} ${fg("toolTitle", theme.bold(`goal: ${run.goal.slice(0, 80)}`))} ${fg(statusColor(run.status), run.status)}`,
    0, 0,
  ));
  container.addChild(new Spacer(1));

  container.addChild(new Text(
    `${fg("dim", progressBar(run.turns.length, run.maxTurns, 15))}  ${fg("dim", `${run.turns.length}/${run.maxTurns} turns`)}`,
    0, 0,
  ));
  container.addChild(new Spacer(1));

  for (const turn of run.turns) {
    const tIco = turn.judgeVerdict === "achieved" ? "✓" : turn.judgeVerdict === "blocked" ? "✗" : "…";
    const tColor = turn.judgeVerdict === "achieved" ? "success" : turn.judgeVerdict === "blocked" ? "error" : "warning";

    container.addChild(new Text(
      `  ${fg(tColor, tIco)} ${fg("dim", `Turn ${turn.turnNumber}`)}: ${fg(tColor, turn.judgeVerdict)}`,
      0, 0,
    ));

    const snippet = turn.workerResponse.slice(0, 150).replace(/\n/g, " ");
    if (snippet) container.addChild(new Text(`     ${fg("dim", snippet)}`, 0, 0));

    if (turn.judgeReason) {
      container.addChild(new Text(`     ${fg("dim", `judge: ${turn.judgeReason.slice(0, 120)}`)}`, 0, 0));
    }

    const turnCost = (turn.usage?.workerCost || 0) + (turn.usage?.judgeCost || 0);
    if (turnCost > 0) {
      container.addChild(new Text(`     ${fg("dim", `↑${fmtCount(turn.usage?.workerInput || 0)} ↓${fmtCount(turn.usage?.workerOutput || 0)} · $${turnCost.toFixed(4)}`)}`, 0, 0));
    }
  }

  if (run.totalCost > 0) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(fg("dim", `total cost: $${run.totalCost.toFixed(4)}`), 0, 0));
  }

  return container;
}
