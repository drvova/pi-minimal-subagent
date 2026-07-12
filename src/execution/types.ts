import type { Message } from "@mariozechner/pi-ai";
import type { AgentSource } from "../agents/agents.ts";
import type { DelegationDecision } from "../delegation/policy.ts";

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
  artifactDir?: string;
  stdoutArtifact?: string;
  stderrArtifact?: string;
  stdoutTail?: string[];
}

export interface SubagentDetails {
  results: SubagentResult[];
  availableAgents?: string[];
  projectAgentsDir?: string | null;
  delegation?: DelegationDecision;
  policyActive?: boolean;
}
