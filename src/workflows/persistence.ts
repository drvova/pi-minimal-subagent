import * as fs from "node:fs";
import * as path from "node:path";
import type { WorkflowDefinition } from "./types.ts";
import { dbDeleteWorkflow, dbGetWorkflow, dbListWorkflows, dbSaveWorkflow, isBun } from "../state/db.ts";

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

function workflowsDir(cwd: string): string {
  return path.join(stateDir(cwd), "workflows");
}

function workflowPath(cwd: string, id: string): string {
  return path.join(workflowsDir(cwd), `${id}.json`);
}

export function listWorkflows(cwd: string): WorkflowDefinition[] {
  if (isBun) return dbListWorkflows(cwd) as WorkflowDefinition[];
  const dir = workflowsDir(cwd);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<WorkflowDefinition>(path.join(dir, f)))
    .filter((w): w is WorkflowDefinition => w !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getWorkflow(cwd: string, id: string): WorkflowDefinition | null {
  if (isBun) return dbGetWorkflow(cwd, id) as WorkflowDefinition | null;
  return readJson<WorkflowDefinition>(workflowPath(cwd, id));
}

export function saveWorkflow(cwd: string, workflow: WorkflowDefinition): void {
  workflow.updatedAt = new Date().toISOString();
  if (isBun) { dbSaveWorkflow(cwd, workflow); return; }
  writeJson(workflowPath(cwd, workflow.id), workflow);
}

export function deleteWorkflow(cwd: string, id: string): boolean {
  if (isBun) { dbDeleteWorkflow(cwd, id); return true; }
  const p = workflowPath(cwd, id);
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  return true;
}
