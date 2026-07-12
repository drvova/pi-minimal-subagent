import assert from "node:assert/strict";
import test from "node:test";
import { processPiJsonLine } from "./runner-events.js";
import {
  getFinalAssistantText,
  getResultSummaryText,
  getSubagentProgressText,
} from "./progress.js";

function freshResult(overrides = {}) {
  return {
    agent: "test-agent",
    agentSource: "user",
    task: "do work",
    exitCode: -1,
    messages: [],
    response: "",
    stderr: "",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
    ...overrides,
  };
}

// --- getFinalAssistantText ---

test("getFinalAssistantText: returns empty for null/undefined", () => {
  assert.equal(getFinalAssistantText(null), "");
  assert.equal(getFinalAssistantText(undefined), "");
  assert.equal(getFinalAssistantText([]), "");
});

test("getFinalAssistantText: returns last assistant text", () => {
  const messages = [
    { role: "user", content: [{ type: "text", text: "hello" }] },
    { role: "assistant", content: [{ type: "text", text: "first reply" }] },
    { role: "user", content: [{ type: "text", text: "go on" }] },
    { role: "assistant", content: [{ type: "text", text: "second reply" }] },
  ];
  assert.equal(getFinalAssistantText(messages), "second reply");
});

test("getFinalAssistantText: skips non-assistant messages", () => {
  const messages = [
    { role: "toolResult", content: [] },
    { role: "user", content: [{ type: "text", text: "hello" }] },
    { role: "assistant", content: [{ type: "text", text: "final" }] },
  ];
  assert.equal(getFinalAssistantText(messages), "final");
});

test("getFinalAssistantText: skips assistant messages with no text", () => {
  const messages = [
    { role: "assistant", content: [{ type: "image", source: {} }] },
    { role: "assistant", content: [{ type: "text", text: "" }] },
    { role: "assistant", content: [{ type: "text", text: "real" }] },
  ];
  assert.equal(getFinalAssistantText(messages), "real");
});

test("getFinalAssistantText: concatenates multiple text parts", () => {
  const messages = [
    {
      role: "assistant",
      content: [
        { type: "text", text: "part 1 " },
        { type: "text", text: "part 2" },
      ],
    },
  ];
  assert.equal(getFinalAssistantText(messages), "part 1 part 2");
});

// --- processPiJsonLine: message events ---

test("processPiJsonLine: empty/invalid input returns false", () => {
  const result = freshResult();
  assert.equal(processPiJsonLine("", result), false);
  assert.equal(processPiJsonLine("   ", result), false);
  assert.equal(processPiJsonLine("not json", result), false);
});

test("processPiJsonLine: unknown event type returns false", () => {
  const result = freshResult();
  assert.equal(
    processPiJsonLine(JSON.stringify({ type: "unknown_event" }), result),
    false,
  );
});

test("processPiJsonLine: message_end accumulates assistant message + usage", () => {
  const result = freshResult();
  const changed = processPiJsonLine(JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "hello world" }],
      usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, cost: { total: 0.01 } },
      provider: "anthropic",
      model: "claude-sonnet-4-5",
    },
  }), result);

  assert.equal(changed, true);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].content[0].text, "hello world");
  assert.equal(result.usage.input, 100);
  assert.equal(result.usage.output, 50);
  assert.equal(result.usage.cost, 0.01);
  assert.equal(result.usage.turns, 1);
  assert.equal(result.provider, "anthropic");
  assert.equal(result.model, "claude-sonnet-4-5");
});

test("processPiJsonLine: deduplicates identical assistant messages", () => {
  const result = freshResult();
  const message = {
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "unique" }],
      usage: { input: 10, output: 5 },
    },
  };

  assert.equal(processPiJsonLine(JSON.stringify(message), result), true);
  assert.equal(processPiJsonLine(JSON.stringify(message), result), false);
  assert.equal(result.messages.length, 1);
});

test("processPiJsonLine: agent_end sets sawAgentEnd and accumulates usage", () => {
  const result = freshResult();
  const changed = processPiJsonLine(JSON.stringify({
    type: "agent_end",
    messages: [
      {
        role: "assistant",
        content: [{ type: "text", text: "done" }],
        usage: { input: 50, output: 25 },
      },
    ],
  }), result);

  assert.equal(changed, true);
  assert.equal(result.sawAgentEnd, true);
  assert.equal(result.messages.length, 1);
  assert.equal(result.usage.input, 50);
});

// --- processPiJsonLine: tool execution events ---

test("processPiJsonLine: tool_execution_start creates tool entry", () => {
  const result = freshResult();
  const changed = processPiJsonLine(JSON.stringify({
    type: "tool_execution_start",
    toolCallId: "call-1",
    toolName: "bash",
    args: { command: "ls -la" },
  }), result);

  assert.equal(changed, true);
  assert.equal(result.toolExecutions.length, 1);
  assert.equal(result.toolExecutions[0].toolCallId, "call-1");
  assert.equal(result.toolExecutions[0].toolName, "bash");
  assert.equal(result.toolExecutions[0].status, "running");
  assert.ok(result.toolExecutions[0].displayText.includes("bash"));
  assert.ok(result.toolExecutions[0].displayText.includes("ls"));
});

test("processPiJsonLine: tool_execution_update sets latestText", () => {
  const result = freshResult();
  processPiJsonLine(JSON.stringify({
    type: "tool_execution_start",
    toolCallId: "call-1",
    toolName: "bash",
    args: { command: "cat file" },
  }), result);

  const changed = processPiJsonLine(JSON.stringify({
    type: "tool_execution_update",
    toolCallId: "call-1",
    partialResult: { content: [{ type: "text", text: "file contents here" }] },
  }), result);

  assert.equal(changed, true);
  assert.equal(result.toolExecutions[0].status, "running");
  assert.ok(result.toolExecutions[0].latestText.includes("file contents here"));
});

test("processPiJsonLine: tool_execution_end marks completed", () => {
  const result = freshResult();
  processPiJsonLine(JSON.stringify({
    type: "tool_execution_start",
    toolCallId: "call-1",
    toolName: "bash",
    args: { command: "echo done" },
  }), result);

  const changed = processPiJsonLine(JSON.stringify({
    type: "tool_execution_end",
    toolCallId: "call-1",
    result: { content: [{ type: "text", text: "done\n" }] },
    isError: false,
  }), result);

  assert.equal(changed, true);
  assert.equal(result.toolExecutions[0].status, "completed");
});

test("processPiJsonLine: tool_execution_end with error", () => {
  const result = freshResult();
  processPiJsonLine(JSON.stringify({
    type: "tool_execution_start",
    toolCallId: "call-2",
    toolName: "read",
    args: { path: "/missing" },
  }), result);

  const changed = processPiJsonLine(JSON.stringify({
    type: "tool_execution_end",
    toolCallId: "call-2",
    result: { text: "ENOENT: no such file" },
    isError: true,
  }), result);

  assert.equal(changed, true);
  assert.equal(result.toolExecutions[0].status, "error");
  assert.equal(result.toolExecutions[0].isError, true);
});

// --- processPiJsonLine: thinking events ---

test("processPiJsonLine: thinking_start initializes thinking state", () => {
  const result = freshResult();
  const changed = processPiJsonLine(JSON.stringify({
    type: "message_update",
    assistantMessageEvent: { type: "thinking_start" },
  }), result);

  assert.equal(changed, true);
  assert.equal(result.thinking.status, "running");
  assert.equal(result.thinking.chars, 0);
});

test("processPiJsonLine: thinking_delta increments chars", () => {
  const result = freshResult();
  processPiJsonLine(JSON.stringify({
    type: "message_update",
    assistantMessageEvent: { type: "thinking_start" },
  }), result);
  processPiJsonLine(JSON.stringify({
    type: "message_update",
    assistantMessageEvent: { type: "thinking_delta", delta: "some thoughts" },
  }), result);

  assert.equal(result.thinking.status, "running");
  assert.ok(result.thinking.chars > 0);
});

test("processPiJsonLine: thinking_end marks completed", () => {
  const result = freshResult();
  processPiJsonLine(JSON.stringify({
    type: "message_update",
    assistantMessageEvent: { type: "thinking_start" },
  }), result);
  processPiJsonLine(JSON.stringify({
    type: "message_update",
    assistantMessageEvent: { type: "thinking_delta", delta: "thought content here" },
  }), result);
  const changed = processPiJsonLine(JSON.stringify({
    type: "message_update",
    assistantMessageEvent: { type: "thinking_end", content: "thought content here" },
  }), result);

  assert.equal(changed, true);
  assert.equal(result.thinking.status, "completed");
  assert.equal(result.thinking.chars, "thought content here".length);
});

// --- usage accumulation across turns ---

test("processPiJsonLine: multiple message_end events accumulate usage", () => {
  const result = freshResult();
  processPiJsonLine(JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "turn 1" }],
      usage: { input: 100, output: 50, cacheRead: 20, cacheWrite: 10, cost: { total: 0.005 } },
    },
  }), result);
  processPiJsonLine(JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "turn 2" }],
      usage: { input: 200, output: 75, cacheRead: 0, cacheWrite: 0, cost: { total: 0.015 } },
    },
  }), result);

  assert.equal(result.messages.length, 2);
  assert.equal(result.usage.input, 300);
  assert.equal(result.usage.output, 125);
  assert.equal(result.usage.cacheRead, 20);
  assert.equal(result.usage.cacheWrite, 10);
  assert.equal(result.usage.cost, 0.02);
  assert.equal(result.usage.turns, 2);
});

// --- sanitize: thinking stripped from stored messages ---

test("processPiJsonLine: strips thinking from stored assistant messages", () => {
  const result = freshResult();
  processPiJsonLine(JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "secret thought" },
        { type: "text", text: "visible" },
      ],
      usage: { input: 10, output: 5 },
    },
  }), result);

  assert.equal(result.messages.length, 1);
  const stored = result.messages[0].content;
  assert.equal(stored.length, 1);
  assert.equal(stored[0].type, "text");
  assert.equal(stored[0].text, "visible");
});

// --- getResultSummaryText ---

test("getResultSummaryText: returns final assistant text", () => {
  const result = freshResult({
    messages: [
      { role: "assistant", content: [{ type: "text", text: "summary here" }] },
    ],
  });
  assert.equal(getResultSummaryText(result), "summary here");
});

test("getResultSummaryText: returns error message when no assistant text", () => {
  const result = freshResult({
    errorMessage: "something went wrong",
  });
  assert.equal(getResultSummaryText(result), "something went wrong");
});

test("getResultSummaryText: returns stderr on error exit", () => {
  const result = freshResult({
    exitCode: 1,
    stopReason: "error",
    stderr: "process crashed",
  });
  assert.equal(getResultSummaryText(result), "process crashed");
});

test("getResultSummaryText: returns (no output) when nothing available", () => {
  const result = freshResult({ exitCode: 0 });
  assert.equal(getResultSummaryText(result), "(no output)");
});

// --- getSubagentProgressText ---

test("getSubagentProgressText: returns final text when available", () => {
  const result = freshResult({
    messages: [
      { role: "assistant", content: [{ type: "text", text: "progress output" }] },
    ],
  });
  assert.equal(getSubagentProgressText(result), "progress output");
});

test("getSubagentProgressText: shows tool progress when running", () => {
  const result = freshResult({
    toolExecutions: [
      {
        toolCallId: "call-1",
        toolName: "bash",
        status: "completed",
        displayText: "bash $ npm install",
        activityOrder: 1,
      },
    ],
    toolExecutionCount: 1,
  });
  const text = getSubagentProgressText(result);
  assert.ok(text.includes("bash $ npm install"));
});

test("getSubagentProgressText: shows running tool output", () => {
  const result = freshResult({
    toolExecutions: [
      {
        toolCallId: "call-1",
        toolName: "read",
        status: "running",
        displayText: "read ~/file.ts",
        latestText: "import React from 'react'",
        activityOrder: 1,
      },
    ],
    toolExecutionCount: 1,
  });
  const text = getSubagentProgressText(result);
  assert.ok(text.includes("import React from 'react'"));
});

test("getSubagentProgressText: returns (running...) when nothing else", () => {
  const result = freshResult();
  assert.equal(getSubagentProgressText(result), "(running...)");
});
