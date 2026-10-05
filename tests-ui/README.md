# tests-ui/ — Playwright specs (optional)

Browser checks the agents draft and you may keep. Never a gate by themselves: the verdict always comes from an assertion.

| Path | What it is |
|---|---|
| `specs/` | Deterministic UI checks drafted by a8-ui and a5-qa: role/label locators, business-outcome assertions. |
| `quarantine/` | Flaky specs with a `// QUARANTINE(<reason>)` header. Never a gate. |
| `heals/` | Proposals from Playwright's healer agent (optional, see `docs/PLAYWRIGHT-AGENTS.md`), reviewed by a6 before any spec changes. |
| `auth.setup.ts` | Development-org login via frontdoor. **Refuses production.** Protected: agents cannot edit it. |
| `playwright.config.ts` | The Playwright configuration. Protected. |

Install (human, once): `npm i -D playwright@1.63.0 @playwright/test@1.63.0 && npx playwright install chromium`.
Run: `npx playwright test -c tests-ui/playwright.config.ts`.
