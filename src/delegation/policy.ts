import type { AgentConfig } from "../agents/agents.ts";
import { analyzeTaskComplexity } from "./complexity.ts";
import type { ComplexityReport } from "./complexity.ts";

export type { ComplexityReport } from "./complexity.ts";

export interface DelegationPolicy {
  autoDelegate: boolean;
  complexityThreshold: number;
  minTaskLength: number;
  agentRouting?: Array<{ keywords: string[]; agent: string; weight?: number }>;
}

export interface DelegationDecision {
  delegate: boolean;
  reason: string;
  complexity: ComplexityReport;
}

export function evaluatePolicy(
  task: string,
  policy: DelegationPolicy,
): DelegationDecision {
  if (!policy.autoDelegate) {
    return { delegate: true, reason: "auto-delegation disabled by policy", complexity: { score: 0, components: { length: 0, termDensity: 0, actionCount: 0, technicalDensity: 0 }, recommendation: "skip" } };
  }
  const complexity = analyzeTaskComplexity(task);
  if (task.trim().length < policy.minTaskLength) {
    return { delegate: false, reason: `task below minimum length (${task.trim().length}/${policy.minTaskLength} chars)`, complexity };
  }
  if (complexity.score >= policy.complexityThreshold) {
    return { delegate: true, reason: `complexity score ${complexity.score} meets threshold ${policy.complexityThreshold}`, complexity };
  }
  return { delegate: false, reason: `complexity score ${complexity.score} below threshold ${policy.complexityThreshold}`, complexity };
}

function keywordMatchScore(task: string, keywords: string[]): number {
  const lower = task.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    const matches = lower.match(regex);
    if (matches) score += matches.length;
  }
  return score;
}

export function selectAgent(
  task: string,
  routing: NonNullable<DelegationPolicy["agentRouting"]>,
  agents: AgentConfig[],
): AgentConfig | null {
  if (!routing || routing.length === 0) return null;
  const scored = routing
    .map((rule) => ({ rule, score: keywordMatchScore(task, rule.keywords) * (rule.weight ?? 1) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;
  return agents.find((a) => a.name === scored[0].rule.agent) ?? null;
}

/** Zero-config auto selection: score agents by task-token overlap with name+description. */
export function matchAgentByDescription(task: string, agents: AgentConfig[]): AgentConfig | undefined {
  if (!agents.length) return undefined;
  const tokens = new Set(task.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2));
  let best: AgentConfig | undefined;
  let bestScore = 0;
  for (const a of agents) {
    const text = `${a.name} ${a.description}`.toLowerCase();
    let score = 0;
    for (const t of tokens) if (text.includes(t)) score++;
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return best ?? agents[0];
}

export function formatComplexityReport(report: ComplexityReport): string {
  const c = report.components;
  return [
    `Task complexity: ${(report.score * 100).toFixed(0)}% (${report.recommendation})`,
    `  Length factor:       ${(c.length * 100).toFixed(0)}%`,
    `  Term density:        ${(c.termDensity * 100).toFixed(0)}%`,
    `  Action count:        ${(c.actionCount * 100).toFixed(0)}%`,
    `  Technical density:   ${(c.technicalDensity * 100).toFixed(0)}%`,
  ].join("\n");
}
