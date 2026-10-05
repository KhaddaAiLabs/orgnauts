---
name: std-flow-standards
description: Generic Flow standards for Orgnauts agents — when to use before-save vs after-save vs Apex, one flow per object per context, entry conditions, fault paths, bulk safety, descriptions, versions and activation, Flow tests. Use when planning, building or reviewing a Flow; check Example/Flows for known-good XML first.
---

# Flow standards (generic baseline)

The platform facts below come from the Salesforce Flow documentation. When `knowledge/mirror/` is populated, verify each one you
rely on against it and cite the line (`source: L2`). A fact you cannot find there is written as "unverified" in the plan.

## Choose the layer
| Need | Use |
|---|---|
| Set/derive fields on the same record | **Before-save** record-triggered flow (fast; it CAN read related records with Get Records; it CANNOT create, update or delete other records, and cannot call actions or subflows) |
| Create/update related records, send notifications, call actions or subflows | **After-save** record-triggered flow |
| Complex logic, bulk-heavy, cross-object transactions, callouts with error handling | **Apex** (via the trigger framework) |
| User interaction | Screen flow (entry from Quick Action / Lightning page) |

Never both a flow and a trigger doing the same thing on the same object; the plan states which layer owns the behaviour.

## Structure
- One record-triggered flow per object per context (before / after), with **decision-per-use-case** inside — unless the org
  convention differs (check `docs/org-map/CONVENTIONS.md`). When several record-triggered flows do share one object and context,
  set `triggerOrder` on each and make every entry condition selective, so the plan can state in which order they run and which
  ones run at all for the record in question.
- **Entry conditions** on the trigger (formula or conditions) so the flow only runs when relevant — required for bulk safety.
- **Fault paths** on every Create/Update/Delete/Get and every Action; the fault path logs (Custom Object / Platform Event
  per org standard) and never silently swallows. A fault connector is not a dead end: whatever the handler element connects to
  runs next. A fault connector that points into a **shared** handler whose own path leads back to the failing element creates a
  loop. Give each failing element its own handler that returns to that element's normal next step, or ends the flow.
- No Get Records / DML inside loops — collect, then one DML. No "Update Records" of the triggering record in after-save
  when a before-save assignment does the job.
- **Whole-record write-back hazard**: an Update Records element with `inputReference=$Record` writes back every field the in-memory
  record holds, including values that other automation changed earlier in the same transaction. Prefer explicit field assignments
  (`inputAssignments`) that name only the fields this element changes.
- **`$Record__Prior` is null on insert**: a condition such as `$Record__Prior.Status != 'Closed'` is true for every new record.
  Guard with an "is new" check (`$Record__Prior` is null) or use the IsChanged operators where the behaviour must not run on create.
- **Custom Error** element messages cap at **255 characters**. Measure the decoded length (entities count as one character in the
  stored value) before deploying; the deploy rejects longer messages.
- Async path (`Run Asynchronously`) or a scheduled path for callouts and long work. Such a path runs later, as the user whose
  change triggered the record; name that identity in the plan (LIM-3) because sharing and Named Credential access follow it.
- `<description>` on the flow **and** on every element that is not self-evident. `comment-lint` fails flows without a description.
- Naming: `Object_Context_WhatItDoes` (e.g. `Case_AfterSave_AssignEscalationOwner`) or the org's pattern (`config/naming.yaml`).
- API version = `org/sfdx-project.json` `sourceApiVersion`.

## Versions and activation
- **Every deploy of a flow mints a new version**, and a flow definition holds **at most 50 versions**. Count the versions
  (Tooling `Flow` rows per `DefinitionId`) before a change that will deploy several times, and ask the human to free headroom
  (delete obsolete versions) before you run out; a definition at 50 cannot be saved by anyone.
- **Deactivate** a flow by setting `FlowDefinition.activeVersionNumber` (0 = no active version) or by activating another version.
  `Obsolete` is a status the platform assigns to a replaced version; you never write `<status>Obsolete</status>` yourself.
- A deployed version lands as `Draft` unless the deploy carries `status=Active`. `InvalidDraft` means the deploy "succeeded" and the
  version is unusable: read `Flow.Status` after every deploy, never trust the green deploy alone.
- Never delete flow versions in the repo history; the human decides which org versions to delete.

## Known-good XML
Start from `Example/Flows/*.flow-meta.xml` when it exists (formatting, element ordering, connectors). Copy the shape,
not the logic.

## Testing
- **Record-triggered flows**: Flow Builder tests (`FlowTest` metadata; `sf flow run test` where the CLI supports it) are made for
  them. Add Apex tests that exercise the DML path in bulk (200) and assert the resulting field values, because a Flow test
  exercises a single record.
- **Autolaunched flows** (no trigger, no screens): start them from an Apex test with `Flow.Interview.createInterview(name, inputs)`
  and `.start()`, then assert on the outputs and the records.
- **Screen flows**: the browser (`mcp__orgnauts-ui__*`, a8-ui) for the screens; Apex tests for any autolaunched subflow they call.
- Assert the **absence** of side effects too (no email invocations when the rule says none).

## Review points
entry conditions present · fault paths everywhere, no handler loop · no DML in loops · no `$Record` whole-record write-back ·
`$Record__Prior` guarded on insert · Custom Error ≤ 255 chars · description present · layer correct · no duplicate automation ·
`triggerOrder` set when several flows share the object · version headroom checked · activation path stated · kill switch / bypass
honoured · bulk test present.
