# Code Quality & Patterns Review
**pi-minimal-subagent** — 4130 LoC (TS) + 413 LoC (tests) | 55 TS files | 17 test files

---

## Overview
Solid architecture with clear separation of concerns (dispatch → runners → execution). Strengths: organized module structure, type coverage on domain logic, comprehensive test suite (17 files). Weaknesses: loose typing at boundaries, mixed error handling patterns, long-running functions, string-based action dispatch.

---

## 🔴 Critical Issues

### 1. **Loose Typing at Boundaries** (17 files, HIGH IMPACT)
Files using `: any` without justification, especially in:
- **Integration layers** (rendering, external APIs): `live-widget.ts`, `bun-spawn.ts`, `dispatch-exec.ts`
- **Event handlers** and callbacks with untyped parameters
- **Rendering utilities** accepting shape-unknown TUI/theme objects

**Example antipattern:**
```typescript
export function createLiveWidget(tui: any, theme: any) { ... }
export function initLiveWidget(pi: any): void { ... }
export function thinkingLine(thinking: any, fg: (color: any, text: string) => string): string { ... }
```

**Impact:** Silently accepts invalid data, hides integration errors, breaks refactoring safety.

**Fix:** Define explicit interfaces for external APIs:
```typescript
interface TUIContext { events: EventBus; theme: ThemeProvider; /* ... */ }
interface ThemeHelpers { fg: (color: string, text: string) => string; /* ... */ }
export function createLiveWidget(tui: TUIContext, theme: ThemeHelpers) { ... }
```

---

### 2. **String-Based Action Dispatch** (dispatch.ts, MAINTAINABILITY)
Linear if-chain with 20+ string comparisons; difficult to extend, debug, audit.

```typescript
const a = action || "run";
if (a === "run") return handleRun(...);
if (a === "run-workflow") return handleWorkflowRun(...);
if (a === "run-goal") return handleGoalRun(...);
// ... 17 more if-statements
return { content: [...], isError: true };
```

**Impact:** Hard to find all action handlers, missed cases silently fail, no type safety.

**Fix:** Use a dispatch table:
```typescript
const handlers = {
  "run": handleRun,
  "run-workflow": handleWorkflowRun,
  "run-goal": handleGoalRun,
  // ... others
} as const satisfies Record<string, Handler>;

type ActionType = keyof typeof handlers;
export async function dispatchAction(action: string, ...): Promise<ToolResult> {
  const handler = handlers[action as ActionType];
  if (!handler) return err(`Unknown action "${action}".`);
  return handler(...);
}
```

---

### 3. **Long-Running Functions & Promise Chains** (runner.ts, spawn.ts, gsd-runner.ts)
- `runner.ts`: 203 lines — process spawning + event handling in one function
- `spawn.ts`: 201 lines — shell execution + output buffering + error handling
- Both contain deeply nested callbacks and manual state management

**Impact:** Hard to test, debug, and reason about control flow. Error handling scattered throughout.

**Fix:** Extract concerns into smaller functions:
```typescript
// Instead of: let exitCode = await new Promise(resolve => { ... 100 lines ... })
// Split into:
async function waitForProcess(proc: ChildProcess, signal?: AbortSignal): Promise<number>
async function bufferOutput(proc: ChildProcess, onData: (line: string) => void): Promise<void>
async function manageTimeout(timer: NodeJS.Timeout | null, clearTimer: () => void): Promise<void>
```

---

## 🟡 Medium-Priority Issues

### 4. **Try-Catch Without Proper Error Context** (13 files)
Scattered try-catch blocks without logging source or action intent.

```typescript
try {
  // operation
} catch (e) {
  // generic fallback
}
```

**Better:** Explicit error paths with context:
```typescript
try {
  return await operation();
} catch (e) {
  const err = e instanceof Error ? e : new Error(String(e));
  logger.error("Failed to spawn agent", { agent: agent.name, task, error: err.message });
  return failedResult(agent.name, task, err.message);
}
```

---

### 5. **If-Chain Complexity** (13 files, 13+ if-statements in tight blocks)
Checking many conditions in sequence without early returns or guard clauses.

**Pattern in dispatch-exec.ts & elsewhere:**
```typescript
if (policy) {
  delegation = evaluatePolicy(...);
  if (delegation && !delegation.delegate && params.agent === "auto") {
    return { ... };
  }
}
if (!agent && params.agent === "auto") { ... }
if (!agent) { ... }
// ... more nested conditions
```

**Fix:** Flatten with early returns:
```typescript
const delegation = policy ? evaluatePolicy(...) : null;
if (delegation && !delegation.delegate && params.agent === "auto") {
  return tooDelegated(delegation);
}

const agent = findAgent(params.agent, discovery, policy);
if (!agent) return noAgentFound(params.agent, discovery);

const effectiveAgent = { ...agent, ...params.model ? { model: params.model } : {} };
```

---

### 6. **Mixed JS and TS Files** (12 .js, 55 .ts)
Presence of `.js` files suggests transpiled or generated code mixed with source. Files like:
- `activity-tracker.js`, `message-tracker.js`, `progress.js`, `runner-events.js`
- Alongside `.d.ts` type stubs, suggests incremental migration

**Impact:** IDE support inconsistent, refactoring harder, unclear which is source of truth.

**Action:** Convert .js → .ts or document why split exists:
```
// Run once:
for file in src/**/*.js; do
  if [[ ! -f "${file%.js}.ts" ]]; then
    mv "$file" "${file%.js}.ts"
    # Update imports in callers
  fi
done
```

---

## 🟢 Strengths to Preserve

### ✓ **Clear Module Organization**
- `execution/` for process spawning & I/O
- `engine/` for runners (goal, workflow, gsd)
- `rendering/` for TUI widgets
- `state/` for persistence
- Good separation of concerns

### ✓ **Domain Type Coverage**
49 files with explicit types/interfaces. Core domain well-typed:
- `agents/types`, `workflows/types`, `teams/types`, `runs/types`
- `execution/types`, `engine/goal-types`

### ✓ **Test Coverage**
17 test files with mixed node-test & property-based patterns:
- `complexity.test.ts`, `runner-helpers.test.ts`, `settings.test.ts`
- Good coverage of utilities and validators

### ✓ **No Major Anti-Patterns**
- No global state (except event bus, intentional)
- No circular imports
- No console.log debugging (clean output)
- Good async/await usage (no callback hell)

---

## 📋 Improvement Plan (Ranked by ROI)

| Priority | Issue | Fix Time | Impact | Recommendation |
|----------|-------|----------|--------|-----------------|
| P1 | Loose typing at boundaries (17 files) | 4h | Type safety, IDE support, refactoring confidence | Define `interface TUIContext`, `EventPayload`, etc. |
| P2 | String dispatch (dispatch.ts) | 1h | Maintainability, discoverability | Extract handler map + type union |
| P3 | Long functions (runner.ts, spawn.ts) | 3h | Testability, readability | Extract: waitForProcess, bufferOutput, cleanup |
| P4 | Try-catch without context (13 files) | 2h | Debugging, observability | Add logger.error with context |
| P5 | If-chain flattening (13 files) | 2h | Readability | Introduce early returns + guards |
| P6 | Mixed JS/TS | 1h | Clarity, IDE support | Migrate .js → .ts or document intent |

---

## Sample Fixes

### Quick Win: Dispatch Table (1 line change)
**Before:**
```typescript
if (a === "run") return handleRun(...);
if (a === "run-workflow") return handleWorkflowRun(...);
// ... 18 more
```

**After:**
```typescript
const handlers = {
  run: handleRun, "run-workflow": handleWorkflowRun, /* ... */
} as const;
const handler = handlers[action as keyof typeof handlers];
if (!handler) return err(`Unknown action`);
return handler(...args);
```

### Runner Function Split (LOC -50, cyclomatic complexity ÷2)
Extract `waitForProcess` from 203→150 line runner.ts:
```typescript
async function waitForProcess(proc: ChildProcess, signal?: AbortSignal): Promise<number> {
  return new Promise((resolve) => {
    // Move all proc event handling here
    proc.on("close", (code) => resolve(code ?? 1));
    signal?.addEventListener("abort", () => proc.kill());
  });
}
```

---

## Validation Checklist

- [ ] Run `npm run typecheck` after changes (currently passes)
- [ ] Run `npm run test` (17 tests pass)
- [ ] Grep for remaining `: any` types → document or fix
- [ ] Count if-chains → target: < 3 per function
- [ ] Verify dispatch table has all 20+ actions
- [ ] No try-catch without logger.error in production paths

---

## Conclusion

**Grade: B+** — Good architecture, solid testing, loose typing at boundaries. Fixing P1 (typing) + P2 (dispatch) elevates to **A**. Low risk of major refactor breaking functionality given test coverage.

**Next steps:**
1. Define boundary interfaces (TUIContext, EventPayload)
2. Refactor dispatch.ts to handler map
3. Extract runner functions for testability
4. Migrate .js → .ts (or document)
5. Flatten if-chains with early returns
