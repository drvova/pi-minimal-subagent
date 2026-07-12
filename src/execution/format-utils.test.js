import assert from "node:assert/strict";
import test from "node:test";
import { formatCount, formatToolCallPreview, shortPath, truncateInline, truncateMiddle, stringifyPreview, extractResultText } from "./format-utils.js";

test("truncateMiddle: returns short text unchanged", () => {
  assert.equal(truncateMiddle("hello", 100), "hello");
});

test("truncateMiddle: truncates long text with … separator", () => {
  const result = truncateMiddle("a".repeat(200), 100);
  assert.ok(result.includes("…"));
  assert.ok(!result.includes("truncated")); // no verbose marker
  assert.ok(result.length <= 105);
});

test("extractResultText: extracts from content array", () => {
  assert.equal(formatCount(0), "0");
  assert.equal(formatCount(-1), "0");
  assert.equal(formatCount(42), "42");
  assert.equal(formatCount(999), "999");
});

test("formatCount: k formatting", () => {
  assert.equal(formatCount(1500), "1.5k");
  assert.equal(formatCount(50000), "50k");
  assert.equal(formatCount(999999), "1000k");
});

test("formatCount: M formatting", () => {
  assert.equal(formatCount(1500000), "1.5M");
  assert.equal(formatCount(50000000), "50.0M");
});

test("shortPath: shortens home dir", () => {
  assert.ok(shortPath("/home/user/project").startsWith("~"));
});

test("shortPath: returns ... for empty", () => {
  assert.equal(shortPath(""), "...");
  assert.equal(shortPath(null), "...");
});

test("formatToolCallPreview: bash", () => {
  const result = formatToolCallPreview("bash", { command: "npm install" });
  assert.ok(result.includes("bash $"));
  assert.ok(result.includes("npm install"));
});

test("formatToolCallPreview: read with offset", () => {
  const result = formatToolCallPreview("read", { path: "/tmp/file.txt", offset: 10, limit: 5 });
  assert.ok(result.includes("read"));
  assert.ok(result.includes("file.txt"));
});

test("formatToolCallPreview: write and edit", () => {
  assert.ok(formatToolCallPreview("write", { path: "/tmp/f" }).includes("write"));
  assert.ok(formatToolCallPreview("edit", { path: "/tmp/f" }).includes("edit"));
});

test("formatToolCallPreview: unknown tool shows name and args", () => {
  const result = formatToolCallPreview("custom", { key: "val" });
  assert.ok(result.includes("custom"));
});

test("stringifyPreview: returns empty for undefined", () => {
  assert.equal(stringifyPreview(undefined, 100), "");
});

test("stringifyPreview: middle-truncates long strings", () => {
  const result = stringifyPreview("a".repeat(200), 80);
  assert.ok(result.includes("…"));
});

test("extractResultText: extracts from content array", () => {
  const result = extractResultText({ content: [{ type: "text", text: "hello" }] });
  assert.ok(result.includes("hello"));
});

test("extractResultText: extracts from text property", () => {
  const result = extractResultText({ text: "direct text" });
  assert.ok(result.includes("direct text"));
});
