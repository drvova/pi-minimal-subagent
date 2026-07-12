// GSD cycle widget — renders the 5-phase GSD results with progress icons and costs.

import { Container, Spacer, Text } from "@mariozechner/pi-tui";
import { fmtCount } from "./render-format.ts";
import { icon, statusColor } from "./widgets-shared.ts";

export function renderGSDWidget(run: any, theme: any) {
  const fg = theme.fg.bind(theme);
  const container = new Container();

  const allDone = run.phases?.every((p: any) => p.status === "completed");
  const status = allDone ? "completed" : run.status;
  const sIco = icon(status);
  const color = statusColor(status);

  container.addChild(new Text(`${fg(color, sIco)} ${fg("toolTitle", theme.bold("GSD Cycle"))} ${fg(color, status)}  ${fg("dim", `$${run.totalCost?.toFixed(4) || "0.0000"}`)}`, 0, 0));
  container.addChild(new Spacer(1));

  for (const p of run.phases || []) {
    const pIco = icon(p.status);
    const pColor = statusColor(p.status);
    const snippet = (p.response || "").slice(0, 100).replace(/\n/g, " ");
    container.addChild(new Text(`  ${fg(pColor, pIco)} ${fg("dim", p.name.padEnd(10))} ${fg("dim", p.agent)}: ${snippet}`, 0, 0));
    if (p.usage?.cost > 0) {
      container.addChild(new Text(`     ${fg("dim", `↑${fmtCount(p.usage.input || 0)} ↓${fmtCount(p.usage.output || 0)} · $${p.usage.cost.toFixed(4)}`)}`, 0, 0));
    }
  }

  return container;
}
