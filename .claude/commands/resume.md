---
description: HUMAN ONLY — resume a held/parked ticket after re-checking the tracker for changes
argument-hint: <KEY> [--restart-from <stage>] [--allow-budget]
allowed-tools: Bash(orgnauts agent handoff:*), Read
disable-model-invocation: true
---

Ticket **$1** was resumed by the prompt hook, which re-fetched the tracker and classified the change (see the Orgnauts context line: NONE / COMMENTS_ONLY / DESCRIPTION_AC / SCOPE_CHANGED / CANCELLED_DONE).

1. If `work/$1/ticket-diff.md` exists, read it and tell the human what changed in two lines.
2. Run `orgnauts agent handoff $1` and follow it.
