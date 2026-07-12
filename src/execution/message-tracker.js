/**
 * Message tracking — signature dedup, assistant message handling, usage accumulation.
 * Extracted from runner-events.js. No external dependencies.
 */

export function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
}

function getSeenMessageSignatures(result) {
  if (!Object.prototype.hasOwnProperty.call(result, "__seenMessageSignatures")) {
    Object.defineProperty(result, "__seenMessageSignatures", {
      value: new Set(), enumerable: false, configurable: false, writable: false,
    });
  }
  return result.__seenMessageSignatures;
}

function getSeenForkToolResultSignatures(result) {
  if (!Object.prototype.hasOwnProperty.call(result, "__seenForkToolResultSignatures")) {
    Object.defineProperty(result, "__seenForkToolResultSignatures", {
      value: new Set(), enumerable: false, configurable: false, writable: false,
    });
  }
  return result.__seenForkToolResultSignatures;
}

function updateAssistantMetadata(result, message) {
  if (!message || message.role !== "assistant") return;
  if (!result.provider && message.provider) result.provider = message.provider;
  if (!result.model && message.model) result.model = message.model;
  if (message.stopReason) result.stopReason = message.stopReason;
  if (message.errorMessage) result.errorMessage = message.errorMessage;
}

function sanitizeAssistantMessage(message) {
  const sanitized = { ...message };
  delete sanitized.thinking; delete sanitized.reasoning; delete sanitized.reasoning_content;
  if (Array.isArray(message.content)) {
    sanitized.content = message.content
      .filter((part) => part?.type !== "thinking")
      .map((part) => {
        if (!part || typeof part !== "object") return part;
        const cleanPart = { ...part };
        delete cleanPart.thinking; delete cleanPart.reasoning; delete cleanPart.reasoning_content;
        return cleanPart;
      });
  }
  return sanitized;
}

export function addAssistantMessage(result, message) {
  if (!message || message.role !== "assistant") return false;
  const sanitizedMessage = sanitizeAssistantMessage(message);
  updateAssistantMetadata(result, sanitizedMessage);
  const signature = stableStringify(sanitizedMessage);
  const seen = getSeenMessageSignatures(result);
  if (seen.has(signature)) return false;
  seen.add(signature);
  result.messages.push(sanitizedMessage);
  result.usage.turns++;
  const usage = message.usage;
  if (usage) {
    result.usage.input += usage.input || 0;
    result.usage.output += usage.output || 0;
    result.usage.cacheRead += usage.cacheRead || 0;
    result.usage.cacheWrite += usage.cacheWrite || 0;
    result.usage.cost += usageCost(usage.cost);
    result.usage.contextTokens = usage.totalTokens || 0;
  }
  return true;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function usageCost(cost) {
  if (!cost || typeof cost !== "object") return finiteNumber(cost);
  return finiteNumber(cost.total) || finiteNumber(cost.input) + finiteNumber(cost.output)
    + finiteNumber(cost.cacheRead) + finiteNumber(cost.cacheWrite);
}

export function addNestedForkUsage(result, message) {
  if (!message || message.role !== "toolResult") return false;
  if (message.toolName !== "fork" && message.toolName !== "subagent") return false;
  const results = message.details?.results;
  if (!Array.isArray(results)) return false;
  const signature = typeof message.toolCallId === "string" && message.toolCallId
    ? `toolCallId:${message.toolCallId}`
    : stableStringify({ toolName: message.toolName, details: message.details });
  const seen = getSeenForkToolResultSignatures(result);
  if (seen.has(signature)) return false;
  let changed = false;
  for (const forkResult of results) {
    const usage = forkResult?.usage;
    if (!usage || typeof usage !== "object") continue;
    const input = finiteNumber(usage.input);
    const output = finiteNumber(usage.output);
    const cacheRead = finiteNumber(usage.cacheRead);
    const cacheWrite = finiteNumber(usage.cacheWrite);
    const cost = usageCost(usage.cost);
    const turns = finiteNumber(usage.turns);
    const contextTokens = finiteNumber(usage.contextTokens) || finiteNumber(usage.totalTokens);
    if (!(input || output || cacheRead || cacheWrite || cost || turns || contextTokens)) continue;
    result.usage.input += input;
    result.usage.output += output;
    result.usage.cacheRead += cacheRead;
    result.usage.cacheWrite += cacheWrite;
    result.usage.cost += cost;
    result.usage.turns += turns;
    result.usage.contextTokens = Math.max(result.usage.contextTokens || 0, contextTokens);
    changed = true;
  }
  if (changed) seen.add(signature);
  return changed;
}

export function addMessageUsage(result, message) {
  return addAssistantMessage(result, message) || addNestedForkUsage(result, message);
}

export function addMessagesUsage(result, messages) {
  if (!Array.isArray(messages)) return false;
  let changed = false;
  for (const message of messages) {
    if (addMessageUsage(result, message)) changed = true;
  }
  return changed;
}
