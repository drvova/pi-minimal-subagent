# pi-minimal-subagent

Unified subagent tool for Pi — run agents, workflows, goal loops with live TUI widgets, event bus, and durable state.

## Quick start

```json
{ "action": "run", "agent": "scout", "task": "Inspect the auth flow and report risks." }
```

## Actions

| Action | Description |
|--------|-------------|
| `run` | Run one agent on one task |
| `run-workflow` | Execute a multi-phase workflow with parallel tasks |
| `run-goal` | Run an autonomous worker+judge goal loop |
| `steer` | Inject messages into running agents to redirect |
| `workflows` / `workflow-create` / `workflow-update` / `workflow-delete` | CRUD workflow definitions |
| `teams` / `team-create` / `team-update` / `team-delete` | CRUD team definitions |
| `agents` / `agent-create` / `agent-update` / `agent-delete` | CRUD agent definitions |
| `runs` / `run-status` / `run-abort` | Check run status, abort running workflows |

## Features

- **Single agent execution** — spawn real Pi subprocesses
- **Autonomous delegation** — policy-driven complexity analysis and agent routing
- **Workflow orchestration** — multi-phase execution with configurable concurrency
- **Goal loops** — worker+judge multi-turn autonomous execution with feedback
- **Mid-run steering** — inject messages into running agents to redirect work
- **Durable state** — workflows, teams, runs persisted to `.pi/subagent-state/`
- **Background runs** — detached execution with completion notifications
- **Live TUI widget** — animated spinners, token counts, tool activity above editor
- **Styled notifications** — themed compact completion boxes, expandable to full results
- **Event bus** — 12 lifecycle channels via `pi.events` for other extensions
- **Lossless output** — v0.9.8 L4: 8KB thresholds, head+tail preservation
- **Rich TUI widgets** — progress bars, status icons, model/token display

## Agent files

Markdown files with YAML frontmatter in `~/.pi/agent/agents/` (global) or `.pi/agents/` (project):

```markdown
---
name: scout
description: Fast codebase reconnaissance
model: claude-haiku-4-5
skills: code-review
---
You are a fast codebase scout. Return dense findings.
```

## Settings

Global: `~/.pi/agent/settings.json`. Project: `.pi/settings.json` (overrides global).

```jsonc
{
  "pi-minimal-subagent": {
    "model": null,
    "extensions": null,
    "environment": { "MY_VAR": "value" },
    "delegation": {
      "autoDelegate": true,
      "complexityThreshold": 0.4,
      "minTaskLength": 50,
      "agentRouting": [
        {"keywords": ["refactor"], "agent": "engineer", "weight": 1},
        {"keywords": ["read", "scan"], "agent": "scout", "weight": 1}
      ]
    }
  }
}
```

## Workflow example

```json
{ "action": "workflow-create", "name": "Audit", "description": "Security audit",
  "phases": "[{\"id\":\"scan\",\"name\":\"Scan\",\"concurrency\":2,\"tasks\":[{\"id\":\"s1\",\"agent\":\"scout\",\"task\":\"Security scan\"},{\"id\":\"s2\",\"agent\":\"scout\",\"task\":\"Perf scan\"}]}]" }

{ "action": "run-workflow", "workflowId": "<id>", "background": true }
```

## Architecture

Feature-sliced vertical slices — 43 source files across 9 slices:

```
src/
  index.ts          — unified action dispatcher
  agents/           — discovery + CRUD
  delegation/       — complexity analysis + policy
  engine/           — workflow-runner, phase-runner, spawn, goal-runner, events, steering
  execution/        — runner, events pipeline, types, result-utils
  rendering/        — TUI widgets, live widget, notifications, status, format
  runs/             — types, persistence
  settings/         — config resolution
  teams/            — types, validator, manager, persistence
  workflows/        — types, validator, manager, persistence
```

## Development

```bash
npm install && npm run typecheck && npm test
```
