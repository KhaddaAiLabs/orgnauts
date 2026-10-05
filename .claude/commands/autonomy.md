---
description: HUMAN ONLY — show or change where the system stops for your approval after an agent (per-agent autonomy, D-106)
argument-hint: show | set <agent> ask|auto|inherit
disable-model-invocation: true
---

Per-agent autonomy lives in `config/autonomy.yaml → agents.<agent>`:

- `ask` = after that agent's stage the system stops and waits for `/approve <KEY> --stage <stage>` (you read the stage file and its visual first)
- `auto` = never stop after that agent
- `inherit` = the tier matrix decides (`tiers.<TIER>.human_gates.<stage>`; a stage without a gate key is automatic)

Deploys to preprod and production, and remediation, always stop. That is a hard floor; no setting changes it.

This slash command only explains. The change itself is a **human command in a terminal** (agents cannot run `orgnauts-human`):

- `orgnauts-human autonomy show`: current mode per agent, the tier matrix, the hard floor
- `orgnauts-human autonomy set a3-architect ask`: stop after the architect from now on (applies to the next stage decision; no restart)
- UI → Agents → gate column does the same

Tell the human which of the two commands answers `$ARGUMENTS`, then stop. Do not change any file yourself.
