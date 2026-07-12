import assert from "node:assert/strict";
import test from "node:test";
import {
  handleWorkflowList, handleWorkflowCreate, handleWorkflowUpdate, handleWorkflowDelete,
  handleTeamList, handleTeamCreate, handleTeamUpdate, handleTeamDelete,
  handleAgentList, handleAgentCreate, handleAgentUpdate, handleAgentDelete,
} from "./dispatch-crud.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let testCwd: string;

test.beforeEach(() => {
  testCwd = mkdtempSync(join(tmpdir(), "pi-test-"));
});

test.afterEach(() => {
  if (testCwd) rmSync(testCwd, { recursive: true, force: true });
});

// ─── Workflow CRUD ──────────────────────────────────────────

test("workflow-list: empty", async () => {
  const r = await handleWorkflowList(testCwd);
  assert.equal(r.content[0].text, "No workflows defined.");
});

test("workflow-create: success", async () => {
  const r = await handleWorkflowCreate({
    name: "test-wf", description: "Test workflow",
    phases: JSON.stringify([{ id: "p1", name: "Phase 1", tasks: [{ id: "t1", agent: "test", task: "do something" }] }]),
  }, testCwd);
  assert.ok(r.content[0].text.includes("created"));
  assert.equal(r.isError, undefined);
});

test("workflow-create: missing params", async () => {
  const r = await handleWorkflowCreate({}, testCwd);
  assert.equal(r.isError, true);
  assert.ok(r.content[0].text.includes("requires"));
});

test("workflow-create: invalid JSON", async () => {
  const r = await handleWorkflowCreate({
    name: "test", description: "desc", phases: "not json",
  }, testCwd);
  assert.equal(r.isError, true);
  assert.ok(r.content[0].text.includes("valid JSON"));
});

test("workflow-update: success", async () => {
  await handleWorkflowCreate({
    name: "test-wf", description: "Old desc",
    phases: JSON.stringify([{ id: "p1", name: "Phase 1", tasks: [{ id: "t1", agent: "test", task: "do something" }] }]),
  }, testCwd);

  const list = await handleWorkflowList(testCwd);
  const match = list.content[0].text.match(/\(([^)]+)\)/);
  const id = match?.[1];

  const r = await handleWorkflowUpdate({ id, description: "New desc" }, testCwd);
  assert.ok(r.content[0].text.includes("updated"));
});

test("workflow-update: missing id", async () => {
  const r = await handleWorkflowUpdate({}, testCwd);
  assert.equal(r.isError, true);
});

test("workflow-delete: success", async () => {
  await handleWorkflowCreate({
    name: "test-wf", description: "desc",
    phases: JSON.stringify([{ id: "p1", name: "Phase 1", tasks: [{ id: "t1", agent: "test", task: "do something" }] }]),
  }, testCwd);

  const list = await handleWorkflowList(testCwd);
  const match = list.content[0].text.match(/\(([^)]+)\)/);
  const id = match?.[1];

  const r = await handleWorkflowDelete({ id }, testCwd);
  assert.ok(r.content[0].text.includes("deleted"));
});

test("workflow-delete: missing id", async () => {
  const r = await handleWorkflowDelete({}, testCwd);
  assert.equal(r.isError, true);
});

// ─── Team CRUD ──────────────────────────────────────────────

test("team-list: empty", async () => {
  const r = await handleTeamList(testCwd);
  assert.equal(r.content[0].text, "No teams defined.");
});

test("team-create: success", async () => {
  const r = await handleTeamCreate({
    name: "test-team", description: "Test team",
    members: JSON.stringify([{ agent: "a1", role: "worker" }]),
  }, testCwd);
  assert.ok(r.content[0].text.includes("created"));
});

test("team-create: missing params", async () => {
  const r = await handleTeamCreate({}, testCwd);
  assert.equal(r.isError, true);
});

test("team-update: success", async () => {
  await handleTeamCreate({
    name: "test-team", description: "Old",
    members: JSON.stringify([]),
  }, testCwd);

  const r = await handleTeamUpdate({ name: "test-team", description: "New" }, testCwd);
  assert.ok(r.content[0].text.includes("updated"));
});

test("team-update: missing name", async () => {
  const r = await handleTeamUpdate({}, testCwd);
  assert.equal(r.isError, true);
});

test("team-delete: success", async () => {
  await handleTeamCreate({
    name: "test-team", description: "desc",
    members: JSON.stringify([]),
  }, testCwd);

  const r = await handleTeamDelete({ name: "test-team" }, testCwd);
  assert.ok(r.content[0].text.includes("deleted"));
});

test("team-delete: missing name", async () => {
  const r = await handleTeamDelete({}, testCwd);
  assert.equal(r.isError, true);
});

// ─── Agent CRUD ─────────────────────────────────────────────

test("agent-list: empty", async () => {
  const r = await handleAgentList(testCwd);
  // May include discovered agents, so just check it doesn't crash
  assert.ok(r.content[0].text);
});

test("agent-create: success", async () => {
  const r = await handleAgentCreate({
    name: "test-agent", description: "Test", systemPrompt: "You are helpful",
  }, testCwd);
  assert.ok(r.content[0].text.includes("created"));
});

test("agent-create: missing params", async () => {
  const r = await handleAgentCreate({}, testCwd);
  assert.equal(r.isError, true);
});

test("agent-update: success", async () => {
  await handleAgentCreate({
    name: "test-agent", description: "Old", systemPrompt: "Old prompt",
  }, testCwd);

  const r = await handleAgentUpdate({ name: "test-agent", description: "New" }, testCwd);
  assert.ok(r.content[0].text.includes("updated"));
});

test("agent-update: missing name", async () => {
  const r = await handleAgentUpdate({}, testCwd);
  assert.equal(r.isError, true);
});

test("agent-delete: success", async () => {
  await handleAgentCreate({
    name: "test-agent", description: "desc", systemPrompt: "prompt",
  }, testCwd);

  const r = await handleAgentDelete({ name: "test-agent" }, testCwd);
  assert.ok(r.content[0].text.includes("deleted"));
});

test("agent-delete: missing name", async () => {
  const r = await handleAgentDelete({}, testCwd);
  assert.equal(r.isError, true);
});

// ─── Edge cases ──────────────────────────────────────────────

test("workflow-create: validation errors propagate", async () => {
  const r = await handleWorkflowCreate({
    name: "", description: "desc",
    phases: JSON.stringify([]),
  }, testCwd);
  assert.equal(r.isError, true);
  assert.ok(r.content[0].text.includes("Validation"));
});

test("workflow-update: invalid phases JSON", async () => {
  await handleWorkflowCreate({
    name: "test-wf", description: "desc",
    phases: JSON.stringify([{ id: "p1", name: "P1", tasks: [] }]),
  }, testCwd);

  const list = await handleWorkflowList(testCwd);
  const match = list.content[0].text.match(/\(([^)]+)\)/);
  const id = match?.[1];

  const r = await handleWorkflowUpdate({ id, phases: "bad json" }, testCwd);
  assert.equal(r.isError, true);
});

test("team-create: invalid members JSON", async () => {
  const r = await handleTeamCreate({
    name: "test", description: "desc", members: "not json",
  }, testCwd);
  assert.equal(r.isError, true);
});

test("team-update: invalid members JSON", async () => {
  await handleTeamCreate({
    name: "test-team", description: "desc", members: JSON.stringify([]),
  }, testCwd);

  const r = await handleTeamUpdate({ name: "test-team", members: "bad" }, testCwd);
  assert.equal(r.isError, true);
});

test("agent-create: skills and extensions parsing", async () => {
  const r = await handleAgentCreate({
    name: "agent", description: "desc", systemPrompt: "prompt",
    skills: "skill1, skill2,  ", extensions: "ext1,ext2",
  }, testCwd);
  assert.equal(r.isError, undefined);
});
