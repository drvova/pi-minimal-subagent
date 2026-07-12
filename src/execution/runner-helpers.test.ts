import assert from "node:assert/strict";
import test from "node:test";
import { buildChildEnv, buildPiArgs, mergeExtensions } from "./runner-helpers.ts";
import type { AgentConfig } from "../agents/agents.ts";
import type { Settings } from "../settings/settings.ts";

function agent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    name: "test", description: "test agent", systemPrompt: "you are a test agent",
    source: "user", filePath: "/tmp/test.md", ...overrides,
  };
}

function settings(overrides: Partial<Settings> = {}): Settings {
  return { model: null, extensions: null, environment: {}, delegation: null, ...overrides };
}

// ─── mergeExtensions ─────────────────────────────────────────────

test("mergeExtensions: returns empty when both null/empty", () => {
  assert.deepEqual(mergeExtensions(settings({ extensions: null }), agent({ extensions: undefined })), []);
  assert.deepEqual(mergeExtensions(settings({ extensions: [] }), agent({ extensions: undefined })), []);
});

test("mergeExtensions: returns settings extensions", () => {
  const result = mergeExtensions(settings({ extensions: ["npm:foo"] }), agent({ extensions: undefined }));
  assert.deepEqual(result, ["npm:foo"]);
});

test("mergeExtensions: returns agent extensions", () => {
  const result = mergeExtensions(settings({ extensions: null }), agent({ extensions: ["npm:bar"] }));
  assert.deepEqual(result, ["npm:bar"]);
});

test("mergeExtensions: deduplicates combined", () => {
  const result = mergeExtensions(
    settings({ extensions: ["npm:foo", "npm:bar"] }),
    agent({ extensions: ["npm:bar", "npm:baz"] }),
  );
  assert.deepEqual(result, ["npm:foo", "npm:bar", "npm:baz"]);
});

// ─── buildChildEnv ───────────────────────────────────────────────

test("buildChildEnv: inherits process.env", () => {
  const env = buildChildEnv(settings({ environment: {} }));
  assert.ok("PATH" in env);
});

test("buildChildEnv: adds configured variables", () => {
  const env = buildChildEnv(settings({ environment: { MY_VAR: "hello" } }));
  assert.equal(env.MY_VAR, "hello");
});

test("buildChildEnv: overrides inherited with configured", () => {
  process.env.TEST_OVERRIDE = "original";
  const env = buildChildEnv(settings({ environment: { TEST_OVERRIDE: "overridden" } }));
  assert.equal(env.TEST_OVERRIDE, "overridden");
  delete process.env.TEST_OVERRIDE;
});

// ─── buildPiArgs ─────────────────────────────────────────────────

test("buildPiArgs: basic args", () => {
  const args = buildPiArgs({
    task: "do work",
    systemPromptPath: null,
    settings: settings({ extensions: null }),
    agent: agent(),
  });
  assert.ok(args.includes("--mode"));
  assert.ok(args.includes("json"));
  assert.ok(args.includes("-p"));
  assert.ok(args.includes("do work"));
});

test("buildPiArgs: adds model when configured", () => {
  const args = buildPiArgs({
    task: "work", systemPromptPath: null,
    settings: settings({ model: "gpt-5" }),
    agent: agent(),
  });
  assert.ok(args.includes("--model"));
  assert.ok(args.includes("gpt-5"));
});

test("buildPiArgs: agent model overrides settings model", () => {
  const args = buildPiArgs({
    task: "work", systemPromptPath: null,
    settings: settings({ model: "default-model" }),
    agent: agent({ model: "agent-model" }),
  });
  const idx = args.indexOf("--model");
  assert.equal(args[idx + 1], "agent-model");
});

test("buildPiArgs: adds thinking flag", () => {
  const args = buildPiArgs({
    task: "work", systemPromptPath: null,
    settings: settings(),
    agent: agent({ thinking: "enabled" }),
  });
  assert.ok(args.includes("--thinking"));
});

test("buildPiArgs: adds skill flags", () => {
  const args = buildPiArgs({
    task: "work", systemPromptPath: null,
    settings: settings(),
    agent: agent({ skills: ["code-review", "testing"] }),
  });
  assert.ok(args.includes("--skill"));
  const skillIdx = args.indexOf("--skill");
  assert.equal(args[skillIdx + 1], "code-review");
});

test("buildPiArgs: adds system prompt path", () => {
  const args = buildPiArgs({
    task: "work", systemPromptPath: "/tmp/prompt.md",
    settings: settings({ extensions: null }),
    agent: agent(),
  });
  assert.ok(args.includes("--append-system-prompt"));
  assert.ok(args.includes("/tmp/prompt.md"));
});

test("buildPiArgs: no-extensions when settings.extensions is non-null", () => {
  const args = buildPiArgs({
    task: "work", systemPromptPath: null,
    settings: settings({ extensions: [] }),
    agent: agent(),
  });
  assert.ok(args.includes("--no-extensions"));
});

test("buildPiArgs: appends task as last argument", () => {
  const args = buildPiArgs({
    task: "the task text", systemPromptPath: null,
    settings: settings({ extensions: null }),
    agent: agent(),
  });
  assert.equal(args[args.length - 1], "the task text");
});
