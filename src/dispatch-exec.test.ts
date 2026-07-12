import assert from "node:assert/strict";
import test from "node:test";
import { extractParentContext } from "./dispatch-exec.ts";

test("extractParentContext: empty branch returns empty string", () => {
  const result = extractParentContext({ getBranch: () => [] });
  assert.equal(result, "");
});

test("extractParentContext: null sessionManager returns empty", () => {
  assert.equal(extractParentContext(null), "");
  assert.equal(extractParentContext(undefined), "");
});

test("extractParentContext: missing getBranch returns empty", () => {
  assert.equal(extractParentContext({}), "");
});

test("extractParentContext: extracts user and assistant messages", () => {
  const sessionManager = {
    getBranch: () => [
      { message: { role: "user", content: "hello" } },
      { message: { role: "assistant", content: "hi there" } },
    ],
  };
  const result = extractParentContext(sessionManager);
  assert.match(result, /user: hello/);
  assert.match(result, /assistant: hi there/);
});

test("extractParentContext: skips system messages", () => {
  const sessionManager = {
    getBranch: () => [
      { message: { role: "system", content: "system prompt" } },
      { message: { role: "user", content: "user message" } },
    ],
  };
  const result = extractParentContext(sessionManager);
  assert.doesNotMatch(result, /system/);
  assert.match(result, /user: user message/);
});

test("extractParentContext: handles array content with text blocks", () => {
  const sessionManager = {
    getBranch: () => [
      {
        message: {
          role: "user",
          content: [
            { type: "text", text: "part 1" },
            { type: "text", text: "part 2" },
          ],
        },
      },
    ],
  };
  const result = extractParentContext(sessionManager);
  assert.match(result, /part 1/);
  assert.match(result, /part 2/);
});

test("extractParentContext: filters out non-text content blocks", () => {
  const sessionManager = {
    getBranch: () => [
      {
        message: {
          role: "user",
          content: [
            { type: "image", data: "..." },
            { type: "text", text: "text content" },
          ],
        },
      },
    ],
  };
  const result = extractParentContext(sessionManager);
  assert.match(result, /text content/);
  assert.doesNotMatch(result, /image/);
});

test("extractParentContext: truncates to maxChars from end", () => {
  const longText = "a".repeat(1000);
  const sessionManager = {
    getBranch: () => [
      { message: { role: "user", content: longText } },
      { message: { role: "assistant", content: longText } },
    ],
  };
  const result = extractParentContext(sessionManager, 500);
  assert.ok(result.length <= 500);
  // With long messages, truncation happens, verify it's not empty
  assert.ok(result.length > 0);
});

test("extractParentContext: skips empty messages", () => {
  const sessionManager = {
    getBranch: () => [
      { message: { role: "user", content: "   " } },
      { message: { role: "assistant", content: "response" } },
    ],
  };
  const result = extractParentContext(sessionManager);
  assert.doesNotMatch(result, /user:/);
  assert.match(result, /assistant: response/);
});

test("extractParentContext: handles missing message field", () => {
  const sessionManager = {
    getBranch: () => [
      { notMessage: "invalid" },
      { message: { role: "user", content: "valid" } },
    ],
  };
  const result = extractParentContext(sessionManager);
  assert.match(result, /user: valid/);
  assert.doesNotMatch(result, /invalid/);
});

test("extractParentContext: handles null/undefined content", () => {
  const sessionManager = {
    getBranch: () => [
      { message: { role: "user", content: null } },
      { message: { role: "assistant", content: undefined } },
      { message: { role: "user", content: "real content" } },
    ],
  };
  const result = extractParentContext(sessionManager);
  assert.match(result, /user: real content/);
});
