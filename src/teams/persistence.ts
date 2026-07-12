import * as fs from "node:fs";
import * as path from "node:path";
import type { TeamDefinition } from "./types.ts";

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

function teamsDir(cwd: string): string {
  return path.join(stateDir(cwd), "teams");
}

function teamPath(cwd: string, name: string): string {
  return path.join(teamsDir(cwd), `${name}.json`);
}

export function listTeams(cwd: string): TeamDefinition[] {
  const dir = teamsDir(cwd);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<TeamDefinition>(path.join(dir, f)))
    .filter((t): t is TeamDefinition => t !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getTeam(cwd: string, name: string): TeamDefinition | null {
  return readJson<TeamDefinition>(teamPath(cwd, name));
}

export function saveTeam(cwd: string, team: TeamDefinition): void {
  team.updatedAt = new Date().toISOString();
  writeJson(teamPath(cwd, team.name), team);
}

export function deleteTeam(cwd: string, name: string): boolean {
  const p = teamPath(cwd, name);
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  return true;
}
