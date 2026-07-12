import type { AgentConfig } from "../agents/agents.ts";
import type { Settings } from "../settings/settings.ts";
import { now, spawnForTask } from "./spawn.ts";
import { buildJudgePrompt, buildWorkerPrompt, parseJudgeVerdict } from "./goal-helpers.ts";
import type { GoalConfig, GoalRun, GoalTurn } from "./goal-types.ts";
import { emitGoalLoopCompleted, emitGoalLoopFailed, emitGoalLoopStarted } from "./events.ts";

export interface GoalRunnerOptions {
  cwd: string;
  config: GoalConfig;
  workerAgent: AgentConfig;
  judgeAgent: AgentConfig;
  settings: Settings;
  signal?: AbortSignal;
  dryRun?: boolean;
}

function generateGoalId(): string {
  return `goal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function runGoalLoop(opts: GoalRunnerOptions): Promise<GoalRun> {
  const { cwd, config, workerAgent, judgeAgent, settings, signal, dryRun } = opts;

  const run: GoalRun = {
    id: generateGoalId(),
    team: config.team, goal: config.goal,
    workerAgent: config.workerAgent, judgeAgent: config.judgeAgent,
    maxTurns: config.maxTurns, budget: config.budget ?? 0,
    turns: [], status: "running", startedAt: now(), totalCost: 0,
  };

  let previousFeedback = "";
  emitGoalLoopStarted(config.goal, config.workerAgent, config.judgeAgent, config.maxTurns, cwd);

  const effectiveMax = config.maxTurns > 0 ? config.maxTurns : Infinity;
  for (let turnNum = 1; turnNum <= effectiveMax; turnNum++) {
    if (signal?.aborted) { run.status = "aborted"; break; }

    const workerTask = buildWorkerPrompt(config.goal, previousFeedback);
    const turn: GoalTurn = {
      turnNumber: turnNum,
      workerPrompt: workerTask,
      workerTask: `Turn ${turnNum}${config.maxTurns > 0 ? `/${config.maxTurns}` : ""}`,
      workerResponse: "",
      judgeVerdict: "not_achieved",
      judgeReason: "",
      startedAt: now(),
      completedAt: "",
      usage: { workerInput: 0, workerOutput: 0, workerCost: 0, judgeInput: 0, judgeOutput: 0, judgeCost: 0 },
    };

    if (dryRun) {
      turn.workerResponse = `[DRY RUN] Worker turn ${turnNum} for goal: ${config.goal}`;
      turn.judgeVerdict = turnNum >= 2 ? "achieved" : "not_achieved";
      turn.judgeReason = turnNum >= 2 ? "Goal appears satisfied." : "More work needed.";
      turn.completedAt = now();
      run.turns.push(turn);
      previousFeedback = `Turn ${turnNum}: ${turn.judgeReason}`;
      if (turn.judgeVerdict === "achieved") { run.status = "achieved"; break; }
      continue;
    }

    // Worker turn
    const workerResult = await spawnForTask(cwd, workerTask, workerAgent, settings, signal);
    turn.workerResponse = workerResult.response;
    turn.usage.workerInput = workerResult.usage.input;
    turn.usage.workerOutput = workerResult.usage.output;
    turn.usage.workerCost = workerResult.usage.cost;
    run.totalCost += workerResult.usage.cost;

    if (config.budget && run.totalCost >= config.budget) {
      run.status = "budget_exceeded"; turn.completedAt = now(); run.turns.push(turn); break;
    }

    // Judge turn
    const judgePrompt = buildJudgePrompt(config.goal, workerResult.response, turnNum);
    const judgeResult = await spawnForTask(cwd, judgePrompt, judgeAgent, settings, signal);
    turn.usage.judgeInput = judgeResult.usage.input;
    turn.usage.judgeOutput = judgeResult.usage.output;
    turn.usage.judgeCost = judgeResult.usage.cost;
    run.totalCost += judgeResult.usage.cost;

    const { verdict, reason } = parseJudgeVerdict(judgeResult.response);
    turn.judgeVerdict = verdict;
    turn.judgeReason = reason;
    turn.completedAt = now();
    run.turns.push(turn);

    if (verdict === "achieved") { run.status = "achieved"; break; }
    if (verdict === "blocked") { run.status = "blocked"; break; }

    previousFeedback = `Turn ${turnNum} verdict: ${verdict}\n${reason}`;

    if (config.budget && run.totalCost >= config.budget) {
      run.status = "budget_exceeded"; break;
    }
  }

  if (run.status === "running" && config.maxTurns > 0 && run.turns.length >= config.maxTurns) {
    run.status = "max_turns";
  }
  run.completedAt = now();

  if (run.status === "achieved") {
    emitGoalLoopCompleted(config.goal, run.turns.length, run.totalCost, cwd);
  } else {
    emitGoalLoopFailed(config.goal, run.status, cwd);
  }

  return run;
}
