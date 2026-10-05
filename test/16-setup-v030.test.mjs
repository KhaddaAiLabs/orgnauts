/**
 * v0.3.0 first-run experience: `setup --quick` (5 questions, tracker through Claude Code MCP), the prerequisites table that
 * runs BEFORE any question (preflight), an honest offline doctor (no `sf` process may leave it under ORGNAUTS_OFFLINE=1),
 * and the offline test runner itself.
 *
 * The `sf` shim: a shell script on PATH that appends every invocation to a marker file and answers in the CLI's shape.
 * "No sf call happened" is then a missing file, and the positive control (the same call without offline mode) proves the
 * shim is reachable — a zero without that control would prove nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import { makeProject, cleanup, REPO } from "./helpers.mjs";

const HUMAN = path.join(REPO, "bin", "orgnauts-human.js");
const DOCTOR_URL = pathToFileURL(path.join(REPO, "dist", "doctor", "index.js")).href;
const PATHS_URL = pathToFileURL(path.join(REPO, "dist", "core", "paths.js")).href;

function fakeSf(marker) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orgnauts-fake-sf-"));
  fs.writeFileSync(path.join(dir, "sf"), `#!/bin/sh\necho "$@" >> "${marker}"\ncase "$*" in\n  *--json*) echo '{"status":0,"result":{}}' ;;\n  *--version*) echo '@salesforce/cli/0.0.0-test-shim' ;;\n  *) echo 'shim' ;;\nesac\n`);
  fs.chmodSync(path.join(dir, "sf"), 0o755);
  return dir;
}
const withShim = (dir) => `${dir}${path.delimiter}${process.env.PATH ?? ""}`;
const rmrf = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } };
const yaml = (root, name) => YAML.parse(fs.readFileSync(path.join(root, "config", `${name}.yaml`), "utf8"));
/** the human CLI in the temp project; offline by default (what scripts/run-tests.mjs sets for the whole suite) */
const human = (root, args, env = {}, input) => spawnSync(process.execPath, [HUMAN, ...args], { cwd: root, input, encoding: "utf8", env: { ...process.env, ORGNAUTS_PROJECT_DIR: root, ORGNAUTS_OFFLINE: "1", ...env } });

test("(a) setup --quick --non-interactive: tracker mcp + server, dev-only orgs, policy targets = dev, no preprod, no sf call", () => {
  const root = makeProject();
  const marker = path.join(root, "sf-called.txt");
  const shim = fakeSf(marker);
  try {
    const r = human(root, ["setup", "--quick", "--non-interactive", "--dev", "DevSandbox", "--project", "PROJ", "--emails", "me+*@acme.com", "--tracker", "mcp", "--mcp-server", "atlassian"], { PATH: withShim(shim) });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /prerequisites:/, "the preflight table is printed first");
    assert.match(r.stdout, /\[0b\] Salesforce CLI/);
    const tracker = yaml(root, "tracker");
    assert.equal(tracker.adapter, "mcp");
    assert.equal(tracker.project_key, "PROJ");
    assert.equal(tracker.mcp.server, "atlassian");
    assert.ok(Array.isArray(tracker.mcp.read_tools) && tracker.mcp.read_tools.length >= 1, "read tools filled in from the defaults");
    assert.deepEqual(yaml(root, "policy").allowed_deploy_targets, ["DevSandbox"]);
    assert.deepEqual(yaml(root, "orgs").orgs.map((o) => o.role), ["development"], "no preprod, no evidence org");
    assert.deepEqual(yaml(root, "safety").allowed_test_emails, ["me+*@acme.com"]);
    assert.equal(yaml(root, "notify").slack.enabled, false);
    assert.match(r.stdout, /1\. orgnauts-human org login --alias DevSandbox --keychain agent/);
    assert.doesNotMatch(r.stdout, /--keychain engine/);
    assert.match(r.stdout, /claude mcp list/, "the next steps say how the tracker is read");
    // sync ran: the intake agent carries the MCP read tools; and in offline mode nothing spawned sf
    assert.match(fs.readFileSync(path.join(root, ".claude", "agents", "a1-intake.md"), "utf8"), /mcp__atlassian__getJiraIssue/);
    assert.ok(fs.existsSync(path.join(root, ".mcp.json")));
    assert.equal(fs.existsSync(marker), false, "setup under ORGNAUTS_OFFLINE=1 must not call sf");
  } finally { cleanup(root); rmrf(shim); }
});

test("(b) preflight(): ids 0a–0f, a FAIL when sf is hidden from PATH (setup stops with the install line), no FAIL with sf present", () => {
  const root = makeProject();
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "orgnauts-empty-path-"));
  const marker = path.join(root, "sf-called.txt");
  const shim = fakeSf(marker);
  const script = `import { preflight } from ${JSON.stringify(DOCTOR_URL)}; const r = await preflight(); process.stdout.write(JSON.stringify(r));`;
  const run = (PATH) => {
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", env: { ...process.env, PATH, ORGNAUTS_PROJECT_DIR: root, ORGNAUTS_OFFLINE: "" } });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  try {
    const hidden = run(empty);
    assert.deepEqual(hidden.checks.map((c) => c.id), ["0a", "0b", "0c", "0d", "0e", "0f"]);
    const sf = hidden.checks.find((c) => c.id === "0b");
    assert.equal(sf.level, "fail");
    assert.match(sf.detail, /npm i -g @salesforce\/cli/);
    assert.equal(hidden.ok, false);
    assert.equal(hidden.checks.find((c) => c.id === "0a").level, "ok", `node ${process.versions.node} is ≥ 20.10`);

    const present = run(withShim(shim));
    const sfOk = present.checks.find((c) => c.id === "0b");
    assert.equal(sfOk.level, "ok");
    assert.match(sfOk.detail, /test-shim/, "online: the version line comes from `sf --version`");
    assert.ok(present.checks.every((c) => c.level !== "fail"), JSON.stringify(present.checks));
    assert.equal(present.ok, true);

    // the CLI surfaces: `doctor --preflight` exits 1 / 0; `setup` stops before its first question and writes nothing
    const cli = (PATH, args) => spawnSync(process.execPath, [HUMAN, ...args], { encoding: "utf8", env: { ...process.env, PATH, ORGNAUTS_PROJECT_DIR: root, ORGNAUTS_OFFLINE: "" } });
    assert.equal(cli(empty, ["doctor", "--preflight"]).status, 1);
    assert.equal(cli(withShim(shim), ["doctor", "--preflight"]).status, 0);
    const stopped = cli(empty, ["setup", "--quick", "--non-interactive", "--dev", "DevSandbox", "--project", "PROJ"]);
    assert.equal(stopped.status, 1);
    assert.match(stopped.stderr, /setup stopped/);
    assert.match(stopped.stdout + stopped.stderr, /npm i -g @salesforce\/cli/);
    assert.equal(fs.existsSync(path.join(root, "config", "orgs.yaml")), false, "nothing is written when a prerequisite is missing");
  } finally { cleanup(root); rmrf(empty); rmrf(shim); }
});

test("(c) doctor() under ORGNAUTS_OFFLINE=1 spawns no sf (shim records nothing) and says `offline`; the control without it does call sf", () => {
  const root = makeProject();
  const marker = path.join(root, "sf-called.txt");
  const shim = fakeSf(marker);
  const script = `import { doctor } from ${JSON.stringify(DOCTOR_URL)}; import { projectPaths } from ${JSON.stringify(PATHS_URL)}; const r = await doctor({ p: projectPaths(${JSON.stringify(root)}), ...JSON.parse(process.env.DOCTOR_OPTS) }); process.stdout.write(JSON.stringify(r));`;
  const run = (offline, opts) => {
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", env: { ...process.env, PATH: withShim(shim), ORGNAUTS_PROJECT_DIR: root, ORGNAUTS_OFFLINE: offline ? "1" : "", DOCTOR_OPTS: JSON.stringify(opts) } });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  try {
    // every option that would reach an org is requested — all of them must become honest skips
    const off = run(true, { p1: true, emailCanary: true, fls: true });
    assert.equal(fs.existsSync(marker), false, "offline doctor must not call sf");
    const byId = Object.fromEntries(off.checks.map((c) => [c.id, c]));
    assert.equal(byId["2a"].level, "skip"); assert.match(byId["2a"].detail, /offline/);
    for (const id of ["2e", "2g", "3a", "4a", "6", "10", "12"]) { assert.ok(byId[id], `check ${id} present`); assert.equal(byId[id].level, "skip", `${id} is a skip offline`); assert.match(byId[id].detail, /offline/i); }
    assert.equal(byId["9h"].level, "ok"); assert.match(byId["9h"].detail, /ORGNAUTS_OFFLINE/);
    assert.equal(byId["2h"].level, "ok"); assert.match(byId["2h"].detail, /64\.0/, "sourceApiVersion read from org/sfdx-project.json");
    assert.equal(byId["1"].level, "ok");
    assert.ok(off.checks.length >= 8);

    // positive control: the same doctor without offline mode reaches the shim
    const on = run(false, {});
    assert.equal(fs.existsSync(marker), true, "control: the online doctor calls sf through the shim");
    assert.match(fs.readFileSync(marker, "utf8"), /--version/);
    assert.equal(on.checks.find((c) => c.id === "2a").level, "ok");
  } finally { cleanup(root); rmrf(shim); }
});

test("(c2) check 2h warns when the cached org API version differs from sfdx-project.json", () => {
  const root = makeProject();
  const script = `import { doctor } from ${JSON.stringify(DOCTOR_URL)}; import { projectPaths } from ${JSON.stringify(PATHS_URL)}; const r = await doctor({ p: projectPaths(${JSON.stringify(root)}), quick: true }); process.stdout.write(JSON.stringify(r.checks.find((c) => c.id === "2h")));`;
  try {
    fs.mkdirSync(path.join(root, ".orgnauts", "cache"), { recursive: true });
    fs.writeFileSync(path.join(root, ".orgnauts", "cache", "org.json"), JSON.stringify({ alias: "DevSandbox", apiVersion: "65.0", fetched_at: "2026-10-04T00:00:00Z" }));
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", env: { ...process.env, ORGNAUTS_PROJECT_DIR: root, ORGNAUTS_OFFLINE: "1" } });
    assert.equal(r.status, 0, r.stderr);
    const c = JSON.parse(r.stdout);
    assert.equal(c.level, "warn");
    assert.match(c.detail, /64\.0/); assert.match(c.detail, /65\.0/); assert.match(c.detail, /set it to the org's version/);
  } finally { cleanup(root); }
});

test("(d) scripts/run-tests.mjs sets ORGNAUTS_OFFLINE for the whole suite (what doctor 9h reads)", () => {
  const runner = fs.readFileSync(path.join(REPO, "scripts", "run-tests.mjs"), "utf8");
  assert.match(runner, /ORGNAUTS_OFFLINE/);
  assert.equal(process.env.ORGNAUTS_OFFLINE, "1", "this very process was started by the runner (or with ORGNAUTS_OFFLINE=1)");
});

test("(e) the quick wizard accepts piped answers (no TTY) without crashing and writes the files", () => {
  const root = makeProject();
  const marker = path.join(root, "sf-called.txt");
  const shim = fakeSf(marker);
  try {
    const r = human(root, ["setup", "--quick"], { PATH: withShim(shim) }, "DevSandbox\nPROJ\n\nmcp\natlassian\nnone\n");
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /1\/5 Development sandbox alias/);
    assert.match(r.stdout, /5\/5 Preprod/);
    const tracker = yaml(root, "tracker");
    assert.equal(tracker.adapter, "mcp"); assert.equal(tracker.mcp.server, "atlassian"); assert.equal(tracker.project_key, "PROJ");
    assert.deepEqual(yaml(root, "safety").allowed_test_emails, ["*@example.com", "*.invalid"], "Enter kept the documentation-safe default");
    assert.equal(yaml(root, "orgs").orgs.length, 1, "`none` = development sandbox only");
    for (const f of ["orgs", "tracker", "safety", "notify", "policy"]) assert.ok(fs.existsSync(path.join(root, "config", `${f}.yaml`)), `config/${f}.yaml written`);
    assert.ok(fs.existsSync(path.join(root, ".mcp.json")));
    assert.equal(fs.existsSync(marker), false);
  } finally { cleanup(root); rmrf(shim); }
});

test("(f) the full wizard (`setup`, no flag) offers mcp as the default tracker and asks the MCP server name", () => {
  const root = makeProject();
  const shim = fakeSf(path.join(root, "sf-called.txt"));
  try {
    // dev · preprod none · production none · tracker Enter (= mcp) · project · MCP server Enter (= atlassian) · e-mails Enter · tag field Enter · Slack n
    const answers = ["DevSandbox", "none", "none", "", "DEMO", "", "", "", "n", ""].join("\n");
    const r = human(root, ["setup"], { PATH: withShim(shim) }, answers);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /Tracker adapter: mcp/);
    assert.match(r.stdout, /MCP server name/);
    const tracker = yaml(root, "tracker");
    assert.equal(tracker.adapter, "mcp"); assert.equal(tracker.mcp.server, "atlassian"); assert.equal(tracker.project_key, "DEMO");
    assert.deepEqual(yaml(root, "orgs").orgs.map((o) => o.role), ["development"]);
  } finally { cleanup(root); rmrf(shim); }
});

test("(g) non-interactive flags: jira keeps its base URL, file needs no server, an unknown tracker is refused before anything is written", () => {
  const root = makeProject();
  const shim = fakeSf(path.join(root, "sf-called.txt"));
  const env = { PATH: withShim(shim) };
  try {
    let r = human(root, ["setup", "--quick", "--non-interactive", "--dev", "DevSandbox", "--project", "PROJ", "--tracker", "jira", "--jira-url", "https://your-site.atlassian.net"], env);
    assert.equal(r.status, 0, r.stderr);
    let tracker = yaml(root, "tracker");
    assert.equal(tracker.adapter, "jira"); assert.equal(tracker.jira.base_url, "https://your-site.atlassian.net");

    r = human(root, ["setup", "--quick", "--non-interactive", "--dev", "DevSandbox", "--project", "PROJ", "--tracker", "file", "--preprod", "UAT"], env);
    assert.equal(r.status, 0, r.stderr);
    tracker = yaml(root, "tracker");
    assert.equal(tracker.adapter, "file");
    assert.deepEqual(yaml(root, "orgs").orgs.map((o) => `${o.role}:${o.keychain}`), ["development:agent", "preprod:engine"]);
    assert.match(r.stdout, /org login --alias UAT --keychain engine/);

    const before = fs.readFileSync(path.join(root, "config", "tracker.yaml"), "utf8");
    r = human(root, ["setup", "--quick", "--non-interactive", "--dev", "DevSandbox", "--project", "PROJ", "--tracker", "trello"], env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--tracker must be one of mcp \| jira \| file/);
    assert.equal(fs.readFileSync(path.join(root, "config", "tracker.yaml"), "utf8"), before, "a refused run changes nothing");

    r = human(root, ["setup", "--quick", "--non-interactive", "--dev", "DevSandbox", "--project", "bad key"], env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /project key/);
  } finally { cleanup(root); rmrf(shim); }
});
