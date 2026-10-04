# templates/prompts — the task prompt the conductor passes to each specialist

`orgnauts agent handoff <KEY>` renders the first of `<agent>.<stage>.<CLASSIFICATION>.md`, `<agent>.<stage>.md`,
`<agent>.md` that exists (CLASSIFICATION = `01-intake.json → classification`: BUG | ENHANCEMENT | DATA-FIX | QUESTION,
`UNKNOWN` before intake ran — D-098), substituting:

`{{TICKET}} {{TITLE}} {{VAULT}} {{STAGE}} {{STAGE_TITLE}} {{AGENT}} {{ATTEMPT}} {{TIER}} {{OUTPUT}} {{GATES}}
{{NOTE}} {{REJECTION}} {{CONFIG}} {{FACTS}} {{TAG_FIELD}} {{TAG}} {{ALLOWED_EMAILS}} {{CLASSIFICATION}}`

New in v0.3.0:

| Placeholder | Value | Use it in |
|---|---|---|
| `{{TRACKER}}` | the tracker adapter name (`mcp`, `jira`, `file`) | any prompt that mentions the tracker |
| `{{TRACKER_MCP}}` | the tracker's MCP server name (`atlassian` by default), empty for the `jira`/`file` adapters | a1 prompts (tool names are `mcp__<server>__<tool>`) |
| `{{TICKET_IMPORT}}` | a pre-rendered block for a1-intake only (D-105): Step 0 import the ticket through the tracker's read tool, save `00-inbox/ticket-import.json`, run `orgnauts agent ticket import`, then the prior-art search. Rendered while the vault holds the stub or a refresh was requested; empty otherwise and for the `jira`/`file` adapters | `a1-intake.prior_art.md`, top of `a1-intake.intake.md` |
| `{{VISUAL}}` | `work/<KEY>/visuals/<stage>.html` for the `intake` and `plan` stages (D-107), empty elsewhere | a1 intake and a3 prompts |
| `{{BASELINE_SOURCES}}` | comma list of the configured preprod orgs, with `(label)` and `[default]` for the `baseline_source: true` one; `none` when none is configured (D-108) | `a0b-baseline.md` |

The agent's *system prompt* (`.claude/agents/<agent>.md`) says how the job is done; this file says **which** job, for
**which** ticket, with the values that change per run. Keep them short. Edit here to change what agents are told;
never put company-specific values in them — they come from config through the placeholders.
