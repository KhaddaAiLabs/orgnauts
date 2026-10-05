# Contributing

Thank you for helping keep the crew disciplined. The rules below exist because Orgnauts is a safety system before it
is a productivity tool: a change that makes an agent faster but lets it near production is a regression.

## Before you open a pull request

1. `npm run verify` — build, the 119 offline tests, the hardcode lint, the repo checks and the hook-latency budget must
   all stay green. Add a test for every behaviour you change (gates, hooks, state machine, UI, MCP, config layers).
   Tests start from `config/defaults/` — never from your personal `config/*.yaml`, which is gitignored.
2. `node scripts/hardcode-lint.mjs` — nothing company-specific outside `config/`. Examples use `PROJ-123`,
   `DevSandbox`, `UAT`, `Production` and `*@example.com`. Put your own company names and project keys in the
   gitignored `.hardcode-lint.json` (see `.hardcode-lint.json.example`) so the lint protects your clone.
3. Hooks are safety-critical: keep `src/hooks/fast.ts` dependency-free and fast (`node scripts/hooks-latency.mjs`),
   fail closed, and duplicate hard cases as static deny rules in `.claude/settings.json`.
4. Every agent prompt change is a behaviour change: run the golden set when you have one, and record the decision
   in `docs/DECISIONS.md` (new rows at the top, with the *why* and the *consequence*).
5. Verified facts about Claude Code or the Salesforce CLI carry a date and a source in the file header comment;
   unverified ones are marked **[U]** and get a spike under `spikes/`.
6. Run `npm run install:toolkit` after toolkit changes so the hooks on your machine match your source
   (`orgnauts-human doctor` #9e warns when they differ).

## Commit style

`type(scope): imperative summary` — for example `gate(plan-lint): resolve fields per object` or
`docs(runbook): describe the parity acceptance path`. One logical change per commit.

## What we will not merge

- Anything that gives an agent a path to production writes, the engine keychain, `git push`, or a real e-mail address.
- A gate that can be argued with: gates return verdicts from files and commands, never from model output.
- Company-, org- or person-specific values anywhere outside the gitignored `config/*.yaml` and `docs/org-map/`.
