import { spawn } from "node:child_process";
import type { AgentConfig } from "../agents/agents.ts";
import type { Settings } from "../settings/settings.ts";
import type { TaskResult } from "../runs/types.ts";
import type { WorkflowTask } from "../workflows/types.ts";
import { resolvePiSpawn } from "../execution/runner-helpers.ts";
import { buildChildArgs, now } from "./spawn-args.ts";
import { parsePiStdout } from "./spawn-parse.ts";
import { IDLE_TIMEOUT_MS, createIdleWatchdog } from "./spawn-watchdog.ts";

const isWindows = process.platform === "win32";

export function spawnPiTask(
  cwd: string,
  task: WorkflowTask,
  agent: AgentConfig,
  settings: Settings,
  signal?: AbortSignal,
): Promise<TaskResult> {
  return new Promise((resolve) => {
    const args = buildChildArgs(task, agent, settings);
    const result: TaskResult = {
      taskId: task.id,
      agent: task.agent,
      task: task.task,
      status: "running",
      startedAt: now(),
    };

    const piSpawn = resolvePiSpawn();
    const proc = spawn(piSpawn.command, [...piSpawn.prefixArgs, ...args], {
      cwd,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...(settings.environment ?? {}) },
    });

    let timedOut = false;
    const watchdog = createIdleWatchdog(() => { timedOut = true; try { proc.kill("SIGKILL"); } catch { /* already dead */ } });
    const onAbort = () => { try { proc.kill(isWindows ? undefined : "SIGTERM"); } catch { /* already dead */ } };
    signal?.addEventListener("abort", onAbort, { once: true });

    proc.stdin.end();

    let stdout = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); watchdog.reset(); });
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); watchdog.reset(); });

    proc.on("close", (code) => {
      watchdog.clear();
      result.exitCode = code ?? 1;
      result.completedAt = now();

      const { response, usage } = parsePiStdout(stdout);
      result.response = response || undefined;
      result.usage = usage ? { ...usage, turns: 1 } : undefined;
      if (!result.response && stderr.trim()) result.errorMessage = stderr.trim();

      signal?.removeEventListener("abort", onAbort);
      if (signal?.aborted) {
        result.status = "aborted";
      } else if (timedOut) {
        result.status = "failed";
        result.errorMessage = `Idle timeout: no output for ${IDLE_TIMEOUT_MS / 1000}s (process wedged)`;
      } else if (code === 0 && !result.response && !result.errorMessage) {
        // needs_attention: process exited cleanly but produced no substantive output
        result.status = "needs_attention";
      } else {
        result.status = code === 0 ? "completed" : "failed";
      }

      resolve(result);
    });

    proc.on("error", (err) => {
      watchdog.clear();
      result.status = "failed";
      result.exitCode = 1;
      result.completedAt = now();
      result.errorMessage = err.message;
      resolve(result);
    });
  });
}
