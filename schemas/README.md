# schemas/ — the contracts

Every structured file the toolkit reads or writes has a JSON schema here. A file that does not validate is refused: a config file fails doctor check 1, a stage output fails the `contract-check` gate.

| Path | Validates | Checked by |
|---|---|---|
| `manifest.schema.json` | `work/<KEY>/manifest.yaml`, the ticket state | the toolkit on every load |
| `config/<name>.schema.json` | `config/<name>.yaml` (14 files) | doctor check 1, the UI on every save |
| `contracts/intake.schema.json` | `01-intake.json`, including the required `visual` block | `contract-check`, `visual-check` |
| `contracts/plan.schema.json` | `03-plan.json`, including the required `visual` block and the grounding table | `contract-check`, `plan-lint`, `visual-check` |
| `contracts/repro.schema.json` | `02-repro.json`, including `system_walkthrough[]` and `background` | `contract-check`, `assertion-referee` |
| `contracts/implementation.schema.json` | `04-implementation.json` | `contract-check` |
| `contracts/test-report.schema.json` | `05-test-report.json`, `07-uat-report.json` | `contract-check`, `test-quality` |
| `contracts/review.schema.json` | `06-review.json` | `contract-check`, `security` |
| `contracts/comms.schema.json` | the comms drafts' metadata | `comms-lint` |
| `contracts/cartography.schema.json` | `00d-cartography.json` | `contract-check` |
| `contracts/prior-art.schema.json` | `00c-prior-art.json` | `contract-check` |
| `contracts/ticket-import.schema.json` | `00-inbox/ticket-import.json`, what the tracker returned (a `title` is required) | `orgnauts agent ticket import` |

Changing a schema is a behaviour change for the agent that writes that file: update the template, the agent prompt and the tests together.
