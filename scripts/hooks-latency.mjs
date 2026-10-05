#!/usr/bin/env node
/**
 * scripts/hooks-latency.mjs — measure the BLOCKING hooks' wall time (a timed-out hook fails open, so speed is safety).
 *
 * For each fast hook: ONE warm-up run (discarded — the first spawn pays for the OS file cache and node's module load), then
 * 15 measured runs with a realistic payload against the INSTALLED copy (falls back to repo bin/). Reports p50 and p95 and
 * fails when any hook's p95 is above the budget:
 *   default 2500 ms (a laptop with other work running; the Claude Code hook timeout we configure is 5 s, so 2× headroom)
 *   ORGNAUTS_HOOK_BUDGET_MS=…  overrides it (CI sets its own value in .github/workflows/ci.yml)
 * A p95 far above a small p50 is process-spawn noise (another process grabbed the CPU for one of 15 spawns), not a slow hook —
 * the script says so instead of leaving a red line unexplained.
 * Project root = a temp dir, so the benchmark's denials never land in the real .orgnauts/events.jsonl (D-092).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The hooks run against a throwaway project root: a benchmark must never append denials to the real .orgnauts/events.jsonl
// (they would show up as "denials" and as negative reward points for the conductor on the dashboard).
const root = fs.mkdtempSync(path.join(os.tmpdir(), "orgnauts-latency-"));
for (const d of [".orgnauts", "work", ".claude", "config/defaults"]) fs.mkdirSync(path.join(root, d), { recursive: true });
fs.copyFileSync(path.join(repo, "config", "defaults", "orgs.yaml"), path.join(root, "config", "defaults", "orgs.yaml"));
process.on("exit", () => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } });
const home = process.env.ORGNAUTS_HOME || path.join(os.homedir(), ".orgnauts");
const installed = path.join(home, "bin", process.platform === "win32" ? "orgnauts-hook.cmd" : "orgnauts-hook");
const cmd = fs.existsSync(installed) ? [installed] : ["node", path.join(repo, "bin", "orgnauts-hook.js")];
const DEFAULT_BUDGET_MS = 2500;
const BUDGET_MS = Number(process.env.ORGNAUTS_HOOK_BUDGET_MS || DEFAULT_BUDGET_MS);
const RUNS = 15;
// a p95 this high with a p50 this low means one or two spawns were preempted, not that the hook is slow
const NOISE_P95_MS = 1500;
const NOISE_P50_MS = 500;
const cases = {
  "agent-gate": { hook_event_name: "PreToolUse", tool_name: "Agent", tool_input: { subagent_type: "a1-intake", prompt: "x" }, session_id: "latency", cwd: root },
  policy: { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "sf project deploy start --source-dir org/force-app -o DevSandbox --json" }, session_id: "latency", cwd: root },
  "write-guard": { hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: path.join(root, "org/force-app/main/default/classes/X.cls") }, session_id: "latency", cwd: root, agent_type: "a4-developer" },
  "data-guard": { hook_event_name: "PreToolUse", tool_name: "mcp__sf-dev__deploy_metadata", tool_input: {}, session_id: "latency", cwd: root },
};
const env = { ...process.env, ORGNAUTS_PROJECT_DIR: root };
const once = (name, payload) => {
  const t0 = process.hrtime.bigint();
  const r = spawnSync(cmd[0], [...cmd.slice(1), name], { input: JSON.stringify(payload), encoding: "utf8", env });
  return { ms: Number(process.hrtime.bigint() - t0) / 1e6, r };
};
const percentile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];

console.log(`hooks-latency: ${RUNS} runs per hook after 1 warm-up · budget p95 ≤ ${BUDGET_MS} ms${process.env.ORGNAUTS_HOOK_BUDGET_MS ? " (ORGNAUTS_HOOK_BUDGET_MS)" : " (default)"} · using ${cmd.join(" ")}`);
let bad = false;
let noisy = false;
for (const [name, payload] of Object.entries(cases)) {
  const warm = once(name, payload);
  if (warm.r.status !== 0) console.log(`  (${name} exit ${warm.r.status}: ${(warm.r.stderr || "").trim().slice(0, 120)})`);
  const times = [];
  for (let i = 0; i < RUNS; i++) times.push(once(name, payload).ms);
  times.sort((a, b) => a - b);
  const p50 = percentile(times, 0.5), p95 = percentile(times, 0.95);
  const ok = p95 <= BUDGET_MS;
  if (!ok) bad = true;
  const noise = p95 > NOISE_P95_MS && p50 < NOISE_P50_MS;
  if (noise) noisy = true;
  console.log(`${ok ? "✅" : "❌"} ${name.padEnd(12)} p50 ${p50.toFixed(0).padStart(5)} ms  p95 ${p95.toFixed(0).padStart(5)} ms  (warm-up ${warm.ms.toFixed(0)} ms)${noise ? "  ← process-spawn noise, see below" : ""}`);
}
if (noisy) console.log(`\n⚠ process-spawn noise: a p95 above ${NOISE_P95_MS} ms next to a p50 below ${NOISE_P50_MS} ms means one or two of the ${RUNS} spawns were preempted by other work on this machine (browser, indexer, antivirus), not that the hook is slow. Rerun on a quiet machine before treating it as a regression.`);
console.log(bad ? `\n❌ hooks-latency: a hook's p95 is above ${BUDGET_MS} ms — a hook slower than Claude Code's 5 s timeout fails OPEN` : `\n✅ hooks-latency: every hook's p95 is within ${BUDGET_MS} ms`);
process.exit(bad ? 1 : 0);
