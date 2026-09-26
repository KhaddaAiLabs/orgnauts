# Security policy

Orgnauts exists to keep AI agents away from production, preprod credentials, real e-mail addresses and anything it
cannot prove. A way around any of those guarantees is a security bug, even when no data was touched.

## Reporting a vulnerability

- Report privately through GitHub: **Security → Report a vulnerability** on
  [github.com/KhaddaAiLabs/orgnauts](https://github.com/KhaddaAiLabs/orgnauts/security/advisories/new).
  Please do not open a public issue or pull request for a security problem.
- Include the version (`orgnauts-human version`), the hook or gate involved, and — when you can — a failing test in the
  offline harness (`test/03-hooks.test.mjs`, `test/07-lifecycle-simulation.test.mjs`, `test/14-hard-rules.test.mjs`).
  A failing test is the best report.
- You will get an acknowledgement within a few working days and a fix or a mitigation before any public disclosure.

## Scope

- The toolkit (`src/`), the hooks, the two MCP servers, the local UI, the `.claude/` configuration and the config schemas.
- Out of scope: the pinned third-party plugin (`forcedotcom/sf-skills`, see `.claude-plugin/README.md`), Claude Code
  itself, and the Salesforce CLI — report those upstream.

## Design references

- `docs/SAFETY.md` — the four rules that can never be skipped and what enforces each one.
- `docs/THREAT-MODEL.md` — the threats considered and the layered mitigations.
- Secrets never belong in the repository: `scripts/hardcode-lint.mjs` and gitleaks run in CI on every push.
