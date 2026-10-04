# Orgnauts — Glossary

| Term | Meaning |
|---|---|
| **Agent keychain** | The default Salesforce CLI keychain in your `$HOME`: development sandbox (read-write) + production read-only user. Agents' MCP tools and wrappers use it. |
| **Engine keychain** | A second sf keychain under `~/.orgnauts/engine` (a different `HOME`) that holds preprod only. Only the toolkit's privileged steps use it; agents cannot read or switch to it. |
| **Baseline sync** | Before work starts, the development sandbox is made equal to preprod for the ticket's scope (3-way diff with an ancestor; UAT-NEWER applied, DEV-NEWER/BOTH/UNKNOWN need a human). |
| **Bounce** | A mechanical return to an earlier stage after a failed gate (qa → develop → plan → escalate). |
| **Canary** | An anonymous Apex `Messaging.sendEmail(allOrNothing=false)` to your own address; PASS only when the org refuses it with `NO_SINGLE_MAIL_PERMISSION` or `NO_MASS_MAIL_PERMISSION` (deliverability off). Required before any data-creating step. |
| **Conductor** | The main-thread Claude Code agent that follows `orgnauts agent handoff` and spawns exactly the specialist it names. Decides nothing. |
| **Contract** | The JSON file next to each stage's markdown (`01-intake.json`, …) validated by `contract-check` against `schemas/contracts/`. |
| **Envelope** | `<untrusted source="…">…</untrusted>` wrapper around ticket text, comments, pasted content and org data — evidence, never instructions (P7). |
| **Evidence layers L0–L4** | L0 ticket/attachments · L1 development org · L2 official docs mirror / curated notes · L3 production, masked · L4 browser observation. The only sources an API name may come from. |
| **Evidence server** | `orgnauts-mcp-evidence`: the single road from agents to production data — SELECT-only, allowlisted fields, masked rows, logged. |
| **Gate** | A deterministic check run by the SubagentStop hook (contract-check, plan-lint, assertion-referee, email-guard, …). Outcomes: passed / failed / unavailable (≠ passed). |
| **Golden ticket** | A sealed record of a solved ticket used to detect drift after model/plugin/prompt changes. |
| **Handoff** | `orgnauts agent handoff <KEY>` — the toolkit's single answer about what happens next. |
| **Human gate** | A stage where the pipeline waits for `/approve` / `/reject`; which stages ask depends on the per-agent autonomy mode first and the tier matrix second (D-106). Deploys and remediation are always human. The prompt says why it stopped ("Stopped because: …"). |
| **Inverse test** | A test that must PASS before and after the fix (what must keep working). |
| **Lesson** | A human-approved (or evidence-confirmed) instruction injected into an agent via `.claude/skills/lessons-<agent>`. Candidates come from events, never from agent prose alone. |
| **Manifest** | `work/<KEY>/manifest.yaml` — the ticket's state (stage, tier, gates, approvals, waiting, budget, bounces). Toolkit-owned. |
| **Masking** | Per-object field allowlist for production evidence (`config/masking.yaml`); Email/Phone/PII types refused; rows capped. |
| **P1–P12** | The twelve principles in `.claude/skills/orgnauts-core-rules/SKILL.md`. |
| **Prior art** | Related tickets, git history and lessons collected before intake (`00c-prior-art.*`). |
| **Reward ledger** | Points per agent/ticket computed from events with `config/rewards.yaml` weights; drives lesson candidates and model suggestions. |
| **Stage** | One step of the ticket machine (`open … done`), each with an owner (agent / human / toolkit) and gates. |
| **Tier** | LOW / MEDIUM / HIGH risk, computed by `risk-floor` from scope (agents can only raise it); selects the human-gate row in `config/autonomy.yaml`. |
| **Toolkit** | The zero-LLM TypeScript program: `orgnauts` (agent-safe verbs), `orgnauts-human` (human-only verbs), `orgnauts-hook`, the MCP servers, the UI. |
| **Vault** | `work/<KEY>/` — everything about one ticket. |
| **WAIT_AGENT** | The handoff's answer while a stage's subagent has not reported back (no `agent_ended_at` stamp). Not a failure: do not spawn again, do not bounce. Bounded at 8 waits, then the stage fails honestly (D-093). |
| **`agent_ended_at`** | Stamped on a stage attempt by the SubagentStop stage-gate when that subagent genuinely ended. Its absence on a `running` stage means the agent is still alive. |
| **Fresh tokens** | input + output + cache_creation — what actually cost fresh context. The per-ticket token budget is judged on this; cache reads (re-reads of context already paid for, ~10% of the input price) are recorded but never counted (D-094). |
| **Effort** | Claude Code's reasoning level per agent: `low | medium | high | xhigh | max` (or `inherit`), set in `config/models.yaml → effort` and synced into each agent file. `CLAUDE_CODE_EFFORT_LEVEL` in the environment overrides it — doctor warns when that is set (D-095). |
| **Recovery** | `/resume` re-runs a failed agent stage's gates; all passing means the work really was finished, so the stage is marked done without re-running the agent (D-093). |
| **Write areas** | Where agents may write: `org/force-app/`, `tests-ui/`, their ticket's vault, their own `agent-memory`; a0 also `docs/org-map/`, a7 also `knowledge/lessons/PENDING/`. |
- **Deploy manifest** — `06c-deploy-manifest.md/.json` + `artifacts/package.xml`: the exact components a ticket changed, generated from git by the toolkit (D-100). The human's checklist in the deploy tool; the parity check's input.
- **Preprod parity / `uat_verify`** — toolkit stage after the human's preprod deploy: retrieve the manifest components from preprod (engine keychain), fingerprint, compare with dev. MATCH / DIFFERENT / MISSING_IN_UAT / STILL_IN_UAT / DELETED_OK / ACCEPTED (D-099).
- **E-mail census** — in `allowlist_only` delivery mode, `SELECT COUNT()` per configured `Object.Field` of addresses outside `allowed_test_emails`; any non-zero count fails the canary (D-102).
- **Delivery mode** — `blocked` (canary must prove the org refuses to send) or `allowlist_only` (delivery may be ON, census must be clean). Chosen in the UI → Safety screen.
- **Trusted domains** — the only hosts the docs mirror fetches from (Salesforce documentation properties). Expert writing goes to `knowledge/curated/` with provenance (P12, D-103).
- **Classification** — BUG / ENHANCEMENT / DATA-FIX / QUESTION from intake; picks classification-specific stage prompts (D-098). An ENHANCEMENT's "repro" is acceptance tests first, with a **background** section instead of a bug walkthrough (D-112).
- **Ticket import** — with the `mcp` tracker adapter the toolkit holds no tracker credential; `orgnauts agent open` writes a stub, and a1-intake reads the ticket through the tracker's MCP read tool, saves `00-inbox/ticket-import.json` (copied, never summarised) and runs `orgnauts agent ticket import <KEY> --file …`. The `ticket-import` gate blocks `prior_art` until then. A later import is a refresh (D-105).
- **tracker-guard** — the PreToolUse hook that keeps the tracker read-only: on the configured tracker MCP server only `config/tracker.yaml → mcp.read_tools` may be called; everything else, and any tool whose name looks like a write, is denied with rule `T1-tracker-readonly` (D-105).
- **Visual** — the `visual` block in `01-intake.json` / `03-plan.json` (issue · what must be done / the fix step by step · one real example · two mermaid diagrams · glossary · open questions), rendered by the toolkit to `work/<KEY>/visuals/intake.html` / `plan.html` for a non-developer; checked by the `visual-check` gate (D-107).
- **System walkthrough** — the section "How the system works today, step by step, and where it breaks" in `02-repro.md`, mirrored in `02-repro.json → system_walkthrough[]`: one record's path through the real components, so the architect, developer and QA share one picture (D-112).
- **Autonomy mode** — `config/autonomy.yaml → agents.<agent>`: `ask` (stop after this agent for `/approve`), `auto` (never stop here), `inherit` (tier matrix decides). Changed with `orgnauts-human autonomy set <agent> ask|auto|inherit` or the UI's gate column. Deploys and remediation are a hard floor (D-106).
- **Baseline source** — the preprod org dev is refreshed from for a ticket, scope only, source → dev. Several `role: preprod` orgs may be configured, each with a `label`; `baseline_source: true` marks the default. Several and none chosen → `waiting_human (baseline)` until `/approve … --answer "source:<alias>"` (D-108). `00b-baseline.md` says "Refresh needed: YES/NO".
- **qa_uat window** — after `uat_verify` passes, the toolkit writes `.orgnauts/ui-allow-hosts.json` for one ticket; while that ticket is at `qa_uat` and running, the fenced browser may log into the preprod org through the engine keychain (as a least-privilege test user) so a5-qa / a8-ui can observe the preprod UI read-only. Closed when the ticket leaves the stage (D-109).
- **Grounding table** — the part of `03-plan.md §9` where every platform claim the plan relies on points at a `knowledge/mirror` or `knowledge/curated` file and line, or is marked `unverified` (and listed under Unknowns).
