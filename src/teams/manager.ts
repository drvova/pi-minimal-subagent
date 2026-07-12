import type { TeamDefinition, TeamMember } from "./types.ts";
import { deleteTeam, listTeams, saveTeam } from "./persistence.ts";
import { validateTeam } from "./validator.ts";
import type { ValidationError } from "./validator.ts";

export type { ValidationError } from "./validator.ts";

function err(field: string, message: string): ValidationError {
  return { field, message };
}

export function createTeam(
  cwd: string,
  input: { name: string; description: string; members: TeamMember[] },
): { team?: TeamDefinition; errors: ValidationError[] } {
  const now = new Date().toISOString();
  const team: TeamDefinition = {
    name: input.name.trim(), description: input.description.trim(),
    members: input.members.map((m) => ({ agent: m.agent.trim(), role: m.role.trim() })),
    createdAt: now, updatedAt: now,
  };
  const errors = validateTeam(team);
  if (errors.length > 0) return { errors };
  if (listTeams(cwd).some((t) => t.name === team.name)) {
    return { errors: [err("name", `Team "${team.name}" already exists`)] };
  }
  saveTeam(cwd, team);
  return { team, errors: [] };
}

export function updateTeam(
  cwd: string, name: string,
  input: { description?: string; members?: TeamMember[] },
): { team?: TeamDefinition; errors: ValidationError[] } {
  const existing = listTeams(cwd).find((t) => t.name === name);
  if (!existing) return { errors: [err("name", `Team "${name}" not found`)] };
  const merged: TeamDefinition = {
    ...existing,
    ...(input.description !== undefined && { description: input.description.trim() }),
    ...(input.members !== undefined && {
      members: input.members.map((m) => ({ agent: m.agent.trim(), role: m.role.trim() })),
    }),
  };
  const errors = validateTeam(merged);
  if (errors.length > 0) return { errors };
  saveTeam(cwd, merged);
  return { team: merged, errors: [] };
}

export function removeTeam(cwd: string, name: string): { deleted: boolean; error?: string } {
  if (!deleteTeam(cwd, name)) return { deleted: false, error: `Team "${name}" not found` };
  return { deleted: true };
}
