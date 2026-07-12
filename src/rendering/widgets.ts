// Rich widget renderers for subagent, workflow, and goal run results.
// Shared helpers (icon, statusColor, progressBar, tokenDisplay) in ./widgets-shared.ts

import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { getFinalAssistantText } from "../execution/progress.js";
import type { SubagentResult } from "../execution/types.ts";
import { isResultError, isResultSuccess } from "../execution/result-utils.ts";
import type { GoalRun } from "../engine/goal-types.ts";
import type { WorkflowRun } from "../runs/types.ts";
import { renderActivityLines } from "./render-activities.ts";
import { fmtCount, fmtModelProvider, MAX_TASK_PREVIEW_CHARS } from "./render-format.ts";
import type { RunStatus } from "../runs/types.ts";
import { icon, progressBar, statusColor, tokenDisplay } from "./widgets-shared.ts";

// ─── Subagent widget ──────────────────────────────────────────

export function renderSubagentWidget(toolResult: any, theme: any) {
  const results = toolResult?.details?.results;
  const result: SubagentResult | undefined = Array.isArray(results) && results.length > 0 ? results[0] : undefined;
  if (!result) return new Text("(no output)", 0, 0);

  const fg = theme.fg.bind(theme);
  const mdTheme = getMarkdownTheme();
  const container = new Container();

  const isRunning = result.exitCode === -1;
  const isSuccess = isResultSuccess(result);
  const isError = isResultError(result);

  const statusText = isRunning ? "running" : isSuccess ? "completed" : "failed";
  const statusIco = icon(isRunning ? "running" : isSuccess ? "completed" : "failed");

  // Header
  container.addChild(new Text(
    `${fg(statusColor(isRunning ? "running" : isSuccess ? "completed" : "failed"), statusIco)} ${fg("toolTitle", theme.bold(statusText))} ${fg("dim", result.agent)}`,
    0, 0,
  ));
  container.addChild(new Spacer(1));

  // Task
  container.addChild(new Text(fg("dim", `task: ${result.task || "..."}`), 0, 0));
  container.addChild(new Spacer(1));

  // Activity with model/token info
  if (result.agent) {
    const activityText = renderActivityLines(result, fg);
    if (activityText) {
      container.addChild(new Text(activityText, 0, 0));
      container.addChild(new Spacer(1));
    }
  }

  // Model + token usage
  const modelInfo = fmtModelProvider(result);
  const tokenInfo = tokenDisplay({
    input: result.usage?.input || 0,
    output: result.usage?.output || 0,
    cost: result.usage?.cost || 0,
  }, fg);

  if (modelInfo || tokenInfo.trim()) {
    let info = "";
    if (modelInfo) info += fg("dim", modelInfo);
    if (tokenInfo.trim()) info += (info ? "  " : "") + tokenInfo;
    if (info) container.addChild(new Text(info, 0, 0));
  }

  // Final output
  if (!isRunning) {
    const finalOutput = getFinalAssistantText(result.messages);
    if (finalOutput) {
      container.addChild(new Spacer(1));
      container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
    }
    if (isError && result.stderr?.trim()) {
      container.addChild(new Spacer(1));
      container.addChild(new Text(fg("error", result.stderr.trim().slice(0, 500)), 0, 0));
    }
  }

  return container;
}

// ─── Workflow widget ──────────────────────────────────────────

export function renderWorkflowWidget(run: WorkflowRun, theme: any) {
  const fg = theme.fg.bind(theme);
  const mdTheme = getMarkdownTheme();
  const container = new Container();

  // Header
  const sIco = icon(run.status);
  container.addChild(new Text(
    `${fg(statusColor(run.status), sIco)} ${fg("toolTitle", theme.bold(`workflow: ${run.workflowName}`))} ${fg(statusColor(run.status), run.status === "running" ? "running" : run.status)}`,
    0, 0,
  ));
  container.addChild(new Spacer(1));

  // Overall progress
  const totalTasks = run.phaseResults.reduce((s, p) => s + p.taskResults.length, 0);
  const completedTasks = run.phaseResults.reduce((s, p) => s + p.taskResults.filter(t => t.status === "completed").length, 0);
  if (totalTasks > 0) {
    container.addChild(new Text(fg("dim", progressBar(completedTasks, totalTasks)), 0, 0));
  }
  container.addChild(new Spacer(1));

  // Phase list
  for (let i = 0; i < run.phaseResults.length; i++) {
    const p = run.phaseResults[i];
    const pCompleted = p.taskResults.filter(t => t.status === "completed").length;
    const pTotal = p.taskResults.length;

    container.addChild(new Text(
      `  ${fg(statusColor(p.status), icon(p.status))} ${fg("toolOutput", `${i + 1}. ${p.phaseName}`)}  ${fg("dim", progressBar(pCompleted, pTotal, 12))}`,
      0, 0,
    ));

    // Task details
    for (const t of p.taskResults) {
      const tIco = icon(t.status);
      const tColor = statusColor(t.status);
      const response = (t.response || t.errorMessage || "").slice(0, 120);
      const agentLabel = fg("dim", t.agent);
      const emptyLabel = t.status === "needs_attention" ? fg("warning", "(no output — needs attention)") : fg("dim", "(running...)");
      const verdict = response ? fg(tColor, response) : emptyLabel;
      container.addChild(new Text(`     ${fg(tColor, tIco)} ${agentLabel}: ${verdict}`, 0, 0));
    }
    if (i < run.phaseResults.length - 1) container.addChild(new Spacer(1));
  }

  // Cost
  if ((run as any).totalCost && (run as any).totalCost > 0) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(fg("dim", `cost: $${(run as any).totalCost.toFixed(4)}  ·  ${run.phaseResults.length} phases`), 0, 0));
  }

  if (run.error) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(fg("error", `error: ${run.error}`), 0, 0));
  }

  return container;
}

// ─── Goal loop widget ─────────────────────────────────────────

export function renderGoalWidget(run: GoalRun, theme: any) {
  const fg = theme.fg.bind(theme);
  const container = new Container();

  const sIco = icon(run.status === "achieved" ? "completed" : run.status === "running" ? "running" : "failed");

  // Header with progress
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

  // Turn details
  for (const turn of run.turns) {
    const tIco = turn.judgeVerdict === "achieved" ? "✓" : turn.judgeVerdict === "blocked" ? "✗" : "…";
    const tColor = turn.judgeVerdict === "achieved" ? "success" : turn.judgeVerdict === "blocked" ? "error" : "warning";

    container.addChild(new Text(
      `  ${fg(tColor, tIco)} ${fg("dim", `Turn ${turn.turnNumber}`)}: ${fg(tColor, turn.judgeVerdict)}`,
      0, 0,
    ));

    // Worker response snippet
    const snippet = turn.workerResponse.slice(0, 150).replace(/\n/g, " ");
    if (snippet) container.addChild(new Text(`     ${fg("dim", snippet)}`, 0, 0));

    // Judge reason
    if (turn.judgeReason) {
      container.addChild(new Text(`     ${fg("dim", `judge: ${turn.judgeReason.slice(0, 120)}`)}`, 0, 0));
    }

    // Token/cost per turn
    const turnCost = (turn.usage?.workerCost || 0) + (turn.usage?.judgeCost || 0);
    if (turnCost > 0) {
      container.addChild(new Text(`     ${fg("dim", `↑${fmtCount(turn.usage?.workerInput || 0)} ↓${fmtCount(turn.usage?.workerOutput || 0)} · \$ ${turnCost.toFixed(4)}`)}`, 0, 0));
    }
  }

  // Total cost
  if (run.totalCost > 0) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(fg("dim", `total cost: $${run.totalCost.toFixed(4)}`), 0, 0));
  }

  return container;
}

// ─── Quick status line widget ──────────────────────────────────

export function renderGSDWidget(run: any, theme: any) {
  const fg = theme.fg.bind(theme);
  const container = new Container();

  const allDone = run.phases?.every((p: any) => p.status === "completed");
  const status = allDone ? "completed" : run.status;
  const sIco = icon(status);
  const color = statusColor(status);

  container.addChild(new Text(`${fg(color, sIco)} ${fg("toolTitle", theme.bold("GSD Cycle"))} ${fg(color, status)}  ${fg("dim", `$${run.totalCost?.toFixed(4) || "0.0000"}`)}`, 0, 0));
  container.addChild(new Spacer(1));

  const phases = run.phases || [];
  for (const p of phases) {
    const pIco = icon(p.status);
    const pColor = statusColor(p.status);
    const snippet = (p.response || "").slice(0, 100).replace(/\n/g, " ");
    container.addChild(new Text(`  ${fg(pColor, pIco)} ${fg("dim", p.name.padEnd(10))} ${fg("dim", p.agent)}: ${snippet}`, 0, 0));
    if (p.usage?.cost > 0) {
      container.addChild(new Text(`     ${fg("dim", `↑${fmtCount(p.usage.input || 0)} ↓${fmtCount(p.usage.output || 0)} · $${p.usage.cost.toFixed(4)}`)}`, 0, 0));
    }
  }

  return container;
}

export function renderStatusLine(label: string, status: RunStatus | string, details: string, theme: any): Text {
  const fg = theme.fg.bind(theme);
  const sIco = icon(status);
  const text = `${fg(statusColor(status), sIco)} ${fg("toolTitle", theme.bold(label))} ${fg(statusColor(status), status)}  ${fg("dim", details)}`;
  return new Text(text, 0, 0);
}

