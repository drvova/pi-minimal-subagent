import type { Message } from "@mariozechner/pi-ai";
import { getFinalAssistantText } from "./progress.js";
import type { SubagentResult, ToolExecution } from "./types.ts";

export function emptyUsage() {
  return {
    input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
    cost: 0, contextTokens: 0, turns: 0,
  };
}

export function hasFinalAssistantOutput(
  r: Pick<SubagentResult, "messages">,
): boolean {
  return getFinalAssistantText(r.messages).trim().length > 0;
}

export function hasSemanticCompletion(
  r: Pick<SubagentResult, "messages" | "sawAgentEnd">,
): boolean {
  return Boolean(r.sawAgentEnd) && hasFinalAssistantOutput(r);
}

export function isResultSuccess(r: SubagentResult): boolean {
  if (r.exitCode === -1) return false;
  if (hasSemanticCompletion(r)) return true;
  return r.exitCode === 0 && r.stopReason !== "error" && r.stopReason !== "aborted";
}

export function isResultError(r: SubagentResult): boolean {
  if (r.exitCode === -1) return false;
  return !isResultSuccess(r);
}

function latestFailedTool(result: SubagentResult): ToolExecution | undefined {
  const activities = Array.isArray(result.activities) ? result.activities : [];
  for (let i = activities.length - 1; i >= 0; i--) {
    const activity = activities[i];
    if (activity?.type === "tool" && (activity.status === "error" || activity.isError)) return activity;
  }
  const tools = Array.isArray(result.toolExecutions) ? result.toolExecutions : [];
  for (let i = tools.length - 1; i >= 0; i--) {
    const tool = tools[i];
    if (tool?.status === "error" || tool?.isError) return tool;
  }
  return undefined;
}

function formatArtifactSummary(result: SubagentResult): string {
  const paths: string[] = [];
  if (result.stdoutArtifact) paths.push(`stdout: ${result.stdoutArtifact}`);
  if (result.stderrArtifact) paths.push(`stderr: ${result.stderrArtifact}`);
  return paths.length > 0 ? `\nArtifacts: ${paths.join(", ")}` : "";
}

function normalizeAgentEndToolFailure(result: SubagentResult): void {
  if (!result.sawAgentEnd || hasSemanticCompletion(result)) return;
  if (result.stopReason !== "error" && !result.errorMessage) return;
  const tool = latestFailedTool(result);
  if (!tool) return;
  const transportError = result.errorMessage?.trim();
  if (transportError && !result.stderr.includes(transportError)) {
    result.stderr = result.stderr.trim()
      ? `${result.stderr.trim()}\nTransport error: ${transportError}`
      : `Transport error: ${transportError}`;
  }
  const toolLabel = tool.displayText || tool.toolName || "tool";
  const toolOutput = tool.latestText?.trim();
  const artifacts = formatArtifactSummary(result);
  result.errorMessage = toolOutput
    ? `Subagent failed after tool error: ${toolLabel}\n${toolOutput}${artifacts}`
    : `Subagent failed after tool error: ${toolLabel}${artifacts}`;
}

export function normalizeCompletedResult(
  result: SubagentResult,
  wasAborted: boolean,
): SubagentResult {
  const semanticSuccess = hasSemanticCompletion(result);
  normalizeAgentEndToolFailure(result);

  if (wasAborted) {
    if (semanticSuccess) {
      result.exitCode = 0;
      if (result.stopReason === "aborted") result.stopReason = undefined;
      if (result.errorMessage === "Subagent was aborted.") result.errorMessage = undefined;
    } else {
      result.exitCode = 130;
      result.stopReason = "aborted";
      result.errorMessage = "Subagent was aborted.";
      if (!result.stderr.trim()) result.stderr = "Subagent was aborted.";
    }
    result.response = getFinalOutput(result.messages);
    return result;
  }

  if (result.exitCode > 0) {
    if (semanticSuccess) {
      result.exitCode = 0;
      if (result.stopReason === "error") result.stopReason = undefined;
      if (result.errorMessage === result.stderr.trim()) result.errorMessage = undefined;
    } else {
      if (!result.stopReason) result.stopReason = "error";
      if (!result.errorMessage && result.stderr.trim()) {
        result.errorMessage = result.stderr.trim();
      }
    }
  }
  result.response = getFinalOutput(result.messages);
  return result;
}

export function getFinalOutput(messages: Message[]): string {
  return getFinalAssistantText(messages);
}
