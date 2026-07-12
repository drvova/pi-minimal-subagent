import assert from "node:assert/strict";
import test from "node:test";
import { parseDelegationPolicy, parseEnvironment, mergeEnvironment } from "./settings-parsers.ts";

// --- parseEnvironment ---

test("parseEnvironment: returns undefined for null", () => {
  assert.equal(parseEnvironment(null), undefined);
});

test("parseEnvironment: returns undefined for non-object", () => {
  assert.equal(parseEnvironment("string"), undefined);
  assert.equal(parseEnvironment(42), undefined);
  assert.equal(parseEnvironment([]), undefined);
});

test("parseEnvironment: returns empty object for empty config (no keys to filter)", () => {
  assert.deepEqual(parseEnvironment({}), {});
});

test("parseEnvironment: parses valid string keys", () => {
  const result = parseEnvironment({ FOO: "bar", HELLO: "world" });
  assert.deepEqual(result, { FOO: "bar", HELLO: "world" });
});

test("parseEnvironment: trims whitespace from keys", () => {
  const result = parseEnvironment({ "  FOO  ": "bar" });
  assert.deepEqual(result, { FOO: "bar" });
});

test("parseEnvironment: ignores empty keys after trimming", () => {
  const result = parseEnvironment({ "   ": "bar", VALID: "yes" });
  assert.deepEqual(result, { VALID: "yes" });
});

test("parseEnvironment: ignores keys with null bytes", () => {
  const result = parseEnvironment({ "BAD\0KEY": "val", OK: "yes" });
  assert.deepEqual(result, { OK: "yes" });
});

test("parseEnvironment: ignores keys with equals sign", () => {
  const result = parseEnvironment({ "BAD=KEY": "val", OK: "yes" });
  assert.deepEqual(result, { OK: "yes" });
});

test("parseEnvironment: ignores non-string values", () => {
  const result = parseEnvironment({ FOO: 123, BAR: true, BAZ: null, OK: "yes" });
  assert.deepEqual(result, { OK: "yes" });
});

test("parseEnvironment: ignores values with null bytes", () => {
  const result = parseEnvironment({ BAD: "val\0ue", OK: "yes" });
  assert.deepEqual(result, { OK: "yes" });
});

test("parseEnvironment: preserves empty string values", () => {
  const result = parseEnvironment({ EMPTY: "", OK: "yes" });
  assert.deepEqual(result, { EMPTY: "", OK: "yes" });
});

// --- mergeEnvironment ---

test("mergeEnvironment: returns empty when both undefined", () => {
  assert.deepEqual(mergeEnvironment(undefined, undefined), {});
});

test("mergeEnvironment: returns base when overrides is undefined", () => {
  assert.deepEqual(mergeEnvironment({ A: "1" }, undefined), { A: "1" });
});

test("mergeEnvironment: returns overrides when base is undefined", () => {
  assert.deepEqual(mergeEnvironment(undefined, { A: "1" }), { A: "1" });
});

test("mergeEnvironment: merges distinct keys", () => {
  const result = mergeEnvironment({ A: "base" }, { B: "override" });
  assert.deepEqual(result, { A: "base", B: "override" });
});

test("mergeEnvironment: override wins on same key", () => {
  const result = mergeEnvironment({ A: "base" }, { A: "override" });
  assert.deepEqual(result, { A: "override" });
});

test("mergeEnvironment: preserves base keys not in overrides", () => {
  const result = mergeEnvironment({ A: "1", B: "2", C: "3" }, { B: "new" });
  assert.deepEqual(result, { A: "1", B: "new", C: "3" });
});

test("mergeEnvironment: does not mutate base", () => {
  const base = { A: "1" };
  mergeEnvironment(base, { B: "2" });
  assert.deepEqual(base, { A: "1" });
});

// --- parseDelegationPolicy ---

test("parseDelegationPolicy: returns undefined for non-object", () => {
  assert.equal(parseDelegationPolicy(null), undefined);
  assert.equal(parseDelegationPolicy("string"), undefined);
  assert.equal(parseDelegationPolicy([]), undefined);
});

test("parseDelegationPolicy: returns defaults when missing fields", () => {
  const result = parseDelegationPolicy({});
  assert.equal(result!.autoDelegate, false);
  assert.equal(result!.complexityThreshold, 0.3);
  assert.equal(result!.minTaskLength, 50);
  assert.equal(result!.agentRouting, undefined);
});

test("parseDelegationPolicy: reads autoDelegate", () => {
  assert.equal(parseDelegationPolicy({ autoDelegate: true })!.autoDelegate, true);
  assert.equal(parseDelegationPolicy({ autoDelegate: false })!.autoDelegate, false);
});

test("parseDelegationPolicy: clamps complexityThreshold to [0, 1]", () => {
  assert.equal(parseDelegationPolicy({ complexityThreshold: 0.7 })!.complexityThreshold, 0.7);
  assert.equal(parseDelegationPolicy({ complexityThreshold: -1 })!.complexityThreshold, 0);
  assert.equal(parseDelegationPolicy({ complexityThreshold: 5 })!.complexityThreshold, 1);
});

test("parseDelegationPolicy: clamps minTaskLength to >= 0", () => {
  assert.equal(parseDelegationPolicy({ minTaskLength: 100 })!.minTaskLength, 100);
  assert.equal(parseDelegationPolicy({ minTaskLength: -10 })!.minTaskLength, 0);
});

test("parseDelegationPolicy: parses agentRouting with valid entries", () => {
  const result = parseDelegationPolicy({
    agentRouting: [
      { keywords: ["refactor", "optimize"], agent: "engineer", weight: 2 },
    ],
  });
  assert.ok(result!.agentRouting);
  assert.equal(result!.agentRouting!.length, 1);
  assert.deepEqual(result!.agentRouting![0].keywords, ["refactor", "optimize"]);
  assert.equal(result!.agentRouting![0].agent, "engineer");
  assert.equal(result!.agentRouting![0].weight, 2);
});

test("parseDelegationPolicy: defaults weight to 1", () => {
  const result = parseDelegationPolicy({
    agentRouting: [{ keywords: ["test"], agent: "tester" }],
  });
  assert.equal(result!.agentRouting![0].weight, 1);
});

test("parseDelegationPolicy: filters entries with empty keywords", () => {
  const result = parseDelegationPolicy({
    agentRouting: [
      { keywords: [], agent: "scout" },
      { keywords: ["valid"], agent: "tester" },
    ],
  });
  assert.equal(result!.agentRouting!.length, 1);
  assert.equal(result!.agentRouting![0].agent, "tester");
});

test("parseDelegationPolicy: filters entries with empty agent name", () => {
  const result = parseDelegationPolicy({
    agentRouting: [
      { keywords: ["test"], agent: "" },
      { keywords: ["valid"], agent: "tester" },
    ],
  });
  assert.equal(result!.agentRouting!.length, 1);
});

test("parseDelegationPolicy: sets agentRouting to undefined when all entries filtered", () => {
  const result = parseDelegationPolicy({
    agentRouting: [
      { keywords: [], agent: "" },
    ],
  });
  assert.equal(result!.agentRouting, undefined);
});

test("parseDelegationPolicy: lowercases keywords", () => {
  const result = parseDelegationPolicy({
    agentRouting: [{ keywords: ["REFACTOR", "Optimize"], agent: "engineer" }],
  });
  assert.deepEqual(result!.agentRouting![0].keywords, ["refactor", "optimize"]);
});

test("parseDelegationPolicy: ignores non-string keywords", () => {
  const result = parseDelegationPolicy({
    agentRouting: [{ keywords: [123, true, "valid"], agent: "engineer" }],
  });
  assert.deepEqual(result!.agentRouting![0].keywords, ["valid"]);
});

test("parseDelegationPolicy: ignores non-object routing entries", () => {
  const result = parseDelegationPolicy({
    agentRouting: [
      "not an object",
      null,
      { keywords: ["valid"], agent: "tester" },
    ],
  });
  assert.equal(result!.agentRouting!.length, 1);
});
