import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createAgent, updateAgent, removeAgent } from "./manager.ts";
import { discoverAgents } from "./agents.ts";

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pi-test-agentmgr-"));
}

test("createAgent: writes valid markdown", () => {
  const dir = tmpdir();
  try {
    const r = createAgent(dir, {
      name: "scout", description: "Fast recon", systemPrompt: "You are a scout.",
    });
    assert.equal(r.errors.length, 0);

    // Verify file exists
    assert.ok(fs.existsSync(r.filePath));
    const content = fs.readFileSync(r.filePath, "utf-8");
    assert.ok(content.includes("name: scout"));
    assert.ok(content.includes("description: Fast recon"));
    assert.ok(content.includes("You are a scout."));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("createAgent: includes optional fields", () => {
  const dir = tmpdir();
  try {
    const r = createAgent(dir, {
      name: "full", description: "Full agent", systemPrompt: "body",
      model: "gpt-5", skills: ["code-review"], extensions: ["npm:foo"], thinking: "enabled",
    });
    assert.equal(r.errors.length, 0);
    const content = fs.readFileSync(r.filePath, "utf-8");
    assert.ok(content.includes("model: gpt-5"));
    assert.ok(content.includes("skills: code-review"));
    assert.ok(content.includes("extensions: npm:foo"));
    assert.ok(content.includes("thinking: enabled"));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("createAgent: rejects missing name", () => {
  const r = createAgent("/tmp", { name: "", description: "d", systemPrompt: "s" });
  assert.ok(r.errors.length > 0);
  assert.ok(r.errors[0].field === "name");
});

test("createAgent: rejects duplicate name", () => {
  const dir = tmpdir();
  try {
    createAgent(dir, { name: "dup", description: "first", systemPrompt: "body" });
    const r = createAgent(dir, { name: "dup", description: "second", systemPrompt: "body" });
    assert.ok(r.errors.length > 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("updateAgent: modifies existing fields", () => {
  const dir = tmpdir();
  try {
    createAgent(dir, { name: "test", description: "orig", systemPrompt: "original body" });
    updateAgent(dir, "test", { description: "updated", systemPrompt: "new body" });
    const content = fs.readFileSync(path.join(dir, ".pi", "agents", "test.md"), "utf-8");
    assert.ok(content.includes("description: updated"));
    assert.ok(content.includes("new body"));
    assert.ok(!content.includes("original body"));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("removeAgent: deletes file", () => {
  const dir = tmpdir();
  try {
    const r = createAgent(dir, { name: "temp", description: "tmp", systemPrompt: "body" });
    assert.ok(fs.existsSync(r.filePath));
    assert.equal(removeAgent(dir, "temp").deleted, true);
    assert.ok(!fs.existsSync(r.filePath));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("removeAgent: returns error for nonexistent", () => {
  const dir = tmpdir();
  try {
    const r = removeAgent(dir, "nope");
    assert.equal(r.deleted, false);
    assert.ok(r.error);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
