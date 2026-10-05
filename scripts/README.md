# scripts/ — build and check helpers

All of them run with `node scripts/<name>.mjs`. `npm run verify` runs the four checks CI runs.

| Script | npm alias | What it does |
|---|---|---|
| `run-tests.mjs` | `npm test` (after `npm run build`) | Runs every `test/*.test.mjs` with `ORGNAUTS_OFFLINE=1`, so no `sf` call leaves the suite and nothing pings your keychain. Filters: `node scripts/run-tests.mjs hooks gates`. Set `ORGNAUTS_ONLINE_TESTS=1` to allow `sf`. |
| `hardcode-lint.mjs` | `npm run lint:hardcode` | Fails when a tracked file holds a real-looking ticket key, an e-mail outside the documentation-safe domains, a Salesforce org id, a real instance hostname, or anything you list in the gitignored `.hardcode-lint.json`. |
| `repo-checks.mjs` | `npm run check:repo` | Checks the hooks are wired in `.claude/settings.json`, every agent file is well-formed, the conductor only spawns agents that exist, the templates carry the headings the gates look for, and the product name is the same everywhere. |
| `hooks-latency.mjs` | `npm run hooks:latency` | Spawns each blocking hook 15 times after a warm-up against the **installed** copy and reports p50/p95 against a 2500 ms budget (CI: `ORGNAUTS_HOOK_BUDGET_MS`). A slow hook is a safety problem: a timed-out hook renders no decision. |
| `install-toolkit.mjs` | `npm run install:toolkit` | Copies `dist/` to `~/.orgnauts/toolkit` and writes the launchers in `~/.orgnauts/bin`. The hooks call that copy. Run it after every toolkit change (doctor 9e warns when the two differ). |
