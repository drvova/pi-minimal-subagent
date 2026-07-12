// Bun-native SQLite persistence — replaces JSON file I/O for runs, workflows, teams.
// Falls back to no-op when running under Node.js (uses existing JSON persistence instead).

const isBun = typeof (globalThis as any).Bun !== "undefined"
  && process.env.PI_USE_SQLITE === "1";

export { isBun };

let db: any = null;

function getDb(cwd: string): any {
  if (!isBun) return null;
  if (db) return db;

  const { Database } = require("bun:sqlite");
  const path = require("path");
  const fs = require("fs");

  const dir = path.join(cwd, ".pi", "subagent-state");
  fs.mkdirSync(dir, { recursive: true });

  db = new Database(path.join(dir, "state.db"));
  db.run("PRAGMA journal_mode=WAL");
  db.run("PRAGMA foreign_keys=ON");

  // Schema
  db.run(`CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY, name TEXT, description TEXT, phases JSON, team TEXT,
    created_at TEXT, updated_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS teams (
    name TEXT PRIMARY KEY, description TEXT, members JSON,
    created_at TEXT, updated_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY, workflow_id TEXT, workflow_name TEXT, status TEXT,
    phase_results JSON, started_at TEXT, completed_at TEXT, error TEXT,
    total_cost REAL DEFAULT 0
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS run_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, timestamp TEXT,
    type TEXT, phase_id TEXT, task_id TEXT, message TEXT
  )`);

  return db;
}

// ─── Workflow persistence ──────────────────────────────────

export function dbSaveWorkflow(cwd: string, workflow: any): void {
  const d = getDb(cwd); if (!d) return;
  d.run(`INSERT OR REPLACE INTO workflows (id, name, description, phases, team, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [workflow.id, workflow.name, workflow.description, JSON.stringify(workflow.phases),
     workflow.team || null, workflow.createdAt, workflow.updatedAt]);
}

export function dbGetWorkflow(cwd: string, id: string): any | null {
  const d = getDb(cwd); if (!d) return null;
  const row = d.query("SELECT * FROM workflows WHERE id = ?").get(id);
  if (!row) return null;
  return { ...row, phases: JSON.parse(row.phases) };
}

export function dbListWorkflows(cwd: string): any[] {
  const d = getDb(cwd); if (!d) return [];
  const rows = d.query("SELECT * FROM workflows ORDER BY name").all();
  return rows.map((r: any) => ({ ...r, phases: JSON.parse(r.phases) }));
}

export function dbDeleteWorkflow(cwd: string, id: string): void {
  const d = getDb(cwd); if (!d) return;
  d.run("DELETE FROM workflows WHERE id = ?", [id]);
}

// ─── Team persistence ───────────────────────────────────────

export function dbSaveTeam(cwd: string, team: any): void {
  const d = getDb(cwd); if (!d) return;
  d.run(`INSERT OR REPLACE INTO teams (name, description, members, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)`,
    [team.name, team.description, JSON.stringify(team.members), team.createdAt, team.updatedAt]);
}

export function dbGetTeam(cwd: string, name: string): any | null {
  const d = getDb(cwd); if (!d) return null;
  const row = d.query("SELECT * FROM teams WHERE name = ?").get(name);
  if (!row) return null;
  return { ...row, members: JSON.parse(row.members) };
}

export function dbListTeams(cwd: string): any[] {
  const d = getDb(cwd); if (!d) return [];
  const rows = d.query("SELECT * FROM teams ORDER BY name").all();
  return rows.map((r: any) => ({ ...r, members: JSON.parse(r.members) }));
}

export function dbDeleteTeam(cwd: string, name: string): void {
  const d = getDb(cwd); if (!d) return;
  d.run("DELETE FROM teams WHERE name = ?", [name]);
}

// ─── Run persistence ────────────────────────────────────────

export function dbSaveRun(cwd: string, run: any): void {
  const d = getDb(cwd); if (!d) return;
  d.run(`INSERT OR REPLACE INTO runs (id, workflow_id, workflow_name, status, phase_results, started_at, completed_at, error, total_cost)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [run.id, run.workflowId, run.workflowName, run.status, JSON.stringify(run.phaseResults),
     run.startedAt, run.completedAt || null, run.error || null, run.totalCost || 0]);
}

export function dbGetRun(cwd: string, runId: string): any | null {
  const d = getDb(cwd); if (!d) return null;
  const row = d.query("SELECT * FROM runs WHERE id = ?").get(runId);
  if (!row) return null;
  return { ...row, phaseResults: JSON.parse(row.phase_results) };
}

export function dbUpdateRun(cwd: string, run: any): void {
  dbSaveRun(cwd, run);
}

export function dbListRuns(cwd: string): any[] {
  const d = getDb(cwd); if (!d) return [];
  const rows = d.query("SELECT * FROM runs ORDER BY started_at DESC").all();
  return rows.map((r: any) => ({ ...r, phaseResults: JSON.parse(r.phase_results) }));
}

export function dbAppendRunEvent(cwd: string, runId: string, event: any): void {
  const d = getDb(cwd); if (!d) return;
  d.run("INSERT INTO run_events (run_id, timestamp, type, phase_id, task_id, message) VALUES (?, ?, ?, ?, ?, ?)",
    [runId, event.timestamp, event.type, event.phaseId || null, event.taskId || null, event.message || null]);
}

// ─── Runtime check ──────────────────────────────────────────
