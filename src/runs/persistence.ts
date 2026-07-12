import * as fs from "node:fs";
import * as path from "node:path";
import type { BackgroundRun, RunEvent, RunListEntry, WorkflowRun } from "./types.ts";

const STATE_DIR = ".pi/subagent-state";

function stateDir(cwd: string): string {
  return path.join(cwd, STATE_DIR);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function writeJson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function appendJsonLine(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, JSON.stringify(data) + "\n", "utf-8");
}

function runsDir(cwd: string): string {
  return path.join(stateDir(cwd), "runs");
}

function runDir(cwd: string, runId: string): string {
  return path.join(runsDir(cwd), runId);
}

function runManifestPath(cwd: string, runId: string): string {
  return path.join(runDir(cwd, runId), "run.json");
}

export function saveRun(cwd: string, run: WorkflowRun): void {
  ensureDir(runDir(cwd, run.id));
  writeJson(runManifestPath(cwd, run.id), run);
}

export function getRun(cwd: string, runId: string): WorkflowRun | null {
  return readJson<WorkflowRun>(runManifestPath(cwd, runId));
}

export function updateRun(cwd: string, run: WorkflowRun): void {
  writeJson(runManifestPath(cwd, run.id), run);
}

export function appendRunEvent(cwd: string, runId: string, event: RunEvent): void {
  appendJsonLine(path.join(runDir(cwd, runId), "events.jsonl"), event);
}

export function listRuns(cwd: string): RunListEntry[] {
  const dir = runsDir(cwd);
  if (!fs.existsSync(dir)) return [];

  const entries: RunListEntry[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const run = getRun(cwd, e.name);
    if (!run) continue;
    let taskCount = 0;
    for (const phase of run.phaseResults) {
      taskCount += phase.taskResults.length;
    }
    entries.push({
      runId: run.id,
      workflowId: run.workflowId,
      workflowName: run.workflowName,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      phaseCount: run.phaseResults.length,
      taskCount,
    });
  }
  entries.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return entries;
}

// ─── Background runs (in-memory registry) ────────────────────────

const bgRuns = new Map<string, BackgroundRun>();

export function registerBgRun(bg: BackgroundRun): void {
  bgRuns.set(bg.runId, bg);
}

export function getBgRun(runId: string): BackgroundRun | undefined {
  return bgRuns.get(runId);
}

export function updateBgRunStatus(runId: string, status: BackgroundRun["status"]): void {
  const bg = bgRuns.get(runId);
  if (bg) bg.status = status;
}

export function listBgRuns(): BackgroundRun[] {
  return Array.from(bgRuns.values());
}

export function cleanupBgRun(runId: string): void {
  bgRuns.delete(runId);
}
