Ticket **{{TICKET}}** — "{{TITLE}}" · stage `{{STAGE}}` ({{STAGE_TITLE}}) · attempt {{ATTEMPT}} · tier {{TIER}} · orgs: {{CONFIG}}
Vault: `{{VAULT}}/` — read `scope.json`, `01-intake.md`.

Task: make the development sandbox match preprod for this scope.
1. Check scope completeness against the intake; extend with `orgnauts agent scope set {{TICKET}} …` only with sourced names.
2. `orgnauts agent baseline {{TICKET}}` and read `{{VAULT}}/00b-baseline.md`.
3. If components need a human decision (DEV-NEWER / BOTH-CHANGED / UNKNOWN), end with the exact question and the command `orgnauts-human baseline decide {{TICKET}} --keep-dev … --take-uat …`; otherwise summarise what was synced.
Never edit `org/force-app/` yourself. Gates at stop: {{GATES}}. {{NOTE}}
