// Bun-native spawn + IPC wrapper for subagent child processes.
// Uses Bun.spawn/Bun Shell when available, falls back to node:child_process.

const isBun = typeof (globalThis as any).Bun !== "undefined";

export interface SpawnResult {
  response: string;
  usage: { input: number; output: number; cost: number };
  exitCode: number;
}

export async function bunSpawnTask(
  command: string, args: string[], cwd: string, env: Record<string, string>, signal?: AbortSignal,
): Promise<SpawnResult> {
  if (!isBun) {
    // Fallback: use Node spawn (handled by caller)
    throw new Error("Bun not available");
  }

  const proc = (globalThis as any).Bun.spawn([command, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });

  const onAbort = () => { try { proc.kill(); } catch { /* already dead */ } };
  signal?.addEventListener("abort", onAbort, { once: true });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  signal?.removeEventListener("abort", onAbort);

  let response = "";
  let usage = { input: 0, output: 0, cost: 0 };

  for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
    try {
      const event = JSON.parse(line);
      if (event.type === "message_end" && event.message?.role === "assistant") {
        const texts = (event.message.content || [])
          .filter((p: any) => p.type === "text").map((p: any) => p.text);
        if (texts.length) response = texts.join("");
        if (event.message.usage) {
          usage = {
            input: event.message.usage.input || 0,
            output: event.message.usage.output || 0,
            cost: event.message.usage.cost?.total ?? event.message.usage.cost ?? 0,
          };
        }
      }
    } catch { /* ignore */ }
  }

  return { response, usage, exitCode };
}

// ─── Native JSONL streaming parser (Bun.file().lines()) ───────

export async function* bunReadJsonLines(path: string): AsyncGenerator<any> {
  if (!isBun) return;
  const file = (globalThis as any).Bun.file(path);
  for await (const line of file.stream().pipeThrough(new TextDecoderStream())) {
    try { yield JSON.parse(line); } catch { /* skip bad lines */ }
  }
}

// ─── IPC-enabled spawn for mid-run steering ─────────────────

export interface IPCSpawn {
  process: any;
  exited: Promise<number>;
  send(message: any): void;
  stdout: ReadableStream;
}

export function bunSpawnIPC(command: string, args: string[], cwd: string, env: Record<string, string>): IPCSpawn | null {
  if (!isBun) return null;

  const proc = (globalThis as any).Bun.spawn([command, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
    ipc: true,
  });

  return {
    process: proc,
    exited: proc.exited,
    send: (message: any) => proc.send(message),
    stdout: proc.stdout,
  };
}

export { isBun };
