const COMPLEX_TERMS = new Set([
  "refactor", "migrate", "architect", "design", "implement",
  "build", "create", "deploy", "optimize", "restructure",
  "rewrite", "overhaul", "integrate", "transform", "establish",
  "setup", "configure", "secure", "audit", "validate",
]);

const SIMPLE_TERMS = new Set([
  "read", "list", "check", "find", "inspect", "scan",
  "look", "view", "show", "print", "display", "report",
  "summarize", "describe", "explain", "count", "measure",
  "tell", "what", "where", "which", "who",
]);

const TECHNICAL_TERMS = new Set([
  "function", "class", "module", "component", "api",
  "endpoint", "route", "middleware", "service", "database",
  "schema", "migration", "query", "index", "cache",
  "auth", "token", "session", "state", "hook",
  "type", "interface", "async", "promise", "stream",
]);

export interface ComplexityReport {
  score: number;
  components: {
    length: number;
    termDensity: number;
    actionCount: number;
    technicalDensity: number;
  };
  recommendation: "skip" | "inline" | "delegate_light" | "delegate";
}

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s_-]/g, " ").split(/\s+/).filter(Boolean);
}

function countSentences(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 0).length);
}

function countActionItems(text: string): number {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const bulletCount = lines.filter((l) => /^\s*[-*]\s/.test(l)).length;
  const numberedCount = lines.filter((l) => /^\s*\d+[.)]\s/.test(l)).length;
  const imperativeCount = lines.filter((l) =>
    /^(read|check|find|inspect|scan|list|create|build|fix|add|remove|update|delete|refactor|test|run|deploy|write|edit|move|copy|rename|merge|review)\b/i.test(l.trim()),
  ).length;
  return Math.max(bulletCount, numberedCount, imperativeCount);
}

export function analyzeTaskComplexity(task: string): ComplexityReport {
  const trimmed = task.trim();
  if (!trimmed) {
    return { score: 0, components: { length: 0, termDensity: 0, actionCount: 0, technicalDensity: 0 }, recommendation: "skip" };
  }
  const tokens = tokenize(trimmed);
  const uniqueTokens = new Set(tokens);
  const actionCount = countActionItems(trimmed);
  const lengthFactor = Math.min(1, Math.log2(Math.max(1, trimmed.length)) / Math.log2(2000));

  let complexHits = 0, simpleHits = 0, technicalHits = 0;
  for (const token of uniqueTokens) {
    if (COMPLEX_TERMS.has(token)) complexHits++;
    if (SIMPLE_TERMS.has(token)) simpleHits++;
    if (TECHNICAL_TERMS.has(token)) technicalHits++;
  }
  const termDensity = uniqueTokens.size > 0
    ? (complexHits * 1.5 + technicalHits * 0.5) / (Math.max(1, simpleHits * 0.8) + uniqueTokens.size * 0.15) : 0;
  const normalizedTermDensity = Math.min(1, termDensity);
  const actionFactor = Math.min(1, actionCount / 8);
  const technicalDensity = uniqueTokens.size > 0 ? Math.min(1, technicalHits / (uniqueTokens.size * 0.2)) : 0;

  const components = {
    length: Math.round(lengthFactor * 100) / 100,
    termDensity: Math.round(normalizedTermDensity * 100) / 100,
    actionCount: Math.round(actionFactor * 100) / 100,
    technicalDensity: Math.round(technicalDensity * 100) / 100,
  };

  const weights = { length: 0.15, termDensity: 0.35, actionCount: 0.25, technicalDensity: 0.25 };
  const score = Math.round(
    (components.length * weights.length + components.termDensity * weights.termDensity +
      components.actionCount * weights.actionCount + components.technicalDensity * weights.technicalDensity) * 100,
  ) / 100;

  let recommendation: ComplexityReport["recommendation"];
  if (score < 0.2) recommendation = "skip";
  else if (score < 0.4) recommendation = "inline";
  else if (score < 0.65) recommendation = "delegate_light";
  else recommendation = "delegate";

  return { score, components, recommendation };
}
