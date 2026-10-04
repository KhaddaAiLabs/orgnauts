/**
 * doctor — boot conditions (Part 11 §10.1 L-E). FAIL = the system refuses to start.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { tryLoadConfig, configFilePath, CONFIG_FILES, type AllConfig, type OrgConfig } from "../core/config.js";
import { homePaths, projectPaths, packageRoot, type ProjectPaths } from "../core/paths.js";
import { orgList, orgDisplay, soql, sfVersion, type OrgListEntry } from "../core/sf.js";
import { remotes } from "../core/git.js";
import { run, which } from "../core/shell.js";
import { exists, readJsonOr, readText, readTextOr } from "../core/util.js";
import { AGENT_NAMES } from "../core/state-machine.js";
import { runCanary, canaryFresh } from "../privileged/index.js";
import { evidenceDescribe } from "../engines/evidence/query.js";
import { SF_MCP_VERSION, keychainDenyRules, KEYCHAIN_DENY_RE } from "../engines/sync.js";
import { loadSources, loadTrustedDomains, sourceTrusted, curatedLint } from "../engines/mirror.js";
import { emailDeliveryMode, emailCensusFields, trackerMcp } from "../core/config.js";

export type Level = "ok" | "warn" | "fail" | "skip";
export interface Check { id: string; title: string; level: Level; detail: string }

export interface DoctorOptions { p1?: boolean; emailCanary?: boolean; hooksLatency?: boolean; fls?: boolean; quick?: boolean; p?: ProjectPaths }

/** v0.3.0: ORGNAUTS_OFFLINE=1 (set by scripts/run-tests.mjs) — no `sf` process may be spawned; org and CLI checks become skip|warn. */
export function isOffline(): boolean { return process.env.ORGNAUTS_OFFLINE === "1"; }

/** Where an executable sits on PATH, found WITHOUT spawning anything (`which` is itself a process — preflight must answer on a bare PATH). */
export function findOnPath(cmd: string, envPath: string = process.env.PATH ?? ""): string | undefined {
  const exts = process.platform === "win32" ? ["", ".cmd", ".exe", ".bat"] : [""];
  for (const dir of envPath.split(path.delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const f = path.join(dir, cmd + ext);
      try { fs.accessSync(f, fs.constants.X_OK); if (fs.statSync(f).isFile()) return f; } catch { /* not here */ }
    }
  }
  return undefined;
}

export const MIN_NODE = { major: 20, minor: 10 };
export function nodeVersionOk(v: string = process.versions.node): boolean {
  const [major, minor] = v.split(".").map(Number);
  return major > MIN_NODE.major || (major === MIN_NODE.major && (minor ?? 0) >= MIN_NODE.minor);
}

export const SF_INSTALL_HINT = "npm i -g @salesforce/cli";

/**
 * preflight — the prerequisites `orgnauts-human setup` checks BEFORE it asks a single question (also `doctor --preflight`).
 * Same check shape as doctor(). Nothing here needs an org; the only process it may spawn is `sf --version`, and not in offline mode.
 *   0a node ≥ 20.10 (FAIL) · 0b sf CLI (FAIL — stops setup) · 0c git (FAIL) · 0d claude (WARN) · 0e python3 · 0f Playwright (both optional)
 */
export async function preflight(opts: { p?: ProjectPaths } = {}): Promise<{ checks: Check[]; ok: boolean }> {
  const p = opts.p ?? projectPaths();
  const checks: Check[] = [];
  const add = (id: string, title: string, level: Level, detail: string) => checks.push({ id, title, level, detail });
  const nodeOk = nodeVersionOk();
  add("0a", `Node.js ≥ ${MIN_NODE.major}.${MIN_NODE.minor}`, nodeOk ? "ok" : "fail", `node ${process.versions.node}${nodeOk ? "" : " — too old; install Node 20.10 or newer (nvm install 22) and run setup again"}`);
  const sfPath = findOnPath("sf");
  if (!sfPath) add("0b", "Salesforce CLI (sf)", isOffline() ? "skip" : "fail", isOffline() ? `offline (ORGNAUTS_OFFLINE=1) — sf is not on PATH; not counted as a failure in offline mode. Install: ${SF_INSTALL_HINT}` : `not found on PATH — install: ${SF_INSTALL_HINT}   then open a new terminal and run setup again`);
  else if (isOffline()) add("0b", "Salesforce CLI (sf)", "ok", `${sfPath} (version not read: ORGNAUTS_OFFLINE=1)`);
  else { const v = await sfVersion(); add("0b", "Salesforce CLI (sf)", "ok", v ?? `${sfPath} (sf --version gave no answer — run it by hand once)`); }
  const gitPath = findOnPath("git");
  add("0c", "git", gitPath ? "ok" : "fail", gitPath ?? "not found on PATH — install git (the toolkit reads the repo history and your remotes)");
  const claudePath = findOnPath("claude");
  add("0d", "Claude Code (claude)", claudePath ? "ok" : "warn", claudePath ?? "not found on PATH — install Claude Code and check `claude --version`; the agents run inside it (setup itself does not need it)");
  const py = findOnPath("python3");
  add("0e", "python3 (optional — Phase 0 spikes, some sf-skills plugin scripts)", py ? "ok" : "skip", py ?? "not found — optional; only the spikes and some plugin scripts use it");
  const pwPkg = [path.join(p.root, "node_modules", "playwright", "package.json"), path.join(packageRoot(), "node_modules", "playwright", "package.json")].find((f) => exists(f));
  const pwVersion = pwPkg ? readJsonOr<{ version?: string }>(pwPkg, {}).version : undefined;
  add("0f", "Playwright (optional — browser QA in preprod)", pwPkg ? "ok" : "skip", pwPkg ? `playwright ${pwVersion ?? "?"} (${path.dirname(pwPkg)})` : "not installed — optional; npm i -D playwright && npx playwright install chromium when you want browser tests");
  return { checks, ok: !checks.some((c) => c.level === "fail") };
}

export async function doctor(opts: DoctorOptions = {}): Promise<{ checks: Check[]; ok: boolean }> {
  const p = opts.p ?? projectPaths();
  const offline = isOffline();
  const checks: Check[] = [];
  const add = (id: string, title: string, level: Level, detail: string) => checks.push({ id, title, level, detail });

  // 1 config
  const { cfg: partial, errors } = tryLoadConfig(p);
  const cfgErrors = Object.entries(errors);
  const personal = CONFIG_FILES.filter((n) => configFilePath(n, p).source === "personal").length;
  add("1", "config/*.yaml load + validate", cfgErrors.length ? "fail" : "ok", cfgErrors.length ? cfgErrors.map(([k, v]) => `${k}: ${v.split("\n")[0]}`).join(" | ") : `${CONFIG_FILES.length} files valid (${personal} personal in config/, ${CONFIG_FILES.length - personal} from config/defaults/)`);
  const cfg = partial as AllConfig;
  const dev = cfg.orgs?.orgs.find((o) => o.role === "development");
  const pre = cfg.orgs?.orgs.find((o) => o.role === "preprod");
  const ev = cfg.orgs?.orgs.find((o) => o.role === "evidence");

  // 2 tools — in offline mode no `sf` process is spawned at all: the CLI's presence is read from PATH, nothing else
  const sfPath = findOnPath("sf");
  const sfv = offline ? undefined : await sfVersion();
  if (offline) add("2a", "Salesforce CLI (sf)", sfPath ? "skip" : "warn", sfPath ? `offline (ORGNAUTS_OFFLINE=1) — ${sfPath} found, version not read; plugin, keychain and org checks are skipped` : `offline (ORGNAUTS_OFFLINE=1) — sf is not on PATH; install: ${SF_INSTALL_HINT}`);
  else add("2a", "Salesforce CLI (sf)", sfv ? "ok" : "fail", sfv ?? `not found — ${SF_INSTALL_HINT}`);
  add("2b", "Node.js", nodeVersionOk() ? "ok" : "fail", `node ${process.versions.node} (need ≥ ${MIN_NODE.major}.${MIN_NODE.minor})`);
  add("2c", "git", (await which("git")) ? "ok" : "fail", (await which("git")) ?? "not found");
  for (const tool of ["python3", "jq"]) add(`2d-${tool}`, `${tool} (needed by the sf-skills plugin scripts)`, (await which(tool)) ? "ok" : "warn", (await which(tool)) ?? "not found — plugin hooks/skills will degrade");
  if (offline) add("2e", "sf plugins: code-analyzer + plugin-flow", "skip", "offline — `sf plugins` not run");
  else {
    const ca = await run("sf", ["plugins"], { timeoutMs: 60_000 });
    const plugins = parseSfPlugins(ca.stdout);
    add("2e", "sf plugins: code-analyzer + plugin-flow", plugins.codeAnalyzer && plugins.flow ? "ok" : "warn", ca.code === 0 ? [plugins.codeAnalyzer ? `code-analyzer ${plugins.codeAnalyzer}` : "code-analyzer missing (sf plugins install code-analyzer)", plugins.flow ? `flow ${plugins.flow}` : "plugin-flow missing (sf plugins install @salesforce/plugin-flow)"].join("; ") : "could not list plugins");
  }
  if (process.env.SFDX_AUTO_DEPLOY === "1") add("2f", "SFDX_AUTO_DEPLOY", "fail", "SFDX_AUTO_DEPLOY=1 makes the sf-skills plugin auto-deploy on every edit — unset it (deploys must be explicit orgnauts steps)");

  // 2g default target-org: agents' bare `sf` commands would hit it — it must be unset or the development org
  if (sfv && cfg.orgs) {
    const r = await run("sf", ["config", "get", "target-org", "--json"], { timeoutMs: 20_000 });
    const val = (() => { try { const j = JSON.parse(r.stdout) as { result?: { value?: string }[] }; return j.result?.[0]?.value; } catch { return undefined; } })();
    const devAliases = cfg.orgs.orgs.filter((o) => o.role === "development").map((o) => o.alias.toLowerCase());
    add("2g", "default sf target-org is unset or the development org", !val || devAliases.includes(String(val).toLowerCase()) ? "ok" : "fail", val ? `target-org = ${val}${devAliases.includes(String(val).toLowerCase()) ? "" : " — run: sf config unset target-org (agents must always name the org explicitly)"}` : "unset");
  } else if (offline && cfg.orgs) add("2g", "default sf target-org is unset or the development org", "skip", "offline — `sf config get target-org` not run");

  // 2h — plan-lint checks every plan against org/sfdx-project.json → sourceApiVersion; `orgnauts agent cache freshen` records the
  // development org's real API version in .orgnauts/cache/org.json. When the two differ, a plan can name a feature the project
  // version does not know yet (or the org does not have yet).
  {
    const proj = readJsonOr<{ sourceApiVersion?: string }>(path.join(p.org, "sfdx-project.json"), {});
    const orgCache = readJsonOr<{ apiVersion?: string; alias?: string; fetched_at?: string }>(path.join(p.state, "cache", "org.json"), {});
    if (!proj.sourceApiVersion) add("2h", "sourceApiVersion (org/sfdx-project.json)", "warn", "org/sfdx-project.json has no sourceApiVersion — set it to the version your development org runs (`sf org display` shows it)");
    else if (orgCache.apiVersion && orgCache.apiVersion !== proj.sourceApiVersion) add("2h", "sourceApiVersion (org/sfdx-project.json)", "warn", `sfdx-project.json says ${proj.sourceApiVersion}, ${orgCache.alias ?? "the development org"} runs ${orgCache.apiVersion} — plans are checked against sfdx-project.json — set it to the org's version`);
    else add("2h", "sourceApiVersion (org/sfdx-project.json)", "ok", orgCache.apiVersion ? `${proj.sourceApiVersion} — matches ${orgCache.alias ?? "the development org"} (read ${orgCache.fetched_at ?? "by cache freshen"})` : `${proj.sourceApiVersion} — the org's version is unknown until \`orgnauts agent cache freshen\` runs; check it then`);
  }

  // 3/4 keychains
  let agentOrgs: OrgListEntry[] = [];
  let engineOrgs: OrgListEntry[] = [];
  if (sfv && cfg.orgs) {
    const a = await orgList("agent");
    agentOrgs = a.data ?? [];
    add("3a", "AGENT keychain lists the development org", dev && agentOrgs.some((o) => matchAlias(o, dev)) ? "ok" : "fail", dev ? (agentOrgs.some((o) => matchAlias(o, dev)) ? `${dev.alias} present` : `${dev.alias} missing — orgnauts-human org login --keychain agent --alias ${dev.alias} --role development`) : "no development org in config");
    if (ev) add("3b", "AGENT keychain lists the evidence (production) org", agentOrgs.some((o) => matchAlias(o, ev)) ? "ok" : "fail", agentOrgs.some((o) => matchAlias(o, ev)) ? `${ev.alias} present` : `${ev.alias} missing — log in with the READ-ONLY user`);
    if (pre) {
      const leak = agentOrgs.find((o) => matchAlias(o, pre));
      add("3c", "P1c: preprod is NOT in the AGENT keychain", leak ? "fail" : "ok", leak ? `${pre.alias} (${leak.username}) is in the agent keychain — remove it: sf org logout -o ${pre.alias}` : "preprod auth is engine-only");
      const e = await orgList("engine");
      engineOrgs = e.data ?? [];
      add("4a", "ENGINE keychain lists preprod", engineOrgs.some((o) => matchAlias(o, pre)) ? "ok" : "fail", engineOrgs.some((o) => matchAlias(o, pre)) ? `${pre.alias} present in ${homePaths().engineHome}` : `${pre.alias} missing — orgnauts-human org login --keychain engine --alias ${pre.alias} --role preprod`);
      const extra = engineOrgs.filter((o) => !matchAlias(o, pre));
      if (extra.length) add("4b", "ENGINE keychain holds only preprod", "warn", `also has: ${extra.map((o) => o.alias ?? o.username).join(", ")} — keep the engine keychain minimal`);
    } else add("3c", "preprod org", "warn", "no preprod org configured — baseline sync and preprod QA are skipped (flag no_preprod)");
    // 6 admin prod login leak (live: sf org display may refresh a token → skipped in quick mode)
    if (ev && opts.quick) add("6", "No second (admin) production login in the AGENT keychain", "skip", "quick mode — run `orgnauts-human doctor` (without --quick) for live org checks");
    if (ev && !opts.quick) {
      const evDisp = await orgDisplay(ev.alias, ev.keychain);
      const evHost = evDisp.data?.instanceUrl ? new URL(evDisp.data.instanceUrl).host : undefined;
      const others = agentOrgs.filter((o) => o.instanceUrl && evHost && new URL(o.instanceUrl).host === evHost && !matchAlias(o, ev));
      add("6", "No second (admin) production login in the AGENT keychain", others.length ? "fail" : "ok", others.length ? `${others.map((o) => o.username).join(", ")} also point at ${evHost} — log them out of this machine's default keychain (use another OS user/machine for admin work)` : evHost ? `only ${ev.alias} points at ${evHost}` : "evidence org not reachable — cannot verify");
      if (ev.readonly_user && evDisp.data?.username && evDisp.data.username.toLowerCase() !== ev.readonly_user.toLowerCase()) add("6b", "Evidence alias uses the configured read-only user", "fail", `${ev.alias} is ${evDisp.data.username}, config says ${ev.readonly_user}`);
      // 5 P1 identity
      if (opts.p1 && evDisp.ok && evDisp.data?.username) {
        const u = await soql(`SELECT Id FROM User WHERE Username = '${evDisp.data.username.replace(/'/g, "")}'`, ev.alias, { keychain: ev.keychain });
        const uid = u.data?.records?.[0]?.Id as string | undefined;
        if (!uid) add("5", "P1 identity: read-only permissions", "fail", `could not resolve user id for ${evDisp.data.username}: ${u.error ?? "no rows"}`);
        else {
          const q = `SELECT Name, PermissionsModifyAllData, PermissionsModifyMetadata, PermissionsAuthorApex, PermissionsCustomizeApplication, PermissionsViewSetup FROM PermissionSet WHERE Id IN (SELECT PermissionSetId FROM PermissionSetAssignment WHERE AssigneeId = '${uid}')`;
          const r = await soql(q, ev.alias, { keychain: ev.keychain });
          if (!r.ok || !r.data) add("5", "P1 identity: read-only permissions", "fail", `permission query failed: ${r.error}`);
          else {
            const bad = r.data.records.filter((x) => x.PermissionsModifyAllData || x.PermissionsModifyMetadata || x.PermissionsAuthorApex || x.PermissionsCustomizeApplication);
            const viewSetup = r.data.records.some((x) => x.PermissionsViewSetup);
            add("5", "P1 identity: production user cannot Modify All Data / Modify Metadata / Author Apex / Customize Application", bad.length ? "fail" : "ok", bad.length ? `granted via: ${bad.map((x) => x.Name).join(", ")} — production is NOT read-only for this user` : `${r.data.records.length} permission set(s) checked, none grant write`);
            add("5b", "P1 identity: View Setup and Configuration (needed for Tooling/SetupAuditTrail facts)", viewSetup ? "ok" : "warn", viewSetup ? "granted" : "missing — prod metadata facts via Tooling will be limited");
          }
        }
      } else if (opts.p1) add("5", "P1 identity", "fail", `evidence org not reachable: ${evDisp.error ?? "unknown"}`);
    }
  } else if (offline && cfg.orgs) {
    // honest skips: the keychain and org checks need `sf`, which offline mode forbids — say so instead of staying silent
    add("3a", "AGENT keychain lists the development org", "skip", `offline (ORGNAUTS_OFFLINE=1) — keychains not read; run \`orgnauts-human doctor\` without ORGNAUTS_OFFLINE for the live checks (3a–6b, 9g${opts.p1 ? ", 5" : ""})`);
    if (pre) add("4a", "ENGINE keychain lists preprod", "skip", "offline — not read");
    if (ev) add("6", "No second (admin) production login in the AGENT keychain", "skip", "offline — not read");
  }

  // 7 Blue Canvas remotes
  const rem = await remotes(p.root);
  const bc = rem.filter((r) => (cfg.policy?.bluecanvas_remote_patterns ?? ["bluecanvas"]).some((pat) => r.url.toLowerCase().includes(pat.toLowerCase())));
  add("7", "P1b: no Blue Canvas git remote in this repo", bc.length ? "fail" : "ok", bc.length ? `remove: ${bc.map((r) => `${r.name} → ${r.url}`).join(", ")}` : rem.length ? `${rem.length} remote(s), none Blue Canvas` : "no remotes");

  // 8 .mcp.json
  const mcp = readJsonOr<{ mcpServers?: Record<string, { args?: string[] }> }>(path.join(p.root, ".mcp.json"), {});
  const sfdev = mcp.mcpServers?.["sf-dev"];
  const orgsArg = sfdev?.args?.[sfdev.args.indexOf("--orgs") + 1];
  const badServers = Object.keys(mcp.mcpServers ?? {}).filter((k) => /uat|preprod|prod/i.test(k) && k !== "orgnauts-evidence");
  add("8", ".mcp.json: sf-dev bound to the development org only, no preprod/prod servers", !sfdev ? "fail" : orgsArg !== dev?.alias || badServers.length ? "fail" : "ok", !sfdev ? "sf-dev server missing — run orgnauts-human sync" : orgsArg !== dev?.alias ? `sf-dev --orgs is "${orgsArg}", expected "${dev?.alias}" — run orgnauts-human sync` : badServers.length ? `remove servers: ${badServers.join(", ")}` : `sf-dev → ${orgsArg} (@salesforce/mcp ${sfdev.args?.find((a) => a.startsWith("@salesforce/mcp"))?.split("@").pop() ?? "?"}; pinned ${SF_MCP_VERSION})`);

  // 8b tracker (D-105): mcp → the intake agent must carry the server's READ tools; jira → env vars; file → inbox
  {
    const tr = cfg.tracker;
    if (!tr) add("8b", "tracker adapter", "warn", "config/tracker.yaml did not load");
    else if (tr.adapter === "mcp") {
      const mcpCfg = trackerMcp({ tracker: tr });
      const a1 = exists(path.join(p.agents, "a1-intake.md")) ? fs.readFileSync(path.join(p.agents, "a1-intake.md"), "utf8") : "";
      const toolsLine = /^tools:\s*(.*)$/m.exec(a1)?.[1] ?? "";
      const missing = mcpCfg.read_tools.filter((t) => !toolsLine.includes(`mcp__${mcpCfg.server}__${t}`));
      const writeInTools = /mcp__[a-z0-9_-]+__(add|edit|create|transition|update|delete)[A-Za-z]*/i.exec(toolsLine)?.[0];
      add("8b", `tracker: MCP "${mcpCfg.server}" (${mcpCfg.kind ?? "tracker"}), read-only tools on a1-intake`, writeInTools ? "fail" : missing.length ? "fail" : "ok",
        writeInTools ? `a1-intake lists a WRITE tool (${writeInTools}) — remove it; Orgnauts never posts to the tracker` : missing.length ? `a1-intake.md tools line lacks ${missing.map((t) => `mcp__${mcpCfg.server}__${t}`).join(", ")} — run orgnauts-human sync` : `${mcpCfg.read_tools.length} read tool(s) on a1-intake; the server must be connected in Claude Code (claude mcp list → "${mcpCfg.server}"); no tracker credential is held by the toolkit`);
    } else if (tr.adapter === "jira") {
      const have = [tr.jira.email_env, tr.jira.token_env].filter((e) => !!process.env[e]);
      add("8b", "tracker: Jira REST adapter credentials", have.length === 2 ? "ok" : "warn", have.length === 2 ? `${tr.jira.base_url} (env ${tr.jira.email_env}, ${tr.jira.token_env} set)` : `set ${[tr.jira.email_env, tr.jira.token_env].filter((e) => !process.env[e]).join(" and ")} in the environment (read-only API token) — or switch to the MCP adapter: tracker.adapter: mcp`);
    } else add("8b", "tracker: file adapter (inbox/<KEY>.md)", "ok", "no tracker connected — paste tickets into inbox/ (templates/inbox-ticket.md); `tracker.adapter: mcp` connects Jira or any tracker with an MCP server");
  }

  // 9 hooks + plugin + settings
  const settings = readJsonOr<{ hooks?: Record<string, unknown>; permissions?: { deny?: string[] } }>(path.join(p.claude, "settings.json"), {});
  const hooksOk = !!settings.hooks && ["PreToolUse", "SubagentStop", "Stop", "UserPromptSubmit", "PostToolUse", "SessionStart"].every((k) => k in (settings.hooks ?? {}));
  add("9a", ".claude/settings.json wires the Orgnauts hooks", hooksOk ? "ok" : "fail", hooksOk ? `${Object.keys(settings.hooks ?? {}).length} hook events` : "missing hook events — restore .claude/settings.json from the repo");
  add("9b", "static deny rules present", settings.permissions?.deny?.some((d) => d.includes("orgnauts-human")) ? "ok" : "fail", settings.permissions?.deny?.length ? `${settings.permissions.deny.length} deny rules` : "no deny rules");
  const pluginDir = path.join(os.homedir(), ".claude", "plugins");
  const pluginFound = exists(pluginDir) && findDir(pluginDir, "salesforce-development", 4);
  add("9c", "sf-skills plugin (salesforce-development) installed", pluginFound ? "ok" : "warn", pluginFound ? pluginFound : "not found under ~/.claude/plugins — in Claude Code: /plugin marketplace add ./  →  /plugin install salesforce-development@orgnauts-pinned");
  const userSettings = readJsonOr<{ autoMemoryEnabled?: boolean }>(path.join(os.homedir(), ".claude", "settings.json"), {});
  add("9d", "autoMemoryEnabled (agent notes channel)", userSettings.autoMemoryEnabled === false ? "warn" : "ok", userSettings.autoMemoryEnabled === false ? "off — agent MEMORY.md notes will not load; approved lessons still inject via skills" : "on/default");
  const hp = homePaths();
  const installedPkg = readJsonOr<{ version?: string }>(path.join(hp.toolkit, "node_modules", "orgnauts", "package.json"), {});
  const repoPkg = readJsonOr<{ version?: string }>(path.join(p.root, "package.json"), {});
  add("9e", "installed toolkit copy (~/.orgnauts/bin) matches repo version", !installedPkg.version ? "fail" : installedPkg.version === repoPkg.version ? "ok" : "warn", !installedPkg.version ? `not installed — npm run install:toolkit (hooks call ${hp.bin})` : `installed ${installedPkg.version} · repo ${repoPkg.version}`);
  if (!exists(path.join(p.state, "policy.compiled.json"))) add("9f", "compiled policy for fast hooks", "warn", "missing — run orgnauts-human sync (hooks fall back to built-in defaults)");
  // 9h — v0.3.0: `npm test` must be offline for real (the v0.2 suite pinged every org in the developer's keychain through
  // `sf org display`/`sf org list`). Proven by reading the runner: it has to set ORGNAUTS_OFFLINE for the whole suite.
  {
    const runner = [path.join(p.root, "scripts", "run-tests.mjs"), path.join(packageRoot(), "scripts", "run-tests.mjs")].find((f) => exists(f));
    const setsOffline = !!runner && /ORGNAUTS_OFFLINE/.test(readTextOr(runner, ""));
    add("9h", "tests are offline (scripts/run-tests.mjs sets ORGNAUTS_OFFLINE)", !runner ? "warn" : setsOffline ? "ok" : "warn", !runner ? "scripts/run-tests.mjs not found — cannot prove the test suite stays off the keychain" : setsOffline ? `${runner} sets ORGNAUTS_OFFLINE — npm test cannot reach an org or the sf keychain` : `${runner} does not set ORGNAUTS_OFFLINE — npm test may ping every org in your keychain through sf; restore the v0.3.0 runner`);
  }
  // 9g machine-specific static denies: every non-development org in the agent keychain must be denied in settings.local.json
  if (sfv && cfg.orgs && agentOrgs.length) {
    const devAliases = cfg.orgs.orgs.filter((o) => o.role === "development").map((o) => o.alias);
    const want = keychainDenyRules(agentOrgs, devAliases);
    const local = readJsonOr<{ permissions?: { deny?: string[] } }>(path.join(p.claude, "settings.local.json"), {});
    const have = new Set((local.permissions?.deny ?? []).filter((r) => KEYCHAIN_DENY_RE.test(r)));
    const missing = want.rules.filter((r) => !have.has(r));
    add("9g", "static denies cover every non-development org in the AGENT keychain (.claude/settings.local.json)", want.targets.length === 0 ? "ok" : missing.length ? "warn" : "ok", want.targets.length === 0 ? "keychain holds only the development org" : missing.length ? `${missing.length} rule(s) missing for ${want.targets.join(", ")} — run orgnauts-human sync` : `${want.targets.length} target(s) denied: ${want.targets.join(", ")}`);
  }

  // 10 canary
  if (opts.emailCanary && dev && offline) add("10", "email canary", "skip", `offline (ORGNAUTS_OFFLINE=1) — canary not run; run \`orgnauts agent canary --org ${dev.alias}\` without ORGNAUTS_OFFLINE`);
  else if (opts.emailCanary && dev) {
    for (const o of [dev, pre].filter((x): x is OrgConfig => !!x)) {
      try { const st = await runCanary(o.alias, { p, cfg }); add(`10-${o.alias}`, `email canary on ${o.alias}`, st.result === "pass" ? "ok" : "fail", st.detail); }
      catch (e) { add(`10-${o.alias}`, `email canary on ${o.alias}`, "fail", (e as Error).message); }
    }
  } else if (dev) {
    // D-097: judge the last result the way the data-guard hook will — a PASS older than canary_max_age_minutes is
    // stale and the first data step of a2-repro will be DENIED, so a green here would be a lie (same defect D-092
    // fixed in the UI card; the doctor was missed)
    const st = readJsonOr<{ at: string; result: string; detail?: string } | undefined>(path.join(p.state, "canary", `${dev.alias}.json`), undefined);
    if (!st) add("10", "email canary (last result)", "warn", "never run — orgnauts agent canary --org " + dev.alias + " (data-guard will deny data steps until a fresh PASS exists)");
    else if (cfg.safety) {
      const f = canaryFresh(cfg, p, dev.alias);
      const ageMin = Math.round((Date.now() - new Date(st.at).getTime()) / 60_000);
      add("10", "email canary (last result)", f.fresh ? "ok" : "warn", f.fresh ? `pass ${ageMin} min ago (fresh, max ${cfg.safety.canary_max_age_minutes})` : `${f.reason} — data-guard will DENY a2/a5 data steps until you rerun: orgnauts agent canary --org ${dev.alias}`);
    } else add("10", "email canary (last result)", st.result === "pass" ? "ok" : "warn", `${st.result} at ${st.at}`);
  }

  // 11 hooks latency
  if (opts.hooksLatency) {
    const hookBin = exists(path.join(hp.bin, "orgnauts-hook")) ? path.join(hp.bin, "orgnauts-hook") : path.join(p.root, "bin", "orgnauts-hook.js");
    for (const h of ["agent-gate", "policy", "write-guard", "data-guard"]) {
      const input = JSON.stringify({ session_id: "doctor", cwd: p.root, hook_event_name: "PreToolUse", tool_name: h === "policy" ? "Bash" : h === "agent-gate" ? "Agent" : h === "data-guard" ? "mcp__sf-dev__run_soql_query" : "Edit", tool_input: h === "policy" ? { command: "ls" } : h === "agent-gate" ? { subagent_type: "a0-cartographer" } : { file_path: path.join(p.root, "org", "force-app", "x.cls") } });
      const r = await run(hookBin.endsWith(".js") ? "node" : hookBin, hookBin.endsWith(".js") ? [hookBin, h] : [h], { input, timeoutMs: 10_000, env: { CLAUDE_PROJECT_DIR: p.root } });
      add(`11-${h}`, `hook latency: ${h}`, r.durationMs < 300 ? "ok" : r.durationMs < 2000 ? "warn" : "fail", `${r.durationMs} ms (deny hooks must answer fast — a timed-out hook does not block)`);
    }
  }

  // 12 FLS / masking vs evidence describe
  if (opts.fls && ev && cfg.masking && offline) add("12", "masking allowlists vs production describe", "skip", "offline (ORGNAUTS_OFFLINE=1) — the evidence org is not described");
  else if (opts.fls && ev && cfg.masking) {
    for (const [obj, m] of Object.entries(cfg.masking.objects)) {
      try {
        const d = await evidenceDescribe(obj, { cfg, p });
        const types = new Map(d.fields.map((f) => [f.name.toLowerCase(), f.type.toLowerCase()]));
        const missing = m.allow.filter((f) => !f.includes(".") && !types.has(f.toLowerCase()));
        const badType = m.allow.filter((f) => ["email", "phone"].includes(types.get(f.toLowerCase()) ?? ""));
        add(`12-${obj}`, `masking allowlist for ${obj} vs production describe`, badType.length ? "fail" : missing.length ? "warn" : "ok", badType.length ? `Email/Phone typed fields in allowlist: ${badType.join(", ")}` : missing.length ? `not visible to the read-only user (FLS?) or misspelled: ${missing.join(", ")}` : `${m.allow.length} fields ok`);
      } catch (e) { add(`12-${obj}`, `masking allowlist for ${obj}`, "warn", (e as Error).message); }
    }
  }

  // 13 oracle cache
  const cacheDir = path.join(p.state, "cache", "describe");
  add("13", "oracle cache (plan-lint/semantic-check)", exists(cacheDir) && fs.readdirSync(cacheDir).length ? "ok" : "warn", exists(cacheDir) && fs.readdirSync(cacheDir).length ? `${fs.readdirSync(cacheDir).length} object describe(s) cached` : "empty — a3-architect runs `orgnauts agent cache freshen <KEY>` at plan time (or run it now)");
  add("14", "package schemas/templates present", exists(path.join(packageRoot(), "schemas", "manifest.schema.json")) ? "ok" : "fail", packageRoot());

  // 15 — D-095: reasoning effort. Report what will actually apply, and warn loudly about the one thing that
  // silently overrides everything: CLAUDE_CODE_EFFORT_LEVEL beats agent frontmatter (documented Claude Code
  // precedence). Without this line a per-agent effort matrix can be configured, synced, and quietly ignored.
  {
    const envEffort = process.env.CLAUDE_CODE_EFFORT_LEVEL;
    const declared: { agent: string; effort?: string }[] = AGENT_NAMES.map((agentName: string) => {
      const f = path.join(p.agents, `${agentName}.md`);
      const fm = exists(f) ? readTextOr(f, "").split("\n---")[0] : "";
      return { agent: agentName, effort: /^effort:\s*(\S+)/m.exec(fm)?.[1] };
    });
    const withEffort = declared.filter((d) => !!d.effort);
    if (envEffort) {
      add("15", "reasoning effort (per-agent, D-095)", "warn",
        `CLAUDE_CODE_EFFORT_LEVEL=${envEffort} is set in this environment and OVERRIDES the effort in .claude/agents/*.md — ${withEffort.length} agent(s) configure their own and none of them will apply. Unset it (remove it from your shell profile) or accept one level for every agent.`);
    } else if (!withEffort.length) {
      add("15", "reasoning effort (per-agent, D-095)", "warn",
        "no agent declares an effort — every agent inherits the session level (~/.claude/settings.json → effortLevel, or --effort). Set config/models.yaml → effort and run orgnauts-human sync to spend reasoning where the work is hard.");
    } else {
      const summary = withEffort.map((d) => `${d.agent}=${d.effort}`).join(" · ");
      add("15", "reasoning effort (per-agent, D-095)", withEffort.length === AGENT_NAMES.length ? "ok" : "warn",
        `${withEffort.length}/${AGENT_NAMES.length} agent(s) declare effort — ${summary}${withEffort.length === AGENT_NAMES.length ? "" : "; the rest inherit the session level"}`);
    }
    // prices: a model with no price records usd: 0, which quietly disables the USD budgets (D-094)
    const priced = Object.keys(cfg.budgets?.prices ?? {});
    const overrideFile = exists(path.join(p.metrics, "prices.json"));
    const models = [...new Set(Object.values(cfg.models?.agents ?? {}).filter((m) => m && m !== "inherit"))];
    const unpriced = models.filter((m) => !priced.some((k) => m.toLowerCase().includes(k.toLowerCase())));
    add("16", "model prices (USD budgets, D-094)",
      overrideFile ? "ok" : !priced.length ? "warn" : unpriced.length ? "warn" : "ok",
      overrideFile ? "metrics/prices.json present — it overrides config/budgets.yaml → prices"
        : !priced.length ? "no prices configured — every run records usd: 0, so the daily/per-ticket USD budgets never fire and the dashboard reads $0. Add config/budgets.yaml → prices."
        : unpriced.length ? `no price entry matches: ${unpriced.join(", ")} — those runs record no cost. Add a key to config/budgets.yaml → prices (matched as a substring of the model id).`
        : `${priced.length} price key(s) from config/budgets.yaml: ${priced.join(", ")} — review them against your own plan`);
  }

  // 17 P12 — knowledge provenance: mirror sources on trusted domains only; curated notes carry source/author/trust
  {
    const trusted = loadTrustedDomains(p);
    const badSources = loadSources(p).filter((s) => !sourceTrusted(s.url, trusted).ok);
    const cur = curatedLint(p);
    add("17", "knowledge sources (P12: official docs + curated with provenance)",
      badSources.length ? "fail" : cur.ok ? "ok" : "warn",
      badSources.length ? `${badSources.length} mirror source(s) on a non-Salesforce host — remove from knowledge/mirror/sources.yaml: ${badSources.map((s) => s.url).join(", ")}`
        : cur.ok ? `${loadSources(p).length} mirror source(s) on trusted domains · ${cur.files} curated note(s) with provenance · agents cannot browse (repo-checks #7)`
        : `${cur.problems.length} curated note(s) without provenance — agents must not cite them: ${cur.problems.slice(0, 4).join("; ")}`);
  }
  // 18 D-102 — e-mail containment mode
  if (cfg.safety) {
    const mode = emailDeliveryMode(cfg.safety);
    add("18", "e-mail containment (P9 / D-102)", "ok",
      mode === "blocked"
        ? `mode blocked — the canary must prove the development org refuses to send; allowlist: ${cfg.safety.allowed_test_emails.join(", ")}`
        : `mode allowlist_only — delivery may be ON; the canary runs an e-mail census over ${emailCensusFields(cfg.safety).join(", ")} and FAILS on any address outside: ${cfg.safety.allowed_test_emails.join(", ")}`);
  }

  const ok = !checks.some((c) => c.level === "fail");
  return { checks, ok };
}

function matchAlias(o: OrgListEntry, cfgOrg: OrgConfig): boolean {
  const a = cfgOrg.alias.toLowerCase();
  return (o.alias ?? "").toLowerCase() === a || (o.aliases ?? []).some((x) => x.toLowerCase() === a) || (!!cfgOrg.readonly_user && (o.username ?? "").toLowerCase() === cfgOrg.readonly_user.toLowerCase());
}

function findDir(root: string, name: string, depth: number): string | undefined {
  if (depth < 0) return undefined;
  try {
    for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const full = path.join(root, ent.name);
      if (ent.name === name) return full;
      const r = findDir(full, name, depth - 1);
      if (r) return r;
    }
  } catch { /* ignore */ }
  return undefined;
}

export function formatChecks(checks: Check[]): string {
  const icon = (l: Level) => (l === "ok" ? "✅" : l === "warn" ? "⚠️ " : l === "fail" ? "❌" : "·");
  return checks.map((c) => `${icon(c.level)} [${c.id}] ${c.title}\n     ${c.detail}`).join("\n");
}

export function readSettingsJsonSafe(p: ProjectPaths): unknown {
  try { return JSON.parse(readText(path.join(p.claude, "settings.json"))); } catch { return undefined; }
}

/** `sf plugins` lists installed plugins by short name (`flow 2.0.1`), then an "Uninstalled JIT Plugins" section that must not count. */
export function parseSfPlugins(stdout: string): { codeAnalyzer?: string; flow?: string } {
  const installed = stdout.split(/uninstalled jit plugins/i)[0] ?? "";
  const pick = (re: RegExp) => installed.match(re)?.[1];
  return {
    codeAnalyzer: pick(/^(?:@salesforce\/(?:plugin-)?)?code-analyzer\s+(\S+)/m),
    flow: pick(/^(?:@salesforce\/plugin-)?flow\s+(\S+)/m),
  };
}
