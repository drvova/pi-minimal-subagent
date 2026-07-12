import assert from "node:assert/strict";
import test from "node:test";
import { parseEnvironment, mergeEnvironment } from "./settings-parsers.ts";

test("integration: parseEnvironment + mergeEnvironment simulate global+project merge", () => {
  // Simulate global settings: API_KEY=global-key, DB_URL=global-db
  const globalEnv = parseEnvironment({ API_KEY: "global-key", DB_URL: "global-db" });
  // Simulate project settings: API_KEY=project-key, LOG_LEVEL=debug
  const projectEnv = parseEnvironment({ API_KEY: "project-key", LOG_LEVEL: "debug" });

  const merged = mergeEnvironment(globalEnv, projectEnv);

  // Project API_KEY wins, global DB_URL kept, project LOG_LEVEL added
  assert.equal(merged.API_KEY, "project-key");
  assert.equal(merged.DB_URL, "global-db");
  assert.equal(merged.LOG_LEVEL, "debug");
});

test("integration: parseEnvironment filters invalid values end-to-end", () => {
  const parsed = parseEnvironment({
    VALID: "yes",
    INVALID_NUMBER: 123,
    INVALID_NULL: null,
    "BAD\0KEY": "value",
    "BAD=KEY": "value",
  });

  assert.deepEqual(parsed, { VALID: "yes" });
});
