# 07 — Test report (preprod: engine-run tests + browser window) · <KEY>

<!-- D-109: tests run through the engine (`privileged test --phase uat`). The preprod UI is observable only while this ticket is at
     qa_uat (`.orgnauts/ui-allow-hosts.json`), as the engine's least-privilege test user, read-only. Differences from 05-test-report are findings. -->
| Layer | Test | Result | Run file | Notes |
|---|---|---|---|---|
| Apex bulk | `Class.method` | Pass | validations/tests-uat.json | |
| Inverse | … | Pass | … | |
| Distribution | … | holds | … | |
| Flow test | … | … | … | |
| Permission (runAs) | … | … | … | |
| UI (preprod, qa_uat window, test user) | … | observed … | ui/…png | window open/closed per stage note |
| Regression | … | … | … | |

Coverage: xx% (run file) · Test quality: n classes checked, findings: …

## Defects (→ bounce to A4/A3)
- none / …

## Verdict: **pass** | **fail**
