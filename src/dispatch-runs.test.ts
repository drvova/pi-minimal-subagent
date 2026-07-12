import assert from "node:assert/strict";
import test from "node:test";
import { handleRunList, handleRunStatus, handleRunAbort } from "./dispatch-runs.ts";

// Minimal stubs for testing
test("handleRunList: empty runs returns message", () => {
  const result = handleRunList("/tmp/test");
  assert.match(result.content[0].text, /No runs found/);
});

test("handleRunStatus: missing runId returns error", async () => {
  const result = await handleRunStatus({}, "/tmp/test");
  assert.ok(result.isError);
  assert.match(result.content[0].text, /requires runId/);
});

test("handleRunStatus: accepts agent_id parameter", async () => {
  const result = await handleRunStatus({ agent_id: "test-id" }, "/tmp/test");
  // Will not find the run, but validates parameter is accepted
  assert.match(result.content[0].text, /not found/);
});

test("handleRunStatus: accepts runId parameter", async () => {
  const result = await handleRunStatus({ runId: "test-id" }, "/tmp/test");
  assert.match(result.content[0].text, /not found/);
});

test("handleRunAbort: missing runId returns error", () => {
  const result = handleRunAbort({});
  assert.ok(result.isError);
  assert.match(result.content[0].text, /requires runId/);
});

test("handleRunAbort: accepts agent_id parameter", () => {
  const result = handleRunAbort({ agent_id: "test-id" });
  // Will not find run to abort, but parameter is accepted
  assert.match(result.content[0].text, /not found/);
});

test("handleRunAbort: accepts runId parameter", () => {
  const result = handleRunAbort({ runId: "test-id" });
  assert.match(result.content[0].text, /not found/);
});
