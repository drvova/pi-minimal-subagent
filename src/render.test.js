import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const renderSource = fs.readFileSync(new URL("./render.ts", import.meta.url), "utf-8");

test("collapsed subagent result uses the configured expand keybinding hint", () => {
  assert.match(
    renderSource,
    /keyHint\(\s*["']app\.tools\.expand["']\s*,\s*["']to expand["']\s*\)/,
  );
  assert.doesNotMatch(renderSource, /Ctrl\+x to expand/);
});
