import type { Message } from "@mariozechner/pi-ai";
import { getFinalAssistantText } from "./runner-events.js";

export type AgentSource = "user" | "project";

export interface AgentConfig {
  name: string;
  description: string;
  systemPrompt: string;
  source: AgentSource;
  filePath: string;
  model?: string;
  extensions?: string[];
  skills?: string[];
  thinking?: string;
}

export interface Settings {
  model: string | null;
  extensions: string[];
}

export interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  turns: number;
}

export interface ToolExecution {
  toolCallId: string;
  toolName: string;
  status: "running" | "completed" | "error";
  updates: number;
  argsPreview?: string;
  displayText?: string;
  latestText?: string;
  isError?: boolean;
  activityOrder?: number;
}

export interface ThinkingState {
  status: "running" | "completed";
  chars: number;
  activityOrder?: number;
}

export interface ToolActivity extends ToolExecution {
  type: "tool";
  activityOrder: number;
}

export interface ThinkingActivity extends ThinkingState {
  type: "thinking";
  activityOrder: number;
}

export type Activity = ToolActivity | ThinkingActivity;

export interface SubagentResult {
  agent: string;
  agentSource: AgentSource | "unknown";
  agentFile?: string;
  task: string;
  exitCode: number;
  messages: Message[];
  response: string;
  stderr: string;
  usage: UsageStats;
  provider?: string;
  model?: string;
  stopReason?: string;
  errorMessage?: string;
  sawAgentEnd?: boolean;
  thinking?: ThinkingState;
  activityCount?: number;
  activities?: Activity[];
  toolExecutionCount?: number;
  toolExecutions?: ToolExecution[];
}

export interface SubagentDetails {
  results: SubagentResult[];
  availableAgents?: string[];
  projectAgentsDir?: string | null;
}

export function emptyUsage(): UsageStats {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    contextTokens: 0,
    turns: 0,
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

export function normalizeCompletedResult(
  result: SubagentResult,
  wasAborted: boolean,
): SubagentResult {
  const semanticSuccess = hasSemanticCompletion(result);

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
