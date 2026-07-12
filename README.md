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

## Features

- Single agent execution, workflow orchestration, goal loops
- Autonomous delegation with policy-driven agent routing
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

## GSD — Structured Software Delivery

Native GSD five-phase methodology via `action=gsd`:

```
Discuss → Plan → Execute → Verify → Ship
```

Each phase spawns a fresh-context subagent. Previous phase output feeds into the next:

```json
{ "action": "gsd", "task": "Add dark mode to the dashboard", "dryRun": true }
```

GSD agents should be defined in `.pi/agents/`:
- `gsd-planner` — Discuss + Plan
- `gsd-executor` — Execute
- `gsd-reviewer` — Verify + Ship

## Development

```bash
npm install && npm run typecheck && npm test
```
