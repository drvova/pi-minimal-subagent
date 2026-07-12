import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentConfig } from "../agents/agents.ts";
import type { Settings } from "../settings/settings.ts";
import type { SubagentResult } from "./types.ts";

export const isWindows = process.platform === "win32";
export const SIGKILL_TIMEOUT_MS = 5000;
export const AGENT_END_GRACE_MS = 250;
export const STDOUT_TAIL_LINES = 40;

export function resolvePiSpawn(): { command: string; prefixArgs: string[] } {
  const isNode = /[\\/]node(?:\.exe)?$/i.test(process.execPath);
  const isBun = /[\\/]bun(?:\.exe)?$/i.test(process.execPath);
  if (!isNode && !isBun) return { command: process.execPath, prefixArgs: [] }; // compiled pi binary
  const entry = process.argv[1] ?? "";
  const entryBase = path.basename(entry).toLowerCase();
  if (entry && (entryBase === "pi" || entryBase === "pi.js" || entry.includes("pi-coding-agent"))) {
    return { command: process.execPath, prefixArgs: [entry] };
  }
  // Parent is not Pi (tests, direct node/bun invocation) — use pi from PATH
  return { command: "pi", prefixArgs: [] };
}

export function writeSystemPromptToTempFile(systemPrompt: string): { dir: string; filePath: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-minimal-subagent-"));
  const filePath = path.join(tmpDir, "system-prompt.md");
  fs.writeFileSync(filePath, systemPrompt, { encoding: "utf-8", mode: 0o600 });
  return { dir: tmpDir, filePath };
}

export function cleanupTempDir(dir: string | null): void {
  if (!dir) return;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

export function createArtifactFiles(): { dir: string; stdoutPath: string; stderrPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-minimal-subagent-output-"));
  const stdoutPath = path.join(dir, "stdout.jsonl");
  const stderrPath = path.join(dir, "stderr.log");
  fs.writeFileSync(stdoutPath, "", { encoding: "utf-8", mode: 0o600 });
  fs.writeFileSync(stderrPath, "", { encoding: "utf-8", mode: 0o600 });
  return { dir, stdoutPath, stderrPath };
}

export function appendArtifact(filePath: string | undefined, chunk: Buffer | string): void {
  if (!filePath) return;
  try { fs.appendFileSync(filePath, chunk); } catch { /* ignore */ }
}

export function rememberStdoutLine(result: SubagentResult, line: string): void {
  if (!line.trim()) return;
  if (!Array.isArray(result.stdoutTail)) result.stdoutTail = [];
  result.stdoutTail.push(line);
  while (result.stdoutTail.length > STDOUT_TAIL_LINES) result.stdoutTail.shift();
}

export function mergeExtensions(settings: Settings, agent: AgentConfig): string[] {
  return [...new Set([...(settings.extensions ?? []), ...(agent.extensions ?? [])])];
}

export function buildChildEnv(settings: Settings): NodeJS.ProcessEnv {
  const inheritedEnv: NodeJS.ProcessEnv = { ...process.env };
  if (isWindows) {
    for (const [configuredKey, configuredValue] of Object.entries(settings.environment)) {
      const normalizedKey = configuredKey.toLowerCase();
      for (const key of Object.keys(inheritedEnv)) {
        if (key.toLowerCase() === normalizedKey) delete inheritedEnv[key];
      }
      inheritedEnv[configuredKey] = configuredValue;
    }
    return inheritedEnv;
  }
  return { ...inheritedEnv, ...settings.environment };
}

export function buildPiArgs(opts: {
  task: string;
  systemPromptPath: string | null;
  settings: Settings;
  agent: AgentConfig;
}): string[] {
  const { task, systemPromptPath, settings, agent } = opts;
  const args = ["--mode", "json", "-p", "--no-session"];
  const extensions = mergeExtensions(settings, agent);

  if (settings.extensions !== null) args.push("--no-extensions");
  for (const extension of extensions) args.push("--extension", extension);

  const model = agent.model ?? settings.model;
  if (model) args.push("--model", model);
  if (agent.thinking) args.push("--thinking", agent.thinking);
  if (agent.skills?.length) {
    for (const skill of agent.skills) args.push("--skill", skill);
  }
  if (systemPromptPath) args.push("--append-system-prompt", systemPromptPath);

  args.push(task);
  return args;
}
