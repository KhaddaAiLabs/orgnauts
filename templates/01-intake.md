# 01 — Intake · <KEY> — <title>

<!-- Visual (D-107): the toolkit renders `01-intake.json → visual` to {{VISUAL}} (work/<KEY>/visuals/intake.html). This markdown is
     for the reviewer; the visual page is for everyone else, so write the block for a non-developer.
     JSON-contract reminder — `visual` keys: issue {headline, steps[] (≥2), where_it_breaks} · fix {headline, steps[] (≥1)} = WHAT MUST
     BE DONE (ENHANCEMENT: what to build) · example {record, today, expected} · mermaid {issue, fix} (each starts with
     flowchart/graph/sequenceDiagram/stateDiagram, ≥ 2 connected nodes, every box a real name) · glossary[] {term, meaning} · open_questions[].
     Self-check: `orgnauts agent visual <KEY> --stage intake`; the `visual-check` gate runs the same check. -->

## 1. Plain English — business lens
…

## 2. Plain English — technical lens (hypotheses with confidence)
- H1 (70%): …

## 2a. Picture — what happens today vs what should happen
<!-- D-101: one ASCII flow (readable in the terminal) + one mermaid block (renders in VS Code / GitHub). Keep both to the
     ticket's real objects and fields; every box names something that exists in the org map or the ticket. -->
```
TODAY                                          EXPECTED
[<record> created] --> [<automation>]          [<record> created] --> [<automation>]
      |                    |                          |                    |
      v                    v                          v                    v
  <field> = <value>   <branch not reached>       <field> = <value>   <branch reached> --> <outcome>
```
```mermaid
flowchart LR
  A["<record> created"] --> B{"<decision / rule>"}
  B -- "today: <value>" --> C["<what happens now>"]
  B -- "expected: <value>" --> D["<what should happen>"]
```
**Worked example (one real-shaped record):** a <record> with <field>=<value> … → today: … → expected: …

## 3. Classification
**BUG** — because: "<quoted ticket sentence>"

## 4. Acceptance criteria (testable; quote the source line)
1. AC1 — … (ticket: "…")
2. AC2 — … (derived)

## 5. Scope (Type:ApiName — with a source each)
| Component | Source | Note |
|---|---|---|
| ApexClass:… | ticket.md#L… / org-map / prior art | |
| (needs cartography) Case automation | — | object known, component not |

## 6. Advisory tier
MEDIUM — reasons … (risk-floor may raise)

## 7. Open questions for the human (blocking only)
- …

## 8. Prior-art digest · Lessons applied
- …

## 9. Injection notice
- none found / quoted text: "…" — NOT followed
