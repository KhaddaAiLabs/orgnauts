# Orgnauts — Runbook (daily operations)

## A normal day

```
orgnauts-human doctor                 # 30 s — green? go
orgnauts-human start                  # conductor session
> /ticket PROJ-123                    # …intake → you approve (HIGH) → … plan → you approve with --answer → …
> /status
orgnauts-human ui                     # in another terminal: watch, approve, edit config
```

When the conductor says **WAIT_HUMAN**:

| It says | You do |
|---|---|
| approval at `intake` / `plan` / `review` | read the file it names (`work/KEY/01-intake.md`, `03-plan.md`, `06-review.md`) and, for intake and plan, open the visual it names in a browser (`work/KEY/visuals/intake.html` / `plan.html`, D-107), then `/approve KEY [--answer "what you checked"]` or `/reject KEY --reason "…"` (UI buttons do the same). The prompt's "(Stopped because: …)" tells you which `config/autonomy.yaml` line made it stop |
| baseline: which source? | several preprod orgs are configured and none is chosen for this ticket (D-108): `/approve KEY --stage baseline --answer "source:<alias>"` or `orgnauts-human baseline decide KEY --source <alias>`; the candidates and their labels are in the prompt |
| baseline decision | `orgnauts-human baseline decide KEY --keep-dev Type:Name --take-uat Type:Name` (or `--all-take-uat`) |
| deploy to preprod | read `06b-deploy-brief.md` (incl. its by-hand steps from the deployment checklist: FLS permission set, assignees, UserAccessPolicy activation, flow activation, environment-specific ids), select **exactly** the components in `06c-deploy-manifest.md` (`artifacts/package.xml`) in your release tool, deploy, then `orgnauts-human deployed KEY --org preprod`. The toolkit then retrieves those components from preprod and compares fingerprints (`07a-uat-parity.md`). MISSING / DIFFERENT → it comes back to you with the list: fix the set and run `deployed` again. NOT VERIFIED (retrieve failed) → fix the cause and run `deployed` again, or — if you verified the deploy another way — `orgnauts-human parity KEY --accept-all --reason "…"` (recorded). When parity passes, the toolkit opens the **preprod browser window** for this ticket's `qa_uat` stage (D-109, see below) |
| deploy to production | same, `--org production`; the toolkit then runs the read-only verification queries from the plan |
| remediation | run `work/KEY/artifacts/remediation/*.apex` yourself in production, then `orgnauts-human verify KEY --remediation` |
| question / escalation | read the ESCALATION block in the stage file; answer in the session, or `/hold`, or `/resume KEY --restart-from <stage>` |

`/hold KEY --reason "…"` pauses (locks released). `/resume KEY` re-fetches the tracker, classifies the change
(comments only → continue; description/AC changed → intake re-runs; scope changed → restart from baseline; cancelled → archive),
detects a sandbox refresh, re-checks the baseline.

## Weekly

- `orgnauts-human learn` (or nightly cron) → `knowledge/DIGEST-<date>.md`; `orgnauts-human lessons review` → approve/reject with reasons.
- `orgnauts-human rewards --tokens` — points and spend per agent; the Agents screen in the UI shows the same.
- `orgnauts-human memory audit` — flags agent notes that contradict events.
- `orgnauts-human orgmap` (nightly) refreshes `docs/org-map/` (gitignored — it carries your org id and every component name); review `CONVENTIONS.md` once, then `orgnauts-human conventions build --prefix <yourorg>` generates the org-specific comment/naming skills **and wires them into the agents** (D-096; `sync` keeps them wired).
- `orgnauts-human mirror` refreshes the official docs mirror (grounding L2) — trusted Salesforce domains only (P12). Notes from MVPs / practitioners: file them in `knowledge/curated/` with the provenance frontmatter (`knowledge/curated/README.md`).
- UI → **Safety**: review the allowed test e-mail list and the delivery mode; the last canary and, in `allowlist_only` mode, the census counts are shown there.

## When something is wrong

| Symptom | Where to look | Fix |
|---|---|---|
| `start` refuses | doctor output | fix the named boot condition; `--force` is for emergencies only |
| `ticket-import` gate fails at `prior_art` ("the ticket has not been imported yet") | `work/KEY/00-inbox/` | with the `mcp` adapter the a1 agent must read the ticket through the tracker MCP and run `orgnauts agent ticket import KEY --file work/KEY/00-inbox/ticket-import.json` (D-105). If the MCP server is not connected in Claude Code (`claude mcp list`), connect it; or drop the ticket as `inbox/KEY.md` (template `templates/inbox-ticket.md`) and re-open |
| `policy.denied` with rule `T1-tracker-readonly` | `work/KEY/events.jsonl`, UI → Safety tile | an agent asked for a tracker tool that is not in `config/tracker.yaml → mcp.read_tools`, or a write tool. Writes are never allowed; if a READ tool is missing from the list, add it and run `orgnauts-human sync` |
| `visual-check` fails ("visual block … incomplete") | `work/KEY/validations/<stage>-visual-check.json` | the agent's `visual` block is thin or a mermaid source is broken; it fixes it on the bounce. You can render by hand: `orgnauts agent visual KEY --stage intake\|plan` |
| the system stops after an agent and you did not expect it (or does not stop where you want) | the prompt's "(Stopped because: …)" | `orgnauts-human autonomy show`; change with `orgnauts-human autonomy set <agent> ask\|auto\|inherit` (deploys and remediation always stop) |
| `ui_login` refused for the preprod alias during `qa_uat` | `.orgnauts/ui-allow-hosts.json`, `work/KEY/.state.json` | the window exists only while THIS ticket is at `qa_uat` and running, after parity passed; it is not created when the preprod instance URL could not be resolved (the stage note says so) — fix the engine keychain login (`orgnauts-human org login`) and run `deployed --org preprod` again |
| `policy.denied` with `R7-wrapped-sf` / `R2-env-prefix` / `R1-human-verbs` (by path) | `work/KEY/events.jsonl` | the agent tried `sf` through a wrapper, with an env prefix, or the human CLI by file path; it must use plain `sf … -o <dev alias>` or the `orgnauts agent …` wrappers — never widen the hook (D-110) |
| an agent is denied constantly (`policy.denied` events) | `work/KEY/events.jsonl`, UI → Safety tile | it is trying the wrong thing; read the reason; if a legitimate path is missing, add a toolkit verb — never widen the hook |
| stage keeps failing gates | `work/KEY/validations/<stage>-<gate>.json` | the reason is mechanical; fix the artifact or the config the gate reads |
| conductor loops / stops early | Stop hook blocks (8-cap → `waiting_human`) | `orgnauts agent handoff KEY` by hand to see the state; `/resume` |
| handoff keeps saying `WAIT_AGENT` | `work/KEY/manifest.yaml → stages.<stage>.agent_waits` | the stage's agent has not reported back. Normal while it works; after 8 waits the stage fails honestly. If it never reports, the agent was spawned in the background (denied since D-093) or died — `/resume KEY` first: if its gates now pass, the stage is recovered without a re-run |
| a stage failed but its output looks complete | `work/KEY/validations/` | `/resume KEY` re-runs that stage's gates; all passing means the stage is marked done with no agent re-run (D-093 recovery). `--restart-from` skips recovery and forces the re-run |
| budget parked | `manifest.yaml → budget` | raise `config/budgets.yaml` or `/resume KEY --allow-budget` |
| canary FAIL | `.orgnauts/canary/<org>.json`, UI → Safety | `blocked` mode: Setup → Email → Deliverability → *No access* (or *System email only*); rerun `orgnauts agent canary`. `allowlist_only` mode: the census found addresses outside the allowlist — the UI shows which fields and how many; scrub them (or switch to `blocked`) |
| canary stale (doctor #10 WARN) | UI → Safety | a PASS older than `canary_max_age_minutes` is not accepted by the data-guard hook — rerun `orgnauts agent canary --org <dev>` before a2/a5 create data |
| `uat_verify` keeps sending the ticket back | `work/KEY/07a-uat-parity.md` | the deploy set in your tool does not match `06c-deploy-manifest.md`; a cosmetic DIFFERENT (e.g. the tool rewrote the api version) can be accepted with `orgnauts-human parity KEY --accept Type:Name --reason "…"` |
| doctor #17 FAIL (knowledge sources) | `knowledge/mirror/sources.yaml` | a mirror source is not on a Salesforce documentation domain — remove it; expert articles go to `knowledge/curated/` with `source_url`, `author`, `trust` |
| preprod validate fails | `validations/uat-validate.json` | usually drift preprod↔dev outside scope → widen scope (`orgnauts agent scope set`) and rerun baseline |
| hooks not firing | `claude --debug`, `orgnauts-human doctor` #9 | installed copy missing/outdated → `npm run install:toolkit`; PATH |
| UI shows config errors | Config tab | fix YAML; every save is schema-validated |

Escape hatches (human, documented, audited): `ORGNAUTS_HOOKS_OFF=1` disables the Orgnauts hooks for a session;
`claude --settings disableAllHooks` disables all hooks; both leave the identity-level protections (read-only user,
keychain split) in place.

## Maintenance procedures

### Choosing the baseline source (D-108)
Several teams promote through more than one preprod org (a shared Partial UAT, a QA copy, a staging org). Configure each as
`role: preprod` in `config/orgs.yaml` with a `label:` (UI → Orgs, or `orgnauts-human org add --role preprod --keychain engine`), and
mark the usual one `baseline_source: true` so tickets do not have to ask. With several configured and no default, the baseline
stage stops with the list; answer `/approve KEY --stage baseline --answer "source:<alias>"` or
`orgnauts-human baseline decide KEY --source <alias>`. `work/KEY/00b-baseline.md` then says which source was used and
**Refresh needed: YES/NO**. Only the ticket's scope is copied, always source → dev; dev is never copied anywhere.

### Changing where the system stops (per-agent autonomy, D-106)
`orgnauts-human autonomy show` prints the mode per agent, the tier matrix and the hard floor. `orgnauts-human autonomy set
a1-intake ask` makes the pipeline stop after every intake for your `/approve`, whatever the tier; `auto` never stops there;
`inherit` (default) uses the tier matrix. It applies to the next stage decision, no restart. UI → Agents → gate column does the same.
Deploys to preprod/production and remediation always stop. Every WAIT_HUMAN prompt ends with "(Stopped because: …)" so you can
see which line applied; `/autonomy` in the conductor session explains the commands (it changes nothing itself).

### Opening the visuals (D-107)
Intake and plan each produce a self-contained page: `work/KEY/visuals/intake.html` ("What is the issue?", "What must be done?",
one real example) and `work/KEY/visuals/plan.html` ("Root cause", "The fix, step by step", one real example), with two diagrams
drawn in the browser and a glossary. Open the file in any browser; share it with the person who asked for the ticket. The
toolkit renders it from the stage's JSON (`visual` block) when the `visual-check` gate runs; re-render by hand with
`orgnauts agent visual KEY --stage intake|plan`. If your browser blocks the diagram library, the diagram source is shown as text.

### QA in preprod with the browser (D-109)
After `orgnauts-human deployed KEY --org preprod` and a passing parity check, the toolkit resolves the preprod hosts with the
engine keychain and writes `.orgnauts/ui-allow-hosts.json` for that one ticket. While the ticket is at `qa_uat`, the a5-qa agent
(and a8-ui as its support) can log the fenced browser into preprod through the **engine** keychain — it never sees the credential
— and observe pages read-only. The window closes when you mark the production deploy, hold the ticket, or it finishes.
**Your part:** make the engine's preprod login a least-privilege TEST user (`config/safety.yaml → ui.uat_test_user_only` is a
reminder, not an enforcement): the browser can do whatever that user can do.

### Refreshing the ticket from the tracker (D-105)
With the `mcp` adapter the toolkit cannot re-fetch the ticket itself (it holds no credential). `/resume KEY` says so and asks the
intake agent to re-import on its next run; to force it now, run in a conductor session the import the agent would run, or drop
the current ticket text as `inbox/KEY.md` and `/resume`. A re-import is a refresh: the same NONE / COMMENTS_ONLY / DESCRIPTION_AC /
SCOPE_CHANGED / CANCELLED_DONE classification applies and `work/KEY/ticket-diff.md` is written.

### Editing the allowed test e-mails / delivery mode (D-102)
UI → Safety: add or remove addresses and patterns, pick `blocked` (default — the canary must prove the org refuses to send)
or `allowlist_only` (delivery may be ON; the canary's census must find no address outside the list in `email_census_fields`).
Saving writes `config/safety.yaml` (schema-validated). Agents read the list on their next data step; the mode applies on the
next `orgnauts agent canary` run.

### Adding an org
UI → Orgs → Add, or `orgnauts-human org add --alias X --role development|preprod|evidence` → `org login` → `doctor`.
Preprod orgs always live in the engine keychain; evidence orgs need a read-only user. A preprod org may carry a `label:` and
`baseline_source: true` (the default baseline source when several are configured, D-108).

### Changing models, reasoning effort or gate modes
UI → Agents, or edit `config/models.yaml` / `config/autonomy.yaml` → `orgnauts-human sync`. Takes effect in the next session
(the per-agent gate column, `autonomy set`, applies to the next stage decision without a restart). `sync` also rewrites the
a1-intake `tools:` line from `config/tracker.yaml → mcp.read_tools` (D-105).
Run the golden set after a model **or effort** change: `orgnauts-human golden list|score`.

**Effort** (D-095) is `low | medium | high | xhigh | max | inherit` per agent. `sync` writes it into the `effort:` line of
each agent file (`inherit` removes the line, so the session level applies). One gotcha worth knowing:
`CLAUDE_CODE_EFFORT_LEVEL` in your environment **overrides agent frontmatter** — if it is set, every per-agent value is
ignored. `orgnauts-human doctor` #15 reports the effective levels and warns about that variable; `orgnauts-human start
--effort <level>` sets one for the conductor session only. Effort is recorded with every run in
`metrics/agent-runs.jsonl`, so a token or cost number can be interpreted afterwards.

### Reading token and cost numbers
`tokens` in the manifest is the raw total **including cache reads**; `fresh_tokens` (input + output + cache_creation) is
what the per-ticket token budget is judged on, because a cache read is a re-read of context already paid for at roughly a
tenth of the price (D-094). The UI shows both columns. Costs come from `config/budgets.yaml → prices`
(or `metrics/prices.json`, which overrides it) — review those numbers against your own plan; doctor #16 warns when a
model you actually run has no price entry, because such runs record no cost at all.

### Bumping the sf-skills pin
See `.claude-plugin/README.md`. Read the upstream diff, run Spike 1, update `sha` + `version`, `/plugin update`, `doctor`, note in `docs/DECISIONS.md`.

### Upgrading the toolkit
`git pull` → `npm ci && npm run build && npm test` → `npm run install:toolkit` → `orgnauts-human sync && orgnauts-human doctor`.

### Sealing a golden ticket
After a ticket closes cleanly: `orgnauts-human golden add KEY`. Replays: Phase 3 (pipeline mode).

### Pipeline mode (Phase 3, API key)
`ANTHROPIC_API_KEY=… orgnauts-human run KEY` runs `claude -p … --agent conductor` in a resume loop with
`--max-budget-usd`; stops at every human gate. Your own plan token is a licence gray zone for unattended batch use —
`--allow-oauth` exists but read the note first.

## Files you may edit by hand

`config/*.yaml` (then `sync`) · `knowledge/checklists/*.yaml` · `knowledge/guards/*.txt` · `knowledge/curated/*` ·
`knowledge/lessons/L-*.md` (then `learn sync`) · `templates/**` · `Example/Flows/*` · `docs/**` · `inbox/<KEY>.md` (manual
ticket paste) · `.claude/agents/*.md` (prose; the `tools:`/`model:`/`effort:` lines are rewritten by `sync`), `.claude/skills/**`
(except generated `lessons-*` and `<prefix>-*`), `.claude/rules/*`, `.claude/commands/*`, `CLAUDE.md`.
Never edit by hand: `work/**/manifest.yaml`, `.state.json`, `events.jsonl`, `validations/`, `approvals/`, `06c-deploy-manifest.*`,
`07a-uat-parity.md`, `visuals/*.html` (rendered), `.mcp.json`, `.orgnauts/` (incl. `ui-allow-hosts.json`).
