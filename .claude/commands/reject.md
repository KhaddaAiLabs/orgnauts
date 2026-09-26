---
description: HUMAN ONLY — reject the stage a ticket is waiting on, with a reason (becomes a lesson candidate)
argument-hint: <KEY> --reason "why"
allowed-tools: Bash(orgnauts agent handoff:*)
disable-model-invocation: true
---

The human rejected **$1** (recorded by the prompt hook; the reason is attached to the stage and to a lesson candidate).
If no Orgnauts context line confirms the recording, say so and stop.

Otherwise run `orgnauts agent handoff $1` — the stage will be re-run with the rejection reason in its prompt.
