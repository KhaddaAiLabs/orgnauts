---
description: Start or continue working a ticket (conductor session only)
argument-hint: <KEY> [--restart]
allowed-tools: Bash(orgnauts agent open:*), Bash(orgnauts agent handoff:*), Bash(orgnauts agent status:*)
disable-model-invocation: true
---

Work ticket **$1** as the Orgnauts conductor.

The UserPromptSubmit hook has bound this session to $1 (if it refused, this is not a conductor session — tell the human to run `orgnauts-human start`).

Steps:
1. Run `orgnauts agent open $ARGUMENTS`
2. Run `orgnauts agent handoff $1` and follow its ACTION literally (spawn exactly the named subagent with the printed prompt, or relay the WAIT/ESCALATION text and stop).
3. After every subagent returns, run `orgnauts agent handoff $1` again.

Never approve, deploy, or spawn anything the handoff did not name.
