# config/ — two layers, one file name

| Path | Tracked in git? | Who writes it |
|---|---|---|
| `config/defaults/<name>.yaml` | **yes** — ships with the repository, must stay generic (hardcode-lint scans it) | maintainers |
| `config/<name>.yaml` | **no** — `.gitignore` has `config/*.yaml` | you: `orgnauts-human setup`, `orgnauts-human org add/remove`, the UI → Config |

The toolkit reads your copy when it exists and the default otherwise, file by file. A fresh clone therefore runs with the
defaults; the first `setup` creates your copies; `git status` never shows them. Tests always start from `config/defaults/`.

Machine-specific permission rules follow the same idea: `.claude/settings.json` (tracked) carries the static rules;
`.claude/settings.local.json` (gitignored, written by `orgnauts-human sync`) carries the deny rules for *your* preprod/evidence
aliases and for every other org in your sf keychain.

`config/people/` — recipient profiles for the comms agent (see its README).

## Three settings worth knowing (v0.3.0)

**`tracker.yaml → adapter: mcp` (default, D-105).** The ticket is read by the a1-intake agent through the tracker's own Claude Code
MCP server; the toolkit stores no API token and no base URL. `mcp.server` is the MCP server name (`atlassian` by default; tools are
`mcp__<server>__<tool>`), `mcp.kind` names the tracker for prompts and the doctor (`jira | linear | github | azure-devops | other`),
and `mcp.read_tools` is the ONLY list of tracker tools the agent may call — `orgnauts-human sync` writes them into
`.claude/agents/a1-intake.md`, and the `tracker-guard` hook denies everything else, write tools above all. Any tracker with an MCP
server works: set the three keys and sync. No tracker at all: drop `inbox/<KEY>.md` (template `templates/inbox-ticket.md`).
The `jira` (REST, env token) and `file` adapters still exist. `post_draft: disabled` cannot be enabled.

**`autonomy.yaml → agents` (D-106).** Per agent: `ask` (stop after this agent's stage and wait for `/approve`), `auto` (never
stop here), `inherit` (the `tiers` matrix decides). Deploys to preprod/production and remediation always stop, whatever is set.
Change it with `orgnauts-human autonomy set <agent> ask|auto|inherit`, the UI → Agents gate column, or by editing the file; it
applies to the next stage decision.

**`orgs.yaml` — several preprod orgs (D-108).** More than one `role: preprod` org may be configured (a shared Partial UAT, a QA
copy, a staging org), each with an optional `label:` shown to you and the agents. Mark the usual baseline source
`baseline_source: true`; with several preprod orgs and no default, each ticket's baseline stage asks you which one to refresh dev
from (`/approve <KEY> --stage baseline --answer "source:<alias>"`). Preprod orgs always use the engine keychain; `write: false`.
