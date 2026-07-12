import assert from "node:assert/strict";
import test from "node:test";
import { emptyUsage, hasFinalAssistantOutput, hasSemanticCompletion, isResultError, isResultSuccess, normalizeCompletedResult } from "./result-utils.ts";
import type { SubagentResult } from "./types.ts";

function base(overrides: Partial<SubagentResult> = {}): SubagentResult {
  return {
    agent: "test", agentSource: "user", task: "work",
    exitCode: 0, messages: [], response: "", stderr: "",
    usage: emptyUsage(), ...overrides,
  };
}

function msg(text: string): any {
  return { role: "assistant", content: [{ type: "text", text }] };
}

test("emptyUsage: returns zeroed object", () => {
  const u = emptyUsage();
  assert.equal(u.input, 0); assert.equal(u.cost, 0); assert.equal(u.turns, 0);
});

test("hasFinalAssistantOutput: false for empty", () => {
  assert.equal(hasFinalAssistantOutput({ messages: [] }), false);
});

test("hasFinalAssistantOutput: true with text", () => {
  assert.equal(hasFinalAssistantOutput({ messages: [msg("hello")] }), true);
});

test("hasSemanticCompletion: false without agentEnd", () => {
  assert.equal(hasSemanticCompletion({ messages: [], sawAgentEnd: false }), false);
});

test("hasSemanticCompletion: true with agentEnd+output", () => {
  assert.equal(hasSemanticCompletion({ messages: [msg("done")], sawAgentEnd: true }), true);
});

test("isResultSuccess: false when running", () => {
  const r = base({ exitCode: -1 });
  assert.equal(isResultSuccess(r), false);
  assert.equal(isResultError(r), false);
});

test("isResultSuccess: true for exit 0", () => {
  assert.equal(isResultSuccess(base({ exitCode: 0 })), true);
});

test("normalizeCompletedResult: aborted with semantic success recovers", () => {
  const r = normalizeCompletedResult(base({
    exitCode: 1, sawAgentEnd: true, stopReason: "aborted",
    errorMessage: "Subagent was aborted.",
    messages: [msg("done")],
  }), true);
  assert.equal(r.exitCode, 0);
  assert.equal(r.stopReason, undefined);
});

test("normalizeCompletedResult: aborted without completion → 130", () => {
  const r = normalizeCompletedResult(base({ exitCode: 1, messages: [] }), true);
  assert.equal(r.exitCode, 130);
});

test("normalizeCompletedResult: error with semantic completion recovers", () => {
  const r = normalizeCompletedResult(base({
    exitCode: 1, sawAgentEnd: true, stopReason: "error",
    messages: [msg("done")],
  }), false);
  assert.equal(r.exitCode, 0);
});

test("normalizeCompletedResult: error without completion stays error", () => {
  const r = normalizeCompletedResult(base({ exitCode: 1, stderr: "crashed" }), false);
  assert.equal(r.exitCode, 1);
  assert.equal(r.stopReason, "error");
});

test("normalizeCompletedResult: tool failure without semantic completion", () => {
  const r = normalizeCompletedResult(base({
    exitCode: 1, sawAgentEnd: true, stopReason: "error", messages: [],
    toolExecutions: [{ toolCallId: "1", toolName: "test-tool", status: "error", latestText: "tool failed", isError: true, updates: 1 }],
  }), false);
  assert.ok(r.errorMessage?.includes("tool error"));
  assert.ok(r.errorMessage?.includes("tool failed"));
});

test("normalizeCompletedResult: tool failure in activities array", () => {
  const r = normalizeCompletedResult(base({
    exitCode: 1, sawAgentEnd: true, stopReason: "error", messages: [],
    activities: [{ type: "tool", status: "error", displayText: "failed-tool", isError: true, activityOrder: 0, toolCallId: "1", toolName: "test-tool", updates: 1 }],
  }), false);
  assert.ok(r.errorMessage?.includes("tool error"));
  assert.ok(r.errorMessage?.includes("failed-tool"));
});

test("normalizeCompletedResult: transport error merged with tool failure", () => {
  const r = normalizeCompletedResult(base({
    exitCode: 1, sawAgentEnd: true, stopReason: "error", messages: [],
    errorMessage: "Connection timeout", stderr: "Something else",
    toolExecutions: [{ toolCallId: "1", toolName: "test-tool", status: "error", isError: true, updates: 1 }],
  }), false);
  assert.ok(r.stderr.includes("Transport error: Connection timeout"));
});

test("normalizeCompletedResult: artifact paths in error message", () => {
  const r = normalizeCompletedResult(base({
    exitCode: 1, sawAgentEnd: true, stopReason: "error", messages: [],
    stdoutArtifact: "/tmp/stdout.txt", stderrArtifact: "/tmp/stderr.txt",
    toolExecutions: [{ toolCallId: "1", toolName: "test-tool", status: "error", isError: true, updates: 1 }],
  }), false);
  assert.ok(r.errorMessage?.includes("Artifacts:"));
  assert.ok(r.errorMessage?.includes("/tmp/stdout.txt"));
});

test("normalizeCompletedResult: no tool failure, no error message modification", () => {
  const r = normalizeCompletedResult(base({
    exitCode: 1, sawAgentEnd: true, stopReason: "error", messages: [],
    toolExecutions: [{ toolCallId: "1", toolName: "test-tool", status: "completed", updates: 1 }],
  }), false);
  assert.equal(r.errorMessage, undefined);
});

test("normalizeCompletedResult: stop_reason=error propagates when exit > 0", () => {
  const r = normalizeCompletedResult(base({ exitCode: 2, stderr: "bad" }), false);
  assert.equal(r.stopReason, "error");
  assert.equal(r.errorMessage, "bad");
});

test("isResultError: true when exitCode > 0 without semantic completion", () => {
  const r = base({ exitCode: 1, messages: [] });
  assert.equal(isResultError(r), true);
});

test("isResultError: false for running state", () => {
  const r = base({ exitCode: -1 });
  assert.equal(isResultError(r), false);
});

test("isResultSuccess: true with semantic completion even if exitCode was non-zero before normalization", () => {
  const r = base({ exitCode: 0, sawAgentEnd: true, messages: [msg("done")] });
  assert.equal(isResultSuccess(r), true);
});

test("isResultSuccess: false when stopReason is error", () => {
  const r = base({ exitCode: 0, stopReason: "error" });
  assert.equal(isResultSuccess(r), false);
});

test("isResultSuccess: false when stopReason is aborted", () => {
  const r = base({ exitCode: 0, stopReason: "aborted" });
  assert.equal(isResultSuccess(r), false);
});
