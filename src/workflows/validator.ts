import type { WorkflowDefinition, WorkflowPhase, WorkflowTask } from "./types.ts";

export interface ValidationError {
  field: string;
  message: string;
}

function err(field: string, message: string): ValidationError {
  return { field, message };
}

export function validateWorkflow(w: Partial<WorkflowDefinition>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!w.name || typeof w.name !== "string" || !w.name.trim()) {
    errors.push(err("name", "Name is required"));
  } else if (w.name.trim().length > 128) {
    errors.push(err("name", "Name must be 128 characters or less"));
  }

  if (!w.description || typeof w.description !== "string" || !w.description.trim()) {
    errors.push(err("description", "Description is required"));
  }

  if (!Array.isArray(w.phases) || w.phases.length === 0) {
    errors.push(err("phases", "At least one phase is required"));
  } else {
    const taskIds = new Set<string>();
    for (let i = 0; i < w.phases.length; i++) {
      const phaseErrors = validatePhase(w.phases[i], i, taskIds);
      errors.push(...phaseErrors);
    }
    for (const phase of w.phases) {
      for (const task of phase.tasks) {
        if (task.dependsOn) {
          for (const depId of task.dependsOn) {
            if (!taskIds.has(depId)) {
              errors.push(err(`phases.tasks.${task.id}.dependsOn`, `Dependency "${depId}" not found in workflow`));
            }
          }
        }
      }
    }
  }

  return errors;
}

function validatePhase(phase: WorkflowPhase, index: number, taskIds: Set<string>): ValidationError[] {
  const errors: ValidationError[] = [];
  const prefix = `phases[${index}]`;

  if (!phase.name || typeof phase.name !== "string" || !phase.name.trim()) {
    errors.push(err(`${prefix}.name`, "Phase name is required"));
  }

  const concurrency = Number(phase.concurrency);
  if (!Number.isFinite(concurrency) || concurrency < 1) {
    errors.push(err(`${prefix}.concurrency`, "Concurrency must be at least 1"));
  }

  if (!Array.isArray(phase.tasks) || phase.tasks.length === 0) {
    errors.push(err(`${prefix}.tasks`, "At least one task per phase is required"));
  } else {
    for (let j = 0; j < phase.tasks.length; j++) {
      const taskErrors = validateTask(phase.tasks[j], `${prefix}.tasks[${j}]`);
      errors.push(...taskErrors);
      if (taskIds.has(phase.tasks[j].id)) {
        errors.push(err(`${prefix}.tasks[${j}].id`, `Duplicate task ID "${phase.tasks[j].id}"`));
      }
      taskIds.add(phase.tasks[j].id);
    }
  }

  return errors;
}

function validateTask(task: WorkflowTask, prefix: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!task.id || typeof task.id !== "string" || !task.id.trim()) {
    errors.push(err(`${prefix}.id`, "Task ID is required"));
  }
  if (!task.agent || typeof task.agent !== "string" || !task.agent.trim()) {
    errors.push(err(`${prefix}.agent`, "Agent name is required"));
  }
  if (!task.task || typeof task.task !== "string" || !task.task.trim()) {
    errors.push(err(`${prefix}.task`, "Task description is required"));
  }

  return errors;
}
