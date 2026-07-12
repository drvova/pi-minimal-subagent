import type { JudgeVerdict } from "./goal-types.ts";

export function buildJudgePrompt(goal: string, transcript: string, turnNumber: number): string {
  return `You are a progress judge. Evaluate whether the following goal has been achieved.

GOAL: ${goal}

WORKER TRANSCRIPT (turn ${turnNumber}):
${transcript}

Respond with EXACTLY one verdict on the first line, then a brief reason:
ACHIEVED
NOT_ACHIEVED
BLOCKED`;
}

export function buildWorkerPrompt(goal: string, previousFeedback: string): string {
  let prompt = `GOAL: ${goal}\n\nWork toward achieving this goal. Report your progress clearly.`;
  if (previousFeedback) {
    prompt += `\n\nPREVIOUS ATTEMPT FEEDBACK:\n${previousFeedback}\n\nAddress the issues above.`;
  }
  return prompt;
}

export function parseJudgeVerdict(response: string): { verdict: JudgeVerdict; reason: string } {
  const lines = response.split("\n");
  const firstLine = lines[0]?.trim().toUpperCase() || "";
  const reason = lines.slice(1).join("\n").trim() || response.slice(firstLine.length).trim();

  if (firstLine.startsWith("ACHIEVED")) return { verdict: "achieved", reason: reason || "Goal achieved." };
  if (firstLine.startsWith("BLOCKED")) return { verdict: "blocked", reason: reason || "Blocked." };
  return { verdict: "not_achieved", reason: reason || response.trim() || "No verdict." };
}
