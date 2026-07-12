# Environment Feature Demo

## Demonstration: Environment Variables in Subagents

This demo shows how the environment configuration feature works in practice.

## Code Flow Trace

When a subagent is spawned, here's the exact flow:

### 1. Configuration Resolution (`src/settings/settings.ts`)

```typescript
// User's .pi/settings.json:
{
  "pi-minimal-subagent": {
    "environment": {
      "MY_API_KEY": "dev-123",
      "LOG_LEVEL": "debug"
    }
  }
}

// resolveSettings() reads and merges global + project configs:
export function resolveSettings(cwd: string): Settings {
  const globalSettings = readSettings(globalDir + "/settings.json", globalDir);
  const projectSettings = readSettings(projectDir + "/settings.json", projectDir);
  
  return {
    model: null,
    extensions: null,
    delegation: null,
    ...globalSettings,
    ...projectSettings,
    environment: mergeEnvironment(
      globalSettings.environment,  // { API_URL: "prod.com" }
      projectSettings.environment   // { MY_API_KEY: "dev-123", LOG_LEVEL: "debug" }
    )
    // Result: { API_URL: "prod.com", MY_API_KEY: "dev-123", LOG_LEVEL: "debug" }
  };
}
```

### 2. Environment Parsing (`src/settings/settings-parsers.ts`)

```typescript
// parseEnvironment filters and validates:
export function parseEnvironment(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const environment: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = rawKey.trim();
    
    // Validation checks:
    if (!key) continue;                     // Empty key → skip
    if (key.includes("=")) continue;        // Invalid key → skip
    if (key.includes("\0")) continue;       // Null byte → skip
    if (typeof rawValue !== "string") continue;  // Non-string → skip
    if (rawValue.includes("\0")) continue;  // Null byte in value → skip
    
    environment[key] = rawValue;  // Empty strings are OK!
  }
  return environment;
}
```

### 3. Environment Merging (Windows-Safe)

```typescript
export function mergeEnvironment(
  base: Record<string, string> | undefined,
  overrides: Record<string, string> | undefined,
): Record<string, string> {
  const environment = { ...(base ?? {}) };
  if (!overrides) return environment;

  // Windows: case-insensitive env var names
  if (process.platform === "win32") {
    for (const [overrideKey, overrideValue] of Object.entries(overrides)) {
      const normalizedKey = overrideKey.toLowerCase();
      // Remove any existing var with same name (case-insensitive)
      for (const key of Object.keys(environment)) {
        if (key.toLowerCase() === normalizedKey) delete environment[key];
      }
      environment[overrideKey] = overrideValue;
    }
    return environment;
  }

  // Unix: case-sensitive, simple merge
  return { ...environment, ...overrides };
}
```

### 4. Child Process Spawn (`src/execution/runner-helpers.ts`)

```typescript
export function buildChildEnv(settings: Settings): NodeJS.ProcessEnv {
  const inheritedEnv: NodeJS.ProcessEnv = { ...process.env };
  
  if (isWindows) {
    // Windows case-insensitive merge
    for (const [configuredKey, configuredValue] of Object.entries(settings.environment)) {
      const normalizedKey = configuredKey.toLowerCase();
      for (const key of Object.keys(inheritedEnv)) {
        if (key.toLowerCase() === normalizedKey) delete inheritedEnv[key];
      }
      inheritedEnv[configuredKey] = configuredValue;
    }
    return inheritedEnv;
  }
  
  // Unix: configured values simply override
  return { ...inheritedEnv, ...settings.environment };
}
```

### 5. Spawn Integration (`src/execution/runner.ts`)

```typescript
const proc = spawn(command, [...prefixArgs, ...piArgs], {
  cwd,
  shell: false,
  stdio: ["pipe", "pipe", "pipe"],
  env: buildChildEnv(settings),  // ← Environment applied here
});
```

## Example Scenarios

### Scenario 1: Simple Override

**Config:**
```json
{ "environment": { "LOG_LEVEL": "debug" } }
```

**Parent env:**
- `LOG_LEVEL=info`
- `PATH=/usr/bin`

**Subagent env:**
- `LOG_LEVEL=debug` ✅ (overridden)
- `PATH=/usr/bin` ✅ (inherited)

### Scenario 2: Global + Project Merge

**Global config:**
```json
{
  "environment": {
    "API_URL": "https://api.production.com",
    "LOG_LEVEL": "info"
  }
}
```

**Project config:**
```json
{
  "environment": {
    "API_URL": "https://api.dev.com",
    "DEBUG_MODE": "true"
  }
}
```

**Result:**
- `API_URL=https://api.dev.com` (project wins)
- `LOG_LEVEL=info` (from global, preserved)
- `DEBUG_MODE=true` (from project)
- All parent env vars inherited

### Scenario 3: Invalid Values Filtered

**Config:**
```json
{
  "environment": {
    "VALID": "string value",
    "INVALID_NUMBER": 123,
    "INVALID_NULL": null,
    "INVALID_BOOL": true,
    "INVALID_ARRAY": ["a", "b"],
    "EMPTY_OK": "",
    "  TRIMMED  ": "value"
  }
}
```

**Parsed result:**
```javascript
{
  VALID: "string value",
  EMPTY_OK: "",
  TRIMMED: "value"
}
// All invalid entries silently ignored
```

## Testing the Feature

### Unit Test Example

From `src/settings/settings.test.ts`:

```typescript
test("parseEnvironment: parses valid string keys", () => {
  const result = parseEnvironment({ FOO: "bar", HELLO: "world" });
  assert.deepEqual(result, { FOO: "bar", HELLO: "world" });
});

test("mergeEnvironment: override wins on same key", () => {
  const result = mergeEnvironment({ A: "base" }, { A: "override" });
  assert.deepEqual(result, { A: "override" });
});
```

### Manual Test

1. Create `.pi/settings.json`:
```json
{
  "pi-minimal-subagent": {
    "environment": {
      "TEST_VAR": "it works!"
    }
  }
}
```

2. Create test agent `.pi/agents/test-env.md`:
```markdown
---
name: test-env
description: Print environment variable
---
You are testing environment variables. Print the value of TEST_VAR.
```

3. Run subagent and observe the configured variable is visible in the child process.

## Security Considerations

✅ **Values not leaked:**
- Not in CLI arguments
- Not in tool result details
- Not in progress text
- Not in render output

✅ **Windows-safe:**
- Case-insensitive merge prevents duplicates
- Proper normalization before delete

✅ **Validation:**
- Null bytes rejected (security)
- Equals signs rejected (shell injection prevention)
- Non-strings ignored (type safety)

## Performance

- **Parsing**: O(n) where n = number of config keys
- **Merging**: O(n + m) where n = global keys, m = project keys
- **Windows merge**: O(n × m) worst case (case-insensitive compare)
- **Child spawn**: No additional overhead beyond Node's `spawn()`

All operations are fast enough to be negligible compared to process spawn time.
