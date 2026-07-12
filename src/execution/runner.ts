import { spawn } from "node:child_process";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { processPiJsonLine } from "./runner-events.js";
import { getSubagentProgressText } from "./progress.js";
import type { AgentConfig } from "../agents/agents.ts";
import type { Settings } from "../settings/settings.ts";
import { type SubagentDetails, type SubagentResult } from "./types.ts";
import { emptyUsage, normalizeCompletedResult } from "./result-utils.ts";
import { emitSubagentCompleted, emitSubagentCreated, emitSubagentFailed, emitSubagentStarted } from "../engine/events.ts";
import {
  AGENT_END_GRACE_MS,
  SIGKILL_TIMEOUT_MS,
  appendArtifact,
  buildChildEnv,
  buildPiArgs,
  cleanupTempDir,
  createArtifactFiles,
  isWindows,
  rememberStdoutLine,
  resolvePiSpawn,
  writeSystemPromptToTempFile,
} from "./runner-helpers.ts";

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
      content: [{ type: "text", text: getSubagentProgressText(result) }],
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
    emitSubagentCreated(agent.name, task, agent.model, cwd);

    const artifacts = createArtifactFiles();
    result.artifactDir = artifacts.dir;
    result.stdoutArtifact = artifacts.stdoutPath;
    result.stderrArtifact = artifacts.stderrPath;
    let wasAborted = false;

    const exitCode = await new Promise<number>((resolve) => {
      const { command, prefixArgs } = resolvePiSpawn();
      emitSubagentStarted(agent.name, task, cwd);
      const proc = spawn(command, [...prefixArgs, ...piArgs], {
        cwd,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        env: buildChildEnv(settings),
      });

      proc.stdin.on("error", () => {});
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
            const killer = spawn("taskkill", ["/T", "/F", "/PID", String(proc.pid)], { stdio: "ignore" });
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
        rememberStdoutLine(result, line);
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
          if (buffer.trim()) { flushBufferedLines(buffer); buffer = ""; }
          proc.stdout.removeListener("data", onStdoutData);
          proc.stderr.removeListener("data", onStderrData);
          finish(0);
          terminateChild();
        }, AGENT_END_GRACE_MS);
        semanticCompletionTimer.unref();
      };

      const onStdoutData = (chunk: Buffer) => {
        appendArtifact(result.stdoutArtifact, chunk);
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) flushLine(line);
      };

      const onStderrData = (chunk: Buffer) => {
        appendArtifact(result.stderrArtifact, chunk);
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
        appendArtifact(result.stderrArtifact, `${err.message}\n`);
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
    const normalized = normalizeCompletedResult(result, wasAborted);

    if (normalized.exitCode === 0 && !normalized.stopReason) {
      emitSubagentCompleted(agent.name, task, normalized.exitCode, normalized.usage?.cost, normalized.usage?.turns, cwd);
    } else if (normalized.exitCode > 0 || normalized.stopReason === "error") {
      emitSubagentFailed(agent.name, task, normalized.exitCode, normalized.errorMessage, cwd);
    }

    return normalized;
  } finally {
    cleanupTempDir(tmpDir);
  }
}
