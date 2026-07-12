import assert from "node:assert/strict";
import test from "node:test";
import { buildJudgePrompt, buildWorkerPrompt, parseJudgeVerdict } from "./goal-helpers.ts";

// ─── buildJudgePrompt ───────────────────────────────────────

test("buildJudgePrompt: includes goal", () => {
  const prompt = buildJudgePrompt("test goal", "transcript", 1);
  assert.ok(prompt.includes("test goal"));
});

test("buildJudgePrompt: includes transcript", () => {
  const prompt = buildJudgePrompt("goal", "test transcript", 1);
  assert.ok(prompt.includes("test transcript"));
});

test("buildJudgePrompt: includes turn number", () => {
  const prompt = buildJudgePrompt("goal", "transcript", 5);
  assert.ok(prompt.includes("turn 5"));
});

test("buildJudgePrompt: requests specific format", () => {
  const prompt = buildJudgePrompt("goal", "transcript", 1);
  assert.ok(prompt.includes("ACHIEVED"));
  assert.ok(prompt.includes("NOT_ACHIEVED"));
  assert.ok(prompt.includes("BLOCKED"));
});

// ─── buildWorkerPrompt ──────────────────────────────────────

test("buildWorkerPrompt: includes goal", () => {
  const prompt = buildWorkerPrompt("test goal", "");
  assert.ok(prompt.includes("test goal"));
});

test("buildWorkerPrompt: no feedback initially", () => {
  const prompt = buildWorkerPrompt("goal", "");
  assert.ok(!prompt.includes("PREVIOUS ATTEMPT"));
});

test("buildWorkerPrompt: includes feedback when provided", () => {
  const prompt = buildWorkerPrompt("goal", "previous feedback");
  assert.ok(prompt.includes("PREVIOUS ATTEMPT"));
  assert.ok(prompt.includes("previous feedback"));
});

test("buildWorkerPrompt: requests progress report", () => {
  const prompt = buildWorkerPrompt("goal", "");
  assert.ok(prompt.toLowerCase().includes("progress"));
});

// ─── parseJudgeVerdict ──────────────────────────────────────

test("parseJudgeVerdict: ACHIEVED", () => {
  const result = parseJudgeVerdict("ACHIEVED\nGoal completed successfully");
  assert.equal(result.verdict, "achieved");
  assert.equal(result.reason, "Goal completed successfully");
});

test("parseJudgeVerdict: NOT_ACHIEVED", () => {
  const result = parseJudgeVerdict("NOT_ACHIEVED\nStill working");
  assert.equal(result.verdict, "not_achieved");
  assert.equal(result.reason, "Still working");
});

test("parseJudgeVerdict: BLOCKED", () => {
  const result = parseJudgeVerdict("BLOCKED\nCannot proceed");
  assert.equal(result.verdict, "blocked");
  assert.equal(result.reason, "Cannot proceed");
});

test("parseJudgeVerdict: lowercase accepted", () => {
  const result = parseJudgeVerdict("achieved\nDone");
  assert.equal(result.verdict, "achieved");
});

test("parseJudgeVerdict: partial match on first line", () => {
  const result = parseJudgeVerdict("ACHIEVED - goal met\nDetails here");
  assert.equal(result.verdict, "achieved");
  assert.ok(result.reason.includes("goal met"));
});

test("parseJudgeVerdict: no reason defaults", () => {
  const result = parseJudgeVerdict("ACHIEVED");
  assert.equal(result.verdict, "achieved");
  assert.equal(result.reason, "Goal achieved.");
});

test("parseJudgeVerdict: blocked no reason", () => {
  const result = parseJudgeVerdict("BLOCKED");
  assert.equal(result.verdict, "blocked");
  assert.equal(result.reason, "Blocked.");
});

test("parseJudgeVerdict: unknown defaults to not_achieved", () => {
  const result = parseJudgeVerdict("UNKNOWN\nWeird response");
  assert.equal(result.verdict, "not_achieved");
  assert.equal(result.reason, "Weird response");
});

test("parseJudgeVerdict: empty input", () => {
  const result = parseJudgeVerdict("");
  assert.equal(result.verdict, "not_achieved");
  assert.equal(result.reason, "No verdict.");
});

test("parseJudgeVerdict: no newline uses full text as reason", () => {
  const result = parseJudgeVerdict("Some random text without verdict");
  assert.equal(result.verdict, "not_achieved");
  assert.ok(result.reason.includes("Some random text"));
});

test("parseJudgeVerdict: multiline reason preserved", () => {
  const result = parseJudgeVerdict("ACHIEVED\nLine 1\nLine 2\nLine 3");
  assert.equal(result.verdict, "achieved");
  assert.equal(result.reason, "Line 1\nLine 2\nLine 3");
});

test("parseJudgeVerdict: whitespace trimmed", () => {
  const result = parseJudgeVerdict("  ACHIEVED  \n  Reason  ");
  assert.equal(result.verdict, "achieved");
  assert.equal(result.reason, "Reason");
});

test("parseJudgeVerdict: case-insensitive verdict detection", () => {
  assert.equal(parseJudgeVerdict("AcHiEvEd").verdict, "achieved");
  assert.equal(parseJudgeVerdict("BlOcKeD").verdict, "blocked");
  assert.equal(parseJudgeVerdict("not_achieved").verdict, "not_achieved");
});

test("parseJudgeVerdict: verdict in middle of text defaults to not_achieved", () => {
  const result = parseJudgeVerdict("Maybe we ACHIEVED something\nBut not really");
  // First line doesn't START with ACHIEVED
  assert.equal(result.verdict, "not_achieved");
});
