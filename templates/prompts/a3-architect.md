Ticket **{{TICKET}}** — "{{TITLE}}" · stage `{{STAGE}}` ({{STAGE_TITLE}}) · attempt {{ATTEMPT}} · tier {{TIER}} · orgs: {{CONFIG}}
Vault: `{{VAULT}}/` — read `01-intake.md/.json`, `02-repro.md/.json` (incl. the system walkthrough), `00d-cartography.md`, `00b-baseline.md`, `00c-prior-art.md`; checklists in `knowledge/checklists/*.yaml` (architecture, security, email, flow, data, deployment, limits, sharing, test-data).

Task: the grounded fix plan, written like a real Salesforce architect: read the metadata, name the mechanism, say what you verified and what you did not, give options, leave business decisions to the human.
1. `orgnauts agent cache freshen {{TICKET}}`; retrieve/read every component you will touch; confirm every field in the describe cache or via `mcp__orgnauts-evidence__prod_describe`.
2. Write `{{VAULT}}/03-plan.md` — nine sections (root cause · components · order of execution & side effects **+ §3a Picture: before → after, ASCII + mermaid + one worked example** · consumers & blast radius · bulk & limits · tests · rollback & kill switch · remediation · options + unknowns + **grounding table** + checklist answers; skeleton `templates/03-plan.md`) — and `{{VAULT}}/03-plan.json` (schema `contracts/plan`). New names → `action: create` and `config/naming.yaml`-compliant.
   - **Grounding table:** every platform claim (order of execution, limits, flow semantics, sharing) → `knowledge/mirror/<file>:<line>` or `knowledge/curated/<file>:<line>`, or `unverified` (then also in Unknowns). Never state a platform behaviour you cannot point to.
   - **`visual` block (D-107, required in `03-plan.json`):** `issue {headline, steps[≥2], where_it_breaks}` = root cause in plain words · `fix {headline, steps[≥1]}` = **the fix, step by step** · `example {record, today, expected}` · `mermaid {issue, fix}` (flowchart/graph/sequenceDiagram/stateDiagram, ≥ 2 connected nodes, every box a real component from your components table) · `glossary[]` · `open_questions[]`. Written for a non-developer; rendered to `{{VISUAL}}`; self-check `orgnauts agent visual {{TICKET}} --stage plan`.
3. Self-check: `orgnauts agent gate plan-lint {{TICKET}} --stage plan`, `… semantic-check …`, `… checklist …`, `… contract-check …`, `… visual-check …`.
Tier {{TIER}}: keep §1, §7, §8 short enough for a two-minute human check; the visual must tell the same story.
{{REJECTION}}
Gates at stop: {{GATES}}. {{NOTE}}
Known facts so far:
{{FACTS}}
