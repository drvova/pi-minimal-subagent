import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createWorkflow, updateWorkflow, removeWorkflow } from "./manager.ts";
import { validateWorkflow } from "./validator.ts";
import { listWorkflows } from "./persistence.ts";

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pi-test-wf-"));
}

test("validateWorkflow: rejects empty workflow", () => {
  assert.ok(validateWorkflow({}).length > 0);
});

test("validateWorkflow: requires name", () => {
  const errors = validateWorkflow({ description: "desc", phases: [] });
  assert.ok(errors.some((e) => e.field === "name"));
});

test("validateWorkflow: requires at least one phase", () => {
  const errors = validateWorkflow({ name: "test", description: "desc", phases: [] });
  assert.ok(errors.some((e) => e.field === "phases"));
});

test("validateWorkflow: valid workflow passes", () => {
  const errors = validateWorkflow({
    name: "Test WF", description: "A test workflow",
    phases: [{ id: "p1", name: "Phase 1", concurrency: 2, tasks: [{ id: "t1", agent: "scout", task: "do work" }] }],
  });
  assert.equal(errors.length, 0);
});

test("validateWorkflow: rejects task without agent", () => {
  const errors = validateWorkflow({
    name: "Test", description: "desc",
    phases: [{ id: "p1", name: "Phase 1", concurrency: 1, tasks: [{ id: "t1", agent: "", task: "work" }] }],
  });
  assert.ok(errors.some((e) => e.field.includes("agent")));
});

test("validateWorkflow: rejects duplicate task IDs", () => {
  const errors = validateWorkflow({
    name: "Test", description: "desc",
    phases: [
      { id: "p1", name: "P1", concurrency: 1, tasks: [{ id: "dup", agent: "a", task: "t1" }] },
      { id: "p2", name: "P2", concurrency: 1, tasks: [{ id: "dup", agent: "b", task: "t2" }] },
    ],
  });
  assert.ok(errors.some((e) => e.message.includes("Duplicate")));
});

test("validateWorkflow: rejects invalid task cross-phase dependency", () => {
  const errors = validateWorkflow({
    name: "Test", description: "desc",
    phases: [
      { id: "p1", name: "P1", concurrency: 1, tasks: [{ id: "t1", agent: "a", task: "work", dependsOn: ["nonexistent"] }] },
    ],
  });
  assert.ok(errors.some((e) => e.field.includes("dependsOn")));
});

test("createWorkflow: persists and retrieves", () => {
  const dir = tmpdir();
  try {
    const result = createWorkflow(dir, {
      name: "Test WF", description: "A test workflow",
      phases: [{ id: "p1", name: "Build", concurrency: 2, tasks: [{ id: "t1", agent: "scout", task: "inspect" }] }],
    });
    assert.equal(result.errors.length, 0);
    assert.ok(result.workflow!.id.startsWith("wf-"));
    assert.equal(listWorkflows(dir).length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("updateWorkflow: modifies existing", () => {
  const dir = tmpdir();
  try {
    const created = createWorkflow(dir, {
      name: "Original", description: "desc",
      phases: [{ id: "p1", name: "P1", concurrency: 1, tasks: [{ id: "t1", agent: "a", task: "work" }] }],
    });
    const result = updateWorkflow(dir, created.workflow!.id, { name: "Updated" });
    assert.equal(result.errors.length, 0);
    assert.equal(result.workflow!.name, "Updated");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("removeWorkflow: deletes existing", () => {
  const dir = tmpdir();
  try {
    const created = createWorkflow(dir, {
      name: "To Delete", description: "desc",
      phases: [{ id: "p1", name: "P1", concurrency: 1, tasks: [{ id: "t1", agent: "a", task: "work" }] }],
    });
    assert.equal(removeWorkflow(dir, created.workflow!.id).deleted, true);
    assert.equal(listWorkflows(dir).length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("removeWorkflow: returns error for nonexistent", () => {
  const result = removeWorkflow("/nonexistent/path", "fake-id");
  assert.equal(result.deleted, false);
  assert.ok(result.error);
});
