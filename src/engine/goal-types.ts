// Goal loop types — autonomous multi-turn worker+judge execution.

export type GoalStatus = "running" | "achieved" | "max_turns" | "budget_exceeded" | "blocked" | "aborted";

export type JudgeVerdict = "achieved" | "not_achieved" | "blocked";

export interface GoalConfig {
  team: string;
  goal: string;
  workerAgent: string;
  judgeAgent: string;
  maxTurns: number;
  budget?: number;
}

export interface GoalTurn {
  turnNumber: number;
  workerPrompt: string;
  workerTask: string;
  workerResponse: string;
  judgeVerdict: JudgeVerdict;
  judgeReason: string;
  startedAt: string;
  completedAt: string;
  usage: {
    workerInput: number;
    workerOutput: number;
    workerCost: number;
    judgeInput: number;
    judgeOutput: number;
    judgeCost: number;
  };
}

export interface GoalRun {
  id: string;
  team: string;
  goal: string;
  workerAgent: string;
  judgeAgent: string;
  maxTurns: number;
  budget: number;
  turns: GoalTurn[];
  status: GoalStatus;
  startedAt: string;
  completedAt?: string;
  totalCost: number;
}
