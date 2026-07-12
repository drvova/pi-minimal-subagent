import { spawn } from "node:child_process";
import type { AgentConfig } from "../agents/agents.ts";
import type { Settings } from "../settings/settings.ts";
import type { TaskResult } from "../runs/types.ts";
import type { WorkflowTask } from "../workflows/types.ts";
import { bunSpawnTask, isBun } from "../execution/bun-spawn.ts";
import { resolvePiSpawn } from "../execution/runner-helpers.ts";

export function now(): string {
  return new Date().toISOString();
}

export function buildChildArgs(task: WorkflowTask, agent: AgentConfig, settings: Settings): string[] {
  const args = ["--mode", "json", "-p", "--no-session"];

  if (settings.extensions !== null) {
    args.push("--no-extensions");
  }

  const extensions = [
    ...new Set([...(settings.extensions ?? []), ...(agent.extensions ?? [])]),
  ];
  for (const ext of extensions) {
    args.push("--extension", ext);
  }

  const model = agent.model ?? settings.model;
  if (model) args.push("--model", model);
  if (agent.thinking) args.push("--thinking", agent.thinking);
  if (agent.skills?.length) {
    for (const skill of agent.skills) args.push("--skill", skill);
  }

  args.push(task.task);
  return args;
}

export function buildArgsForTask(task: string, agent: AgentConfig, settings: Settings): string[] {
  const args = ["--mode", "json", "-p", "--no-session"];
  if (settings.extensions !== null) args.push("--no-extensions");
  const extensions = [...new Set([...(settings.extensions ?? []), ...(agent.extensions ?? [])])];
  for (const ext of extensions) args.push("--extension", ext);
  const model = agent.model ?? settings.model;
  if (model) args.push("--model", model);
  if (agent.thinking) args.push("--thinking", agent.thinking);
  if (agent.skills?.length) for (const skill of agent.skills) args.push("--skill", skill);
  args.push(task);
  return args;
}

export function spawnForTask(
  cwd: string, task: string, agent: AgentConfig, settings: Settings,
): Promise<{ response: string; usage: { input: number; output: number; cost: number } }> {
  // Bun-native fast path
  if (isBun) {
    const args = buildArgsForTask(task, agent, settings);
    const pi = resolvePiSpawn();
    return bunSpawnTask(pi.command, [...pi.prefixArgs, ...args], cwd, settings.environment ?? {}).then(r => ({
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
    proc.stdin.end();
    let stdout = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", () => {});
    proc.on("close", () => {
      let response = "";
      let usage = { input: 0, output: 0, cost: 0 };
      for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
        try {
          const event = JSON.parse(line);
          if (event.type === "message_end" && event.message?.role === "assistant") {
            const texts = (event.message.content || [])
              .filter((p: { type: string }) => p.type === "text").map((p: { text: string }) => p.text);
            if (texts.length) response = texts.join("");
            if (event.message.usage) {
              usage = { input: event.message.usage.input || 0, output: event.message.usage.output || 0, cost: event.message.usage.cost?.total ?? event.message.usage.cost ?? 0 };
            }
          }
        } catch { /* ignore */ }
      }
      resolve({ response, usage });
    });
    proc.on("error", () => resolve({ response: "", usage: { input: 0, output: 0, cost: 0 } }));
  });
}

const isWindows = process.platform === "win32";

export function spawnPiTask(
  cwd: string,
  task: WorkflowTask,
  agent: AgentConfig,
  settings: Settings,
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
      env: {
        ...process.env,
        ...(settings.environment ?? {}),
      },
    });

    proc.stdin.end();

    let stdout = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      result.exitCode = code ?? 1;
      result.completedAt = now();

      const lines = stdout.split(/\r?\n/).filter(Boolean);
      let response = "";
      let usage = undefined;
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (event.type === "message_end" && event.message?.role === "assistant") {
            const texts = (event.message.content || [])
              .filter((p: { type: string }) => p.type === "text")
              .map((p: { text: string }) => p.text);
            if (texts.length) response = texts.join("");
            if (event.message.usage) {
              usage = {
                input: event.message.usage.input || 0,
                output: event.message.usage.output || 0,
                cost: event.message.usage.cost?.total ?? event.message.usage.cost ?? 0,
                turns: 1,
              };
            }
          }
        } catch {
          // ignore non-JSON lines
        }
      }

      result.response = response || undefined;
      result.usage = usage;
      if (!result.response && stderr.trim()) {
        result.errorMessage = stderr.trim();
      }

      // needs_attention: process exited cleanly but produced no substantive output
      if (code === 0 && !result.response && !result.errorMessage) {
        result.status = "needs_attention";
      } else {
        result.status = code === 0 ? "completed" : "failed";
      }

      resolve(result);
    });

    proc.on("error", (err) => {
      result.status = "failed";
      result.exitCode = 1;
      result.completedAt = now();
      result.errorMessage = err.message;
      resolve(result);
    });
  });
}
