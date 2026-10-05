# 02 — Reproduction · <KEY>

## Production evidence (masked, L3)
| Question | Query/count | Result | Evidence file |
|---|---|---|---|
| Does the bad state exist? | COUNT() … | n | evidence/… |

## How the system works today, step by step, and where it breaks (D-112)
<!-- One record's path through the REAL components (Type:ApiName from 00d-cartography.md or a retrieve). Mirror it in
     02-repro.json → system_walkthrough[] {step, component, what_happens, breaks_here, evidence}. A3, A4 and A5 read this instead of
     rebuilding their own picture. ENHANCEMENT: there is no defect to walk through — write "## Background" instead (02-repro.json →
     background): what exists today around the new behaviour: components, data shapes (counts, record-type mix), who does what. -->
| Step | Component (Type:ApiName) | What happens to the record | Breaks here? | Evidence |
|---|---|---|---|---|
| 1 | … | … | no | 00d-cartography.md §2 |
| 2 | … | … | **yes** — … | evidence/… / validations/tests-repro.json |

## Data created (development sandbox, tag `<TAG>`)
| Object | Count | Names pattern | Script |
|---|---|---|---|
| Case | 200 | "Portal login fails after password reset #n" | artifacts/repro-data.apex |

## Failing assertion (must FAIL now → PASS after fix)
- `ClassNameTest.methodName` — what it proves …  → outcome in validations/tests-repro.json: **Fail**

## Inverse assertion (must PASS before and after)
- `ClassNameTest.otherMethod` — … → **Pass**

## Predicted distribution (artifacts/assertions.json)
| Description | Query | Expected |
|---|---|---|

## Root-cause hypothesis (for the architect — not a fix)
… (confidence 0.x)

## Attempts / notes
- attempt 1: …
