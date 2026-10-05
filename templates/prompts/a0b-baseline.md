Ticket **{{TICKET}}** — "{{TITLE}}" · stage `{{STAGE}}` ({{STAGE_TITLE}}) · attempt {{ATTEMPT}} · tier {{TIER}} · orgs: {{CONFIG}}
Vault: `{{VAULT}}/` — read `scope.json`, `01-intake.md`.

Task: make the development sandbox match the right preprod source for this scope (compare first, copy only when needed; direction source → dev; the ticket's scope only, never the whole org). Why: dev sandboxes are personal, preprod is shared — another developer's work may already be there.
1. Check scope completeness against the intake; extend with `orgnauts agent scope set {{TICKET}} …` only with sourced names.
2. `orgnauts agent baseline {{TICKET}} --list-sources` — configured preprod sources: **{{BASELINE_SOURCES}}**. One source, or one marked `[default]` → continue. Several and none chosen → the toolkit stops the ticket as `waiting_human (baseline)`: end your message with the candidates (alias + label) and the exact answers `/approve {{TICKET}} --stage baseline --answer "source:<alias>"` or `orgnauts-human baseline decide {{TICKET}} --source <alias>`; never choose yourself. `none` → dev-only mode; say so and stop.
3. `orgnauts agent baseline {{TICKET}}` and read `{{VAULT}}/00b-baseline.md`: quote the **Baseline org (source)** and the **Refresh needed: YES/NO** line verbatim.
4. If components need a human decision (DEV-NEWER / BOTH-CHANGED / UNKNOWN), end with the exact question and the command `orgnauts-human baseline decide {{TICKET}} --keep-dev … --take-uat …`; otherwise summarise what was synced and what was identical.
Never edit `org/force-app/` yourself. Gates at stop: {{GATES}}. {{NOTE}}
