import assert from "node:assert/strict";
import test from "node:test";
import { createIdleWatchdog } from "./spawn-watchdog.ts";

test("watchdog fires onIdle after silence", async () => {
  let fired = false;
  const wd = createIdleWatchdog(() => { fired = true; }, 30);
  await new Promise(r => setTimeout(r, 60));
  wd.clear();
  assert.equal(fired, true);
});

test("watchdog reset postpones onIdle", async () => {
  let fired = false;
  const wd = createIdleWatchdog(() => { fired = true; }, 40);
  // keep resetting faster than the timeout — should never fire
  for (let i = 0; i < 5; i++) { await new Promise(r => setTimeout(r, 20)); wd.reset(); }
  assert.equal(fired, false);
  wd.clear();
});

test("watchdog clear cancels the timer", async () => {
  let fired = false;
  const wd = createIdleWatchdog(() => { fired = true; }, 30);
  wd.clear();
  await new Promise(r => setTimeout(r, 60));
  assert.equal(fired, false);
});
