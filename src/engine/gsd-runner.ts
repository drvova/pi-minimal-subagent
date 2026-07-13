// Native GSD runner — orchestrates the five-phase GSD cycle.
// Discuss → Plan → Execute → Verify → Ship using real subagent calls.

import { discoverAgents } from "../agents/agents.ts";
import type { Settings } from "../settings/settings.ts";
import { now } from "./spawn.ts";
import { type GSDPhase, runPhase } from "./gsd-phase.ts";

export type { GSDPhase };

export interface GSDOptions {
  cwd: string;
  feature: string;
  plannerAgent?: string;
  executorAgent?: string;
  reviewerAgent?: string;
  settings: Settings;
  signal?: AbortSignal;
  dryRun?: boolean;
}

export interface GSDRun {
  id: string;
  feature: string;
  phases: GSDPhase[];
  status: "running" | "completed" | "failed" | "aborted";
  totalCost: number;
  startedAt: string;
  completedAt?: string;
}

function generateId(): string {
  return `gsd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function runGSDCycle(opts: GSDOptions): Promise<GSDRun> {
  const { cwd, feature, settings, signal } = opts;
  const dryRun = opts.dryRun ?? false;
  const discovery = discoverAgents(cwd);
  const agents = discovery.agents;

  const planner = opts.plannerAgent || agents.find(a => a.name.includes("planner"))?.name || agents[0]?.name || "";
  const executor = opts.executorAgent || agents.find(a => a.name.includes("executor"))?.name || agents[0]?.name || "";
  const reviewer = opts.reviewerAgent || agents.find(a => a.name.includes("reviewer"))?.name || agents[0]?.name || "";

  const run: GSDRun = {
    id: generateId(),
    feature,
    phases: [],
    status: "running",
    totalCost: 0,
    startedAt: now(),
  };

  if (!planner || !executor || !reviewer) {
    run.status = "failed";
    run.completedAt = now();
    return run;
  }

  // Phase 1: Discuss
  const discussPrompt = `GSD Phase: DISCUSS\n\nFeature: ${feature}\n\nCapture implementation decisions before planning. Identify what needs to be built, surface constraints, assumptions, and tradeoffs. Output a clear problem statement.`;
  const discuss = await runPhase(cwd, "Discuss", planner!, agents, discussPrompt, settings, dryRun, signal);
  run.phases.push(discuss);
  run.totalCost += discuss.usage.cost;
  if (signal?.aborted || discuss.status === "failed") { run.status = discuss.status === "failed" ? "failed" : "aborted"; run.completedAt = now(); return run; }

  // Phase 2: Plan
  const planPrompt = `GSD Phase: PLAN\n\nFeature: ${feature}\n\nDiscuss output: ${discuss.response.slice(0, 2000)}\n\nDecompose the work into parallel-executable tasks. Each task must fit in a clean context window. Output: numbered task list with estimates, verification checklist.`;
  const plan = await runPhase(cwd, "Plan", planner!, agents, planPrompt, settings, dryRun, signal);
  run.phases.push(plan);
  run.totalCost += plan.usage.cost;
  if (signal?.aborted || plan.status === "failed") { run.status = plan.status === "failed" ? "failed" : "aborted"; run.completedAt = now(); return run; }

  // Phase 3: Execute
  const executePrompt = `GSD Phase: EXECUTE\n\nFeature: ${feature}\n\nPlan: ${plan.response.slice(0, 2000)}\n\nImplement all tasks from the plan. Write complete tested code with no TODOs or placeholders. Use known working solutions.`;
  const execute = await runPhase(cwd, "Execute", executor!, agents, executePrompt, settings, dryRun, signal);
  run.phases.push(execute);
  run.totalCost += execute.usage.cost;
  if (signal?.aborted || execute.status === "failed") { run.status = execute.status === "failed" ? "failed" : "aborted"; run.completedAt = now(); return run; }

  // Phase 4: Verify
  const verifyPrompt = `GSD Phase: VERIFY\n\nFeature: ${feature}\n\nExecute output: ${execute.response.slice(0, 2000)}\n\nWalk through everything built. Run tests, check types, review output. Diagnose and fix issues. Report: what passed, what failed, what was fixed.`;
  const verify = await runPhase(cwd, "Verify", reviewer!, agents, verifyPrompt, settings, dryRun, signal);
  run.phases.push(verify);
  run.totalCost += verify.usage.cost;
  if (signal?.aborted || verify.status === "failed") { run.status = verify.status === "failed" ? "failed" : "aborted"; run.completedAt = now(); return run; }

  // Phase 5: Ship
  const shipPrompt = `GSD Phase: SHIP\n\nFeature: ${feature}\n\nVerify output: ${verify.response.slice(0, 2000)}\n\nSummarize what was accomplished. List files changed. Note any deferred items. Output a clean summary ready for commit.`;
  const ship = await runPhase(cwd, "Ship", reviewer!, agents, shipPrompt, settings, dryRun, signal);
  run.phases.push(ship);
  run.totalCost += ship.usage.cost;

  run.status = run.phases.every(p => p.status === "completed") ? "completed" : "failed";
  run.completedAt = now();
  return run;
}
