# Changelog

All notable changes to Orgnauts. Decision ids (D-nnn) point at `docs/DECISIONS.md`.

## v0.3.0 — 2026-10-04

Built on v0.2.0 after the first end user installed it and worked a real ticket shape through it. Nothing about the
safety model changed direction; everything about *using* it got simpler.

### Tracker through MCP, no API token (D-105)
- `config/tracker.yaml → adapter: mcp` is the default. The ticket is read by the a1-intake agent through the tracker's
  own Claude Code MCP server (Atlassian Jira MCP by default: `mcp__atlassian__getJiraIssue`, …) and imported into the
  vault with `orgnauts agent ticket import <KEY> --file work/<KEY>/00-inbox/ticket-import.json`. The toolkit never holds a
  tracker credential. Any tracker with an MCP server works (`mcp.server`, `mcp.kind`, `mcp.read_tools`); the Jira REST
  adapter and the `inbox/<KEY>.md` file adapter still exist, and the inbox file is the manual fallback for everyone.
- New gate `ticket-import` (prior_art) refuses to pass while the vault still holds the import stub.
- New hook `tracker-guard` + static denies: the tracker is read-only for agents — no comments, edits, transitions.
- Prior-art tracker search: the agent runs the search tool with the printed `suggested_search` and saves the raw result
  as `00-inbox/tracker-hits.json`; `orgnauts agent prior-art` reads it.

### Per-agent approval switch (D-106)
- `config/autonomy.yaml → agents.<agent>: ask | auto | inherit`. `ask` stops for `/approve` after that agent, `auto`
  never stops, `inherit` follows the tier matrix. Deploys and remediation stay human whatever you set.
- `orgnauts-human autonomy show` / `autonomy set a3-architect ask`; the UI Agents screen has the same switch.
- Every stop now says why: "(Stopped because: config/autonomy.yaml → agents.a1-intake: ask)".

### Visuals anyone can read (D-107)
- The intake and plan contracts carry a required `visual` block (issue · what must be done · one real example · two
  mermaid diagrams · glossary · open questions). New gate `visual-check` renders `work/<KEY>/visuals/intake.html` and
  `plan.html`; the local UI links them from the ticket page; `orgnauts agent visual <KEY> --stage intake|plan` renders on demand.

### Baseline from the org you choose, only when needed (D-108)
- Several `role: preprod` orgs may be configured (`label`, `baseline_source: true`). `orgnauts agent baseline <KEY>
  --list-sources` lists them; with more than one and no choice the toolkit asks: `/approve <KEY> --stage baseline
  --answer "source:UAT"` (or `orgnauts-human baseline decide <KEY> --source UAT`).
- Baseline compares first and copies only the ticket's scope when it differs; `00b-baseline.md` reports "Refresh needed: YES/NO".

### QA in preprod with the browser (D-109)
- After the human deploys to preprod and `uat_verify` confirms parity, the toolkit opens a preprod browser window for
  that ticket only (`.orgnauts/ui-allow-hosts.json`): `ui_login` with the preprod alias works through the engine
  keychain while the ticket is at `qa_uat`. The window closes when the ticket moves on.

### Policy-hook hardening (D-110)
- Denied now: `sf` through `bash -c` / `sh -c` / `eval` / `xargs` / `node -e` / `python -c` / `npx` / an absolute path;
  `VAR=x sf …` env prefixes (incl. `ORGNAUTS_HOOKS_OFF=1 sf …`); the human-only CLI and the hooks by file path;
  `sf api request` without an explicit dev target. More protected paths (`node_modules/`, `.claude/settings.local.json`,
  `.gitignore`, `.forceignore`, `org/sfdx-project.json`, Playwright guard files). Absolute paths into the repository are
  judged like relative ones. `sfdx` → `sf` normalisation no longer rewrites file names such as `sfdx-project.json`.

### Repro explains the system; enhancements have no bug (D-112)
- `02-repro` gains "How the system works today, step by step, and where it breaks" (`system_walkthrough[]`) and, for
  enhancements, `background`. Production data shapes come only through the masked evidence server; dev data uses fake
  e-mails from the allowlist.

### Setup and honesty (D-111)
- `npm run setup` and `orgnauts-human setup --quick` (dev sandbox + Jira MCP in five questions), a preflight check
  before any question, `doctor --preflight`, new doctor checks (tracker 8b, sourceApiVersion 2h, offline tests 9h).
- `npm test` is offline for real (`ORGNAUTS_OFFLINE=1`): no `sf` call leaves the test process; the old suite pinged every
  org in the developer's keychain.
- `hooks:latency` warms up and reports p50/p95 with a laptop-friendly budget; README and SETUP rewritten for a first install.

### Salesforce facts corrected in the shipped knowledge
- Order of execution (after-save flows run after after triggers, assignment, auto-response, workflow and escalation
  rules); before-save flows can read related records; Flow Builder tests are for record-triggered flows; deactivation
  via `FlowDefinition.activeVersionNumber`, not a deployed `Obsolete` status; `WITH USER_MODE` over
  `WITH SECURITY_ENFORCED`. New checklists: deployment, limits, sharing, test data.

## v0.2.0 — 2026-09-26

First public release: conductor + 11 specialists, 19-stage state machine, 16 gates, hooks as enforcement, two
keychains, masked evidence server, email canary with `blocked` / `allowlist_only` modes, deploy manifest + preprod
parity, learn loop, local UI. See `docs/DECISIONS.md` D-059 … D-104.
