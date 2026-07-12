// Run status handlers — extracted from dispatch-crud.ts.
// handleRunList, handleRunStatus, handleRunAbort.

import { abortBackgroundRun } from "./engine/background.ts";
import { getRun, listRuns } from "./runs/persistence.ts";

type ToolResult = { content: Array<{ type: "text"; text: string }>; details: any; isError?: boolean };

function err(msg: string): ToolResult {
  return { content: [{ type: "text", text: msg }], details: {}, isError: true };
}

export function handleRunList(cwd: string): ToolResult {
  const runs = listRuns(cwd);
  if (!runs.length) return { content: [{ type: "text", text: "No runs found." }], details: {} };
  return { content: [{ type: "text", text: runs.map((r: any) => `${r.status === "completed" ? "\u2713" : r.status === "running" ? "\u2026" : "\u00d7"} ${r.workflowName} (${r.runId})\n  ${r.phaseCount} phases, ${r.taskCount} tasks | ${r.startedAt}`).join("\n\n") }], details: {} };
}

export async function handleRunStatus(params: any, cwd: string): Promise<ToolResult> {
  const agentId = params.agent_id || params.runId;
  if (!agentId) return err("run-status requires runId or agent_id.");
  let run = getRun(cwd, agentId!);
  if (params.wait) {
    for (let i = 0; i < 120 && run && run.status !== "completed" && run.status !== "failed" && run.status !== "aborted"; i++) {
      await new Promise(r => setTimeout(r, 1000));
      run = getRun(cwd, agentId!);
    }
  }
  if (!run) return { content: [{ type: "text", text: "Run not found." }], details: {} };
  const lines = [`Workflow: ${run.workflowName}`, `Status: ${run.status}`, run.completedAt ? `Completed: ${run.completedAt}` : ""];
  if (params.verbose) for (const p of run.phaseResults) { lines.push(`  ${p.phaseName}:`); for (const t of p.taskResults) lines.push(`    ${t.status} ${t.agent}: ${t.response || t.errorMessage || ""}`); }
  const taskCount = run.phaseResults.reduce((s: number, p: any) => s + p.taskResults.length, 0);
  const notification = { runId: run.id, workflowName: run.workflowName, status: run.status, phaseCount: run.phaseResults.length, taskCount, preview: (run.phaseResults[0]?.taskResults[0]?.response || "").slice(0, 100) };
  return { content: [{ type: "text", text: lines.filter(Boolean).join("\n") }], details: { run, notification } };
}

export function handleRunAbort(params: any): ToolResult {
  const agentId = params.agent_id || params.runId;
  if (!agentId) return err("run-abort requires runId or agent_id.");
  return { content: [{ type: "text", text: abortBackgroundRun(agentId!) ? "Abort signal sent." : "Run not found." }], details: {} };
}
