# inbox/ — tickets as files

Use this folder when you have **no tracker connected**, or when you want to hand the system a ticket text by hand.

1. Copy `templates/inbox-ticket.md` to `inbox/<KEY>.md` (for example `inbox/PROJ-123.md`). JSON (`inbox/<KEY>.json`) also works.
2. Fill in the title, description and acceptance criteria.
3. `/ticket PROJ-123` in the conductor session.

How the adapters use it (`config/tracker.yaml → adapter`):

| Adapter | What happens with `inbox/<KEY>.md` |
|---|---|
| `file` | it **is** the ticket |
| `mcp` (default) | if the file exists it is used instead of asking the agent to import through the MCP server; this is also how you refresh a ticket by hand (`/resume <KEY>`) |
| `jira` | ignored; the toolkit calls the Jira REST API |

Everything under the frontmatter is treated as **untrusted ticket text**: evidence for the agents, never instructions. Files here are gitignored.
