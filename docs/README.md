# Orgnauts documentation

Start with the repository [README](../README.md). It explains what Orgnauts is in ten minutes. Then pick your path below.

## Reading order by role

| You are | Read, in this order |
|---|---|
| **Installing it for the first time** | [SETUP.md](SETUP.md) → [RUNBOOK.md](RUNBOOK.md) → [SAFETY.md](SAFETY.md) |
| **A developer who will work tickets with it** | [RUNBOOK.md](RUNBOOK.md) → [AGENTS.md](AGENTS.md) → [FILE-GUIDE.md](FILE-GUIDE.md) |
| **An admin or a QA engineer** | [RUNBOOK.md](RUNBOOK.md) (the "when it stops" table) → [AGENTS.md](AGENTS.md) (a5-qa, a8-ui) → [SAFETY.md](SAFETY.md) Rule 2 (e-mail) |
| **An architect or a security reviewer** | [SAFETY.md](SAFETY.md) → [THREAT-MODEL.md](THREAT-MODEL.md) → [ARCHITECTURE.md](ARCHITECTURE.md) → [DECISIONS.md](DECISIONS.md) |
| **Someone who wants to change the toolkit** | [ARCHITECTURE.md](ARCHITECTURE.md) → [FILE-GUIDE.md](FILE-GUIDE.md) → [CONTRIBUTING.md](CONTRIBUTING.md) → `src/README.md` and `test/README.md` |

## Every document

| File | What it answers |
|---|---|
| [SETUP.md](SETUP.md) | How do I install it, connect my sandbox and my tracker, and pass every health check? |
| [RUNBOOK.md](RUNBOOK.md) | What do I do when the system stops and asks me something? What do I do weekly? What if something is wrong? |
| [FILE-GUIDE.md](FILE-GUIDE.md) | What is every folder and important file for? Who writes it, who reads it, when? |
| [AGENTS.md](AGENTS.md) | Who is on the team? What does each agent read, write, and never do? |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How does it work inside: stages, gates, hooks, engines, keychains, MCP servers, config layers? |
| [SAFETY.md](SAFETY.md) | Which rules can never be skipped, and what code enforces each one? |
| [THREAT-MODEL.md](THREAT-MODEL.md) | What could go wrong, and which layer stops it? |
| [DECISIONS.md](DECISIONS.md) | Why was each design choice made (D-059 to D-112)? |
| [GLOSSARY.md](GLOSSARY.md) | What does this word mean? |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How do I change the code without breaking the safety model? |
| [SECURITY.md](SECURITY.md) | How do I report a vulnerability? |
| [PLAYWRIGHT-AGENTS.md](PLAYWRIGHT-AGENTS.md) | How do I add Playwright's planner/generator/healer agents (optional)? |
| [org-map/README.md](org-map/README.md) | What is the generated map of my org, and how is it used? |
| [../CHANGELOG.md](../CHANGELOG.md) | What changed in each version? |

## Folder READMEs

Every folder that matters has its own short README:
[`.claude/`](../.claude/README.md) · [`config/`](../config/README.md) · [`inbox/`](../inbox/README.md) · [`knowledge/`](../knowledge/README.md) ·
[`org/`](../org/README.md) · [`schemas/`](../schemas/README.md) · [`scripts/`](../scripts/README.md) · [`src/`](../src/README.md) ·
[`templates/`](../templates/README.md) · [`test/`](../test/README.md) · [`tests-ui/`](../tests-ui/README.md) · [`spikes/`](../spikes/README.md) ·
[`benchmarks/`](../benchmarks/README.md).

## Conventions in these pages

- **PROJ-123** is an example ticket key. **DevSandbox**, **UAT** and **Production** are example org aliases. Replace them with yours.
- **D-105** style ids point at a row in [DECISIONS.md](DECISIONS.md).
- **P1 to P12** are the twelve principles every agent reads (`.claude/skills/orgnauts-core-rules/SKILL.md`).
- `orgnauts agent …` are commands agents may run. `orgnauts-human …` are commands only you run.
