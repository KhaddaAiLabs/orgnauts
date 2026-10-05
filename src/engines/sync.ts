/**
 * sync.ts — config → generated files. Run after any config change (UI does it automatically).
 *   config/models.yaml   → .claude/agents/*.md  (model: line)
 *   config/orgs.yaml     → .mcp.json (sf-dev bound to the development alias only), .orgnauts/policy.compiled.json, .claude/settings.local.json (alias + keychain denies)
 *   config/policy.yaml   → .orgnauts/policy.compiled.json (fast hooks read this)
 *   knowledge/lessons    → .claude/skills/lessons-<agent>/SKILL.md (via learnSync)
 * Changes take effect in the NEXT Claude Code session (agents/MCP servers load at start).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadConfig, devOrg, preprodOrg, evidenceOrg, trackerMcp, DEFAULT_TRACKER_MCP, EFFORT_LEVELS, type AllConfig } from "../core/config.js";
import { homePaths, projectPaths, type ProjectPaths } from "../core/paths.js";
import { AGENT_NAMES } from "../core/state-machine.js";
import { exists, nowIso, readText, writeJsonAtomic, writeTextAtomic } from "../core/util.js";
import { DEFAULT_POLICY } from "../hooks/fast.js";
import { learnSync } from "./learn.js";

export const SF_MCP_VERSION = "0.30.15"; // verified on npm 2026-09-05; bump deliberately, never `latest`
export const SF_MCP_TOOLSETS = "orgs,data,metadata,testing,code-analysis";

export interface SyncResult { agents_updated: string[]; mcp_written: boolean; policy_written: boolean; skills: string[]; warnings: string[] }

export function syncAll(p: ProjectPaths = projectPaths(), opts: { skipSkills?: boolean; keychainDenies?: boolean } = {}): SyncResult {
  const cfg = loadConfig(p, { fresh: true });
  const warnings: string[] = [];
  const agents_updated = syncAgentModels(p, cfg, warnings);
  agents_updated.push(...syncAgentSkills(p, warnings));
  agents_updated.push(...syncTrackerTools(p, cfg, warnings));
  const mcp_written = writeMcpJson(p, cfg, warnings);
  const policy_written = writeCompiledPolicy(p, cfg);
  syncSettingsDenies(p, cfg, warnings);
  if (opts.keychainDenies) syncKeychainDenies(p, cfg, warnings);
  const skills = opts.skipSkills ? [] : learnSync(p);
  if (!exists(path.join(p.claude, "settings.json"))) warnings.push(".claude/settings.json missing — hooks are not wired");
  else {
    // parse, don't grep: the command strings carry escaped quotes in the file
    let commands = "";
    try {
      const settings = JSON.parse(readText(path.join(p.claude, "settings.json"))) as { hooks?: Record<string, { hooks?: { command?: string }[] }[]> };
      commands = Object.values(settings.hooks ?? {}).flat().flatMap((h) => h.hooks ?? []).map((h) => h.command ?? "").join("\n");
    } catch { warnings.push(".claude/settings.json is not valid JSON"); }
    for (const h of ["agent-gate", "policy", "write-guard", "data-guard", "prompt-router", "stage-gate", "stop-guard", "tokens"]) if (!new RegExp(`orgnauts-hook"? ${h}(\\s|$)`).test(commands)) warnings.push(`.claude/settings.json does not wire hook "${h}"`);
  }
  return { agents_updated, mcp_written, policy_written, skills, warnings };
}

/**
 * Replace a top-level frontmatter key in place, or insert it. A new key goes directly AFTER `after` when that key
 * exists (so `effort:` sits next to `model:`) — never at the very end, where it would land under a block list
 * such as `skills:` and read as part of it.
 */
function setFrontmatterKey(fm: string, key: string, value: string, after?: string): string {
  const re = new RegExp(`^${key}:[ \\t]*.*$`, "m");
  if (re.test(fm)) return fm.replace(re, `${key}: ${value}`);
  if (after) {
    const anchor = new RegExp(`^(${after}:[ \\t]*.*)$`, "m");
    if (anchor.test(fm)) return fm.replace(anchor, `$1\n${key}: ${value}`);
  }
  return `${fm}\n${key}: ${value}`;
}

/** Remove a top-level frontmatter key and its line (effort `inherit` → no line → the session level applies). */
function removeFrontmatterKey(fm: string, key: string): string {
  return fm.replace(new RegExp(`^${key}:[ \\t]*.*$\\n?`, "m"), "");
}

/**
 * D-096: generated org-convention skills (`<prefix>-comment-conventions`, `<prefix>-naming-rules`, written by
 * `orgnauts-human conventions build`) are wired into every agent that lists the matching generic `std-<suffix>` skill.
 * Before this, the skills were written but no agent loaded them, so agents silently stayed on the generic style — P10
 * ("comments in the org's existing format") was a promise, not a mechanism. The overlay line goes directly under the
 * `std-<suffix>` line so precedence (org conventions before std-*) is visible in the file; nothing else is touched.
 */
export const CONVENTION_SKILL_SUFFIXES = ["comment-conventions", "naming-rules"] as const;

export function generatedConventionSkills(p: ProjectPaths): { prefix: string; suffix: string; name: string }[] {
  if (!exists(p.skills)) return [];
  const out: { prefix: string; suffix: string; name: string }[] = [];
  for (const d of fs.readdirSync(p.skills, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const m = new RegExp(`^([a-z0-9]+)-(${CONVENTION_SKILL_SUFFIXES.join("|")})$`).exec(d.name);
    if (!m || m[1] === "std") continue;
    if (!exists(path.join(p.skills, d.name, "SKILL.md"))) continue;
    out.push({ prefix: m[1], suffix: m[2], name: d.name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Add `skillName` to a frontmatter `skills:` block right after the `- std-<suffix>` line; no-op when present or when the agent has no std-<suffix>. */
export function addSkillAfter(fm: string, stdSkill: string, skillName: string): string {
  if (new RegExp(`^\\s*-\\s+${skillName}\\s*$`, "m").test(fm)) return fm;
  const re = new RegExp(`^(\\s*-\\s+)${stdSkill}\\s*$`, "m");
  const m = re.exec(fm);
  if (!m) return fm;
  return fm.replace(re, `$1${stdSkill}\n$1${skillName}`);
}

export function syncAgentSkills(p: ProjectPaths, warnings: string[]): string[] {
  const generated = generatedConventionSkills(p);
  if (!generated.length) return [];
  const updated: string[] = [];
  for (const agent of AGENT_NAMES) {
    const f = path.join(p.agents, `${agent}.md`);
    if (!exists(f)) continue;
    const txt = readText(f);
    const m = txt.match(/^---\n([\s\S]*?)\n---/);
    if (!m) { warnings.push(`${agent}.md has no frontmatter`); continue; }
    let fm = m[1];
    const added: string[] = [];
    for (const g of generated) {
      const next = addSkillAfter(fm, `std-${g.suffix}`, g.name);
      if (next !== fm) { fm = next; added.push(g.name); }
    }
    if (!added.length) continue;
    writeTextAtomic(f, txt.replace(m[0], `---\n${fm.replace(/\n$/, "")}\n---`));
    updated.push(`${agent} + skills ${added.join(", ")}`);
  }
  return updated;
}

/**
 * config/models.yaml → the `model:` and `effort:` lines of .claude/agents/*.md.
 *
 * D-095 adds effort. `inherit` (or no configured value at all) removes the line, which restores the pre-D-095
 * behaviour exactly: the session level applies. Every other frontmatter key the file carries is left untouched.
 */
export function syncAgentModels(p: ProjectPaths, cfg: AllConfig, warnings: string[]): string[] {
  const updated: string[] = [];
  for (const agent of AGENT_NAMES) {
    const f = path.join(p.agents, `${agent}.md`);
    if (!exists(f)) { warnings.push(`agent file missing: .claude/agents/${agent}.md`); continue; }
    const model = cfg.models.agents[agent] ?? cfg.models.fallback ?? "sonnet";
    const effortRaw = cfg.models.effort?.[agent] ?? cfg.models.fallback_effort ?? "inherit";
    const effort = EFFORT_LEVELS.includes(effortRaw as never) ? effortRaw : "inherit";
    if (effortRaw !== effort) warnings.push(`models.yaml: effort "${effortRaw}" for ${agent} is not one of ${EFFORT_LEVELS.join("|")}|inherit — leaving it to the session level`);
    const txt = readText(f);
    const m = txt.match(/^---\n([\s\S]*?)\n---/);
    if (!m) { warnings.push(`${agent}.md has no frontmatter`); continue; }
    let fm = setFrontmatterKey(m[1], "model", model);
    fm = effort === "inherit" ? removeFrontmatterKey(fm, "effort") : setFrontmatterKey(fm, "effort", effort, "model");
    const next = txt.replace(m[0], `---\n${fm.replace(/\n$/, "")}\n---`);
    if (next !== txt) { writeTextAtomic(f, next); updated.push(`${agent} → ${model}${effort === "inherit" ? "" : ` @ ${effort}`}`); }
  }
  return updated;
}

/**
 * D-105: config/tracker.yaml → the tracker READ tools in a1-intake's `tools:` line. The agent file ships with the
 * Atlassian Jira names; a team on another tracker sets `mcp.server` + `mcp.read_tools` and sync rewrites the line.
 * With the jira/file adapters the tracker tools are removed (the toolkit fetches, the agent needs no MCP).
 */
export const TRACKER_TOOL_AGENT = "a1-intake";
export function trackerToolNames(cfg: AllConfig): string[] {
  if (cfg.tracker.adapter !== "mcp") return [];
  const m = trackerMcp(cfg);
  return m.read_tools.map((t) => `mcp__${m.server}__${t}`);
}
export function rewriteTrackerTools(fm: string, wanted: string[]): string {
  const re = /^tools:[ \t]*(.*)$/m;
  const m = re.exec(fm);
  if (!m) return fm;
  const known = new Set([...DEFAULT_TRACKER_MCP.read_tools].map((t) => t.toLowerCase()));
  const isTrackerTool = (t: string) => { const x = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/.exec(t); return !!x && x[1] !== "sf-dev" && !x[1].startsWith("orgnauts") && !x[1].startsWith("plugin_") && (known.has(x[2].toLowerCase()) || wanted.some((w) => w.toLowerCase() === t.toLowerCase())); };
  const kept = m[1].split(",").map((t) => t.trim()).filter(Boolean).filter((t) => !isTrackerTool(t));
  const next = [...kept, ...wanted.filter((w) => !kept.some((k) => k.toLowerCase() === w.toLowerCase()))];
  return fm.replace(re, `tools: ${next.join(", ")}`);
}
export function syncTrackerTools(p: ProjectPaths, cfg: AllConfig, warnings: string[]): string[] {
  const f = path.join(p.agents, `${TRACKER_TOOL_AGENT}.md`);
  if (!exists(f)) return [];
  const txt = readText(f);
  const m = txt.match(/^---\n([\s\S]*?)\n---/);
  if (!m) { warnings.push(`${TRACKER_TOOL_AGENT}.md has no frontmatter`); return []; }
  const wanted = trackerToolNames(cfg);
  const fm = rewriteTrackerTools(m[1], wanted);
  if (fm === m[1]) return [];
  writeTextAtomic(f, txt.replace(m[0], `---\n${fm.replace(/\n$/, "")}\n---`));
  return [`${TRACKER_TOOL_AGENT} tracker tools → ${wanted.length ? wanted.join(", ") : "none (adapter " + cfg.tracker.adapter + ")"}`];
}

export function writeMcpJson(p: ProjectPaths, cfg: AllConfig, warnings: string[]): boolean {
  const dev = devOrg(cfg);
  const hp = homePaths();
  // installed copy first (the launcher IS the command: a sh/.cmd script that execs node on the installed JS);
  // fallback to the repo's bin/*.js run with node (fresh clone before install:toolkit)
  const server = (name: string): { command: string; args: string[] } => {
    const installedJs = path.join(hp.toolkit, "node_modules", "orgnauts", "bin", `${name}.js`);
    if (exists(installedJs)) return { command: "node", args: [installedJs] };
    warnings.push(`installed toolkit not found (${installedJs}) — using repo bin/ for ${name}; run \`npm run install:toolkit\``);
    return { command: "node", args: [path.join(p.root, "bin", `${name}.js`)] };
  };
  const mcp = {
    mcpServers: {
      "sf-dev": {
        type: "stdio",
        command: "npx",
        args: ["-y", `@salesforce/mcp@${SF_MCP_VERSION}`, "--orgs", dev.alias, "--toolsets", SF_MCP_TOOLSETS, "--no-telemetry"],
      },
      "orgnauts-evidence": { type: "stdio", ...server("orgnauts-mcp-evidence"), env: { ORGNAUTS_PROJECT_DIR: "${CLAUDE_PROJECT_DIR:-.}" } },
      "orgnauts-ui": { type: "stdio", ...server("orgnauts-mcp-ui"), env: { ORGNAUTS_PROJECT_DIR: "${CLAUDE_PROJECT_DIR:-.}" } },
    },
    _orgnauts: { generated_at: nowIso(), note: "generated by orgnauts-human sync from config/orgs.yaml — preprod has NO MCP server (engine-only); production only via orgnauts-evidence (masked)" },
  };
  writeJsonAtomic(path.join(p.root, ".mcp.json"), mcp);
  return true;
}

export function writeCompiledPolicy(p: ProjectPaths, cfg: AllConfig): boolean {
  const lower = (s: string) => s.toLowerCase();
  const dev = [...new Set([...cfg.orgs.orgs.filter((o) => o.role === "development").map((o) => lower(o.alias)), ...(cfg.policy.allowed_deploy_targets ?? []).map(lower)])]
    .filter((a) => !cfg.orgs.orgs.some((o) => o.role !== "development" && lower(o.alias) === a)); // a non-dev alias can never be a deploy target
  const pre = cfg.orgs.orgs.filter((o) => o.role === "preprod").map((o) => lower(o.alias));
  const ev = cfg.orgs.orgs.filter((o) => o.role === "evidence").map((o) => lower(o.alias));
  const aliasMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfg.policy.alias_map)) aliasMap[k] = v;
  for (const o of cfg.orgs.orgs) { if (o.readonly_user) aliasMap[o.readonly_user] = o.alias; if (o.instance_url) aliasMap[o.instance_url] = o.alias; }
  const compiled = {
    ...DEFAULT_POLICY,
    compiled_at: nowIso(),
    dev_aliases: dev.length ? dev : DEFAULT_POLICY.dev_aliases,
    preprod_aliases: [...new Set([...pre, ...DEFAULT_POLICY.preprod_aliases])],
    evidence_aliases: [...new Set([...ev, ...DEFAULT_POLICY.evidence_aliases])],
    alias_map: aliasMap,
    bluecanvas_patterns: cfg.policy.bluecanvas_remote_patterns.length ? cfg.policy.bluecanvas_remote_patterns.map(lower) : DEFAULT_POLICY.bluecanvas_patterns,
    engine_home: homePaths().engineHome,
    canary_max_age_minutes: cfg.safety.canary_max_age_minutes,
    require_canary: cfg.safety.require_canary_before_data_stages,
    // D-105: the tracker-guard hook keeps the tracker MCP read-only — only these tools, only on this server
    tracker_mcp_server: cfg.tracker.adapter === "mcp" ? trackerMcp(cfg).server : DEFAULT_POLICY.tracker_mcp_server,
    tracker_read_tools: cfg.tracker.adapter === "mcp" ? trackerMcp(cfg).read_tools : DEFAULT_POLICY.tracker_read_tools,
  };
  writeJsonAtomic(path.join(p.state, "policy.compiled.json"), compiled);
  return true;
}

/**
 * Static permission denies for every configured NON-development alias (preprod + evidence) — belt to the policy hook's
 * braces: static rules apply even if a hook times out. They live in the gitignored .claude/settings.local.json (managed
 * block = entries matching SF_ALIAS_DENY_RE), so a user's aliases never reach git; .claude/settings.json ships static
 * `Production*` / `UAT*` rules and is never rewritten by the toolkit.
 */
export const SF_ALIAS_DENY_RE = /^Bash\(sf (project deploy|project delete|data (query|create|update|delete|upsert|import|bulk|tree import)|apex run|org (open|delete)) \* (-o|--target-org) .+\)$/;
export function aliasDenyRules(cfg: AllConfig): string[] {
  const devNames = new Set(cfg.orgs.orgs.filter((o) => o.role === "development").map((o) => o.alias.toLowerCase()));
  const rules: string[] = [];
  for (const o of cfg.orgs.orgs) {
    if (o.role === "development" || devNames.has(o.alias.toLowerCase())) continue;
    for (const flag of ["-o", "--target-org"]) {
      for (const verb of ["project deploy", "data query", "apex run", "data create", "data update", "data delete", "data upsert", "data import"]) rules.push(`Bash(sf ${verb} * ${flag} ${o.alias}*)`);
    }
  }
  return rules;
}
export function syncSettingsDenies(p: ProjectPaths, cfg: AllConfig, warnings: string[]): boolean {
  return writeLocalDenyBlock(p, warnings, SF_ALIAS_DENY_RE, aliasDenyRules(cfg), "alias denies");
}

/** Replace one managed block (entries matching `re`) inside .claude/settings.local.json, keeping everything else. */
function writeLocalDenyBlock(p: ProjectPaths, warnings: string[], re: RegExp, rules: string[], what: string): boolean {
  const file = path.join(p.claude, "settings.local.json");
  let local: { permissions?: { deny?: string[]; allow?: string[] } } & Record<string, unknown> = {};
  if (exists(file)) { try { local = JSON.parse(readText(file)); } catch { warnings.push(`.claude/settings.local.json is not valid JSON — ${what} not written`); return false; } }
  const kept = (local.permissions?.deny ?? []).filter((r) => !re.test(r));
  local._orgnauts = LOCAL_SETTINGS_NOTE;
  local.permissions = { ...(local.permissions ?? {}), deny: [...new Set([...kept, ...rules])] };
  const next = JSON.stringify(local, null, 2) + "\n";
  if (!exists(file) || next !== readText(file)) { fs.mkdirSync(p.claude, { recursive: true }); writeTextAtomic(file, next); return true; }
  return false;
}
export const LOCAL_SETTINGS_NOTE = "machine-specific, gitignored — managed blocks are rewritten by `orgnauts-human sync`: deny rules for the configured preprod/evidence aliases and for every org in this machine's agent keychain that is not a configured development org (alias + username). Re-run sync after `sf org login/logout` or config changes.";

/**
 * Machine-specific static denies in .claude/settings.local.json (gitignored): every org the AGENT keychain knows that is
 * not a configured development org — by alias AND by username — is denied for any `sf` command. The policy hook (R7)
 * already refuses non-development targets; this is the static copy of the same rule for the case a hook times out.
 * Best effort: needs the sf CLI; skipped silently when it is missing (tests, fresh machines).
 */
export const KEYCHAIN_DENY_RE = /^Bash\(sf \* (-o|--target-org)[ =]\S+\)$/;

export function keychainDenyRules(entries: { alias?: string; aliases?: string[]; username?: string }[], devAliases: string[]): { rules: string[]; targets: string[] } {
  const dev = new Set(devAliases.map((a) => a.toLowerCase()));
  const targets = new Set<string>();
  for (const e of entries) {
    const names = [e.alias, ...(e.aliases ?? []), e.username].filter((n): n is string => !!n && !/\s/.test(n));
    if (names.some((n) => dev.has(n.toLowerCase()))) continue; // a development org — the only org agents may target
    for (const n of names) targets.add(n);
  }
  const rules: string[] = [];
  for (const t of [...targets].sort()) for (const flag of ["-o", "--target-org"]) { rules.push(`Bash(sf * ${flag} ${t})`); rules.push(`Bash(sf * ${flag}=${t})`); }
  return { rules, targets: [...targets].sort() };
}

export function readAgentKeychainSync(): { alias?: string; aliases?: string[]; username?: string }[] | undefined {
  if (process.env.ORGNAUTS_OFFLINE === "1") return undefined; // v0.3.0: tests and demos never spawn `sf`
  try {
    const out = execFileSync("sf", ["org", "list", "--all", "--json"], { encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, SF_DISABLE_TELEMETRY: "true", SF_AUTOUPDATE_DISABLE: "true" } });
    const j = JSON.parse(out) as { result?: Record<string, { alias?: string; aliases?: string[]; username?: string }[] | undefined> };
    return Object.values(j.result ?? {}).flatMap((v) => (Array.isArray(v) ? v : []));
  } catch {
    return undefined;
  }
}

export function syncKeychainDenies(p: ProjectPaths, cfg: AllConfig, warnings: string[], entries?: { alias?: string; aliases?: string[]; username?: string }[]): { written: boolean; targets: string[] } {
  const list = entries ?? readAgentKeychainSync();
  if (!list) { warnings.push("sf org list unavailable — machine-specific keychain denies (.claude/settings.local.json) not refreshed"); return { written: false, targets: [] }; }
  const devAliases = cfg.orgs.orgs.filter((o) => o.role === "development").map((o) => o.alias);
  const { rules, targets } = keychainDenyRules(list, devAliases);
  const written = writeLocalDenyBlock(p, warnings, KEYCHAIN_DENY_RE, rules, "keychain denies");
  return { written, targets };
}

export function describeOrgs(cfg: AllConfig): string {
  return cfg.orgs.orgs.map((o) => `${o.alias} (${o.role}, ${o.keychain} keychain${o.write ? ", RW" : ", RO"})`).join(" · ");
}

export function orgRoles(cfg: AllConfig) {
  return { dev: devOrg(cfg), preprod: preprodOrg(cfg), evidence: evidenceOrg(cfg) };
}

export function ensureRuntimeDirs(p: ProjectPaths): void {
  for (const d of [p.work, p.state, p.metrics, path.join(p.state, "sessions"), path.join(p.state, "cache"), path.join(p.state, "canary"), p.baseline, path.join(p.knowledge, "lessons", "PENDING"), path.join(p.knowledge, "lessons", "RETIRED"), path.join(p.agentMemory)]) fs.mkdirSync(d, { recursive: true });
  for (const agent of AGENT_NAMES) {
    const f = path.join(p.agentMemory, agent, "MEMORY.md");
    if (!exists(f)) writeTextAtomic(f, `# ${agent} — notes (UNVERIFIED)\n\nThese are the agent's own notes. They are evidence for the coach, never rules. Approved lessons live in .claude/skills/lessons-${agent}/SKILL.md.\n`);
  }
}
