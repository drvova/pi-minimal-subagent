<p align="center">
  <img src="https://github.com/drvova/pi-mcp-deferred/raw/master/pi-logo-animated.svg" width="180" alt="Pi Animated Logo">
</p>

# pi-minimal-subagent

Unified subagent tool for Pi — run agents, workflows, goal loops with live TUI widgets, event bus, and durable state.

## Quick start

```json
{ "action": "run", "agent": "scout", "task": "Inspect the auth flow and report risks." }
```

## Actions

| Action | Description |
|--------|-------------|
| `gsd` | Run a full GSD cycle: Discuss → Plan → Execute → Verify → Ship |
| `run` | Run one agent on one task |
| `run-workflow` | Execute a multi-phase workflow with parallel tasks |
| `run-goal` | Run an autonomous worker+judge goal loop |
| `steer` | Inject messages into running agents to redirect |
| `workflows` / `workflow-create` / `workflow-update` / `workflow-delete` | CRUD workflow definitions |
| `teams` / `team-create` / `team-update` / `team-delete` | CRUD team definitions |
| `agents` / `agent-create` / `agent-update` / `agent-delete` | CRUD agent definitions |
| `runs` / `run-status` / `run-abort` | Check run status, abort running workflows |

## Parameters

| Param | Actions | Meaning |
|-------|---------|---------|
| `agent` | run, steer | Agent name, or `auto` for policy/description routing |
| `task` | run, gsd, steer | Prompt / feature description |
| `model` `thinking` `skills` `extensions` | run | Fill fields the agent frontmatter leaves unspecified |
| `resume` | run | Prior run ID — prepends its output as context |
| `inherit_context` | run | Fork the parent conversation into the agent |
| `run_in_background` (`background`) | run-workflow | Return a run ID immediately, don't block |
| `wait` | run-status | Poll up to 120s until the run reaches a terminal status |
| `verbose` | run-status | Include full phase/task breakdown |
| `dryRun` | run-workflow, gsd, run-goal | Scaffold phases without spawning real Pi processes |
| `workerAgent` `judgeAgent` `maxTurns` `budget` | run-goal | Loop worker, judge, turn cap (0 = unlimited), cost cap |
| `plannerAgent` `executorAgent` `reviewerAgent` | gsd | Override phase agents (else resolved by name convention) |

Abort kills running child processes; orphaned `running` records (owner process died) reconcile to `failed` on the next status check.

## Features

- Single agent execution, workflow orchestration, goal loops
- Zero-config `auto` agent — routes by description match, no settings required
- Autonomous delegation with optional policy-driven agent routing
- Mid-run steering — redirect running agents without restart
- Durable state — persisted to `.pi/subagent-state/`
- Background runs with styled completion notifications
- Live above-editor widget with animated spinners and token tracking
- Event bus — lifecycle events via `pi.events` for other extensions
- Rich TUI widgets — progress bars, status icons, cost display

## Agent files

Markdown files with YAML frontmatter in `~/.pi/agent/agents/` or `.pi/agents/`:

```markdown
---
name: scout
description: Fast codebase reconnaissance
---
You are a fast codebase scout. Return dense findings.
```

Frontmatter is authoritative — if an agent file sets a field, it's locked for that agent. Tool parameters only fill in fields the agent leaves unspecified.

## Settings

Global: `~/.pi/agent/settings.json`. Project: `.pi/settings.json` (overrides global).

```jsonc
{
  "pi-minimal-subagent": {
    "extensions": [],
    "environment": {
      "API_KEY": "dev-key",
      "LOG_LEVEL": "debug"
    },
    "delegation": {
      "autoDelegate": true,
      "complexityThreshold": 0.4,
      "minTaskLength": 50,
      "agentRouting": [
        {"keywords": ["refactor"], "agent": "engineer"},
        {"keywords": ["scan", "audit"], "agent": "scout"}
      ]
    }
  }
}
```

**Environment variables**: The `environment` map overrides or adds variables to the subagent process environment. The parent process environment is inherited, and configured values take precedence. Global and project `environment` settings merge by key, with project values winning.

**Delegation is optional.** `agent: "auto"` works with no settings — it scores discovered agents by task-token overlap with their name and description. A `delegation` policy only adds explicit keyword routing and complexity thresholds on top.

## GSD — Structured Software Delivery

Native GSD five-phase methodology via `action=gsd`:

```
Discuss → Plan → Execute → Verify → Ship
```

Each phase spawns a fresh-context subagent. Previous phase output feeds into the next:

```json
{ "action": "gsd", "task": "Add dark mode to the dashboard", "dryRun": true }
```

GSD agents resolve by name convention (`gsd-planner`, `gsd-executor`, `gsd-reviewer`) or fall back to the first discovered agent. Override per phase with `plannerAgent` / `executorAgent` / `reviewerAgent`:
- `gsd-planner` — Discuss + Plan
- `gsd-executor` — Execute
- `gsd-reviewer` — Verify + Ship

## Development

```bash
npm install && npm run typecheck && npm test
```
