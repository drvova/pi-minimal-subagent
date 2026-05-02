import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { getSubagentProgressText, processPiJsonLine } from "./runner-events.js";
import {
  type AgentConfig,
  type Settings,
  type SubagentDetails,
  type SubagentResult,
  emptyUsage,
  normalizeCompletedResult,
} from "./types.ts";

const isWindows = process.platform === "win32";
const SIGKILL_TIMEOUT_MS = 5000;
const AGENT_END_GRACE_MS = 250;
type OnUpdateCallback = (partial: AgentToolResult<SubagentDetails>) => void;

export interface RunSubagentOptions {
  cwd: string;
  agent: AgentConfig;
  task: string;
  settings: Settings;
  signal?: AbortSignal;
  onUpdate?: OnUpdateCallback;
  makeDetails: (results: SubagentResult[]) => SubagentDetails;
}

function resolvePiSpawn(): { command: string; prefixArgs: string[] } {
  const isNode = /[\\/]node(?:\.exe)?$/i.test(process.execPath);
  if (isNode && process.argv[1]) {
    return { command: process.execPath, prefixArgs: [process.argv[1]] };
  }
  return { command: process.execPath, prefixArgs: [] };
}

function writeSystemPromptToTempFile(systemPrompt: string): { dir: string; filePath: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-minimal-subagent-"));
  const filePath = path.join(tmpDir, "system-prompt.md");
  fs.writeFileSync(filePath, systemPrompt, { encoding: "utf-8", mode: 0o600 });
  return { dir: tmpDir, filePath };
}

function cleanupTempDir(dir: string | null): void {
  if (!dir) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

function mergeExtensions(settings: Settings, agent: AgentConfig): string[] {
  return [...new Set([...settings.extensions, ...(agent.extensions ?? [])])];
}

function buildPiArgs(opts: {
  task: string;
  systemPromptPath: string | null;
  settings: Settings;
  agent: AgentConfig;
}): string[] {
  const { task, systemPromptPath, settings, agent } = opts;
  const args = ["--mode", "json", "-p", "--no-session", "--no-extensions"];

  for (const extension of mergeExtensions(settings, agent)) {
    args.push("--extension", extension);
  }

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

export async function runSubagent(opts: RunSubagentOptions): Promise<SubagentResult> {
  const { cwd, agent, task, settings, signal, onUpdate, makeDetails } = opts;

  const result: SubagentResult = {
    agent: agent.name,
    agentSource: agent.source,
    agentFile: agent.filePath,
    task,
    exitCode: -1,
    messages: [],
    response: "",
    stderr: "",
    usage: emptyUsage(),
  };

  const emitUpdate = () => {
    onUpdate?.({
      content: [
        {
          type: "text",
          text: getSubagentProgressText(result),
        },
      ],
      details: makeDetails([result]),
    });
  };

  let tmpDir: string | null = null;
  let systemPromptPath: string | null = null;
  if (agent.systemPrompt.trim()) {
    const tmp = writeSystemPromptToTempFile(agent.systemPrompt);
    tmpDir = tmp.dir;
    systemPromptPath = tmp.filePath;
  }

  try {
    const piArgs = buildPiArgs({ task, systemPromptPath, settings, agent });
    let wasAborted = false;

    const exitCode = await new Promise<number>((resolve) => {
      const { command, prefixArgs } = resolvePiSpawn();
      const proc = spawn(command, [...prefixArgs, ...piArgs], {
        cwd,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
      });

      proc.stdin.on("error", () => {
        // Ignore broken pipe on fast exits.
      });
      proc.stdin.end();

      let buffer = "";
      let didClose = false;
      let settled = false;
      let abortHandler: (() => void) | undefined;
      let semanticCompletionTimer: NodeJS.Timeout | undefined;

      const clearSemanticCompletionTimer = () => {
        if (semanticCompletionTimer) {
          clearTimeout(semanticCompletionTimer);
          semanticCompletionTimer = undefined;
        }
      };

      const terminateChild = () => {
        if (isWindows) {
          if (proc.pid !== undefined) {
            const killer = spawn("taskkill", ["/T", "/F", "/PID", String(proc.pid)], {
              stdio: "ignore",
            });
            killer.unref();
          }
          return;
        }

        proc.kill("SIGTERM");
        const sigkillTimer = setTimeout(() => {
          if (!didClose) proc.kill("SIGKILL");
        }, SIGKILL_TIMEOUT_MS);
        sigkillTimer.unref();
      };

      const finish = (code: number) => {
        if (settled) return;
        settled = true;
        clearSemanticCompletionTimer();
        if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
        resolve(code);
      };

      const flushLine = (line: string) => {
        if (processPiJsonLine(line, result)) emitUpdate();
        maybeFinishFromAgentEnd();
      };

      const flushBufferedLines = (text: string) => {
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) flushLine(line);
        }
      };

      const maybeFinishFromAgentEnd = () => {
        if (!result.sawAgentEnd || didClose || settled) return;
        clearSemanticCompletionTimer();
        semanticCompletionTimer = setTimeout(() => {
          if (didClose || settled || !result.sawAgentEnd) return;
          if (buffer.trim()) {
            flushBufferedLines(buffer);
            buffer = "";
          }
          proc.stdout.removeListener("data", onStdoutData);
          proc.stderr.removeListener("data", onStderrData);
          finish(0);
          terminateChild();
        }, AGENT_END_GRACE_MS);
        semanticCompletionTimer.unref();
      };

      const onStdoutData = (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) flushLine(line);
      };

      const onStderrData = (chunk: Buffer) => {
        result.stderr += chunk.toString();
      };

      proc.stdout.on("data", onStdoutData);
      proc.stderr.on("data", onStderrData);

      proc.on("close", (code) => {
        didClose = true;
        if (buffer.trim()) flushBufferedLines(buffer);
        finish(code ?? 0);
      });

      proc.on("error", (err) => {
        if (!result.stderr.trim()) result.stderr = err.message;
        finish(1);
      });

      if (signal) {
        abortHandler = () => {
          if (didClose || settled) return;
          wasAborted = true;
          terminateChild();
        };
        if (signal.aborted) abortHandler();
        else signal.addEventListener("abort", abortHandler, { once: true });
      }
    });

    result.exitCode = exitCode;
    return normalizeCompletedResult(result, wasAborted);
  } finally {
    cleanupTempDir(tmpDir);
  }
}
