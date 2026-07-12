import assert from "node:assert/strict";
import test from "node:test";
import { analyzeTaskComplexity } from "./complexity.ts";

test("empty task returns score 0", () => {
  const r = analyzeTaskComplexity("   ");
  assert.equal(r.score, 0);
  assert.equal(r.recommendation, "skip");
});

test("simple read task scores low", () => {
  const r = analyzeTaskComplexity("read the file at src/index.ts and list its contents");
  assert.ok(r.score < 0.3);
});

test("complex refactor task scores high", () => {
  const r = analyzeTaskComplexity(
    "Refactor the authentication module to implement OAuth2 with PKCE flow. Migrate database schema to support refresh tokens. Design a new middleware layer.",
  );
  assert.ok(r.score >= 0.3);
});

test("multi-step technical task scores high", () => {
  const r = analyzeTaskComplexity(
    "1. Build a REST API endpoint\n2. Create database migration\n3. Implement caching layer\n4. Write unit tests",
  );
  assert.ok(r.score >= 0.4);
});

test("components are between 0 and 1", () => {
  const r = analyzeTaskComplexity("build and deploy the entire application with database migrations and API endpoints");
  assert.ok(r.components.length >= 0 && r.components.length <= 1);
  assert.ok(r.components.termDensity >= 0 && r.components.termDensity <= 1);
  assert.ok(r.components.actionCount >= 0 && r.components.actionCount <= 1);
  assert.ok(r.components.technicalDensity >= 0 && r.components.technicalDensity <= 1);
});

test("short imperative task has recommendation", () => {
  const r = analyzeTaskComplexity("read file");
  assert.ok(["skip", "inline", "delegate_light", "delegate"].includes(r.recommendation));
});
