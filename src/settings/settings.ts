import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import type { DelegationPolicy } from "../delegation/policy.ts";
import { resolveConfiguredPath } from "../agents/agents.ts";

export interface Settings {
  model: string | null;
  extensions: string[] | null;
  environment: Record<string, string>;
  delegation: DelegationPolicy | null;
}

const SETTINGS_KEY = "pi-minimal-subagent";

function readJsonSafe(filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return {};
  }
}

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

  return {
    ...environment,
    ...overrides,
  };
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

function readSettings(filePath: string, baseDir: string): Partial<Settings> {
  const raw = readJsonSafe(filePath)[SETTINGS_KEY];
  if (!raw || typeof raw !== "object") return {};

  const config = raw as Record<string, unknown>;
  const settings: Partial<Settings> = {};

  if (typeof config.model === "string" && config.model.trim()) {
    settings.model = config.model;
  } else if (config.model === null) {
    settings.model = null;
  }

  if (config.extensions === null) {
    settings.extensions = null;
  } else if (Array.isArray(config.extensions)) {
    settings.extensions = config.extensions
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => resolveConfiguredPath(entry.trim(), baseDir));
  }

  const environment = parseEnvironment(config.environment);
  if (environment) {
    settings.environment = environment;
  }

  const delegation = parseDelegationPolicy(config.delegation);
  if (delegation) {
    settings.delegation = delegation;
  }

  return settings;
}

export function resolveSettings(cwd: string): Settings {
  const globalDir = getAgentDir();
  const projectDir = path.join(cwd, ".pi");
  const globalSettings = readSettings(path.join(globalDir, "settings.json"), globalDir);
  const projectSettings = readSettings(path.join(projectDir, "settings.json"), projectDir);

  return {
    model: null,
    extensions: null,
    delegation: null,
    ...globalSettings,
    ...projectSettings,
    environment: mergeEnvironment(globalSettings.environment, projectSettings.environment),
  };
}
