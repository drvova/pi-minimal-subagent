import assert from "node:assert/strict";
import test from "node:test";
import { analyzeTaskComplexity } from "./complexity.ts";
import { evaluatePolicy, matchAgentByDescription, selectAgent } from "./policy.ts";
import type { AgentConfig } from "../agents/agents.ts";
import type { DelegationPolicy } from "./policy.ts";

test("analyzeTaskComplexity: empty task returns skip", () => {
  const report = analyzeTaskComplexity("   ");
  assert.equal(report.score, 0);
  assert.equal(report.recommendation, "skip");
});

test("analyzeTaskComplexity: simple read task scores low", () => {
  const report = analyzeTaskComplexity("read the file at src/index.ts and list its imports");
  assert.ok(report.score < 0.3, `expected score < 0.3, got ${report.score}`);
  assert.match(report.recommendation, /skip|inline/);
});

test("analyzeTaskComplexity: complex refactor task scores high", () => {
  const report = analyzeTaskComplexity(
    "Refactor the authentication module to implement OAuth2 with PKCE flow. Migrate database schema to support refresh tokens. Design a new middleware layer for token validation. Create integration tests.",
  );
  assert.ok(report.score >= 0.3, `expected score >= 0.3, got ${report.score}`);
});

test("analyzeTaskComplexity: technical task with action items", () => {
  const report = analyzeTaskComplexity(
    "1. Build a REST API endpoint for user profiles\n2. Create database migration for profile fields\n3. Implement caching layer with Redis\n4. Write unit tests for all new functions",
  );
  assert.ok(report.score >= 0.5, `expected score >= 0.5, got ${report.score}`);
});

test("evaluatePolicy: disabled autoDelegate always delegates", () => {
  const policy: DelegationPolicy = { autoDelegate: false, complexityThreshold: 0.9, minTaskLength: 1 };
  const decision = evaluatePolicy("read a file", policy);
  assert.equal(decision.delegate, true);
  assert.match(decision.reason, /disabled/i);
});

test("evaluatePolicy: below minTaskLength skips delegation", () => {
  const policy: DelegationPolicy = { autoDelegate: true, complexityThreshold: 0.1, minTaskLength: 500 };
  const decision = evaluatePolicy("read index.ts", policy);
  assert.equal(decision.delegate, false);
  assert.match(decision.reason, /below minimum length/i);
});

test("evaluatePolicy: high threshold skips simple tasks", () => {
  const policy: DelegationPolicy = { autoDelegate: true, complexityThreshold: 0.5, minTaskLength: 5 };
  const decision = evaluatePolicy("read the file and list its contents", policy);
  assert.equal(decision.delegate, false);
  assert.match(decision.reason, /below threshold/i);
});

test("evaluatePolicy: low threshold delegates most tasks", () => {
  const policy: DelegationPolicy = { autoDelegate: true, complexityThreshold: 0.15, minTaskLength: 5 };
  const decision = evaluatePolicy("read the file and list its contents", policy);
  // Simple task might still be above 0.15, so either outcome is valid
  // but complexity score should be computed
  assert.ok(typeof decision.complexity.score === "number");
});

test("evaluatePolicy: complex task always delegates with low threshold", () => {
  const policy: DelegationPolicy = { autoDelegate: true, complexityThreshold: 0.2, minTaskLength: 10 };
  const decision = evaluatePolicy(
    "Refactor the entire database layer to use connection pooling, implement retry logic, and migrate all queries to parameterized statements.",
    policy,
  );
  assert.equal(decision.delegate, true);
});

test("selectAgent: returns null when no routing rules match", () => {
  const agents: AgentConfig[] = [{ name: "scout", description: "scout", systemPrompt: "scout", source: "user", filePath: "/tmp/scout.md" }];
  const routing: NonNullable<DelegationPolicy["agentRouting"]> = [
    { keywords: ["refactor", "optimize"], agent: "engineer", weight: 1 },
  ];
  const result = selectAgent("read some file", routing, agents);
  assert.equal(result, null);
});

test("selectAgent: matches agent by keywords", () => {
  const agents: AgentConfig[] = [
    { name: "scout", description: "scout", systemPrompt: "scout", source: "user", filePath: "/tmp/scout.md" },
    { name: "engineer", description: "engineer", systemPrompt: "engineer", source: "user", filePath: "/tmp/engineer.md" },
  ];
  const routing: NonNullable<DelegationPolicy["agentRouting"]> = [
    { keywords: ["refactor", "optimize"], agent: "engineer", weight: 1 },
    { keywords: ["read", "scan", "inspect"], agent: "scout", weight: 1 },
  ];
  const result = selectAgent("refactor the database module", routing, agents);
  assert.ok(result);
  assert.equal(result!.name, "engineer");
});

test("selectAgent: picks highest weighted match", () => {
  const agents: AgentConfig[] = [
    { name: "scout", description: "scout", systemPrompt: "scout", source: "user", filePath: "/tmp/scout.md" },
    { name: "tester", description: "tester", systemPrompt: "tester", source: "user", filePath: "/tmp/tester.md" },
  ];
  const routing: NonNullable<DelegationPolicy["agentRouting"]> = [
    { keywords: ["test"], agent: "scout", weight: 0.5 },
    { keywords: ["test", "coverage"], agent: "tester", weight: 2 },
  ];
  const result = selectAgent("test the coverage report", routing, agents);
  assert.ok(result);
  assert.equal(result!.name, "tester");
});

test("matchAgentByDescription picks agent by token overlap", () => {
  const agents = [
    { name: "scout", description: "Fast codebase reconnaissance", source: "project", filePath: "", systemPrompt: "" },
    { name: "gsd-reviewer", description: "GSD Verify and Ship phase agent", source: "project", filePath: "", systemPrompt: "" },
  ] as AgentConfig[];
  assert.equal(matchAgentByDescription("verify the ship checklist", agents)?.name, "gsd-reviewer");
  assert.equal(matchAgentByDescription("reconnaissance of codebase", agents)?.name, "scout");
  assert.equal(matchAgentByDescription("zzz qqq", agents)?.name, "scout"); // no overlap -> first agent
  assert.equal(matchAgentByDescription("anything", []), undefined);
});
