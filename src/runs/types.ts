// Run types — owned by runs slice.

export type RunStatus = "pending" | "running" | "completed" | "failed" | "aborted" | "needs_attention";

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  status: RunStatus;
  phaseResults: PhaseResult[];
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface PhaseResult {
  phaseId: string;
  phaseName: string;
  status: RunStatus;
  startedAt: string;
  completedAt?: string;
  taskResults: TaskResult[];
}

export interface TaskResult {
  taskId: string;
  agent: string;
  task: string;
  status: RunStatus;
  startedAt?: string;
  completedAt?: string;
  exitCode?: number;
  response?: string;
  errorMessage?: string;
  artifactDir?: string;
  usage?: {
    input: number;
    output: number;
    cost: number;
    turns: number;
  };
}

export interface RunEvent {
  timestamp: string;
  type: "run_started" | "run_completed" | "run_failed" | "run_aborted" |
        "phase_started" | "phase_completed" | "phase_failed" |
        "task_started" | "task_completed" | "task_failed";
  runId: string;
  phaseId?: string;
  taskId?: string;
  message?: string;
}

export interface BackgroundRun {
  runId: string;
  pid: number;
  startedAt: string;
  status: RunStatus;
  cwd: string;
}

export interface RunListEntry {
  runId: string;
  workflowId: string;
  workflowName: string;
  status: RunStatus;
  startedAt: string;
  completedAt: string | undefined;
  phaseCount: number;
  taskCount: number;
}
