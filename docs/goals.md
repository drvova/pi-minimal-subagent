# Goal loops — autonomous multi-turn execution

The `goal-run` tool runs an autonomous loop where a **worker** agent attempts to achieve a goal and a **judge** agent evaluates progress, feeding feedback into subsequent turns until the goal is achieved or a stop condition is met.

Claude-Code-style `/goal`.

## How it works

```
┌─────────────────────────────────────────────────────┐
│ GOAL: "Fix all TypeScript errors in the project"    │
│ maxTurns: 5, budget: $2.00                         │
└─────────────────────────────────────────────────────┘
                        │
         ┌──────────────▼──────────────┐
         │  Turn 1: Worker attempts    │
         │  → "Fixed 3 errors, 2 remain"│
         └──────────────┬──────────────┘
                        │
         ┌──────────────▼──────────────┐
         │  Turn 1: Judge evaluates    │
         │  → NOT_ACHIEVED: 2 errors   │
         │    remain in src/foo.ts     │
         └──────────────┬──────────────┘
                        │
         ┌──────────────▼──────────────┐
         │  Turn 2: Worker (with       │
         │  judge feedback appended)   │
         │  → "Fixed remaining errors" │
         └──────────────┬──────────────┘
                        │
         ┌──────────────▼──────────────┐
         │  Turn 2: Judge evaluates    │
         │  → ACHIEVED: All TS errors  │
         │    resolved                 │
         └──────────────┬──────────────┘
                        │
                    ✓ DONE
```

## Usage

```json
{
  "team": "my-team",
  "goal": "Fix all TypeScript errors and ensure the build passes",
  "workerAgent": "engineer",
  "judgeAgent": "reviewer",
  "maxTurns": 5,
  "budget": 2.50
}
```

### Dry run (scaffold)

```json
{
  "team": "my-team",
  "goal": "Test goal",
  "workerAgent": "engineer",
  "judgeAgent": "reviewer",
  "maxTurns": 3,
  "dryRun": true
}
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `team` | string | yes | — | Team name for this goal run |
| `goal` | string | yes | — | The goal to achieve. Be specific about success criteria |
| `workerAgent` | string | yes | — | Agent that does the actual work each turn |
| `judgeAgent` | string | yes | — | Agent that evaluates progress against the goal |
| `maxTurns` | number | yes | 5 | Maximum turns before stopping |
| `budget` | number | no | — | Optional cost budget. Stops if exceeded |
| `dryRun` | boolean | no | false | Scaffold without spawning real processes |

## Stop conditions

The loop stops when any of these occur:

| Status | Trigger |
|--------|---------|
| `achieved` | Judge returns ACHIEVED verdict |
| `max_turns` | Loop reaches `maxTurns` without achieving the goal |
| `budget_exceeded` | Total cost exceeds `budget` |
| `blocked` | Judge returns BLOCKED verdict (goal is impossible or blocked) |
| `aborted` | Abort signal received |

## Judge protocol

The judge agent receives the goal and the worker's transcript. It must respond with EXACTLY one verdict on the first line:

```
ACHIEVED
<reason — goal has been met, describe the evidence>
```

```
NOT_ACHIEVED
<reason — what still needs to be done, what's missing>
```

```
BLOCKED
<reason — why the goal cannot be achieved, what's preventing progress>
```

## Worker feedback

After a `NOT_ACHIEVED` verdict, the judge's reason is appended to the next turn's worker prompt:

```
GOAL: <original goal>

Work toward achieving this goal. Report your progress clearly.

PREVIOUS ATTEMPT FEEDBACK:
Turn 1 verdict: NOT_ACHIEVED
2 TypeScript errors remain in src/foo.ts. The build still fails.

Address the issues above.
```

## Agent requirements

Both worker and judge agents must be defined in `~/.pi/agent/agents/` or `.pi/agents/`. The judge should be a different agent than the worker — typically a more critical/evaluative persona.

Example judge agent:

```markdown
---
name: reviewer
description: Progress evaluator and quality gate
---
You are a strict progress evaluator. Your job is to determine whether
a goal has been fully achieved based on the worker's transcript.

Rules:
- Only return ACHIEVED if the goal is completely satisfied
- Return NOT_ACHIEVED with specific, actionable feedback
- Return BLOCKED if the goal is impossible or progress is blocked
```

## Cost tracking

Each turn's worker and judge usage is tracked separately:

```
Turn 1:
  Worker: ↑1200 ↓800 $0.015
  Judge:  ↑400  ↓200 $0.003
Turn 2:
  Worker: ↑900  ↓600 $0.011
  Judge:  ↑300  ↓150 $0.002
─────────────────────────────
Total: $0.031, 2 turns, achieved
```
