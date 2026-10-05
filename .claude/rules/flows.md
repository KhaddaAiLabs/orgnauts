---
paths:
  - "org/force-app/**/*.flow-meta.xml"
  - "org/force-app/**/*.flowtest-meta.xml"
  - "Example/Flows/**"
---

# Flow metadata in this repo

- `<description>` on the flow and on non-obvious elements (comment-lint). Name: `Object_Context_WhatItDoes` unless `config/naming.yaml` says otherwise.
- Before-save for same-record field logic (it may read related records, not write them); after-save for related records/notifications/actions; Apex for complex or bulk-heavy work. Never duplicate a trigger's behaviour in a flow (`std-flow-standards`).
- Entry conditions present; fault paths on every DML/Action (no fault connector into a shared handler that loops back); no Get/DML inside loops; no `inputReference=$Record` whole-record write-back; `$Record__Prior` is null on insert; Custom Error messages ≤ 255 characters; API version = `org/sfdx-project.json`.
- Start from `Example/Flows/*.flow-meta.xml` for known-good XML shape. Every deploy mints a new version (max 50 per definition) — check headroom first. Deactivate via `FlowDefinition.activeVersionNumber` (0 = none) or by activating another version; the platform marks replaced versions Obsolete. Never delete history.
