# org/ — the SFDX project agents work in

| Path | What it is |
|---|---|
| `force-app/` | The **only** place agents write code and metadata. Before a ticket starts, it is refreshed from the chosen preprod org for the ticket's components (`orgnauts agent baseline <KEY>`), so a scoped component here equals preprod plus the ticket's change. |
| `sfdx-project.json` | `sourceApiVersion` is what the `semantic-check` gate compares plans against. Keep it equal to your dev org's API version (doctor 2h). Agents cannot edit this file. |
| `.forceignore` | Profiles, settings and credential-bearing metadata never travel through agents; humans manage them through the deploy brief. Agents cannot edit this file. |
| `.baseline/` | Raw retrieves (`uat/<ts>/`, `dev/<ts>/`, `dev-pre-sync/<ts>/`) that prove the three-way baseline comparison. Gitignored. |

Nothing in this folder is company-specific by default; the first `baseline` run fills it from your orgs.
