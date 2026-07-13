import { spawn } from "node:child_process";
import type { AgentConfig } from "../agents/agents.ts";
import type { Settings } from "../settings/settings.ts";
import { bunSpawnTask, isBun } from "../execution/bun-spawn.ts";
import { resolvePiSpawn } from "../execution/runner-helpers.ts";
import { buildArgsForTask } from "./spawn-args.ts";
import { parsePiStdout } from "./spawn-parse.ts";

export { now, buildChildArgs, buildArgsForTask } from "./spawn-args.ts";
export { spawnPiTask } from "./spawn-task.ts";

export function spawnForTask(
  cwd: string, task: string, agent: AgentConfig, settings: Settings, signal?: AbortSignal,
): Promise<{ response: string; usage: { input: number; output: number; cost: number } }> {
  // Bun-native fast path
  if (isBun) {
    const args = buildArgsForTask(task, agent, settings);
    const pi = resolvePiSpawn();
    return bunSpawnTask(pi.command, [...pi.prefixArgs, ...args], cwd, settings.environment ?? {}, signal).then(r => ({
      response: r.response, usage: r.usage,
    }));
  }

  // Node.js fallback
  return new Promise((resolve) => {
    const args = buildArgsForTask(task, agent, settings);
    const pi = resolvePiSpawn();
    const proc = spawn(pi.command, [...pi.prefixArgs, ...args], {
      cwd, shell: false, stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...(settings.environment ?? {}) },
    });
    const onAbort = () => { try { proc.kill("SIGTERM"); } catch { /* already dead */ } };
    signal?.addEventListener("abort", onAbort, { once: true });
    proc.stdin.end();
    let stdout = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", () => {});
    proc.on("close", () => {
      signal?.removeEventListener("abort", onAbort);
      const { response, usage } = parsePiStdout(stdout);
      resolve({ response, usage: usage ?? { input: 0, output: 0, cost: 0 } });
    });
    proc.on("error", () => resolve({ response: "", usage: { input: 0, output: 0, cost: 0 } }));
  });
}
