import assert from "node:assert/strict";
import test from "node:test";
import { icon, statusColor, progressBar, tokenDisplay } from "./widgets-shared.ts";

// ─── icon ───────────────────────────────────────────────────

test("icon: completed", () => {
  assert.equal(icon("completed"), "✓");
});

test("icon: achieved", () => {
  assert.equal(icon("achieved"), "✓");
});

test("icon: failed", () => {
  assert.equal(icon("failed"), "✗");
});

test("icon: error", () => {
  assert.equal(icon("error"), "✗");
});

test("icon: blocked", () => {
  assert.equal(icon("blocked"), "✗");
});

test("icon: running", () => {
  assert.equal(icon("running"), "…");
});

test("icon: pending", () => {
  assert.equal(icon("pending"), "…");
});

test("icon: aborted", () => {
  assert.equal(icon("aborted"), "⊘");
});

test("icon: needs_attention", () => {
  assert.equal(icon("needs_attention"), "!");
});

test("icon: unknown status", () => {
  assert.equal(icon("unknown"), "•");
});

// ─── statusColor ────────────────────────────────────────────

test("statusColor: completed", () => {
  assert.equal(statusColor("completed"), "success");
});

test("statusColor: achieved", () => {
  assert.equal(statusColor("achieved"), "success");
});

test("statusColor: failed", () => {
  assert.equal(statusColor("failed"), "error");
});

test("statusColor: error", () => {
  assert.equal(statusColor("error"), "error");
});

test("statusColor: blocked", () => {
  assert.equal(statusColor("blocked"), "error");
});

test("statusColor: running", () => {
  assert.equal(statusColor("running"), "warning");
});

test("statusColor: aborted", () => {
  assert.equal(statusColor("aborted"), "error");
});

test("statusColor: needs_attention", () => {
  assert.equal(statusColor("needs_attention"), "warning");
});

test("statusColor: unknown status", () => {
  assert.equal(statusColor("unknown"), "muted");
});

// ─── progressBar ────────────────────────────────────────────

test("progressBar: 0 of 0", () => {
  assert.equal(progressBar(0, 0), "");
});

test("progressBar: 0 of 10", () => {
  const bar = progressBar(0, 10);
  assert.ok(bar.includes("░".repeat(20)));
  assert.ok(bar.includes("0/10"));
});

test("progressBar: 5 of 10", () => {
  const bar = progressBar(5, 10);
  assert.ok(bar.includes("█".repeat(10)));
  assert.ok(bar.includes("░".repeat(10)));
  assert.ok(bar.includes("5/10"));
});

test("progressBar: 10 of 10", () => {
  const bar = progressBar(10, 10);
  assert.ok(bar.includes("█".repeat(20)));
  assert.ok(bar.includes("10/10"));
});

test("progressBar: custom width", () => {
  const bar = progressBar(1, 2, 10);
  assert.ok(bar.includes("█".repeat(5)));
  assert.ok(bar.includes("░".repeat(5)));
});

test("progressBar: rounding", () => {
  const bar = progressBar(1, 3, 20);
  // 1/3 * 20 = 6.67, should round to 7
  assert.ok(bar.includes("1/3"));
  const filled = bar.match(/█+/)?.[0]?.length || 0;
  assert.ok(filled === 7);
});

// ─── tokenDisplay ───────────────────────────────────────────

const mockFg = (_c: any, text: string) => text;

test("tokenDisplay: input only", () => {
  const usage = { input: 1000 };
  const result = tokenDisplay(usage, mockFg);
  assert.ok(result.includes("↑1.0k"));
});

test("tokenDisplay: output only", () => {
  const usage = { output: 500 };
  const result = tokenDisplay(usage, mockFg);
  assert.ok(result.includes("↓500"));
});

test("tokenDisplay: cost only", () => {
  const usage = { cost: 0.1234 };
  const result = tokenDisplay(usage, mockFg);
  assert.ok(result.includes("$0.1234"));
});

test("tokenDisplay: complete", () => {
  const usage = { input: 1000, output: 500, cost: 0.05 };
  const result = tokenDisplay(usage, mockFg);
  assert.ok(result.includes("↑1.0k"));
  assert.ok(result.includes("↓500"));
  assert.ok(result.includes("$0.0500"));
});

test("tokenDisplay: empty usage", () => {
  const usage = {};
  const result = tokenDisplay(usage, mockFg);
  assert.equal(result, "");
});

test("tokenDisplay: zero values not displayed", () => {
  const usage = { input: 0, output: 0, cost: 0 };
  const result = tokenDisplay(usage, mockFg);
  assert.equal(result, "");
});

test("tokenDisplay: applies color function", () => {
  const colorFg = (_c: any, text: string) => `[${text}]`;
  const usage = { input: 100 };
  const result = tokenDisplay(usage, colorFg);
  assert.ok(result.includes("[↑100]"));
});
