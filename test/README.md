# test/ — the offline test suite

119 tests, about one minute, **no Salesforce org and no Claude needed**. `scripts/run-tests.mjs` sets `ORGNAUTS_OFFLINE=1`, so no `sf` process is spawned and nothing touches your keychain (doctor check 9h proves it).

```bash
npm test                                  # build + every test
node scripts/run-tests.mjs hooks gates    # only files whose name contains a filter word
node scripts/run-tests.mjs --test-name-pattern=referee
ORGNAUTS_ONLINE_TESTS=1 npm test          # allow real sf calls (slow; only when you mean it)
```

| File | What it proves |
|---|---|
| `01-config.test.mjs` | the two config layers load and validate; defaults are generic |
| `02-state-machine.test.mjs` | stage order, gate lists, who stops the pipeline (tier matrix and per-agent switch), bounce ladders |
| `03-hooks.test.mjs` | the deny hooks: agent-gate, policy (Bash), write-guard, data-guard; what is allowed and what is refused |
| `04-gates.test.mjs` | each gate passes good artifacts and fails bad ones; `unavailable` is never `passed` |
| `05-lifecycle-learn.test.mjs` | open, hold, resume with tracker diff classification; rewards and lesson sync |
| `06-ui-mcp.test.mjs` | the fenced browser server: production refused, Setup URLs refused, allowed hosts |
| `07-lifecycle-simulation.test.mjs` | one whole ticket (DEMO-101) from open to done with fixture agent outputs: stage order, gates, human gates, bounces, deploy marks |
| `08-review-fixes.test.mjs` | rejection re-runs the stage, the support-agent flow, comms-lint e-mail rules, protected-file moves denied |
| `09-scripts.test.mjs` | the runner itself and `repo-checks.mjs` (hooks wired, marketplace pinned, agent frontmatter) |
| `10-dev-only-config.test.mjs` | a dev-sandbox-only configuration skips the preprod stages honestly |
| `11-beta-run1-fixes.test.mjs` | machine-specific static denies for every non-development org, default alias denies, pasted e-mail patterns |
| `12-run1-blocker-fixes.test.mjs` | a live subagent is never a failed stage (WAIT_AGENT, `agent_ended_at`, recovery on resume), fresh-token budgets, effort per agent |
| `13-goal-changes.test.mjs` | convention-skill wiring, canary age, classification-aware repro, deploy manifest, preprod parity, picture sections |
| `14-hard-rules.test.mjs` | red-team tests for the rules that may never be skipped: production read-only, zero real e-mail, nothing guessed, docs from Salesforce domains only |
| `15-v030-core.test.mjs` | v0.3.0: tracker through MCP (stub → import → gate), per-agent autonomy, visuals, baseline source choice, the `qa_uat` browser window, policy-hook hardening |
| `16-setup-v030.test.mjs` | v0.3.0 first run: `setup --quick`, the preflight table, the offline doctor, the offline runner |
| `helpers.mjs` | shared fixtures: a temporary project, a ticket vault, the `VISUAL` block, hook runners |

Every test starts from `config/defaults/`, never from your personal `config/*.yaml`. The negative fixtures (fake e-mails, fake hostnames) live here on purpose, so `scripts/hardcode-lint.mjs` skips this folder.

When you change a gate, a hook, the state machine, the UI, an MCP server or a config layer, add or extend a test in the matching file. A security bug report is best as a failing test here (see `docs/SECURITY.md`).
