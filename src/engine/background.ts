import { discoverAgents } from "../agents/agents.ts";
import { resolveSettings } from "../settings/settings.ts";
import { getWorkflow } from "../workflows/persistence.ts";
import { registerBgRun, updateBgRunStatus } from "../runs/persistence.ts";
import { runWorkflow } from "./workflow-runner.ts";
import type { BackgroundRun, RunStatus } from "../runs/types.ts";

const backgroundRuns = new Map<string, { run: Promise<unknown>; abort: AbortController }>();

export function startBackgroundRun(cwd: string, workflowId: string, opts?: { dryRun?: boolean }): { runId: string; error?: string } {
  const workflow = getWorkflow(cwd, workflowId);
  if (!workflow) return { runId: "", error: `Workflow "${workflowId}" not found` };

  const agents = discoverAgents(cwd).agents;
  const settings = resolveSettings(cwd);
  const abort = new AbortController();

  // Generate run ID now so we can return it before the run completes
  const runId = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const bgRun: BackgroundRun = {
    runId,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    status: "running",
    cwd,
  };
  registerBgRun(bgRun);

  const runPromise = runWorkflow({
    cwd,
    workflow,
    agents,
    settings,
    signal: abort.signal,
    dryRun: opts?.dryRun,
    runId,
  });

  backgroundRuns.set(runId, { run: runPromise, abort });

  // Fire-and-forget: update status when done
  runPromise.then((result) => {
    updateBgRunStatus(runId, result.status);
  }).catch(() => {
    updateBgRunStatus(runId, "failed");
  });

  return { runId };
}

export function abortBackgroundRun(runId: string): boolean {
  const entry = backgroundRuns.get(runId);
  if (!entry) return false;
  entry.abort.abort();
  updateBgRunStatus(runId, "aborted");
  return true;
}
