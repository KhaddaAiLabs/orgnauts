Ticket **{{TICKET}}** — "{{TITLE}}" · stage `{{STAGE}}` ({{STAGE_TITLE}}) · attempt {{ATTEMPT}} of 2 · tier {{TIER}} · classification **{{CLASSIFICATION}}** · orgs: {{CONFIG}}
Vault: `{{VAULT}}/` — read `01-intake.md/.json`, `00b-baseline.md`, `00d-cartography.md`, `00c-prior-art.md`.

Task: prove the bug with a failing assertion (data first). (A DATA-FIX is proven the same way: the bad data shape
must exist in dev data and a test must fail on it; a QUESTION has nothing to reproduce — write the honest ESCALATION block now.)
- Production evidence ONLY via `mcp__orgnauts-evidence__prod_row_count` / `prod_soql` with `ticket: "{{TICKET}}"` and a real purpose (masked; Email/Phone fields are refused by the server, a refusal is final). Never SOQL or `sf` against production or preprod.
- **System walkthrough (D-112):** in `{{VAULT}}/02-repro.md` write "How the system works today, step by step, and where it breaks" — one record's path through the real components (`Type:ApiName` from `00d-cartography.md` or a retrieve), what each step does, the step that breaks, with evidence; mirror it in `02-repro.json → system_walkthrough[] {step, component, what_happens, breaks_here, evidence}`.
- Canary first: `orgnauts agent canary` must be fresh and PASS before any data is created (P9).
- Dev data: script `{{VAULT}}/artifacts/repro-data.apex` (from `templates/repro-data.apex`), meaningful names, every record `{{TAG_FIELD}} = "{{TAG}}"`, emails ONLY from: {{ALLOWED_EMAILS}} (prefer a `.invalid` domain). Count rows already carrying a value you use as a key; read the before-save flows for assignments to fields you set; read the records back after insert. Run it with `orgnauts agent privileged apex-run {{TICKET}} --file {{VAULT}}/artifacts/repro-data.apex`.
- Tests: failing test (must FAIL now) + inverse test (must PASS) under `org/force-app/main/default/classes/`, bulk 200, org comment format. Distribution assertions in `{{VAULT}}/artifacts/assertions.json`. UI-only steps: `mcp__orgnauts-ui__*` in the dev org (screenshot + text), or `ui-request.md` + "UI observation requested" for a8-ui.
- `orgnauts agent privileged test {{TICKET}} --phase repro` → check `validations/tests-repro.json`.
- Write `{{VAULT}}/02-repro.md` + `02-repro.json` (schema `contracts/repro`: failing_tests, inverse_tests, predicted_distribution, data_created, evidence, system_walkthrough, root_cause_hypothesis, confidence).
If this is attempt 2 and no honest failing assertion exists → write the ESCALATION block (skill `orgnauts-escalation-format`) instead of forcing one.
{{REJECTION}}
Gates at stop: {{GATES}}. {{NOTE}}
Known facts so far:
{{FACTS}}
