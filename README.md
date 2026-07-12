# Pi Minimal Subagents

Named subagent tool for Pi with autonomous delegation, workflow orchestration, and durable state.

## Tools

| Tool | Description |
|------|-------------|
| `subagent` | Run one named agent on one focused task |
| `workflow-run` | Execute a multi-phase workflow with parallel tasks |
| `workflow-manage` | CRUD for workflow definitions |
| `team-manage` | CRUD for team definitions |
| `agent-manage` | CRUD for project agent markdown files |
| `run-status` | Check workflow run status; list/abort runs |

## Installation

In Pi settings (`~/.pi/agent/settings.json` or project `.pi/settings.json`):

```jsonc
{ "extensions": ["npm:pi-minimal-subagents"] }
```

## Quick start

### Single subagent

```json
{ "agent": "scout", "task": "Inspect the auth flow and report risks." }
```

For parallel subagents, call `subagent` multiple times in the same turn.

### Workflow execution

Define a workflow, then run it:

```json
// Step 1: Create the workflow
{ "action": "create", "name": "Code Review", "description": "Review and test a PR",
  "phases": "[{\"id\":\"p1\",\"name\":\"Inspect\",\"concurrency\":2,\"tasks\":[{\"id\":\"t1\",\"agent\":\"scout\",\"task\":\"Read all changed files and identify issues\"},{\"id\":\"t2\",\"agent\":\"scout\",\"task\":\"Check for security vulnerabilities\"}]},{\"id\":\"p2\",\"name\":\"Test\",\"concurrency\":1,\"tasks\":[{\"id\":\"t3\",\"agent\":\"tester\",\"task\":\"Write and run tests for the PR changes\"}]}]" }

// Step 2: Run it (synchronous)
{ "workflowId": "<returned-id>", "dryRun": false }

// Step 2b: Run it in background
{ "workflowId": "<returned-id>", "background": true }
```

Each phase runs its tasks in parallel (up to `concurrency` limit). Phases run sequentially.

### Background runs

```json
{ "workflowId": "wf-xxx", "background": true }
// Returns: Run ID: run-xxx
// Check status later:
{ "runId": "run-xxx" }
// Abort if needed:
{ "action": "abort", "runId": "run-xxx" }
```

### Policy-driven delegation

Use `agent: "auto"` and configure `agentRouting` in settings to let the policy pick the best agent based on task keywords.

## Agent files

Markdown files with YAML frontmatter:

```markdown
---
name: scout
description: Fast codebase reconnaissance
model: claude-haiku-4-5
extensions: npm:some-pi-extension
skills: code-review
thinking: enabled
---
You are a fast codebase scout. Return dense findings for the parent agent.
```

Loaded from `~/.pi/agent/agents/*.md` (global) and `.pi/agents/*.md` (project). Project agents override global agents. Manage agents with the `agent-manage` tool.

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
        {"keywords": ["refactor", "optimize"], "agent": "engineer", "weight": 1},
        {"keywords": ["read", "scan", "inspect"], "agent": "scout", "weight": 1}
      ]
    }
  }
}
```

### `model`

Default model for subagents. Agent frontmatter `model` overrides. `null` uses Pi's default.

### `extensions`

| Value | Behavior |
|-------|----------|
| `null` / omitted | Child loads normal Pi extensions |
| `[]` | Child runs with `--no-extensions` |
| `["npm:foo"]` | Child runs `--no-extensions`, then loads listed extensions |

Agent frontmatter `extensions` are always appended.

### `environment`

Key-value map of env vars injected into subagent subprocesses. Configured values merge over inherited parent env (configured names override, omitted names inherit). String values only. Global and project merge by key (project wins).

### `delegation`

Autonomous delegation policy. Controls when tasks are delegated vs. handled inline.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `autoDelegate` | `boolean` | `false` | Enable autonomous decisions |
| `complexityThreshold` | `number` | `0.3` | Score 0-1 above which tasks delegate |
| `minTaskLength` | `number` | `50` | Min chars to consider delegation |
| `agentRouting` | `array` | none | Keyword-based agent selection for `"auto"` |

**agentRouting entries:** `keywords` (string[]), `agent` (string), `weight` (number, default 1).

Complexity scoring: term density (35%), action count (25%), technical density (25%), length (15%).

## Workflow definitions

Workflows are JSON documents persisted under `.pi/subagent-state/workflows/`. Each has:

- **Phases** — run sequentially. Each phase has a `concurrency` setting.
- **Tasks** — run in parallel within a phase. Each task specifies an `agent` name and `task` description.
- **Dependencies** — tasks can declare `dependsOn` for cross-phase ordering.

### Example workflow JSON

```json
{
  "id": "wf-abc123",
  "name": "Full Audit",
  "description": "Security audit + performance review",
  "phases": [
    {
      "id": "phase-scan",
      "name": "Scanning",
      "concurrency": 2,
      "tasks": [
        {"id": "sec", "agent": "scout", "task": "Security vulnerability scan"},
        {"id": "perf", "agent": "scout", "task": "Performance hotspot scan"}
      ]
    },
    {
      "id": "phase-fix",
      "name": "Fixing",
      "concurrency": 1,
      "tasks": [
        {"id": "apply", "agent": "engineer", "task": "Apply fixes found in scan phase", "dependsOn": ["sec", "perf"]}
      ]
    }
  ]
}
```

## Run state

All runs persist to `.pi/subagent-state/runs/<run-id>/`:

```
run.json        — run manifest with phase/task results
events.jsonl    — append-only event log (run_started, phase_started, task_completed, etc.)
```

List past runs with `run-status`, check individual runs by ID.

## Development

```bash
npm install && npm run typecheck && npm test
```

## Architecture

Feature-sliced vertical slices:

```
src/
  index.ts              — tool registration + wiring
  agents/               — agent discovery + CRUD
  delegation/           — task complexity analysis + delegation policy
  execution/            — single-subagent execution + event parsing
  workflows/            — workflow definition types, validation, CRUD, persistence
  teams/                — team definition types, validation, CRUD, persistence
  runs/                 — run types, durable persistence, event log, background registry
  engine/               — pure orchestration: workflow runner, background runs
  rendering/            — TUI call/result rendering
  settings/             — configuration resolution
```

Each slice owns its types, logic, persistence, and tests. No shared types file. Engine is pure orchestration.
