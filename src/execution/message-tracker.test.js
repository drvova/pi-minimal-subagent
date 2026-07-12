import assert from "node:assert/strict";
import test from "node:test";
import { addAssistantMessage, addMessageUsage, addMessagesUsage, addNestedForkUsage, stableStringify } from "./message-tracker.js";

// ─── stableStringify ─────────────────────────────────────────────

test("stableStringify: handles primitives", () => {
  assert.equal(stableStringify(null), "null");
  assert.equal(stableStringify(42), "42");
  assert.equal(stableStringify("hello"), '"hello"');
});

test("stableStringify: sorts object keys", () => {
  const a = stableStringify({ b: 1, a: 2 });
  const b = stableStringify({ a: 2, b: 1 });
  assert.equal(a, b);
});

test("stableStringify: handles arrays", () => {
  assert.equal(stableStringify([1, 2]), "[1,2]");
});

// ─── addAssistantMessage ─────────────────────────────────────────

function freshResult(overrides = {}) {
  return {
    agent: "test", agentSource: "user", task: "work",
    exitCode: -1, messages: [], response: "", stderr: "",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
    ...overrides,
  };
}

test("addAssistantMessage: adds message and tracks usage", () => {
  const result = freshResult();
  const changed = addAssistantMessage(result, {
    role: "assistant",
    content: [{ type: "text", text: "hello" }],
    usage: { input: 100, output: 50, cost: { total: 0.01 } },
    provider: "openai",
    model: "gpt-5",
  });
  assert.equal(changed, true);
  assert.equal(result.messages.length, 1);
  assert.equal(result.usage.input, 100);
  assert.equal(result.usage.output, 50);
  assert.equal(result.usage.cost, 0.01);
  assert.equal(result.usage.turns, 1);
  assert.equal(result.provider, "openai");
  assert.equal(result.model, "gpt-5");
});

test("addAssistantMessage: deduplicates identical messages", () => {
  const result = freshResult();
  const msg = { role: "assistant", content: [{ type: "text", text: "same" }] };
  assert.equal(addAssistantMessage(result, msg), true);
  assert.equal(addAssistantMessage(result, msg), false);
  assert.equal(result.messages.length, 1);
});

test("addAssistantMessage: strips thinking from stored content", () => {
  const result = freshResult();
  addAssistantMessage(result, {
    role: "assistant",
    content: [
      { type: "thinking", thinking: "hidden" },
      { type: "text", text: "visible" },
    ],
  });
  const stored = result.messages[0].content;
  assert.equal(stored.length, 1);
  assert.equal(stored[0].type, "text");
});

test("addAssistantMessage: ignores non-assistant messages", () => {
  const result = freshResult();
  assert.equal(addAssistantMessage(result, { role: "user", content: [] }), false);
});

// ─── addNestedForkUsage ──────────────────────────────────────────

test("addNestedForkUsage: accumulates fork usage", () => {
  const result = freshResult();
  const changed = addNestedForkUsage(result, {
    role: "toolResult",
    toolName: "fork",
    toolCallId: "call-1",
    details: {
      results: [
        { usage: { input: 200, output: 100, cost: { total: 0.02 }, turns: 3 } },
      ],
    },
  });
  assert.equal(changed, true);
  assert.equal(result.usage.input, 200);
  assert.equal(result.usage.output, 100);
  assert.equal(result.usage.cost, 0.02);
  assert.equal(result.usage.turns, 3);
});

test("addNestedForkUsage: deduplicates by toolCallId", () => {
  const result = freshResult();
  const msg = {
    role: "toolResult", toolName: "fork", toolCallId: "call-1",
    details: { results: [{ usage: { input: 10, output: 5 } }] },
  };
  assert.equal(addNestedForkUsage(result, msg), true);
  assert.equal(addNestedForkUsage(result, msg), false);
});

test("addNestedForkUsage: ignores non-fork messages", () => {
  const result = freshResult();
  assert.equal(addNestedForkUsage(result, { role: "toolResult", toolName: "bash" }), false);
  assert.equal(addNestedForkUsage(result, { role: "assistant" }), false);
});

// ─── addMessageUsage / addMessagesUsage ──────────────────────────

test("addMessageUsage: delegates to assistant or fork", () => {
  const result = freshResult();
  assert.equal(addMessageUsage(result, { role: "assistant", content: [{ type: "text", text: "hi" }] }), true);
  assert.equal(result.messages.length, 1);
});

test("addMessagesUsage: processes array of messages", () => {
  const result = freshResult();
  addMessagesUsage(result, [
    { role: "assistant", content: [{ type: "text", text: "first" }] },
    { role: "assistant", content: [{ type: "text", text: "second" }] },
  ]);
  assert.equal(result.messages.length, 2);
  assert.equal(result.usage.turns, 2);
});

test("addMessagesUsage: returns false for non-array", () => {
  const result = freshResult();
  assert.equal(addMessagesUsage(result, null), false);
  assert.equal(addMessagesUsage(result, "string"), false);
});
