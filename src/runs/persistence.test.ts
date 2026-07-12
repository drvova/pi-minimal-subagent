import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { saveRun, getRun, updateRun, appendRunEvent, listRuns } from "./persistence.ts";
import type { WorkflowRun } from "./types.ts";

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pi-test-runs-"));
}

test("saveRun + getRun + updateRun", () => {
  const dir = tmpdir();
  try {
    const run: WorkflowRun = {
      id: "run-1", workflowId: "wf-1", workflowName: "Test",
      status: "running", startedAt: new Date().toISOString(),
      phaseResults: [{
        phaseId: "p1", phaseName: "Phase 1", status: "running",
        startedAt: new Date().toISOString(),
        taskResults: [{ taskId: "t1", agent: "scout", task: "work", status: "running" }],
      }],
    };
    saveRun(dir, run);
    const got = getRun(dir, "run-1");
    assert.ok(got);
    assert.equal(got!.status, "running");

    run.status = "completed";
    run.completedAt = new Date().toISOString();
    updateRun(dir, run);
    assert.equal(getRun(dir, "run-1")!.status, "completed");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("appendRunEvent writes to events file", () => {
  const dir = tmpdir();
  try {
    saveRun(dir, { id: "run-ev", workflowId: "wf-1", workflowName: "Test", status: "running", startedAt: new Date().toISOString(), phaseResults: [] });
    appendRunEvent(dir, "run-ev", { timestamp: new Date().toISOString(), type: "run_started", runId: "run-ev", message: "started" });
    appendRunEvent(dir, "run-ev", { timestamp: new Date().toISOString(), type: "task_started", runId: "run-ev", phaseId: "p1", taskId: "t1" });

    const eventsPath = path.join(dir, ".pi", "subagent-state", "runs", "run-ev", "events.jsonl");
    assert.ok(fs.existsSync(eventsPath));
    const lines = fs.readFileSync(eventsPath, "utf-8").trim().split("\n");
    assert.equal(lines.length, 2);
    assert.ok(JSON.parse(lines[0]).type === "run_started");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("listRuns returns sorted entries", () => {
  const dir = tmpdir();
  try {
    for (let i = 0; i < 3; i++) {
      saveRun(dir, {
        id: `run-${i}`, workflowId: "wf-1", workflowName: `WF ${i}`,
        status: "completed",
        startedAt: new Date(Date.now() - (3 - i) * 1000).toISOString(),
        completedAt: new Date().toISOString(),
        phaseResults: [{ phaseId: "p1", phaseName: "P1", status: "completed", startedAt: "", completedAt: "", taskResults: [] }],
      });
    }
    const runs = listRuns(dir);
    assert.equal(runs.length, 3);
    assert.ok(runs[0].startedAt >= runs[1].startedAt); // newest first
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("getRun returns null for nonexistent", () => {
  assert.equal(getRun("/nonexistent", "fake"), null);
});
