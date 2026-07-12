import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createTeam, updateTeam, removeTeam } from "./manager.ts";
import { validateTeam } from "./validator.ts";
import { listTeams } from "./persistence.ts";

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pi-test-team-"));
}

test("validateTeam: rejects empty team", () => {
  assert.ok(validateTeam({}).length > 0);
});

test("validateTeam: requires members", () => {
  const errors = validateTeam({ name: "team", description: "desc", members: [] });
  assert.ok(errors.some((e) => e.field === "members"));
});

test("validateTeam: rejects duplicate agents", () => {
  const errors = validateTeam({
    name: "team", description: "desc",
    members: [
      { agent: "scout", role: "finder" },
      { agent: "scout", role: "checker" },
    ],
  });
  assert.ok(errors.some((e) => e.message.includes("Duplicate")));
});

test("validateTeam: valid team passes", () => {
  const errors = validateTeam({
    name: "Dream Team", description: "Best agents",
    members: [
      { agent: "scout", role: "Reconnaissance" },
      { agent: "engineer", role: "Implementation" },
    ],
  });
  assert.equal(errors.length, 0);
});

test("createTeam: persists and retrieves", () => {
  const dir = tmpdir();
  try {
    const result = createTeam(dir, { name: "Dream Team", description: "Best agents", members: [{ agent: "scout", role: "finder" }] });
    assert.equal(result.errors.length, 0);
    assert.equal(listTeams(dir).length, 1);
    assert.equal(listTeams(dir)[0].name, "Dream Team");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("createTeam: rejects duplicate name", () => {
  const dir = tmpdir();
  try {
    createTeam(dir, { name: "dup", description: "first", members: [{ agent: "a", role: "r" }] });
    const result = createTeam(dir, { name: "dup", description: "second", members: [{ agent: "b", role: "r" }] });
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].message.includes("already exists"));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
