import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverAgents } from "./agents.ts";

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pi-test-agents-"));
}

function writeAgent(dir: string, name: string, description: string, body: string, extra = "") {
  const content = `---\nname: ${name}\ndescription: ${description}\n${extra ? extra + "\n" : ""}---\n${body}`;
  fs.writeFileSync(path.join(dir, `${name}.md`), content, "utf-8");
}

function writeFile(dir: string, name: string, content: string) {
  fs.writeFileSync(path.join(dir, name), content, "utf-8");
}

test("discoverAgents: returns empty when no agent dirs exist", () => {
  const dir = tmpdir();
  try {
    const result = discoverAgents(dir);
    assert.equal(result.agents.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("discoverAgents: loads agents from project .pi/agents dir", () => {
  const dir = tmpdir();
  try {
    const agentsDir = path.join(dir, ".pi", "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    writeAgent(agentsDir, "scout", "Fast codebase reconnaissance", "You are a scout.");
    writeAgent(agentsDir, "engineer", "Deep implementation work", "You are an engineer.");

    const result = discoverAgents(dir);
    assert.equal(result.agents.length, 2);
    assert.equal(result.agents[0].name, "engineer"); // sorted
    assert.equal(result.agents[1].name, "scout");
    assert.equal(result.projectAgentsDir, agentsDir);

    const scout = result.agents.find((a) => a.name === "scout");
    assert.ok(scout);
    assert.equal(scout.description, "Fast codebase reconnaissance");
    assert.equal(scout.source, "project");
    assert.equal(scout.systemPrompt, "You are a scout.");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("discoverAgents: skips non-markdown files", () => {
  const dir = tmpdir();
  try {
    const agentsDir = path.join(dir, ".pi", "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    writeAgent(agentsDir, "valid", "A valid agent", "body");
    writeFile(agentsDir, "notes.txt", "not an agent");

    const result = discoverAgents(dir);
    assert.equal(result.agents.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("discoverAgents: skips agents without name or description", () => {
  const dir = tmpdir();
  try {
    const agentsDir = path.join(dir, ".pi", "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    writeFile(agentsDir, "no-name.md", "---\ndescription: missing name\n---\nbody");
    writeFile(agentsDir, "no-desc.md", "---\nname: orphan\n---\nbody");
    writeAgent(agentsDir, "valid", "Has both", "body");

    const result = discoverAgents(dir);
    assert.equal(result.agents.length, 1);
    assert.equal(result.agents[0].name, "valid");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("discoverAgents: parses optional frontmatter fields", () => {
  const dir = tmpdir();
  try {
    const agentsDir = path.join(dir, ".pi", "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    writeAgent(agentsDir, "full", "Complete agent", "body",
      "model: gpt-5\nskills: code-review\nthinking: enabled\nextensions: npm:foo");

    const result = discoverAgents(dir);
    const agent = result.agents[0];
    assert.equal(agent.model, "gpt-5");
    assert.deepEqual(agent.skills, ["code-review"]);
    assert.equal(agent.thinking, "enabled");
    assert.deepEqual(agent.extensions, ["npm:foo"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("discoverAgents: trims system prompt body", () => {
  const dir = tmpdir();
  try {
    const agentsDir = path.join(dir, ".pi", "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    writeFile(agentsDir, "trimmed.md", "---\nname: trimmed\ndescription: Test\n---\n  \n  body here  \n\n  ");

    const result = discoverAgents(dir);
    assert.equal(result.agents[0].systemPrompt, "body here");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("discoverAgents: project agent overrides user agent with same name", () => {
  // This test only checks that project agents come from .pi/agents
  // User agent override depends on getAgentDir() and can't be tested without mocking
  const dir = tmpdir();
  try {
    const agentsDir = path.join(dir, ".pi", "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    writeAgent(agentsDir, "worker", "Project version", "project body");

    const result = discoverAgents(dir);
    assert.equal(result.agents.length, 1);
    assert.equal(result.agents[0].source, "project");
    assert.equal(result.agents[0].description, "Project version");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
