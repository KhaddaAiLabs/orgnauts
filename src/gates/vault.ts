/**
 * ticket-import · visual-check — gates about the vault itself (D-105, D-107).
 */
import path from "node:path";
import { readJsonOr } from "../core/util.js";
import { trackerMcp } from "../core/config.js";
import { renderStageVisual, VISUAL_SOURCE } from "../engines/visual.js";
import type { TicketSnapshot } from "../engines/tracker/types.js";
import { failed, passed, unavailable, type Gate } from "./types.js";

/**
 * ticket-import — with the MCP tracker adapter the toolkit opens the vault with a STUB; the a1-intake agent must import
 * the real ticket (`orgnauts agent ticket import`) before the prior_art stage can pass. With the jira/file adapters the
 * snapshot is already real and the gate passes.
 */
export const ticketImportGate: Gate = {
  name: "ticket-import",
  description: "The vault holds the real ticket (not the MCP import stub): title, description and comments came from the tracker.",
  async run(ctx) {
    const snap = readJsonOr<TicketSnapshot | undefined>(path.join(ctx.vault, "ticket.json"), undefined);
    if (!snap) return unavailable("ticket-import", "ticket.json missing — run `orgnauts agent open` first");
    if (snap.pending_import) {
      const m = trackerMcp(ctx.cfg);
      return failed("ticket-import", `the ticket has not been imported yet: call the tracker's read tool (mcp__${m.server}__${m.read_tools[0]} for ${ctx.ticket}), save the result as work/${ctx.ticket}/00-inbox/ticket-import.json (schema schemas/contracts/ticket-import.schema.json), then run \`orgnauts agent ticket import ${ctx.ticket} --file work/${ctx.ticket}/00-inbox/ticket-import.json\``);
    }
    if (!snap.title || snap.title === ctx.ticket) return failed("ticket-import", "ticket.json has no real title — re-import the ticket");
    return passed("ticket-import", `ticket present (via ${snap.imported_via ?? snap.tracker}; ${snap.comments?.length ?? 0} comment(s))`);
  },
};

/**
 * visual-check — the stage contract carries a `visual` block that the toolkit can render to work/<KEY>/visuals/<stage>.html.
 * The gate RENDERS it (so the file the human is told to open always exists) and fails on a thin or broken block.
 */
export const visualCheck: Gate = {
  name: "visual-check",
  description: "The stage's `visual` block (issue · what to do · one example · two mermaid diagrams) is complete and renders to work/<KEY>/visuals/<stage>.html.",
  async run(ctx) {
    const src = VISUAL_SOURCE[ctx.stage];
    if (!src) return passed("visual-check", `no visual defined for stage ${ctx.stage}`);
    const r = renderStageVisual(ctx.p, ctx.ticket, ctx.stage);
    if (!r.rendered) {
      if (r.problems.some((x) => /missing$/.test(x) && x.includes(src.contract))) return unavailable("visual-check", r.problems.join("; "));
      return failed("visual-check", `visual block in ${src.contract} is incomplete: ${r.problems.join("; ")} — fill \`visual\` (issue.headline/steps/where_it_breaks · fix.headline/steps · example.record/today/expected · mermaid.issue/fix) and finish again`);
    }
    return passed("visual-check", `rendered ${r.relative}`);
  },
};
