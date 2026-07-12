import { getMarkdownTheme, keyHint } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { getFinalAssistantText } from "../execution/progress.js";
import { addSection, errorText, renderActivityLines, storedActivities, totalActivityCount } from "./render-activities.ts";
import { status, statusIcon, statusLabel } from "./render-status.ts";
import {
  COLLAPSED_ACTIVITY_COUNT,
  fmtUsage,
  getFallbackText,
  getPrimaryResult,
  preview,
  textPreview,
  MAX_TASK_PREVIEW_CHARS,
} from "./render-format.ts";

export function renderSubagentCall(args: any, theme: any) {
  const fg = theme.fg.bind(theme);
  const agent = typeof args?.agent === "string" && args.agent.trim() ? args.agent.trim() : "agent";
  const text = `${fg("toolTitle", theme.bold("subagent"))} ${fg("dim", agent)} ${fg("dim", preview(args?.task, MAX_TASK_PREVIEW_CHARS))}`;
  return new Text(text, 0, 0);
}

export function renderSubagentResult(toolResult: any, { expanded }: { expanded: boolean }, theme: any) {
  const result = getPrimaryResult(toolResult);
  if (!result) return new Text(getFallbackText(toolResult), 0, 0);

  const fg = theme.fg.bind(theme);
  const currentStatus = status(result);
  const icon = statusIcon(result, fg);
  const finalOutput = getFinalAssistantText(result.messages);
  const usage = fmtUsage(result);
  const activityText = renderActivityLines(result, fg, expanded ? undefined : COLLAPSED_ACTIVITY_COUNT);
  const mdTheme = getMarkdownTheme();

  if (expanded) {
    const container = new Container();
    container.addChild(new Spacer(1));
    container.addChild(new Text(`${icon} ${fg("toolTitle", theme.bold(statusLabel(currentStatus)))} ${fg("dim", result.agent)}`, 0, 0));
    addSection(container, "─── Agent ───", new Text(fg("dim", `${result.agent}${result.agentSource ? ` (${result.agentSource})` : ""}`), 0, 0), fg);
    addSection(container, "─── Task ───", new Text(fg("dim", result.task || "..."), 0, 0), fg);
    if (activityText) addSection(container, "─── Activity ───", new Text(activityText, 0, 0), fg);
    if (finalOutput) {
      addSection(container, "─── Output ───", new Markdown(finalOutput.trim(), 0, 0, mdTheme), fg);
    } else if (currentStatus !== "running") {
      addSection(container, "─── Output ───", new Text(fg("muted", "(no final response)"), 0, 0), fg);
    }
    const err = currentStatus === "error" ? errorText(result) : "";
    if (err) addSection(container, "─── Error ───", new Text(fg("error", err), 0, 0), fg);
    if (usage) { container.addChild(new Spacer(1)); container.addChild(new Text(fg("dim", usage), 0, 0)); }
    return container;
  }

  const collapsedStatusPrefix = currentStatus === "running" ? "" : "\n";
  let text = `${collapsedStatusPrefix}${icon} ${fg("toolTitle", theme.bold(statusLabel(currentStatus)))} ${fg("dim", result.agent)}`;
  if (activityText) {
    text += `\n${activityText}`;
    if (finalOutput) text += `\n\n${fg("toolOutput", textPreview(finalOutput))}`;
  } else if (finalOutput) {
    text += `\n${fg("toolOutput", textPreview(finalOutput))}`;
  } else if (currentStatus === "running") {
    text += `\n${fg("muted", "(running...)")}`;
  } else {
    text += `\n${fg("muted", "(no final response)")}`;
  }
  if (currentStatus === "error") {
    const err = errorText(result);
    if (err) text += `\n${fg("error", textPreview(err))}`;
  }
  if (usage) text += `\n${fg("dim", usage)}`;

  const activities = storedActivities(result);
  const total = totalActivityCount(result, activities);
  if (!expanded && (total > COLLAPSED_ACTIVITY_COUNT || finalOutput || currentStatus !== "running")) {
    text += `\n(${keyHint("app.tools.expand", "to expand")})`;
  }
  return new Text(text, 0, 0);
}
