import assert from "node:assert/strict";
import test from "node:test";
import { isBun } from "./db.ts";

// Note: These tests run under Node.js where isBun === false.
// Bun-specific logic is exercised in integration tests.

test("isBun is false when PI_USE_SQLITE is not set", () => {
  assert.equal(isBun, false);
});

test("database operations are no-op under Node.js", async () => {
  const { dbSaveWorkflow, dbGetWorkflow, dbListWorkflows, dbDeleteWorkflow } = await import("./db.ts");
  const tmpCwd = "/tmp/test-db-" + Math.random().toString(36).slice(2);

  // All ops should be no-ops (return early when !isBun)
  const workflow = {
    id: "test-wf", name: "Test", description: "Test workflow",
    phases: [], team: null, createdAt: "2024-01-01", updatedAt: "2024-01-01",
  };

  dbSaveWorkflow(tmpCwd, workflow);
  assert.equal(dbGetWorkflow(tmpCwd, "test-wf"), null);
  assert.deepEqual(dbListWorkflows(tmpCwd), []);
  dbDeleteWorkflow(tmpCwd, "test-wf"); // Should not throw
});

test("team operations are no-op under Node.js", async () => {
  const { dbSaveTeam, dbGetTeam, dbListTeams, dbDeleteTeam } = await import("./db.ts");
  const tmpCwd = "/tmp/test-db-" + Math.random().toString(36).slice(2);

  const team = {
    name: "test-team", description: "Test team",
    members: [], createdAt: "2024-01-01", updatedAt: "2024-01-01",
  };

  dbSaveTeam(tmpCwd, team);
  assert.equal(dbGetTeam(tmpCwd, "test-team"), null);
  assert.deepEqual(dbListTeams(tmpCwd), []);
  dbDeleteTeam(tmpCwd, "test-team");
});

test("run operations are no-op under Node.js", async () => {
  const { dbSaveRun, dbGetRun, dbUpdateRun, dbListRuns, dbAppendRunEvent } = await import("./db.ts");
  const tmpCwd = "/tmp/test-db-" + Math.random().toString(36).slice(2);

  const run = {
    id: "run-1", workflowId: "wf-1", workflowName: "Test",
    status: "running", phaseResults: [], startedAt: "2024-01-01",
    completedAt: null, error: null, totalCost: 0,
  };

  dbSaveRun(tmpCwd, run);
  assert.equal(dbGetRun(tmpCwd, "run-1"), null);
  dbUpdateRun(tmpCwd, run);
  assert.deepEqual(dbListRuns(tmpCwd), []);
  dbAppendRunEvent(tmpCwd, "run-1", { timestamp: "2024-01-01", type: "test" });
});
