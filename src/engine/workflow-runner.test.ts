import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runWorkflow } from "./workflow-runner.ts";
import { getRun, listRuns } from "../runs/persistence.ts";
import type { WorkflowDefinition } from "../workflows/types.ts";
import type { Settings } from "../settings/settings.ts";

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pi-test-engine-"));
}

function defaultSettings(): Settings {
  return { model: null, extensions: null, environment: {}, delegation: null };
}

const noAgents: never[] = [];

test("dryRun: single phase, single task completes", async () => {
  const dir = tmpdir();
  try {
    const wf: WorkflowDefinition = {
      id: "wf-1", name: "Test", description: "desc",
      phases: [{ id: "p1", name: "Phase 1", concurrency: 1, tasks: [{ id: "t1", agent: "scout", task: "inspect" }] }],
      createdAt: "", updatedAt: "",
    };
    const run = await runWorkflow({ cwd: dir, workflow: wf, agents: noAgents, settings: defaultSettings(), dryRun: true });
    assert.equal(run.status, "completed");
    assert.equal(run.phaseResults.length, 1);
    assert.equal(run.phaseResults[0].status, "completed");
    assert.equal(run.phaseResults[0].taskResults.length, 1);
    assert.equal(run.phaseResults[0].taskResults[0].status, "completed");
    assert.ok(run.phaseResults[0].taskResults[0].response?.includes("[DRY RUN]"));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("dryRun: multi-phase runs sequentially", async () => {
  const dir = tmpdir();
  try {
    const wf: WorkflowDefinition = {
      id: "wf-2", name: "Multi", description: "desc",
      phases: [
        { id: "p1", name: "First", concurrency: 1, tasks: [{ id: "t1", agent: "a", task: "first" }] },
        { id: "p2", name: "Second", concurrency: 1, tasks: [{ id: "t2", agent: "b", task: "second" }] },
      ],
      createdAt: "", updatedAt: "",
    };
    const run = await runWorkflow({ cwd: dir, workflow: wf, agents: noAgents, settings: defaultSettings(), dryRun: true });
    assert.equal(run.status, "completed");
    assert.equal(run.phaseResults.length, 2);
    assert.equal(run.phaseResults[0].status, "completed");
    assert.equal(run.phaseResults[1].status, "completed");
    assert.ok(run.phaseResults[0].taskResults[0].response?.includes("first"));
    assert.ok(run.phaseResults[1].taskResults[0].response?.includes("second"));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("dryRun: multiple tasks in a phase all complete", async () => {
  const dir = tmpdir();
  try {
    const wf: WorkflowDefinition = {
      id: "wf-3", name: "Parallel", description: "desc",
      phases: [{
        id: "p1", name: "Phase", concurrency: 3,
        tasks: [
          { id: "t1", agent: "a", task: "work 1" },
          { id: "t2", agent: "b", task: "work 2" },
          { id: "t3", agent: "c", task: "work 3" },
        ],
      }],
      createdAt: "", updatedAt: "",
    };
    const run = await runWorkflow({ cwd: dir, workflow: wf, agents: noAgents, settings: defaultSettings(), dryRun: true });
    assert.equal(run.status, "completed");
    assert.equal(run.phaseResults[0].taskResults.length, 3);
    for (const tr of run.phaseResults[0].taskResults) {
      assert.equal(tr.status, "completed");
      assert.ok(tr.response?.includes("[DRY RUN]"));
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("dryRun: persists run to disk", async () => {
  const dir = tmpdir();
  try {
    const wf: WorkflowDefinition = {
      id: "wf-persist", name: "Persist", description: "desc",
      phases: [{ id: "p1", name: "Phase", concurrency: 1, tasks: [{ id: "t1", agent: "a", task: "work" }] }],
      createdAt: "", updatedAt: "",
    };
    const run = await runWorkflow({ cwd: dir, workflow: wf, agents: noAgents, settings: defaultSettings(), dryRun: true });
    const loaded = getRun(dir, run.id);
    assert.ok(loaded);
    assert.equal(loaded!.status, "completed");
    assert.equal(listRuns(dir).length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("dryRun: records run_started and run_completed events", async () => {
  const dir = tmpdir();
  try {
    const wf: WorkflowDefinition = {
      id: "wf-ev", name: "Events", description: "desc",
      phases: [{ id: "p1", name: "Phase", concurrency: 1, tasks: [{ id: "t1", agent: "a", task: "work" }] }],
      createdAt: "", updatedAt: "",
    };
    const run = await runWorkflow({ cwd: dir, workflow: wf, agents: noAgents, settings: defaultSettings(), dryRun: true });
    const eventsPath = path.join(dir, ".pi", "subagent-state", "runs", run.id, "events.jsonl");
    assert.ok(fs.existsSync(eventsPath));
    const lines = fs.readFileSync(eventsPath, "utf-8").trim().split("\n");
    assert.ok(lines.length >= 3); // run_started, phase_started, task_completed, phase_completed, run_completed
    assert.equal(JSON.parse(lines[0]).type, "run_started");
    assert.equal(JSON.parse(lines[lines.length - 1]).type, "run_completed");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("dryRun: pre-aborted signal produces failed run", async () => {
  const dir = tmpdir();
  try {
    const abort = new AbortController();
    const wf: WorkflowDefinition = {
      id: "wf-abort", name: "Abort", description: "desc",
      phases: [{ id: "p1", name: "First", concurrency: 1, tasks: [{ id: "t1", agent: "a", task: "work" }] }],
      createdAt: "", updatedAt: "",
    };
    abort.abort();
    const run = await runWorkflow({ cwd: dir, workflow: wf, agents: noAgents, settings: defaultSettings(), signal: abort.signal, dryRun: true });
    assert.equal(run.status, "failed");
    assert.ok(run.error);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("dryRun: agent resolution skipped, all tasks complete", async () => {
  const dir = tmpdir();
  try {
    const wf: WorkflowDefinition = {
      id: "wf-skip", name: "SkipAgent", description: "desc",
      phases: [{ id: "p1", name: "Phase", concurrency: 1, tasks: [{ id: "t1", agent: "nonexistent", task: "work" }] }],
      createdAt: "", updatedAt: "",
    };
    // Dry-run skips agent resolution entirely
    const run = await runWorkflow({ cwd: dir, workflow: wf, agents: noAgents, settings: defaultSettings(), dryRun: true });
    assert.equal(run.status, "completed");
    assert.ok(run.phaseResults[0].taskResults[0].response?.includes("[DRY RUN]"));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
