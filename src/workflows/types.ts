// Workflow definition types — owned by workflows slice.

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  phases: WorkflowPhase[];
  team?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowPhase {
  id: string;
  name: string;
  tasks: WorkflowTask[];
  concurrency: number;
}

export interface WorkflowTask {
  id: string;
  agent: string;
  task: string;
  dependsOn?: string[];
}
