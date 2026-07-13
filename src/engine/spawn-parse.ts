// Shared Pi JSON-line stdout parser — used by both spawn variants.

export function parsePiStdout(stdout: string): {
  response: string;
  usage: { input: number; output: number; cost: number } | undefined;
} {
  let response = "";
  let usage: { input: number; output: number; cost: number } | undefined;
  for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
    try {
      const event = JSON.parse(line);
      if (event.type === "message_end" && event.message?.role === "assistant") {
        const texts = (event.message.content || [])
          .filter((p: { type: string }) => p.type === "text").map((p: { text: string }) => p.text);
        if (texts.length) response = texts.join("");
        if (event.message.usage) {
          usage = {
            input: event.message.usage.input || 0,
            output: event.message.usage.output || 0,
            cost: event.message.usage.cost?.total ?? event.message.usage.cost ?? 0,
          };
        }
      }
    } catch { /* ignore non-JSON lines */ }
  }
  return { response, usage };
}
