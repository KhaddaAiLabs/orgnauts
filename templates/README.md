# templates/ — what agents are told, and what they fill in

| Path | What it is | Used when |
|---|---|---|
| `prompts/<agent>[.<stage>[.<CLASSIFICATION>]].md` | The **task prompt** the conductor hands to a specialist: which ticket, which stage, which output, which gates. Placeholders like `{{TICKET}}`, `{{VISUAL}}`, `{{TICKET_IMPORT}}`, `{{BASELINE_SOURCES}}` are filled by `orgnauts agent handoff`. See `prompts/_README.md`. | every spawn |
| `00c-prior-art.md` … `07-uat-report.md` | The **skeleton** of each stage file, with the headings the gates look for (`## 2a. Picture` in intake, `### 3a. Picture` in the plan, …). The agent copies it into the vault and fills it in. | the stage starts |
| `comms/client-update.md`, `internal-summary.md`, `tracker-comment.md` | Skeletons for the three drafts a9-comms writes | comms stage |
| `inbox-ticket.md` | The ticket file to copy into `inbox/<KEY>.md` when you have no tracker | by you |
| `repro-data.apex` | The anonymous Apex skeleton a2 uses to create tagged, fake-e-mail test data | repro stage |
| `lesson.md` | The lesson file shape | by the coach and by you |

The agent's **system prompt** (`.claude/agents/<agent>.md`) says *how* the job is done. The files here say *which* job, for *which* ticket, with the values that change per run. Edit here to change what agents are told. Never put company-specific values in them; they come from config through the placeholders.
