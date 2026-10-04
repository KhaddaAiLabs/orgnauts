Ticket **{{TICKET}}** — "{{TITLE}}" · stage `{{STAGE}}` ({{STAGE_TITLE}}) · attempt {{ATTEMPT}} of 2 · tier {{TIER}} · classification **{{CLASSIFICATION}}** · orgs: {{CONFIG}}
Vault: `{{VAULT}}/` — read `01-intake.md/.json` (the acceptance criteria are your spec), `00b-baseline.md`, `00d-cartography.md`, `00c-prior-art.md`.

Task: this is an ENHANCEMENT — there is no bug to prove. Your job is **acceptance tests first**: make the new behaviour
observable before anyone builds it, so A4 has a target and A5 has a referee.
- **Background (D-112):** write `## Background` in `{{VAULT}}/02-repro.md` and `02-repro.json → background` — what exists today around the new behaviour: the components that touch the same records (`Type:ApiName` from `00d-cartography.md`), the data shapes they hold (counts and record-type mix from the evidence tools), which users do what. Nothing to reproduce, everything to understand; no defect hunt.
- For every acceptance criterion `ACn` in `01-intake.json`, write one Apex test method that asserts the NEW behaviour. It
  must FAIL now (the feature does not exist yet) for the right reason — a business assertion, never a compile error and never
  `System.assert(false)`. Name the method for the outcome it proves (`escalatedCaseIsRoutedToSupportQueue`).
- Write at least one **inverse test** that protects the behaviour that must keep working after the enhancement. It must PASS now.
- Production evidence ONLY via `mcp__orgnauts-evidence__prod_row_count` / `prod_soql` (`ticket: "{{TICKET}}"`; masked, Email/Phone refused) — for the SHAPE of real
  data (volumes, record types, picklist mix), not for a bug footprint. Do not spend attempts looking for a defect that does not exist.
- Canary first: `orgnauts agent canary` must be fresh and PASS before any data is created (P9).
- Dev data: script `{{VAULT}}/artifacts/repro-data.apex` (from `templates/repro-data.apex`), meaningful names, every record `{{TAG_FIELD}} = "{{TAG}}"`, emails ONLY from: {{ALLOWED_EMAILS}} (prefer a `.invalid` domain). Run it with `orgnauts agent privileged apex-run {{TICKET}} --file {{VAULT}}/artifacts/repro-data.apex`.
- Distribution assertions in `{{VAULT}}/artifacts/assertions.json` describe the world before/after the enhancement.
- `orgnauts agent privileged test {{TICKET}} --phase repro` → check `validations/tests-repro.json`: acceptance tests **Fail**, inverse **Pass**.
- Write `{{VAULT}}/02-repro.md` + `02-repro.json` (schema `contracts/repro`): `failing_tests` = the acceptance tests, `inverse_tests`,
  `predicted_distribution`, `data_created`, `evidence`, `background`, `root_cause_hypothesis` = "n/a — enhancement; acceptance tests define the target", `confidence`.
If an acceptance criterion cannot be expressed as an assertion (it needs a human judgement or a UI-only observation), say so
in `02-repro.md` under **Not testable automatically** with the reason — that is an honest, valid output (P11); write
`{{VAULT}}/ui-request.md` and end with "UI observation requested" when a8-ui could capture it.
{{REJECTION}}
Gates at stop: {{GATES}}. {{NOTE}}
Known facts so far:
{{FACTS}}
