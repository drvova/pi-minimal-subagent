import assert from "node:assert/strict";
import test from "node:test";
import { runGoalLoop } from "./goal-runner.ts";
import type { AgentConfig } from "../agents/agents.ts";
import type { Settings } from "../settings/settings.ts";

function defaultSettings(): Settings {
  return { model: null, extensions: null, environment: {}, delegation: null };
}

const workerAgent: AgentConfig = {
  name: "worker", description: "worker", systemPrompt: "work",
  source: "user", filePath: "/tmp/worker.md",
};

const judgeAgent: AgentConfig = {
  name: "judge", description: "judge", systemPrompt: "judge",
  source: "user", filePath: "/tmp/judge.md",
};

test("dryRun: achieves goal on second turn", async () => {
  const run = await runGoalLoop({
    cwd: "/tmp", dryRun: true,
    config: { team: "test", goal: "Test goal", workerAgent: "worker", judgeAgent: "judge", maxTurns: 3 },
    workerAgent, judgeAgent, settings: defaultSettings(),
  });
  assert.equal(run.status, "achieved");
  assert.equal(run.turns.length, 2);
  assert.equal(run.turns[0].judgeVerdict, "not_achieved");
  assert.equal(run.turns[1].judgeVerdict, "achieved");
});

test("dryRun: hits maxTurns if never achieves", async () => {
  const run = await runGoalLoop({
    cwd: "/tmp", dryRun: true,
    config: { team: "test", goal: "Hard goal", workerAgent: "worker", judgeAgent: "judge", maxTurns: 1 },
    workerAgent, judgeAgent, settings: defaultSettings(),
  });
  assert.equal(run.status, "max_turns");
  assert.equal(run.turns.length, 1);
  // With only 1 turn in dryRun mode, verdict stays not_achieved
  assert.equal(run.turns[0].judgeVerdict, "not_achieved");
});

test("dryRun: single turn runs once with maxTurns=1", async () => {
  const run = await runGoalLoop({
    cwd: "/tmp", dryRun: true,
    config: { team: "test", goal: "Easy goal", workerAgent: "worker", judgeAgent: "judge", maxTurns: 1 },
    workerAgent, judgeAgent, settings: defaultSettings(),
  });
  assert.equal(run.turns.length, 1);
  // Dry-run pattern: turn 1 = not_achieved, so with maxTurns=1 it hits max_turns
  assert.equal(run.status, "max_turns");
});

test("dryRun: aborted via signal", async () => {
  const abort = new AbortController();
  abort.abort();
  const run = await runGoalLoop({
    cwd: "/tmp", dryRun: true,
    config: { team: "test", goal: "Goal", workerAgent: "worker", judgeAgent: "judge", maxTurns: 5 },
    workerAgent, judgeAgent, settings: defaultSettings(), signal: abort.signal,
  });
  assert.equal(run.status, "aborted");
});

test("dryRun: previous feedback accumulates across turns", async () => {
  const run = await runGoalLoop({
    cwd: "/tmp", dryRun: true,
    config: { team: "test", goal: "Goal", workerAgent: "worker", judgeAgent: "judge", maxTurns: 3 },
    workerAgent, judgeAgent, settings: defaultSettings(),
  });
  assert.equal(run.status, "achieved");
  // Second turn should have feedback from first turn
  assert.ok(run.turns[1].workerPrompt.includes("PREVIOUS ATTEMPT FEEDBACK"));
});
