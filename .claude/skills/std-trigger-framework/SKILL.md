---
name: std-trigger-framework
description: How Orgnauts agents work with triggers — discover and reuse the org's existing trigger framework first (one trigger per object, handler class, bypass switch), and only if none exists follow this generic handler pattern. Use when a plan or change touches a trigger or record-triggered automation.
---

# Trigger framework — reuse first, this pattern second

## Step 1 — find what the org already has
```
grep -rl "trigger " org/force-app/main/default/triggers | head
grep -rn "TriggerHandler\|TriggerDispatcher\|TriggerFramework\|fflib_SObjectDomain\|Bypass" org/force-app/main/default/classes --include=*.cls -l | head
```
Read the handler base class and one existing handler end-to-end. Note: how a handler registers, how contexts are
dispatched (`beforeInsert`, `afterUpdate` …), how recursion is prevented, how bypass works (Custom Setting /
Custom Permission / static flag), how the handler is tested. **Record these in `00d-cartography.md §6` and follow them.**

## Step 2 — one trigger per object, no logic in the trigger
```apex
trigger CaseTrigger on Case (before insert, before update, after insert, after update) {
    new CaseTriggerHandler().run();   // or the org's dispatcher call — copy it exactly
}
```
If the object already has a trigger, **extend its handler**; never add a second trigger.

## Step 3 — generic handler shape (only when the org has none)
```apex
public inherited sharing virtual class TriggerHandler {
    private static Set<String> bypassed = new Set<String>();
    public void run() {
        if (bypassed.contains(handlerName()) || isDisabledBySetting()) return;
        switch on Trigger.operationType {
            when BEFORE_INSERT { beforeInsert(); } when BEFORE_UPDATE { beforeUpdate(); }
            when AFTER_INSERT  { afterInsert(); }  when AFTER_UPDATE  { afterUpdate(); }
            when BEFORE_DELETE { beforeDelete(); } when AFTER_DELETE  { afterDelete(); } when AFTER_UNDELETE { afterUndelete(); }
        }
    }
    protected virtual void beforeInsert() {} /* … */
    public static void bypass(String name) { bypassed.add(name); }
    public static void clearBypass(String name) { bypassed.remove(name); }
    protected virtual Boolean isDisabledBySetting() { return false; } // e.g. Trigger_Switch__mdt
    protected virtual String handlerName() { return String.valueOf(this).split(':')[0]; }
}
```
Handlers pass `Trigger.new` / `Trigger.oldMap` into **service** methods that take collections; services own the logic and are
unit-testable without DML where possible.

## Order of execution the plan must state
Taken from the Apex Developer Guide, "Triggers and Order of Execution". **Verify against `knowledge/mirror/` when it is populated
and cite the line (`source: L2`)**; until then this list is the working reference and any step you rely on is marked "unverified".

1. The record is loaded or initialised with the request's values. For a request from a standard UI page, system validation
   for the page runs first (layout-required fields, field formats, maximum lengths).
2. **Before-save record-triggered flows** run.
3. **Before triggers** run.
4. System validation runs again (required fields, field formats, foreign keys), then **custom validation rules**.
5. **Duplicate rules** run.
6. The record is **saved to the database, but not committed**.
7. **After triggers** run.
8. **Assignment rules** run.
9. **Auto-response rules** run.
10. **Workflow rules** run. A workflow field update re-runs the before-update and after-update triggers **once more**
    (and system validation again), but not the before-save flows, duplicate rules or the earlier steps.
11. **Escalation rules** run.
12. **Processes and flows launched by workflow** (flow trigger workflow actions) run.
13. **After-save record-triggered flows** run.
14. **Entitlement rules** run.
15. **Roll-up summary** fields on the parent record are recalculated and the parent is saved (the parent goes through its own save).
16. The same for the **grandparent** record when it carries roll-ups.
17. **Criteria-based sharing** is evaluated.
18. All DML is **committed** to the database.
19. **Post-commit logic** runs: email is sent, enqueued async Apex (Queueable, @future, Batch) and asynchronous flow paths start.

A change that moves logic between these layers is a design decision — write it in `03-plan.md §3` with the reason, and show the
record's path before and after in §3a. Two consequences worth stating every time: a before-save flow cannot see what an after
trigger will do, and anything after step 18 (email, async) runs only if the whole transaction commits.

## Recursion & re-entry
- Static `Set<Id>` of processed records per context; clear only in tests.
- Beware flow ↔ trigger loops (flow updates the record → trigger fires again). The plan names every automation on the object.

## Kill switch
Every new behaviour gets a switch (Custom Metadata `Automation_Switch__mdt` or the org's equivalent) read in the handler;
the deploy brief documents how to flip it.
