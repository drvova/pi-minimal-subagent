import type { WorkflowDefinition, WorkflowPhase } from "./types.ts";
import { deleteWorkflow, listWorkflows, saveWorkflow } from "./persistence.ts";
import { validateWorkflow } from "./validator.ts";
import type { ValidationError } from "./validator.ts";

export type { ValidationError } from "./validator.ts";

function err(field: string, message: string): ValidationError {
  return { field, message };
}

export function createWorkflow(
  cwd: string,
  input: { name: string; description: string; phases: WorkflowPhase[]; team?: string },
): { workflow?: WorkflowDefinition; errors: ValidationError[] } {
  const id = `wf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const workflow: WorkflowDefinition = {
    id, name: input.name.trim(), description: input.description.trim(),
    phases: input.phases, team: input.team?.trim() || undefined,
    createdAt: now, updatedAt: now,
  };
  const errors = validateWorkflow(workflow);
  if (errors.length > 0) return { errors };
  saveWorkflow(cwd, workflow);
  return { workflow, errors: [] };
}

export function updateWorkflow(
  cwd: string, id: string,
  input: { name?: string; description?: string; phases?: WorkflowPhase[]; team?: string },
): { workflow?: WorkflowDefinition; errors: ValidationError[] } {
  const existing = listWorkflows(cwd).find((w) => w.id === id);
  if (!existing) return { errors: [err("id", `Workflow "${id}" not found`)] };
  const merged: WorkflowDefinition = {
    ...existing,
    ...(input.name !== undefined && { name: input.name.trim() }),
    ...(input.description !== undefined && { description: input.description.trim() }),
    ...(input.phases !== undefined && { phases: input.phases }),
    ...(input.team !== undefined && { team: input.team?.trim() || undefined }),
  };
  const errors = validateWorkflow(merged);
  if (errors.length > 0) return { errors };
  saveWorkflow(cwd, merged);
  return { workflow: merged, errors: [] };
}

export function removeWorkflow(cwd: string, id: string): { deleted: boolean; error?: string } {
  if (!deleteWorkflow(cwd, id)) return { deleted: false, error: `Workflow "${id}" not found` };
  return { deleted: true };
}
