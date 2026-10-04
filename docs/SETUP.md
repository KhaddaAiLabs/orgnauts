# Orgnauts — Setup

Time: ~15 minutes for the quick path (one development sandbox, tracker through Claude Code MCP); ~2 hours for the full path
(preprod + production read-only user), plus the Phase 0 spikes once before the first real ticket.
Platform: macOS / Linux. **Windows is not supported** — the hooks are `sh` launchers and the engine keychain is a `HOME` override.

## Phase 0 — Prerequisites

`orgnauts-human setup` (both paths) checks these BEFORE it asks a question and prints the table; `orgnauts-human doctor --preflight`
prints it on its own. A missing Salesforce CLI stops setup with the install line; a missing `claude` only warns.

| Id | Check | Level when missing | Install / fix |
|---|---|---|---|
| 0a | Node.js ≥ 20.10 | FAIL | `nvm install 22` or your package manager |
| 0b | Salesforce CLI `sf` | FAIL (setup stops) | `npm i -g @salesforce/cli`, then open a new terminal |
| 0c | git | FAIL | install git |
| 0d | Claude Code `claude` | WARN | install Claude Code; the agents run inside it, setup does not |
| 0e | python3 | optional (skip) | only the Phase 0 spikes and some sf-skills plugin scripts |
| 0f | Playwright | optional (skip) | `npm i -D playwright && npx playwright install chromium` — browser QA in preprod |

Also needed, not checked by the table: one **development sandbox** you may break (the only org agents write to), and a tracker — the
Atlassian (Jira) MCP server connected in Claude Code (`claude mcp list`), any other tracker with an MCP server, or none (`inbox/` files).
Your **own admin production login must not be in the default sf keychain on this machine** — doctor 6 fails if it is
(`sf org logout -o <admin alias>`, or use another OS user for admin work).

## Phase 1 — Quick path (development sandbox only, tracker `mcp`)

```bash
git clone https://github.com/KhaddaAiLabs/orgnauts.git && cd orgnauts
npm run setup                 # = npm ci && npm run build && npm run install:toolkit && orgnauts-human setup --quick
export PATH="$HOME/.orgnauts/bin:$PATH"       # add to your shell profile
```

`npm run setup` stops with a message if there is no `package-lock.json` in the folder — you are not at the repository root.
`install:toolkit` copies the built package to `~/.orgnauts/toolkit` and writes launchers into `~/.orgnauts/bin`: the hooks in
`.claude/settings.json` call **that** copy, so agents can never edit the code that enforces the rules (doctor 9e warns when the
installed copy and the repo differ — rerun `npm run install:toolkit` after changing the toolkit).

The quick wizard asks five questions (Enter keeps the default shown in `[…]` — type a value, never the brackets):

| # | Question | Default | Written to |
|---|---|---|---|
| 1 | development sandbox alias (the only org agents deploy to) | `DevSandbox` | `config/orgs.yaml`, `config/policy.yaml → allowed_deploy_targets` |
| 2 | tracker project key | `DEMO` | `config/tracker.yaml → project_key` (only this prefix may open a ticket) |
| 3 | allowed TEST e-mail patterns — add your own address pattern, e.g. `you+*@yourcompany.example` | `*@example.com,*.invalid` | `config/safety.yaml → allowed_test_emails` |
| 4 | tracker: `mcp` (asks the MCP server name, default `atlassian`) · `jira` (asks the base URL) · `file` | `mcp` | `config/tracker.yaml → adapter`, `mcp.server` |
| 5 | preprod/UAT alias — `none` = development sandbox only | `none` | `config/orgs.yaml` |

Non-interactive, same result: `orgnauts-human setup --quick --non-interactive --dev DevSandbox --project PROJ --emails "you+*@yourcompany.example" --tracker mcp --mcp-server atlassian`.
Your `config/*.yaml` are personal copies (gitignored); anything you did not personalise comes from `config/defaults/`. Setup also runs
`sync`: `.mcp.json` (the `sf-dev` MCP server bound to your dev alias), the compiled hook policy, the agents' model lines and the tracker's
READ tools on the intake agent.

Then:

```bash
orgnauts-human org login --alias DevSandbox --keychain agent    # browser login (your default sf keychain = the AGENT keychain)
export ORGNAUTS_CANARY_EMAIL=you@yourcompany.example           # the canary's only recipient — your own address (env var, never config)
orgnauts-human doctor                                           # every check below; `start` refuses while a FAIL remains
# in Claude Code, once:  /plugin marketplace add ./   then   /plugin install salesforce-development@orgnauts-pinned
orgnauts-human start                                            # conductor session →  /ticket PROJ-123
```

With tracker `mcp` the MCP server must be connected in Claude Code (`claude mcp list` shows `atlassian`); Orgnauts holds no token.
With tracker `file`, copy `templates/inbox-ticket.md` to `inbox/PROJ-123.md` and fill it in. A development-sandbox-only run skips
baseline sync, the preprod stages and production verify, and records each skip.

## Phase 2 — Full path (`orgnauts-human setup`, no flag)

The full wizard adds the preprod org, the production read-only user, the test-tag field and Slack. You can also start quick and add
orgs later: `orgnauts-human org add --alias UAT --role preprod` + `org login`, or the UI → Orgs.

**Preprod via the engine keychain.** The sf CLI keeps its logins under `$HOME`; the *engine keychain* is a second `HOME`
(`~/.orgnauts/engine`) that only the toolkit's privileged steps use (baseline retrieve, dry-run validate, preprod test runs). Agents
cannot read that directory and cannot switch `HOME` (hooks + static denies), so no agent can ever reach preprod — that is the whole
point of the second keychain.

```bash
orgnauts-human org login --alias UAT --keychain engine
orgnauts-human org list
```

Several preprod orgs are allowed (a shared Partial UAT, a QA copy, a staging org): add each with role `preprod`, give it a `label` and
mark the default baseline source with `baseline_source: true` in `config/orgs.yaml`. A ticket may pick another one:
`/approve KEY --stage baseline --answer "source:QA"` or `orgnauts-human baseline decide KEY --source QA`.

**Production read-only evidence user (admin, once).** Orgnauts reaches production only as this user; its permissions ARE the boundary.
Recipe: [`spikes/A-prod-readonly-user/RECIPE.md`](../spikes/A-prod-readonly-user/RECIPE.md) — minimum-access profile, a permission set
with object/field **Read** only on the allowlisted objects/fields in `config/masking.yaml`, *View Setup and Configuration*, API enabled,
login IP ranges. Then `orgnauts-human org login --alias Production --keychain agent` **as that user** and
`orgnauts-human doctor --p1 --fls` (5: the user cannot modify data/metadata · 12: masking allowlist vs the real describe).

Other files you may tune: `models.yaml` (model + reasoning effort per agent — `CLAUDE_CODE_EFFORT_LEVEL` in your shell overrides
them, doctor 15 warns), `autonomy.yaml` (tier matrix + per-agent ask/auto), `budgets.yaml` (tokens/USD/minutes and the model prices
cost is computed from), `masking.yaml` (review with whoever owns data privacy). Secrets never go in config:
`ORGNAUTS_JIRA_TOKEN`, `ORGNAUTS_SLACK_WEBHOOK`, `ORGNAUTS_CANARY_EMAIL`, `ANTHROPIC_API_KEY` (pipeline mode) are environment variables.
Run `orgnauts-human sync` after any config change or any `sf org login/logout`.

**Spikes (once, before the first real ticket).** `spikes/README.md` lists seven short experiments that settle the open questions
against *your* orgs (sf-skills coexistence, Tooling rights of the read-only user, a repro by hand, a baseline by hand, the canary
result shape, the read-only user recipe, live hook behaviour). Record findings as `spikes/<n>/findings-<date>.md` (gitignored).

## Phase 3 — First ticket

```bash
orgnauts agent canary --org DevSandbox      # must PASS: Setup → Email → Deliverability = No access / System email only
orgnauts-human start
> /ticket PROJ-123
```

**What the import step does.** With tracker `mcp` the conductor spawns the intake agent, which calls the MCP server's READ tools
(`getJiraIssue`, …) and runs `orgnauts agent ticket import PROJ-123 --file work/PROJ-123/00-inbox/ticket-import.json`; the toolkit
writes `ticket.json` / `ticket.md` inside an *untrusted* envelope (the text is data, never instructions) and indexes prior art.
A gate refuses to pass the stage while the vault still holds the stub. With tracker `file` the same import reads `inbox/PROJ-123.md`.

**Where to look when it stops.** `orgnauts agent status PROJ-123` (stage, waiting reason, last gate verdict) · `orgnauts-human status`
(all tickets) · `work/PROJ-123/visuals/intake.html` and `plan.html` (open in a browser) · `work/PROJ-123/events.jsonl` ·
`orgnauts-human ui`. Approve with `/approve PROJ-123` (`--stage`, `--answer "…"`), reject with `/reject PROJ-123 --reason "…"`.
When it says deploy, select exactly the components in `work/PROJ-123/06c-deploy-manifest.md` in your release tool, deploy, then
`orgnauts-human deployed PROJ-123 --org preprod` — the toolkit compares fingerprints before QA runs in preprod.

## Doctor checks

`orgnauts-human doctor` prints every check below (`--p1 --email-canary --hooks-latency --fls` / `--all` add the live ones;
`--preflight` prints only 0a–0f; `--json` for machines). `start` refuses to launch while any check FAILs; warnings do not block.
With `ORGNAUTS_OFFLINE=1` no `sf` process is spawned: 2a, 2e, 2g and 3a become honest *skip* lines that say "offline" (so do 4a and 6
when those orgs are configured, and 10 / 12 when `--email-canary` / `--fls` were asked for).

| Id | Meaning |
|---|---|
| 0a–0f | preflight: node ≥ 20.10 · sf CLI · git · claude · python3 (optional) · Playwright (optional) |
| 1 | every `config/*.yaml` loads and validates against its schema (how many are personal vs defaults) |
| 2a | Salesforce CLI present (version) — *skip/warn when offline* |
| 2b | Node.js ≥ 20.10 |
| 2c | git present |
| 2d-python3, 2d-jq | optional tools the sf-skills plugin scripts use |
| 2e | `sf plugins`: code-analyzer and plugin-flow installed |
| 2f | `SFDX_AUTO_DEPLOY=1` is set (FAIL — the plugin would deploy on every edit) |
| 2g | the default `sf` target-org is unset or the development org |
| 2h | `org/sfdx-project.json → sourceApiVersion` matches the development org's API version recorded by `orgnauts agent cache freshen` (plans are checked against sfdx-project.json — set it to the org's version) |
| 3a | AGENT keychain lists the development org |
| 3b | AGENT keychain lists the evidence (production) org |
| 3c | P1c: preprod is NOT in the AGENT keychain (or: no preprod configured — preprod stages skipped) |
| 4a, 4b | ENGINE keychain lists preprod — and only preprod |
| 5, 5b | P1 identity: the production user cannot Modify All Data / Modify Metadata / Author Apex / Customize Application; has View Setup (`--p1`) |
| 6, 6b | no second (admin) production login in the AGENT keychain; the evidence alias is the configured read-only user |
| 7 | P1b: no Blue Canvas git remote in this repo |
| 8 | `.mcp.json`: `sf-dev` bound to the development org only, no preprod/prod servers |
| 8b | tracker adapter: `mcp` → the MCP server's READ tools are on the intake agent and no write tool is · `jira` → env vars set · `file` → inbox |
| 9a, 9b | `.claude/settings.json` wires the Orgnauts hooks; static deny rules present |
| 9c | sf-skills plugin (`salesforce-development`) installed |
| 9d | Claude Code auto memory on (agent notes channel) |
| 9e | installed toolkit copy (`~/.orgnauts`) matches the repo version |
| 9f | compiled policy for fast hooks exists (`sync`) |
| 9g | static denies cover every non-development org in the AGENT keychain (`.claude/settings.local.json`) |
| 9h | tests are offline: `scripts/run-tests.mjs` sets `ORGNAUTS_OFFLINE` — `npm test` cannot ping your keychain |
| 10, 10-\<alias\> | e-mail canary: last result and freshness (a stale PASS blocks data steps); `--email-canary` runs it |
| 11-\<hook\> | hook latency per blocking hook (`--hooks-latency`) |
| 12-\<object\> | masking allowlist vs the production describe for each object (`--fls`) |
| 13 | oracle cache (describe/metadata) present for plan-lint |
| 14 | package schemas/templates present |
| 15 | reasoning effort per agent, and the `CLAUDE_CODE_EFFORT_LEVEL` override |
| 16 | model prices present so USD budgets can fire |
| 17 | knowledge sources on Salesforce domains only; curated notes carry provenance (P12) |
| 18 | e-mail containment mode (`blocked` / `allowlist_only`) and the allowlist |

## Troubleshooting (from the first beta)

- **`npm ci` fails: "no package-lock.json"** — you are in the wrong folder. Run `npm run setup` (or `npm ci`) in the repository root,
  the folder that holds `package.json` *and* `package-lock.json`.
- **The wizard wrote `[*@example.com,*.invalid]` as one pattern** — the brackets show the default; press Enter to keep it or type the
  values without brackets. Setup strips stray brackets, but fix `config/safety.yaml` (or UI → ⛨ Safety) if a bracket slipped through.
- **`/plugin marketplace add` says the path is invalid** — local paths must start with `./`: `/plugin marketplace add ./` from the repo.
  A stale `orgnauts-pinned` marketplace: `claude plugin marketplace remove orgnauts-pinned` first.
- **Canary FAILs or never runs** — export `ORGNAUTS_CANARY_EMAIL=you@yourcompany.example` (your own address) and set the development
  sandbox's Deliverability to *No access* or *System email only* (Setup → Email → Deliverability); then `orgnauts agent canary --org DevSandbox`.
  Data steps are refused until a fresh PASS exists (doctor 10).
- **hooks-latency fails on a laptop** — `npm run verify` measures 15 spawns per hook after a warm-up and allows a p95 of 2500 ms
  locally. A p95 above 1500 ms next to a p50 below 500 ms is process-spawn noise from other work on the machine (the script says so);
  rerun on a quiet machine. CI uses `ORGNAUTS_HOOK_BUDGET_MS`.
- **Seeding test data fails on `Test_Tag__c`** — every object the agents seed needs that custom text field (the ticket tag goes in it).
  Create it in the development sandbox, or point `config/safety.yaml → test_tag_field` at the field you have.
- **plan-lint rejects a valid API** — `org/sfdx-project.json → sourceApiVersion` is older than your org. Set it to the org's version
  (`sf org display -o DevSandbox` shows it); doctor 2h compares the two once `orgnauts agent cache freshen` has run.
- **Doctor says the installed copy differs (9e)** — `npm run install:toolkit` after every toolkit change.
- **`sync` warns "sf org list unavailable"** — the sf CLI was not reachable, so the machine-specific keychain denies were not refreshed;
  run `orgnauts-human sync` again with `sf` on PATH.

## Windows

Not supported. The hooks are POSIX `sh` launchers in `~/.orgnauts/bin`, and the engine keychain is a `HOME` override the sf CLI honours
on macOS/Linux. Use WSL, a Linux VM, or a macOS/Linux machine.

## Uninstall / reset

`rm -rf ~/.orgnauts` removes the installed toolkit and the engine keychain (log out of preprod first:
`HOME=~/.orgnauts/engine sf org logout -o UAT`). Runtime state lives in `work/`, `.orgnauts/`, `metrics/`, `org/.baseline/` — all gitignored.
Before you publish a fork: everything generated from your org is gitignored and `npm run lint:hardcode` fails if a generated org file is
tracked; put your own company names in `.hardcode-lint.json` (see the `.example`).
