---
description: Show Orgnauts ticket status (all tickets, or one)
argument-hint: [KEY]
allowed-tools: Bash(orgnauts agent status:*)
---

Current Orgnauts state:

!`orgnauts agent status $ARGUMENTS`

Summarise in plain language: which tickets are running, which wait for a human (and the exact command to unblock), which are done. Do not start any work from this command.
