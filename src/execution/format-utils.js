/**
 * Pure formatting utilities — extracted from runner-events.js.
 * No dependencies on other modules.
 * v0.9.8 L4: lossless-by-default thresholds sized from measured data.
 */

export const MAX_TOOL_PREVIEW_CHARS = 8000;
export const MAX_TOOL_ARGS_PREVIEW_CHARS = 300;
export const MAX_INLINE_ERROR_PREVIEW_CHARS = 160;

export function truncateMiddle(text, maxChars) {
  if (typeof text !== "string" || text.length <= maxChars) return text;
  const keep = Math.max(0, maxChars - 3);
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return `${text.slice(0, head)}\n…\n${text.slice(text.length - tail)}`;
}

export function truncateTail(text, maxChars) {
  if (typeof text !== "string" || text.length <= maxChars) return text;
  return `…\n${text.slice(text.length - maxChars)}`;
}

export function truncateInline(text, maxChars) {
  if (typeof text !== "string") return "";
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxChars) return singleLine;
  return `${singleLine.slice(0, Math.max(0, maxChars - 1))}…`;
}

export function formatCount(n) {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function stringifyPreview(value, maxChars) {
  if (value === undefined) return "";
  if (typeof value === "string") return truncateMiddle(value, maxChars);
  try {
    return truncateMiddle(JSON.stringify(value), maxChars);
  } catch {
    return "";
  }
}

export function shortPath(value) {
  if (typeof value !== "string" || !value) return "...";
  return value.replace(/^\/home\/[^/]+/, "~");
}

export function formatToolCallPreview(toolName, args) {
  if (!args || typeof args !== "object") return toolName || "tool";

  switch (toolName) {
    case "bash": {
      const command = typeof args.command === "string" ? args.command : "...";
      return `bash $ ${truncateInline(command, 80)}`;
    }
    case "read": {
      const filePath = shortPath(args.path || args.file_path);
      const offset = args.offset;
      const limit = args.limit;
      const range = offset !== undefined || limit !== undefined ? `:${offset ?? 1}${limit !== undefined ? `-${(offset ?? 1) + limit - 1}` : ""}` : "";
      return `read ${filePath}${range}`;
    }
    case "write":
      return `write ${shortPath(args.path || args.file_path)}`;
    case "edit":
      return `edit ${shortPath(args.path || args.file_path)}`;
    case "ls":
      return `ls ${shortPath(args.path || ".")}`;
    case "find":
      return `find ${truncateInline(stringifyPreview(args.pattern || "*", 60), 60)} in ${shortPath(args.path || ".")}`;
    case "grep":
      return `grep ${truncateInline(stringifyPreview(args.pattern || "", 60), 60)} in ${shortPath(args.path || ".")}`;
    case "fork": {
      const task = typeof args.task === "string" ? args.task : stringifyPreview(args, 80);
      return `fork ${truncateInline(task, 80)}`;
    }
    default: {
      const argsPreview = truncateInline(stringifyPreview(args, 70), 70);
      return argsPreview ? `${toolName} ${argsPreview}` : toolName || "tool";
    }
  }
}

export function extractTextFromContent(content) {
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    if (part.type === "text" && typeof part.text === "string") {
      parts.push(part.text);
    } else if (part.type === "image") {
      parts.push("[image]");
    }
  }
  return parts.join("\n").trim();
}

export function extractResultText(toolResult) {
  if (!toolResult || typeof toolResult !== "object") return "";
  const contentText = extractTextFromContent(toolResult.content);
  if (contentText) return truncateMiddle(contentText, MAX_TOOL_PREVIEW_CHARS);
  if (typeof toolResult.text === "string") {
    return truncateMiddle(toolResult.text.trim(), MAX_TOOL_PREVIEW_CHARS);
  }
  if (typeof toolResult.message === "string") {
    return truncateMiddle(toolResult.message.trim(), MAX_TOOL_PREVIEW_CHARS);
  }
  return "";
}
