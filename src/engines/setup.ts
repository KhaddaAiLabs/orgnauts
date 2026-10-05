/**
 * setup.ts — first-run wizard. Writes config/*.yaml (never credentials), then sync. Interactive or flag-driven.
 *
 * Two paths (v0.3.0):
 *   quick  (`setup --quick`, the README's default) — 5 questions for ONE development sandbox and a tracker read through
 *          Claude Code's MCP (no token): dev alias · project key · allowed test e-mail patterns · tracker (+ MCP server
 *          name or Jira URL) · preprod alias (default none).
 *   full   (`setup`) — the original wizard: every org (preprod, production read-only user), tracker, e-mails, tag field, Slack.
 * Both write the same files through applyAnswers(). Prerequisites are checked first by preflight() (src/doctor) — the CLI
 * prints that table before the first question and stops when the Salesforce CLI is missing.
 */
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadConfigFile, writeConfigFile, trackerMcp, type OrgsConfig, type TrackerConfig, type TrackerAdapterName, type SafetyConfig, type NotifyConfig } from "../core/config.js";
import { projectPaths, type ProjectPaths } from "../core/paths.js";
import { ensureRuntimeDirs, syncAll } from "./sync.js";

export interface SetupAnswers {
  dev: string; preprod?: string; evidence?: string; readonlyUser?: string;
  tracker: TrackerAdapterName; projectKey: string; jiraUrl?: string;
  /** tracker `mcp`: the Claude Code MCP server name (tools are mcp__<server>__<tool>); default "atlassian". */
  mcpServer?: string;
  emails: string[]; tagField: string; slack: boolean;
}

export const TRACKER_ADAPTERS: TrackerAdapterName[] = ["mcp", "jira", "file"];
export const DEFAULT_EMAIL_PATTERNS = ["*@example.com", "*.invalid"];
const DEFAULT_MCP_SERVER = "atlassian";
const DEFAULT_JIRA_URL = "https://your-site.atlassian.net";
const PROJECT_KEY_RE = /^[A-Z][A-Z0-9_]{0,15}$/;     // schemas/config/tracker.schema.json → project_key
const MCP_SERVER_RE = /^[a-z0-9][a-z0-9_-]{0,40}$/;  // schemas/config/tracker.schema.json → mcp.server

export function normalizeTracker(raw: string | undefined, fallback: TrackerAdapterName = "mcp"): TrackerAdapterName {
  const s = (raw ?? "").trim().toLowerCase();
  return (TRACKER_ADAPTERS as string[]).includes(s) ? (s as TrackerAdapterName) : fallback;
}

export async function askAll(defaults: Partial<SetupAnswers>, nonInteractive: boolean, opts: { quick?: boolean } = {}): Promise<SetupAnswers> {
  if (nonInteractive) {
    if (!defaults.dev || !defaults.projectKey) throw new Error("non-interactive setup needs --dev and --project (and --emails; --tracker mcp|jira|file, --mcp-server, --preprod are optional)");
    const tracker = normalizeTracker(defaults.tracker);
    if (defaults.tracker && tracker !== defaults.tracker.toLowerCase()) throw new Error(`--tracker must be one of ${TRACKER_ADAPTERS.join(" | ")} (got "${defaults.tracker}")`);
    return validate({
      dev: defaults.dev, preprod: defaults.preprod || undefined, evidence: defaults.evidence || undefined, readonlyUser: defaults.readonlyUser || undefined,
      tracker, projectKey: defaults.projectKey.toUpperCase(), jiraUrl: tracker === "jira" ? defaults.jiraUrl ?? DEFAULT_JIRA_URL : defaults.jiraUrl,
      mcpServer: tracker === "mcp" ? (defaults.mcpServer ?? DEFAULT_MCP_SERVER).toLowerCase() : defaults.mcpServer,
      emails: defaults.emails?.length ? sanitizeEmailPatterns(defaults.emails) : DEFAULT_EMAIL_PATTERNS, tagField: defaults.tagField ?? "Test_Tag__c", slack: defaults.slack ?? false,
    });
  }
  const asker = makeAsker();
  try {
    return validate(opts.quick ? await askQuick(asker.q, defaults) : await askFull(asker.q, defaults));
  } finally {
    asker.close();
  }
}

/**
 * Lines are queued as they arrive, so answers piped in all at once (`printf 'a\nb\n' | orgnauts-human setup`) are not lost
 * between questions the way rl.question() loses them; a TTY behaves exactly as before. EOF answers "" (= default) to the rest.
 */
function makeAsker(): { q: (label: string, def?: string) => Promise<string>; close: () => void } {
  const rl = readline.createInterface({ input, output });
  const lines: string[] = [];
  const waiters: ((line: string) => void)[] = [];
  let closed = false;
  rl.on("line", (l) => { const w = waiters.shift(); if (w) w(l); else lines.push(l); });
  rl.on("close", () => { closed = true; for (const w of waiters.splice(0)) w(""); });
  const ask = (prompt: string) => new Promise<string>((resolve) => { output.write(prompt); const l = lines.shift(); if (l !== undefined) resolve(l); else if (closed) resolve(""); else waiters.push(resolve); });
  // Enter keeps the default; typing `none` (or `-`) clears an optional answer — and a default of `none` means "empty unless you type something"
  const q = async (label: string, def?: string) => { const a = (await ask(`${label}${def ? ` [${def}]` : ""}: `)).trim(); const v = a || def || ""; return v === "-" || /^none$/i.test(v) ? "" : v; };
  return { q, close: () => rl.close() };
}

type Q = (label: string, def?: string) => Promise<string>;

/** `setup --quick`: one development sandbox, tracker through Claude Code MCP. Five numbered questions (+ one follow-up for the tracker). */
async function askQuick(q: Q, defaults: Partial<SetupAnswers>): Promise<SetupAnswers> {
  output.write("\nOrgnauts quick setup — one development sandbox, tracker read through Claude Code (MCP, no token). 5 questions; Enter = default.\nConfig only: logins come next with `orgnauts-human org login`. Run `orgnauts-human setup` (no --quick) for preprod / production / Slack.\n\n");
  const dev = await q("1/5 Development sandbox alias (the ONLY org agents deploy to)", defaults.dev ?? "DevSandbox");
  const projectKey = (await q("2/5 Tracker project key, e.g. PROJ", defaults.projectKey ?? "DEMO")).toUpperCase();
  const emailsRaw = await q("3/5 Allowed TEST e-mail patterns, comma separated — add your own address pattern (e.g. you+*@yourcompany.example)", (defaults.emails?.length ? defaults.emails : DEFAULT_EMAIL_PATTERNS).join(","));
  const trackerRaw = await q("4/5 Tracker: mcp (Jira or any tracker through a Claude Code MCP server) | jira (REST API, token) | file (inbox/, no tracker)", defaults.tracker ?? "mcp");
  const tracker = normalizeTracker(trackerRaw);
  if (tracker !== trackerRaw.toLowerCase()) output.write(`    (unknown tracker "${trackerRaw}" — using ${tracker})\n`);
  const mcpServer = tracker === "mcp" ? (await q("    MCP server name as Claude Code lists it (`claude mcp list`)", defaults.mcpServer ?? DEFAULT_MCP_SERVER)).toLowerCase() : undefined;
  const jiraUrl = tracker === "jira" ? await q("    Jira base URL", defaults.jiraUrl ?? DEFAULT_JIRA_URL) : undefined;
  const preprod = await q("5/5 Preprod/UAT sandbox alias (baseline source; engine keychain) — `none` = development sandbox only", defaults.preprod ?? "none");
  return { dev, preprod: preprod || undefined, tracker, projectKey, jiraUrl, mcpServer, emails: sanitizeEmailPatterns(emailsRaw.split(",")), tagField: defaults.tagField ?? "Test_Tag__c", slack: defaults.slack ?? false };
}

/** `setup` (no flag): every org and option. Question order is unchanged from v0.2 except the tracker now offers `mcp` (default). */
async function askFull(q: Q, defaults: Partial<SetupAnswers>): Promise<SetupAnswers> {
  output.write("\nOrgnauts setup — config only (logins come next with `orgnauts-human org login`). Enter = default, `none` = skip an optional org.\n\n");
  const dev = await q("Development sandbox alias (agents deploy ONLY here)", defaults.dev ?? "DevSandbox");
  const preprod = await q("Preprod/UAT sandbox alias (baseline source; engine-only) — `none` to skip for now", defaults.preprod ?? "UAT");
  const evidence = await q("Production alias (READ-ONLY evidence) — `none` to skip for now", defaults.evidence ?? "Production");
  const readonlyUser = evidence ? await q("Username of the READ-ONLY production user (admin creates it; no Modify All Data / Modify Metadata / Author Apex)", defaults.readonlyUser ?? "") : "";
  const trackerRaw = await q("Tracker adapter: mcp (through a Claude Code MCP server, no token) | jira (REST API) | file (inbox/)", defaults.tracker ?? "mcp");
  const tracker = normalizeTracker(trackerRaw);
  if (tracker !== trackerRaw.toLowerCase()) output.write(`    (unknown tracker "${trackerRaw}" — using ${tracker})\n`);
  const projectKey = (await q("Tracker project key (e.g. PROJ)", defaults.projectKey ?? "DEMO")).toUpperCase();
  const mcpServer = tracker === "mcp" ? (await q("MCP server name as Claude Code lists it (`claude mcp list`)", defaults.mcpServer ?? DEFAULT_MCP_SERVER)).toLowerCase() : undefined;
  const jiraUrl = tracker === "jira" ? await q("Jira base URL", defaults.jiraUrl ?? DEFAULT_JIRA_URL) : undefined;
  const emailsRaw = await q("Allowed TEST email patterns, comma separated (your own address pattern too, e.g. you+*@company.com)", (defaults.emails?.length ? defaults.emails : DEFAULT_EMAIL_PATTERNS).join(","));
  const tagField = await q("Custom text field on test records that holds the ticket tag", defaults.tagField ?? "Test_Tag__c");
  const slack = /^y/i.test(await q("Enable Slack notifications (webhook URL via env ORGNAUTS_SLACK_WEBHOOK)? y/n", defaults.slack ? "y" : "n"));
  return { dev, preprod: preprod || undefined, evidence: evidence || undefined, readonlyUser: readonlyUser || undefined, tracker, projectKey, jiraUrl, mcpServer, emails: sanitizeEmailPatterns(emailsRaw.split(",")), tagField, slack };
}

/** Fail with a plain message before anything is written (writeConfigFile would reject the same values with a schema dump). */
function validate(a: SetupAnswers): SetupAnswers {
  if (!a.dev) throw new Error("the development sandbox alias cannot be empty");
  if (!PROJECT_KEY_RE.test(a.projectKey)) throw new Error(`project key "${a.projectKey}" must look like PROJ (letters, digits, underscore; starts with a letter; max 16)`);
  if (a.tracker === "mcp" && !MCP_SERVER_RE.test(a.mcpServer ?? "")) throw new Error(`MCP server name "${a.mcpServer}" must be lowercase letters, digits, - or _ (as \`claude mcp list\` shows it)`);
  if (!a.emails.length) a.emails = [...DEFAULT_EMAIL_PATTERNS];
  return a;
}

/** A pasted default such as `[*@example.com,*.invalid]` must not become the patterns `[*@example.com` and `*.invalid]`. */
export function sanitizeEmailPatterns(raw: string[]): string[] {
  const out: string[] = [];
  for (const r of raw) {
    const s = r.trim().replace(/^[\[\]"'\s]+|[\[\]"'\s]+$/g, "");
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

export function applyAnswers(a: SetupAnswers, p: ProjectPaths = projectPaths()): string[] {
  const written: string[] = [];
  const orgs: OrgsConfig = { version: 1, default_count: 3, orgs: [{ alias: a.dev, role: "development", keychain: "agent", write: true, email_deliverability: "unknown", deliverability_verified_on: null, deliverability_verified_by: null }] };
  if (a.preprod) orgs.orgs.push({ alias: a.preprod, role: "preprod", keychain: "engine", write: false, email_deliverability: "unknown", deliverability_verified_on: null, deliverability_verified_by: null });
  if (a.evidence) orgs.orgs.push({ alias: a.evidence, role: "evidence", keychain: "agent", write: false, readonly_user: a.readonlyUser ?? "" });
  writeConfigFile("orgs", orgs, p); written.push("config/orgs.yaml");
  const tracker = loadConfigFile("tracker", p) as TrackerConfig;
  tracker.adapter = a.tracker; tracker.project_key = a.projectKey; if (a.jiraUrl) tracker.jira.base_url = a.jiraUrl;
  // D-105: the MCP block is written with the defaults filled in (read tools, kind) so sync can put the read tools on a1-intake
  if (a.tracker === "mcp" || a.mcpServer) { const m = trackerMcp({ tracker }); tracker.mcp = { ...m, server: a.mcpServer ?? m.server }; }
  writeConfigFile("tracker", tracker, p); written.push("config/tracker.yaml");
  const safety = loadConfigFile("safety", p) as SafetyConfig;
  safety.allowed_test_emails = sanitizeEmailPatterns(a.emails); safety.test_tag_field = a.tagField;
  writeConfigFile("safety", safety, p); written.push("config/safety.yaml");
  const notify = loadConfigFile("notify", p) as NotifyConfig;
  notify.slack.enabled = a.slack;
  writeConfigFile("notify", notify, p); written.push("config/notify.yaml");
  const policy = loadConfigFile("policy", p);
  policy.allowed_deploy_targets = [a.dev];
  writeConfigFile("policy", policy, p); written.push("config/policy.yaml");
  ensureRuntimeDirs(p);
  // the keychain denies need `sf org list` — in offline mode (tests, demos) that call must not happen; `orgnauts-human sync` writes them later
  const offline = process.env.ORGNAUTS_OFFLINE === "1";
  const r = syncAll(p, { keychainDenies: !offline });
  written.push(".mcp.json", ".orgnauts/policy.compiled.json", ".claude/agents/*.md (model + tracker tool lines)");
  if (!offline && !r.warnings.some((w) => /keychain denies/.test(w))) written.push(".claude/settings.local.json (keychain denies)");
  return written;
}

/** The "what to do next" block the CLI prints after setup; short for the quick path, the full ladder otherwise. */
export function nextSteps(a: SetupAnswers, canaryEnv: string, quick: boolean): string {
  const lines: string[] = [];
  let n = 1;
  lines.push(`  ${n++}. orgnauts-human org login --alias ${a.dev} --keychain agent`);
  if (a.preprod) lines.push(`  ${n++}. orgnauts-human org login --alias ${a.preprod} --keychain engine`);
  if (a.evidence) lines.push(`  ${n++}. orgnauts-human org login --alias ${a.evidence} --keychain agent   (READ-ONLY user)`);
  lines.push(`  ${n++}. export ${canaryEnv}=you@yourcompany.example   (your own address — the canary sends to it, nowhere else)`);
  lines.push(`  ${n++}. orgnauts-human doctor${quick ? "" : " --p1 --email-canary --hooks-latency"}`);
  if (a.tracker === "mcp") lines.push(`  ${n++}. in Claude Code: \`claude mcp list\` must show "${a.mcpServer ?? DEFAULT_MCP_SERVER}" connected (that is how tickets are read — no token in Orgnauts)`);
  if (a.tracker === "file") lines.push(`  ${n++}. no tracker: copy templates/inbox-ticket.md to inbox/${a.projectKey}-101.md and fill it in`);
  lines.push(`  ${n++}. in Claude Code, once:  /plugin marketplace add ./   then   /plugin install salesforce-development@orgnauts-pinned`);
  if (!quick) { lines.push(`  ${n++}. orgnauts-human orgmap build && orgnauts-human mirror refresh`); lines.push(`  ${n++}. review docs/org-map/CONVENTIONS.md → orgnauts-human conventions build --prefix <yourorg>`); }
  lines.push(`  ${n++}. orgnauts-human start   →   /ticket ${a.projectKey}-123`);
  return lines.join("\n");
}
