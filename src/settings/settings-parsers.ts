// Settings parsers — extracted from settings.ts.
// Pure parsing functions, exported for direct testing.

import type { DelegationPolicy } from "../delegation/policy.ts";

export function parseEnvironment(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const environment: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const key = rawKey.trim();
    if (!key || key.includes("=") || key.includes("\0") || typeof rawValue !== "string" || rawValue.includes("\0")) continue;
    environment[key] = rawValue;
  }
  return environment;
}

export function mergeEnvironment(
  base: Record<string, string> | undefined,
  overrides: Record<string, string> | undefined,
): Record<string, string> {
  const environment = { ...(base ?? {}) };
  if (!overrides) return environment;

  if (process.platform === "win32") {
    for (const [overrideKey, overrideValue] of Object.entries(overrides)) {
      const normalizedKey = overrideKey.toLowerCase();
      for (const key of Object.keys(environment)) {
        if (key.toLowerCase() === normalizedKey) delete environment[key];
      }
      environment[overrideKey] = overrideValue;
    }
    return environment;
  }

  return { ...environment, ...overrides };
}

export function parseDelegationPolicy(value: unknown): DelegationPolicy | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const config = value as Record<string, unknown>;

  const autoDelegate = typeof config.autoDelegate === "boolean" ? config.autoDelegate : false;
  const complexityThreshold = typeof config.complexityThreshold === "number" && Number.isFinite(config.complexityThreshold)
    ? Math.max(0, Math.min(1, config.complexityThreshold))
    : 0.3;
  const minTaskLength = typeof config.minTaskLength === "number" && Number.isFinite(config.minTaskLength)
    ? Math.max(0, config.minTaskLength)
    : 50;

  let agentRouting: DelegationPolicy["agentRouting"];
  if (Array.isArray(config.agentRouting)) {
    agentRouting = config.agentRouting
      .filter((entry): entry is Record<string, unknown> => entry && typeof entry === "object")
      .map((entry) => {
        const keywords = Array.isArray(entry.keywords)
          ? entry.keywords.filter((k): k is string => typeof k === "string" && k.trim().length > 0).map((k) => k.trim().toLowerCase())
          : [];
        const agent = typeof entry.agent === "string" ? entry.agent.trim() : "";
        const weight = typeof entry.weight === "number" && Number.isFinite(entry.weight) ? Math.max(0, entry.weight) : 1;
        return { keywords, agent, weight };
      })
      .filter((entry) => entry.keywords.length > 0 && entry.agent.length > 0);
    if (agentRouting.length === 0) agentRouting = undefined;
  }

  return { autoDelegate, complexityThreshold, minTaskLength, agentRouting };
}
