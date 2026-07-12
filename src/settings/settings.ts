import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import type { DelegationPolicy } from "../delegation/policy.ts";
import { resolveConfiguredPath } from "../agents/agents.ts";
import { parseDelegationPolicy, parseEnvironment } from "./settings-parsers.ts";
import { mergeEnvironment } from "./settings-parsers.ts";

export { mergeEnvironment, parseDelegationPolicy, parseEnvironment } from "./settings-parsers.ts";

export interface Settings {
  model: string | null;
  extensions: string[] | null;
  environment: Record<string, string>;
  delegation: DelegationPolicy | null;
}

const SETTINGS_KEY = "pi-minimal-subagent";

function readJsonSafe(filePath: string): Record<string, unknown> {
  try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); }
  catch { return {}; }
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
  if (environment) settings.environment = environment;

  const delegation = parseDelegationPolicy(config.delegation);
  if (delegation) settings.delegation = delegation;

  return settings;
}

export function resolveSettings(cwd: string): Settings {
  const globalDir = getAgentDir();
  const projectDir = path.join(cwd, ".pi");
  const globalSettings = readSettings(path.join(globalDir, "settings.json"), globalDir);
  const projectSettings = readSettings(path.join(projectDir, "settings.json"), projectDir);

  return {
    model: null, extensions: null, delegation: null,
    ...globalSettings, ...projectSettings,
    environment: mergeEnvironment(globalSettings.environment, projectSettings.environment),
  };
}
