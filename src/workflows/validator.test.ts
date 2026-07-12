import assert from "node:assert/strict";
import test from "node:test";
import { validateWorkflow } from "./validator.ts";
import type { WorkflowDefinition } from "./types.ts";

test("validateWorkflow: valid workflow has no errors", () => {
  const workflow: WorkflowDefinition = {
    id: "test-wf",
    name: "Test Workflow",
    description: "Test description",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    phases: [
      {
        id: "phase1",
        name: "Phase 1",
        concurrency: 1,
        tasks: [
          { id: "task1", agent: "agent1", task: "Do something" },
        ],
      },
    ],
  };
  const errors = validateWorkflow(workflow);
  assert.equal(errors.length, 0);
});

test("validateWorkflow: missing name returns error", () => {
  const workflow = {
    description: "Test",
    phases: [{ id: "p1", name: "Phase", concurrency: 1, tasks: [{ id: "t1", agent: "a1", task: "t" }] }],
  } as Partial<WorkflowDefinition>;
  const errors = validateWorkflow(workflow);
  assert.ok(errors.some(e => e.field === "name" && e.message.includes("required")));
});

test("validateWorkflow: empty name returns error", () => {
  const workflow = {
    name: "   ",
    description: "Test",
    phases: [],
  } as Partial<WorkflowDefinition>;
  const errors = validateWorkflow(workflow);
  assert.ok(errors.some(e => e.field === "name"));
});

test("validateWorkflow: name too long returns error", () => {
  const workflow = {
    name: "a".repeat(129),
    description: "Test",
    phases: [{ id: "p1", name: "Phase", concurrency: 1, tasks: [{ id: "t1", agent: "a1", task: "t" }] }],
  } as Partial<WorkflowDefinition>;
  const errors = validateWorkflow(workflow);
  assert.ok(errors.some(e => e.field === "name" && e.message.includes("128")));
});

test("validateWorkflow: missing description returns error", () => {
  const workflow = {
    name: "Test",
    phases: [],
  } as Partial<WorkflowDefinition>;
  const errors = validateWorkflow(workflow);
  assert.ok(errors.some(e => e.field === "description" && e.message.includes("required")));
});

test("validateWorkflow: empty description returns error", () => {
  const workflow = {
    name: "Test",
    description: "  ",
    phases: [],
  } as Partial<WorkflowDefinition>;
  const errors = validateWorkflow(workflow);
  assert.ok(errors.some(e => e.field === "description"));
});

test("validateWorkflow: missing phases returns error", () => {
  const workflow = {
    name: "Test",
    description: "Test",
  } as Partial<WorkflowDefinition>;
  const errors = validateWorkflow(workflow);
  assert.ok(errors.some(e => e.field === "phases" && e.message.includes("required")));
});

test("validateWorkflow: empty phases array returns error", () => {
  const workflow = {
    name: "Test",
    description: "Test",
    phases: [],
  } as Partial<WorkflowDefinition>;
  const errors = validateWorkflow(workflow);
  assert.ok(errors.some(e => e.field === "phases"));
});

test("validateWorkflow: phase missing name returns error", () => {
  const workflow = {
    name: "Test",
    description: "Test",
    phases: [
      { tasks: [{ id: "t1", agent: "a1", task: "task" }] },
    ],
  } as Partial<WorkflowDefinition>;
  const errors = validateWorkflow(workflow);
  assert.ok(errors.some(e => e.field.includes("phases[0].name")));
});

test("validateWorkflow: phase with invalid concurrency returns error", () => {
  const workflow = {
    name: "Test",
    description: "Test",
    phases: [
      {
        name: "Phase",
        concurrency: 0,
        tasks: [{ id: "t1", agent: "a1", task: "task" }],
      },
    ],
  } as Partial<WorkflowDefinition>;
  const errors = validateWorkflow(workflow);
  assert.ok(errors.some(e => e.field.includes("concurrency") && e.message.includes("at least 1")));
});

test("validateWorkflow: phase with NaN concurrency returns error", () => {
  const workflow = {
    name: "Test",
    description: "Test",
    phases: [
      {
        name: "Phase",
        concurrency: NaN,
        tasks: [{ id: "t1", agent: "a1", task: "task" }],
      },
    ],
  } as Partial<WorkflowDefinition>;
  const errors = validateWorkflow(workflow);
  assert.ok(errors.some(e => e.field.includes("concurrency")));
});

test("validateWorkflow: phase with Infinity concurrency returns error", () => {
  const workflow = {
    name: "Test",
    description: "Test",
    phases: [
      {
        name: "Phase",
        concurrency: Infinity,
        tasks: [{ id: "t1", agent: "a1", task: "task" }],
      },
    ],
  } as Partial<WorkflowDefinition>;
  const errors = validateWorkflow(workflow);
  assert.ok(errors.some(e => e.field.includes("concurrency")));
});

test("validateWorkflow: phase without tasks returns error", () => {
  const workflow = {
    name: "Test",
    description: "Test",
    phases: [{ id: "p1", name: "Phase", concurrency: 1, tasks: [] }],
  } as Partial<WorkflowDefinition>;
  const errors = validateWorkflow(workflow);
  assert.ok(errors.some(e => e.field.includes("tasks") && e.message.includes("required")));
});

test("validateWorkflow: task missing id returns error", () => {
  const workflow = {
    name: "Test",
    description: "Test",
    phases: [
      { name: "Phase", tasks: [{ agent: "a1", task: "task" }] },
    ],
  } as Partial<WorkflowDefinition>;
  const errors = validateWorkflow(workflow);
  assert.ok(errors.some(e => e.field.includes("id") && e.message.includes("required")));
});

test("validateWorkflow: task with empty id returns error", () => {
  const workflow = {
    name: "Test",
    description: "Test",
    phases: [
      { name: "Phase", tasks: [{ id: "  ", agent: "a1", task: "task" }] },
    ],
  } as Partial<WorkflowDefinition>;
  const errors = validateWorkflow(workflow);
  assert.ok(errors.some(e => e.field.includes("id")));
});

test("validateWorkflow: task missing agent returns error", () => {
  const workflow = {
    name: "Test",
    description: "Test",
    phases: [
      { name: "Phase", tasks: [{ id: "t1", task: "task" }] },
    ],
  } as Partial<WorkflowDefinition>;
  const errors = validateWorkflow(workflow);
  assert.ok(errors.some(e => e.field.includes("agent") && e.message.includes("required")));
});

test("validateWorkflow: task missing task description returns error", () => {
  const workflow = {
    name: "Test",
    description: "Test",
    phases: [
      { name: "Phase", tasks: [{ id: "t1", agent: "a1" }] },
    ],
  } as Partial<WorkflowDefinition>;
  const errors = validateWorkflow(workflow);
  assert.ok(errors.some(e => e.field.includes("task") && e.message.includes("required")));
});

test("validateWorkflow: duplicate task IDs return error", () => {
  const workflow = {
    name: "Test",
    description: "Test",
    phases: [
      {
        name: "Phase",
        tasks: [
          { id: "duplicate", agent: "a1", task: "task1" },
          { id: "duplicate", agent: "a2", task: "task2" },
        ],
      },
    ],
  } as Partial<WorkflowDefinition>;
  const errors = validateWorkflow(workflow);
  assert.ok(errors.some(e => e.field.includes("id") && e.message.includes("Duplicate")));
});

test("validateWorkflow: duplicate IDs across phases return error", () => {
  const workflow = {
    name: "Test",
    description: "Test",
    phases: [
      { name: "Phase 1", tasks: [{ id: "same", agent: "a1", task: "t1" }] },
      { name: "Phase 2", tasks: [{ id: "same", agent: "a2", task: "t2" }] },
    ],
  } as Partial<WorkflowDefinition>;
  const errors = validateWorkflow(workflow);
  assert.ok(errors.some(e => e.message.includes("Duplicate")));
});

test("validateWorkflow: unknown dependency returns error", () => {
  const workflow = {
    name: "Test",
    description: "Test",
    phases: [
      {
        name: "Phase",
        tasks: [
          { id: "t1", agent: "a1", task: "task", dependsOn: ["unknown"] },
        ],
      },
    ],
  } as Partial<WorkflowDefinition>;
  const errors = validateWorkflow(workflow);
  assert.ok(errors.some(e => e.field.includes("dependsOn") && e.message.includes("not found")));
});

test("validateWorkflow: valid dependency has no error", () => {
  const workflow: WorkflowDefinition = {
    id: "test",
    name: "Test",
    description: "Test",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    phases: [
      {
        id: "phase1",
        name: "Phase",
        concurrency: 1,
        tasks: [
          { id: "t1", agent: "a1", task: "task1" },
          { id: "t2", agent: "a2", task: "task2", dependsOn: ["t1"] },
        ],
      },
    ],
  };
  const errors = validateWorkflow(workflow);
  assert.equal(errors.length, 0);
});

test("validateWorkflow: dependency in different phase is valid", () => {
  const workflow: WorkflowDefinition = {
    id: "test",
    name: "Test",
    description: "Test",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    phases: [
      { id: "phase1", name: "Phase 1", concurrency: 1, tasks: [{ id: "t1", agent: "a1", task: "task1" }] },
      { id: "phase2", name: "Phase 2", concurrency: 1, tasks: [{ id: "t2", agent: "a2", task: "task2", dependsOn: ["t1"] }] },
    ],
  };
  const errors = validateWorkflow(workflow);
  assert.equal(errors.length, 0);
});

test("validateWorkflow: multiple unknown dependencies return multiple errors", () => {
  const workflow = {
    name: "Test",
    description: "Test",
    phases: [
      {
        name: "Phase",
        tasks: [
          { id: "t1", agent: "a1", task: "task", dependsOn: ["unknown1", "unknown2"] },
        ],
      },
    ],
  } as Partial<WorkflowDefinition>;
  const errors = validateWorkflow(workflow);
  const depErrors = errors.filter(e => e.message.includes("not found"));
  assert.equal(depErrors.length, 2);
});

test("validateWorkflow: multiple validation errors accumulate", () => {
  const workflow = {
    description: "Missing name",
    phases: [
      { tasks: [{ id: "t1" }] }, // Missing name, agent, task
    ],
  } as Partial<WorkflowDefinition>;
  const errors = validateWorkflow(workflow);
  assert.ok(errors.length >= 3); // At least name, phase name, and task fields
});
