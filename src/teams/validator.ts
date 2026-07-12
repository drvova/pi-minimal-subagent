import type { TeamDefinition } from "./types.ts";

export interface ValidationError {
  field: string;
  message: string;
}

function err(field: string, message: string): ValidationError {
  return { field, message };
}

const NAME_PATTERN = /^[a-z0-9][a-z0-9\s_.-]{0,127}$/i;

export function validateTeam(t: Partial<TeamDefinition>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!t.name || typeof t.name !== "string" || !t.name.trim()) {
    errors.push(err("name", "Team name is required"));
  } else if (!NAME_PATTERN.test(t.name.trim())) {
    errors.push(err("name", "Team name contains invalid characters"));
  }

  if (!t.description || typeof t.description !== "string" || !t.description.trim()) {
    errors.push(err("description", "Description is required"));
  }

  if (!Array.isArray(t.members) || t.members.length === 0) {
    errors.push(err("members", "At least one team member is required"));
  } else {
    const agentNames = new Set<string>();
    for (let i = 0; i < t.members.length; i++) {
      const m = t.members[i];
      if (!m.agent || typeof m.agent !== "string" || !m.agent.trim()) {
        errors.push(err(`members[${i}].agent`, "Agent name is required"));
      } else if (agentNames.has(m.agent.trim())) {
        errors.push(err(`members[${i}].agent`, `Duplicate agent "${m.agent}" in team`));
      } else {
        agentNames.add(m.agent.trim());
      }
      if (!m.role || typeof m.role !== "string" || !m.role.trim()) {
        errors.push(err(`members[${i}].role`, "Role description is required"));
      }
    }
  }

  return errors;
}
