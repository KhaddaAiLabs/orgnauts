/**
 * test/helpers.mjs — a throwaway Orgnauts project in a temp dir (config, schemas, templates, knowledge, .claude, org, git).
 * Every test gets its own root so state never leaks; ORGNAUTS_PROJECT_DIR points at it for hook subprocesses.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as import_child from "node:child_process";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function makeProject(opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "orgnauts-test-"));
  for (const d of ["schemas", "templates", "knowledge", ".claude", "org"]) {
    fs.cpSync(path.join(REPO, d), path.join(root, d), { recursive: true, filter: (src) => !/node_modules|\.baseline|settings\.local\.json/.test(src) });
  }
  // config: ONLY the tracked defaults — a developer's personal config/*.yaml (gitignored) must never leak into a test
  fs.cpSync(path.join(REPO, "config", "defaults"), path.join(root, "config", "defaults"), { recursive: true });
  fs.mkdirSync(path.join(root, "work"), { recursive: true });
  fs.mkdirSync(path.join(root, "inbox"), { recursive: true });
  fs.mkdirSync(path.join(root, ".orgnauts", "sessions"), { recursive: true });
  fs.mkdirSync(path.join(root, "metrics"), { recursive: true });
  // a demo ticket for the file adapter
  fs.copyFileSync(path.join(REPO, "templates", "inbox-ticket.md"), path.join(root, "inbox", "DEMO-101.md"));
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "tests@example.com");
  git("config", "user.name", "orgnauts tests");
  fs.writeFileSync(path.join(root, ".gitignore"), "work/\n.orgnauts/\nmetrics/\n");
  git("add", "-A");
  git("commit", "-q", "-m", "test baseline");
  if (opts.env !== false) process.env.ORGNAUTS_PROJECT_DIR = root;
  return root;
}

export function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
}

export function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
export function writeJson(file, obj) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(obj, null, 2)); }
export function write(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }

/** run an installed-style hook exactly like Claude Code does: JSON on stdin, JSON/exit code out */
export function runHook(root, name, payload, extraEnv = {}) {
  const r = execFileSyncSafe("node", [path.join(REPO, "bin", "orgnauts-hook.js"), name], JSON.stringify({ cwd: root, session_id: "test-session", ...payload }), { ...process.env, ORGNAUTS_PROJECT_DIR: root, ...extraEnv });
  let json;
  try { json = r.stdout.trim() ? JSON.parse(r.stdout.trim().split("\n").pop()) : undefined; } catch { json = undefined; }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json, denied: json?.hookSpecificOutput?.permissionDecision === "deny", reason: json?.hookSpecificOutput?.permissionDecisionReason ?? json?.reason ?? r.stderr };
}

function execFileSyncSafe(cmd, args, input, env) {
  return import_child.spawnSync(cmd, args, { input, encoding: "utf8", env });
}

/** run the agent CLI in the temp project */
export function agentCli(root, args) {
  const r = import_child.spawnSync("node", [path.join(REPO, "bin", "orgnauts.js"), "agent", ...args], { encoding: "utf8", env: { ...process.env, ORGNAUTS_PROJECT_DIR: root } });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}
export function humanCli(root, args) {
  const r = import_child.spawnSync("node", [path.join(REPO, "bin", "orgnauts-human.js"), ...args], { encoding: "utf8", env: { ...process.env, ORGNAUTS_PROJECT_DIR: root } });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** D-107: a valid `visual` block for intake/plan fixtures (visual-check renders work/<KEY>/visuals/<stage>.html from it). */
export const VISUAL = {
  issue: { headline: "Critical web cases keep the submitting user as owner", steps: ["A web form creates a Case with Priority = Critical", "The before-save flow Case_BeforeSave_Routing evaluates the owner rule", "The rule tests Origin = 'Email' and is false for web cases"], where_it_breaks: "Case_BeforeSave_Routing → decision Route_By_Origin → the Critical branch is never reached for Origin = Web" },
  fix: { headline: "Route by Priority as well as Origin so Critical web cases reach the escalation queue", steps: ["Add a Priority = Critical outcome to Route_By_Origin", "Assign OwnerId = Regional_Escalation queue on that outcome", "Keep the Email branch unchanged"] },
  example: { record: "Case 00012345, Origin = Web, Priority = Critical, created by a portal user", today: "Owner stays the portal user; nobody in support sees it", expected: "Owner = Regional Escalation queue within the same save" },
  mermaid: { issue: "flowchart LR\n  A[Web Case created] --> B{Origin = Email?}\n  B -- no --> C[owner unchanged]\n  B -- yes --> D[queue]", fix: "flowchart LR\n  A[Web Case created] --> B{Origin = Email OR Priority = Critical?}\n  B -- yes --> D[Regional Escalation queue]\n  B -- no --> C[owner unchanged]" },
};
