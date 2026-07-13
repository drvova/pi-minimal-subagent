// Idle-timeout watchdog for child Pi processes.
// A healthy child streams JSON events continuously; a wedged one (hung MCP
// tool call, deadlock) goes silent. We reset the timer on every output chunk,
// so only genuinely silent processes are killed — long streaming tasks are safe.

export const IDLE_TIMEOUT_MS = Number(process.env.PI_SUBAGENT_IDLE_TIMEOUT_MS) || 300000;

export function createIdleWatchdog(
  onIdle: () => void,
  timeoutMs: number = IDLE_TIMEOUT_MS,
): { reset: () => void; clear: () => void } {
  let timer: NodeJS.Timeout | undefined;
  const reset = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onIdle, timeoutMs);
  };
  const clear = () => {
    if (timer) { clearTimeout(timer); timer = undefined; }
  };
  reset();
  return { reset, clear };
}
