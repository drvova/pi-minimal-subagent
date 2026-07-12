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
