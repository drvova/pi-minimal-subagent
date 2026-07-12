import assert from "node:assert/strict";
import test, { mock } from "node:test";
import type { PhaseResult, WorkflowRun } from "../runs/types.ts";
import type { WorkflowDefinition } from "../workflows/types.ts";
import type { Settings } from "../settings/settings.ts";
import type { AgentConfig } from "../agents/agents.ts";

// Mock spawn module
const mockSpawnResults: Map<string, any> = new Map();

function setMockTaskResult(taskId: string, result: any) {
  mockSpawnResults.set(taskId, result);
}

function clearMockResults() {
  mockSpawnResults.clear();
}

mock.module("../engine/spawn.ts", {
  namedExports: {
    now: () => "2024-01-01T00:00:00.000Z",
    spawnPiTask: async (_cwd: string, task: any) => {
      const mockResult = mockSpawnResults.get(task.id);
      return mockResult ?? {
        taskId: task.id, agent: task.agent, task: task.task,
        status: "completed", exitCode: 0,
        startedAt: "2024-01-01T00:00:00.000Z",
        completedAt: "2024-01-01T00:00:01.000Z",
        response: "done",
      };
    },
  },
});

const { runPhase } = await import("../engine/phase-runner.ts");

function makeRun(phases: WorkflowDefinition["phases"]): WorkflowRun {
  return {
    id: "run-1", workflowId: "wf-1", workflowName: "Test",
    status: "running", startedAt: "2024-01-01",
    phaseResults: phases.map(p => ({
      phaseId: p.id, phaseName: p.name, status: "pending", startedAt: "2024-01-01",
      taskResults: p.tasks.map(t => ({
        taskId: t.id, agent: t.agent, task: t.task, status: "pending",
      })),
    })),
  };
}

const mockSettings: Settings = {
  model: "claude-3-5-sonnet-latest",
  extensions: null,
  environment: {},
  delegation: null,
};

const mockAgents: AgentConfig[] = [
  { name: "agent1", source: "user", description: "Agent 1", systemPrompt: "test", filePath: "a1.md" },
  { name: "agent2", source: "user", description: "Agent 2", systemPrompt: "test", filePath: "a2.md" },
];

test.beforeEach(() => {
  clearMockResults();
});

test("runPhase: completes single task successfully", async () => {
  const phase: WorkflowDefinition["phases"][number] = {
    id: "p1", name: "Phase 1", concurrency: 1,
    tasks: [{ id: "t1", agent: "agent1", task: "do work" }],
  };
  const run = makeRun([phase]);

  const result = await runPhase("/tmp", phase, mockAgents, mockSettings, run);

  assert.equal(result.status, "completed");
  assert.equal(result.taskResults[0].status, "completed");
  assert.equal(result.taskResults[0].response, "done");
});

test("runPhase: handles task failure", async () => {
  setMockTaskResult("t1", {
    taskId: "t1", status: "failed", exitCode: 1,
    errorMessage: "task failed",
  });

  const phase: WorkflowDefinition["phases"][number] = {
    id: "p1", name: "Phase 1", concurrency: 1,
    tasks: [{ id: "t1", agent: "agent1", task: "fail" }],
  };
  const run = makeRun([phase]);

  const result = await runPhase("/tmp", phase, mockAgents, mockSettings, run);

  assert.equal(result.status, "failed");
  assert.equal(result.taskResults[0].status, "failed");
  assert.equal(result.taskResults[0].errorMessage, "task failed");
});

test("runPhase: runs tasks concurrently when concurrency > 1", async () => {
  const phase: WorkflowDefinition["phases"][number] = {
    id: "p1", name: "Phase 1", concurrency: 2,
    tasks: [
      { id: "t1", agent: "agent1", task: "task 1" },
      { id: "t2", agent: "agent2", task: "task 2" },
    ],
  };
  const run = makeRun([phase]);

  const result = await runPhase("/tmp", phase, mockAgents, mockSettings, run);

  assert.equal(result.status, "completed");
  assert.equal(result.taskResults.length, 2);
  assert.equal(result.taskResults[0].status, "completed");
  assert.equal(result.taskResults[1].status, "completed");
});

test("runPhase: batches tasks according to concurrency", async () => {
  const phase: WorkflowDefinition["phases"][number] = {
    id: "p1", name: "Phase 1", concurrency: 2,
    tasks: [
      { id: "t1", agent: "agent1", task: "1" },
      { id: "t2", agent: "agent1", task: "2" },
      { id: "t3", agent: "agent1", task: "3" },
      { id: "t4", agent: "agent1", task: "4" },
    ],
  };
  const run = makeRun([phase]);

  const result = await runPhase("/tmp", phase, mockAgents, mockSettings, run);

  assert.equal(result.status, "completed");
  assert.equal(result.taskResults.length, 4);
});

test("runPhase: handles agent not found", async () => {
  const phase: WorkflowDefinition["phases"][number] = {
    id: "p1", name: "Phase 1", concurrency: 1,
    tasks: [{ id: "t1", agent: "nonexistent", task: "work" }],
  };
  const run = makeRun([phase]);

  const result = await runPhase("/tmp", phase, mockAgents, mockSettings, run);

  assert.equal(result.status, "failed");
  assert.equal(result.taskResults[0].status, "failed");
  assert.ok(result.taskResults[0].errorMessage?.includes("not found"));
});

test("runPhase: dry run mode", async () => {
  const phase: WorkflowDefinition["phases"][number] = {
    id: "p1", name: "Phase 1", concurrency: 1,
    tasks: [{ id: "t1", agent: "agent1", task: "work" }],
  };
  const run = makeRun([phase]);

  const result = await runPhase("/tmp", phase, mockAgents, mockSettings, run, undefined, true);

  assert.equal(result.status, "completed");
  assert.equal(result.taskResults[0].status, "completed");
  assert.ok(result.taskResults[0].response?.includes("[DRY RUN]"));
});

test("runPhase: abort signal stops execution", async () => {
  const controller = new AbortController();
  const phase: WorkflowDefinition["phases"][number] = {
    id: "p1", name: "Phase 1", concurrency: 1,
    tasks: [
      { id: "t1", agent: "agent1", task: "1" },
      { id: "t2", agent: "agent1", task: "2" },
    ],
  };
  const run = makeRun([phase]);

  // Abort immediately
  controller.abort();

  const result = await runPhase("/tmp", phase, mockAgents, mockSettings, run, controller.signal);

  assert.equal(result.status, "aborted");
});

test("runPhase: auto agent selection with delegation routing", async () => {
  const settingsWithRouting: Settings = {
    ...mockSettings,
    delegation: {
      autoDelegate: true,
      complexityThreshold: 0.3,
      minTaskLength: 10,
      agentRouting: [
        { keywords: ["work"], agent: "agent2", weight: 1 },
      ],
    },
  };

  const phase: WorkflowDefinition["phases"][number] = {
    id: "p1", name: "Phase 1", concurrency: 1,
    tasks: [{ id: "t1", agent: "auto", task: "do work" }],
  };
  const run = makeRun([phase]);

  const result = await runPhase("/tmp", phase, mockAgents, settingsWithRouting, run);

  assert.equal(result.status, "completed");
  assert.equal(result.taskResults[0].status, "completed");
});

test("runPhase: needs_attention status is treated as completed", async () => {
  setMockTaskResult("t1", {
    taskId: "t1", status: "needs_attention", exitCode: 0,
  });

  const phase: WorkflowDefinition["phases"][number] = {
    id: "p1", name: "Phase 1", concurrency: 1,
    tasks: [{ id: "t1", agent: "agent1", task: "work" }],
  };
  const run = makeRun([phase]);

  const result = await runPhase("/tmp", phase, mockAgents, mockSettings, run);

  // Phase is completed if all tasks are completed or needs_attention
  assert.equal(result.status, "completed");
  assert.equal(result.taskResults[0].status, "needs_attention");
});

test("runPhase: mixed success and failure", async () => {
  setMockTaskResult("t2", {
    taskId: "t2", status: "failed", exitCode: 1, errorMessage: "fail",
  });

  const phase: WorkflowDefinition["phases"][number] = {
    id: "p1", name: "Phase 1", concurrency: 2,
    tasks: [
      { id: "t1", agent: "agent1", task: "pass" },
      { id: "t2", agent: "agent1", task: "fail" },
    ],
  };
  const run = makeRun([phase]);

  const result = await runPhase("/tmp", phase, mockAgents, mockSettings, run);

  assert.equal(result.status, "failed");
  assert.equal(result.taskResults[0].status, "completed");
  assert.equal(result.taskResults[1].status, "failed");
});

test("runPhase: timestamps are set", async () => {
  const phase: WorkflowDefinition["phases"][number] = {
    id: "p1", name: "Phase 1", concurrency: 1,
    tasks: [{ id: "t1", agent: "agent1", task: "work" }],
  };
  const run = makeRun([phase]);

  const result = await runPhase("/tmp", phase, mockAgents, mockSettings, run);

  assert.ok(result.startedAt);
  assert.ok(result.completedAt);
  assert.equal(result.status, "completed");
});

test("runPhase: handles empty tasks list", async () => {
  const phase: WorkflowDefinition["phases"][number] = {
    id: "p1", name: "Empty Phase", concurrency: 1, tasks: [],
  };
  const run = makeRun([phase]);

  const result = await runPhase("/tmp", phase, mockAgents, mockSettings, run);

  assert.equal(result.status, "completed");
  assert.equal(result.taskResults.length, 0);
});
