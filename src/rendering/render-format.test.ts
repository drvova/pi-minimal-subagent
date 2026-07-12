import assert from "node:assert/strict";
import test from "node:test";
import {
  truncate, preview, textPreview, inlinePreview,
  fmtCount, fmtModelProvider, fmtUsage,
  getPrimaryResult, getFallbackText,
} from "./render-format.ts";

// ─── truncate ───────────────────────────────────────────────

test("truncate: returns unchanged when under limit", () => {
  assert.equal(truncate("hello", 10), "hello");
});

test("truncate: truncates and adds ellipsis", () => {
  assert.equal(truncate("hello world", 5), "hell…");
});

test("truncate: handles exact limit", () => {
  assert.equal(truncate("hello", 5), "hello");
});

test("truncate: handles empty string", () => {
  assert.equal(truncate("", 10), "");
});

test("truncate: handles zero max", () => {
  assert.equal(truncate("hello", 0), "…");
});

// ─── preview ────────────────────────────────────────────────

test("preview: collapses whitespace", () => {
  assert.equal(preview("hello   world\n  test", 100), "hello world test");
});

test("preview: returns ... for empty", () => {
  assert.equal(preview("", 10), "...");
  assert.equal(preview("   ", 10), "...");
});

test("preview: handles non-string input", () => {
  assert.equal(preview(123, 10), "...");
  assert.equal(preview(null, 10), "...");
  assert.equal(preview(undefined, 10), "...");
});

test("preview: truncates long text", () => {
  const long = "a".repeat(200);
  const result = preview(long, 50);
  assert.ok(result.length <= 50);
  assert.ok(result.endsWith("…"));
});

// ─── textPreview ────────────────────────────────────────────

test("textPreview: limits lines to 3", () => {
  const text = "line1\nline2\nline3\nline4\nline5";
  const result = textPreview(text);
  assert.equal(result.split("\n").length, 3);
});

test("textPreview: respects max chars", () => {
  const long = "a".repeat(3000);
  const result = textPreview(long, 100);
  assert.ok(result.length <= 100);
});

test("textPreview: trims whitespace", () => {
  assert.equal(textPreview("  hello  "), "hello");
});

// ─── inlinePreview ──────────────────────────────────────────

test("inlinePreview: collapses to single line", () => {
  const text = "hello\nworld\ntest";
  const result = inlinePreview(text);
  assert.ok(!result.includes("\n"));
  assert.ok(result.includes("hello world test"));
});

test("inlinePreview: truncates long text", () => {
  const long = "a".repeat(300);
  const result = inlinePreview(long, 50);
  assert.ok(result.length <= 50);
});

// ─── fmtCount ───────────────────────────────────────────────

test("fmtCount: small numbers unchanged", () => {
  assert.equal(fmtCount(0), "0");
  assert.equal(fmtCount(42), "42");
  assert.equal(fmtCount(999), "999");
});

test("fmtCount: thousands with k", () => {
  assert.equal(fmtCount(1000), "1.0k");
  assert.equal(fmtCount(1500), "1.5k");
  assert.equal(fmtCount(9999), "10.0k");
});

test("fmtCount: tens of thousands", () => {
  assert.equal(fmtCount(10_000), "10k");
  assert.equal(fmtCount(99_000), "99k");
});

test("fmtCount: millions with M", () => {
  assert.equal(fmtCount(1_000_000), "1.0M");
  assert.equal(fmtCount(1_500_000), "1.5M");
});

test("fmtCount: invalid numbers", () => {
  assert.equal(fmtCount(NaN), "0");
  assert.equal(fmtCount(-1), "0");
  assert.equal(fmtCount(Infinity), "0");
});

// ─── fmtModelProvider ───────────────────────────────────────

test("fmtModelProvider: combines provider and model", () => {
  const result = { provider: "anthropic", model: "claude-3" } as any;
  assert.equal(fmtModelProvider(result), "anthropic/claude-3");
});

test("fmtModelProvider: model already has provider prefix", () => {
  const result = { provider: "anthropic", model: "anthropic/claude-3" } as any;
  assert.equal(fmtModelProvider(result), "anthropic/claude-3");
});

test("fmtModelProvider: only model", () => {
  const result = { model: "claude-3" } as any;
  assert.equal(fmtModelProvider(result), "claude-3");
});

test("fmtModelProvider: only provider", () => {
  const result = { provider: "anthropic" } as any;
  assert.equal(fmtModelProvider(result), "anthropic");
});

test("fmtModelProvider: neither", () => {
  const result = {} as any;
  assert.equal(fmtModelProvider(result), "");
});

test("fmtModelProvider: trims whitespace", () => {
  const result = { provider: "  anthropic  ", model: "  claude  " } as any;
  assert.equal(fmtModelProvider(result), "anthropic/claude");
});

// ─── fmtUsage ───────────────────────────────────────────────

test("fmtUsage: no usage", () => {
  const result = {} as any;
  assert.equal(fmtUsage(result), "");
});

test("fmtUsage: turns singular", () => {
  const result = { usage: { turns: 1 } } as any;
  assert.ok(fmtUsage(result).includes("1 turn"));
});

test("fmtUsage: turns plural", () => {
  const result = { usage: { turns: 3 } } as any;
  assert.ok(fmtUsage(result).includes("3 turns"));
});

test("fmtUsage: input output", () => {
  const result = { usage: { input: 1000, output: 500 } } as any;
  const fmt = fmtUsage(result);
  assert.ok(fmt.includes("↑1.0k"));
  assert.ok(fmt.includes("↓500"));
});

test("fmtUsage: cache read/write", () => {
  const result = { usage: { cacheRead: 2000, cacheWrite: 1000 } } as any;
  const fmt = fmtUsage(result);
  assert.ok(fmt.includes("R2.0k"));
  assert.ok(fmt.includes("W1.0k"));
});

test("fmtUsage: cost", () => {
  const result = { usage: { cost: 0.1234 } } as any;
  assert.ok(fmtUsage(result).includes("$0.1234"));
});

test("fmtUsage: includes model", () => {
  const result = { usage: { turns: 1 }, model: "claude-3" } as any;
  assert.ok(fmtUsage(result).includes("claude-3"));
});

test("fmtUsage: complete example", () => {
  const result = {
    usage: { turns: 2, input: 1000, output: 500, cost: 0.05 },
    provider: "anthropic", model: "claude-3",
  } as any;
  const fmt = fmtUsage(result);
  assert.ok(fmt.includes("2 turns"));
  assert.ok(fmt.includes("↑1.0k"));
  assert.ok(fmt.includes("↓500"));
  assert.ok(fmt.includes("$0.0500"));
  assert.ok(fmt.includes("anthropic/claude-3"));
});

// ─── getPrimaryResult ───────────────────────────────────────

test("getPrimaryResult: extracts first result", () => {
  const toolResult = { details: { results: [{ agent: "a1" }, { agent: "a2" }] } };
  const primary = getPrimaryResult(toolResult);
  assert.equal(primary?.agent, "a1");
});

test("getPrimaryResult: empty results", () => {
  const toolResult = { details: { results: [] } };
  assert.equal(getPrimaryResult(toolResult), undefined);
});

test("getPrimaryResult: no details", () => {
  const toolResult = {};
  assert.equal(getPrimaryResult(toolResult), undefined);
});

test("getPrimaryResult: results not array", () => {
  const toolResult = { details: { results: "not array" } };
  assert.equal(getPrimaryResult(toolResult), undefined);
});

// ─── getFallbackText ────────────────────────────────────────

test("getFallbackText: extracts text content", () => {
  const toolResult = { content: [{ type: "text", text: "hello" }] };
  assert.equal(getFallbackText(toolResult), "hello");
});

test("getFallbackText: no text content", () => {
  const toolResult = { content: [{ type: "image" }] };
  assert.equal(getFallbackText(toolResult), "(no output)");
});

test("getFallbackText: empty content", () => {
  const toolResult = { content: [] };
  assert.equal(getFallbackText(toolResult), "(no output)");
});

test("getFallbackText: content not array", () => {
  const toolResult = { content: "not array" };
  assert.equal(getFallbackText(toolResult), "(no output)");
});

test("getFallbackText: no content", () => {
  const toolResult = {};
  assert.equal(getFallbackText(toolResult), "(no output)");
});
