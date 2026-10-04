/**
 * mcp.ts — tracker adapter for teams whose tracker is reached through its OWN Claude Code MCP server (D-105).
 *
 * The toolkit holds no tracker credential and makes no HTTP call. Instead:
 *   1. `orgnauts agent open <KEY>` writes a STUB snapshot (`pending_import: true`) unless `inbox/<KEY>.md|.json` exists
 *      (the file adapter is the manual fallback: anyone can paste a ticket from any tool).
 *   2. The a1-intake agent — the only agent with the tracker's READ tools — calls e.g. `mcp__atlassian__getJiraIssue`,
 *      writes the result as JSON into `work/<KEY>/00-inbox/ticket-import.json` and runs
 *      `orgnauts agent ticket import <KEY> --file …`, which validates it (schemas/contracts/ticket-import.schema.json),
 *      wraps it in the untrusted envelope and writes ticket.json / ticket.md. The `ticket-import` gate on the prior_art
 *      stage refuses to let the stage pass while the stub is still there.
 *   3. Prior-art tracker search works the same way: the agent runs the search tool and hands the hits to
 *      `orgnauts agent prior-art <KEY> --hits <file>`.
 * Write tools are never listed in the agent's tools, are denied by the tracker-guard hook and by permissions.deny.
 */
import path from "node:path";
import { projectPaths, vaultDir, type ProjectPaths } from "../../core/paths.js";
import { exists, nowIso, readJsonOr, OrgnautsError } from "../../core/util.js";
import { FileAdapter } from "./file.js";
import { snapshotHash } from "./jira.js";
import type { SearchHit, TicketSnapshot, TrackerAdapter } from "./types.js";

export class McpAdapter implements TrackerAdapter {
  readonly name = "mcp" as const;
  private files: FileAdapter;
  constructor(private server: string, private p: ProjectPaths = projectPaths()) {
    this.files = new FileAdapter(path.join(p.root, "inbox"));
  }

  /** inbox file (manual paste) → imported snapshot in the vault → stub that asks the agent to import. */
  async fetch(key: string): Promise<TicketSnapshot> {
    if (exists(path.join(this.p.root, "inbox", `${key}.md`)) || exists(path.join(this.p.root, "inbox", `${key}.json`))) {
      const s = await this.files.fetch(key);
      s.imported_via = "inbox-file";
      return s;
    }
    const existing = readJsonOr<TicketSnapshot | undefined>(path.join(vaultDir(this.p, key), "ticket.json"), undefined);
    if (existing && !existing.pending_import) return existing;
    return stubSnapshot(key, this.server);
  }

  async probe(key: string): Promise<{ raw_hash: string; updated?: string }> {
    const s = await this.fetch(key);
    return { raw_hash: s.raw_hash, updated: s.updated };
  }

  /** The toolkit cannot search the tracker itself; hits arrive from the agent via `prior-art --hits <file>`. */
  async search(_jql: string, _max = 25): Promise<SearchHit[]> {
    return [];
  }
}

export function stubSnapshot(key: string, server: string): TicketSnapshot {
  const s: TicketSnapshot = {
    key,
    tracker: "mcp",
    fetched_at: nowIso(),
    pending_import: true,
    imported_via: `mcp:${server}`,
    title: key,
    description: `(pending import — the intake agent fetches this ticket through the "${server}" MCP server and runs \`orgnauts agent ticket import ${key} --file work/${key}/00-inbox/ticket-import.json\`)`,
    labels: [],
    components: [],
    comments: [],
    attachments: [],
    links: [],
    raw_hash: "",
  };
  s.raw_hash = snapshotHash(s);
  return s;
}

/** Shape the agent must write (loosely the TicketSnapshot without toolkit-owned fields). Validated against the contract schema too. */
export interface TicketImportInput {
  key?: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  issue_type?: string;
  labels?: string[];
  components?: string[];
  reporter?: string;
  assignee?: string;
  created?: string;
  updated?: string;
  acceptance_criteria?: string;
  comments?: { id?: string; author?: string; created?: string; body: string }[];
  attachments?: { id?: string; filename: string; mimeType?: string; size?: number; created?: string; url?: string }[];
  links?: { type?: string; key: string; title?: string }[];
  parent?: string;
  epic?: string;
  source_url?: string;
}

/** Turn what the agent fetched into a TicketSnapshot. Strips any `<untrusted …>` tags so an injected envelope cannot close ours. */
export function snapshotFromImport(key: string, input: TicketImportInput, server: string, extractAc: (text: string) => string | undefined): TicketSnapshot {
  if (!input || typeof input !== "object") throw new OrgnautsError("ticket import: JSON object expected", "IMPORT_INVALID");
  if (input.key && input.key.toUpperCase() !== key) throw new OrgnautsError(`ticket import: file is for ${input.key}, not ${key}`, "IMPORT_KEY_MISMATCH");
  const clean = (t: unknown) => String(t ?? "").replace(/<\/?untrusted[^>]*>/gi, "");
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => clean(x)).filter(Boolean) : []);
  const description = clean(input.description);
  const snap: TicketSnapshot = {
    key,
    tracker: "mcp",
    fetched_at: nowIso(),
    pending_import: false,
    imported_via: `mcp:${server}`,
    title: clean(input.title).trim() || key,
    description,
    status: input.status ? clean(input.status) : undefined,
    priority: input.priority ? clean(input.priority) : undefined,
    issue_type: input.issue_type ? clean(input.issue_type) : undefined,
    labels: list(input.labels),
    components: list(input.components),
    reporter: input.reporter ? clean(input.reporter) : undefined,
    assignee: input.assignee ? clean(input.assignee) : undefined,
    created: input.created ? clean(input.created) : undefined,
    updated: input.updated ? clean(input.updated) : undefined,
    acceptance_criteria: input.acceptance_criteria ? clean(input.acceptance_criteria) : extractAc(description),
    comments: (Array.isArray(input.comments) ? input.comments : []).map((c, i) => ({ id: String(c.id ?? i + 1), author: c.author ? clean(c.author) : undefined, created: clean(c.created), body: clean(c.body) })),
    attachments: (Array.isArray(input.attachments) ? input.attachments : []).map((a, i) => ({ id: String(a.id ?? i + 1), filename: clean(a.filename), mimeType: a.mimeType, size: a.size, created: a.created, url: a.url })),
    links: (Array.isArray(input.links) ? input.links : []).map((l) => ({ type: clean(l.type ?? "relates to"), key: clean(l.key).toUpperCase(), title: l.title ? clean(l.title) : undefined })),
    parent: input.parent ? clean(input.parent) : undefined,
    epic: input.epic ? clean(input.epic) : undefined,
    raw_hash: "",
    source_url: input.source_url ? clean(input.source_url) : undefined,
  };
  snap.raw_hash = snapshotHash(snap);
  return snap;
}
