

## Quality Review — Issue #14 (SRI Hash for SunCalc CDN)

**Date:** 2026-03-07  
**Reviewer:** Automated quality review (ISO 62304-inspired)  
**SRS Version:** FTM-SRS-001 v1.1  
**Branch:** sdlc/issue-14  
**Overall Verdict:** FAIL — blocking issues must be resolved before merge

---

### Summary

This branch introduces Subresource Integrity (SRI) protection for the SunCalc CDN script tag, adds four new security requirements (FTM-SC-001 through FTM-SC-004) to the SRS, and creates corresponding verification tests in both Jest and Playwright. The intent and structure of the change are sound. However, three blocking issues prevent merge approval.

---

### Blocking Findings (FAIL)

| # | Area | Finding |
|---|---|---|
| 1 | Code / Process | `index.html` is not modified in this diff — the actual SRI `integrity` and `crossorigin` attributes have not been added to the SunCalc script tag. The core fix is absent. |
| 2 | Test Coverage | FTM-SC-001 through FTM-SC-004 have no entries in the Verification Traceability Matrix. |
| 3 | Traceability | The VTM remains at v1.0 (2026-02-20) and does not reflect SRS v1.1 additions. The traceability chain requirement → test → VTM row is broken for all four new requirements. |

---

### Non-Blocking Findings (WARNING)

| # | Area | Finding |
|---|---|---|
| 1 | Requirements | FTM-SC-002 widened to SHA-384 or SHA-512 without documented rationale in SRS revision history or ADR. |
| 2 | Code | Stale inline comment in verification.test.js still references 'SHA-384 digest only' after SRS was updated to include SHA-512. |
| 3 | Code | Duplicate SRI test coverage across two independent describe blocks increases maintenance risk. |
| 4 | Code | SRI regex does not enforce minimum base64 body length — placeholder values such as 'sha384-' would pass. |
| 5 | Code | Removal of self-critique loop and CI test execution from sdlc-session3.yml reduces automated QA gate without a documented compensating control. |
| 6 | Test Coverage | FTM-SC-004 Playwright test body not visible in diff; adequate browser-level coverage cannot be confirmed from the diff alone. |
| 7 | Traceability | VTM version and date not updated to reference SRS v1.1. |

---

### Passing Findings

- New requirements FTM-SC-001 through FTM-SC-004 are uniquely identified, use 'shall' language, and are testable.
- Removal of unsupported Jest `expect(value, message)` second-argument pattern is correct.
- Fix of `describe()` → `test.describe()` in Playwright spec is correct.
- Two-dot to three-dot git diff syntax correction in session4/session5 workflows is semantically correct.
- Security review was completed and appended to `docs/security-review.md`.

---

### Required Actions Before Merge

1. **Add the actual fix to `index.html`** — insert `integrity` and `crossorigin="anonymous"` attributes on the SunCalc CDN script tag with a real, verified SHA-384 (or SHA-512) hash. Verify the hash matches the file served by cdnjs using the provided `curl | openssl` command.
2. **Update the Verification Traceability Matrix** — add Section covering FTM-SC-001 through FTM-SC-004 with correct test file, suite name, and method entries. Update the VTM version and date to align with SRS v1.1.
3. **Resolve the traceability gap** — confirm all four requirement-to-test chains appear in the VTM before closing the issue.

### Recommended Actions (Non-Blocking)

4. Add a rationale note to the SRS or a decision record explaining the SHA-384/SHA-512 widening in FTM-SC-002.
5. Correct the stale inline comment in `verification.test.js` to reference 'SHA-384 or SHA-512'.
6. Consolidate duplicate SRI describe blocks or explicitly designate one as canonical.
7. Tighten SRI regex to enforce minimum base64 body length.
8. Document the rationale for removing CI test execution from sdlc-session3.yml or restore a compensating control.


## Quality Review — Issue #35: Update Visual Themes

| Field | Value |
|---|---|
| **Review Date** | 2026-03-14 |
| **Branch** | feature/issue-35-visual-themes |
| **Reviewer Role** | Quality Engineer |
| **Framework** | ISO 62304 (adapted, non-medical) |
| **Verdict** | ❌ FAIL — Do Not Merge |

### Summary

This PR implements constellation art for the night theme and lavender cloud color for the day theme (Issue #35). The feature implementation itself is directionally correct and code changes are minimal and focused. However, the PR introduces multiple process and documentation failures that prevent it from meeting merge quality standards.

### Findings

| # | Activity | Severity | Title |
|---|---|---|---|
| 1 | Requirements Quality §5.2 | PASS | New requirements uniquely identified and well-formed |
| 2 | Requirements Quality §5.2 | WARNING | FTM-VT-007 uses subjective acceptance criteria |
| 3 | Requirements Quality §5.2 | WARNING | SRS version number not incremented for Amendment C |
| 4 | Requirements Quality §5.2 | WARNING | FTM-VT-004 'light blue' not quantitatively defined |
| 5 | Code Quality §5.5 | PASS | Cloud color change minimal and correctly implemented |
| 6 | Code Quality §5.5 | PASS | Constellation drawing function appropriately contained |
| 7 | Code Quality §5.5 | FAIL | FTM-TEST-GUIDE-001 deleted with no replacement or change control record |
| 8 | Code Quality §5.5 | FAIL | Two FTM-FR-012 UI tests deleted with no requirements justification |
| 9 | Code Quality §5.5 | WARNING | Self-critique did not identify substantive defects |
| 10 | Test Coverage §5.6 | FAIL | FTM-VT-001–FTM-VT-009: no automated tests added for 'Test'-method requirements |
| 11 | Test Coverage §5.6 | FAIL | FTM-FR-012 UI layer now untested after test deletion |
| 12 | Test Coverage §5.6 | WARNING | Lavender color test searches innerHTML — risk of false positive |
| 13 | Traceability §5.7 | FAIL | VTM not updated for any of the nine Amendment C requirements |
| 14 | Traceability §5.7 | FAIL | VTM references deleted FTM-FR-012 UI tests — now inaccurate |
| 15 | Process Compliance | FAIL | Controlled document FTM-TEST-GUIDE-001 deleted without change control |
| 16 | Process Compliance | WARNING | PR body missing 'Closes #35' issue link |
| 17 | Process Compliance | WARNING | SRS version note and requirements count not updated for Amendment C |

### Required Actions Before Merge

1. **[FAIL — Blocker]** Restore or formally supersede FTM-TEST-GUIDE-001 with a change control rationale. If intentionally retiring the document, add a supersession notice and update all references.
2. **[FAIL — Blocker]** Restore the deleted FTM-FR-012 Compass direction UI tests, or provide an SRS amendment formally removing or modifying FTM-FR-012 and FTM-UR-002.
3. **[FAIL — Blocker]** Add Playwright verification tests for all FTM-VT requirements marked 'Test' (FTM-VT-001, -002, -003, -005, -006, -008, -009).
4. **[FAIL — Blocker]** Update the Verification Traceability Matrix with entries for FTM-VT-001 through FTM-VT-009.
5. **[FAIL — Blocker]** Correct the VTM entry for FTM-FR-012 to reflect that the UI-layer tests have been removed.
6. **[WARNING]** Increment SRS version to reflect Amendment C addition; update Last Updated date and requirements count.
7. **[WARNING]** Add quantitative definition for 'light blue' in FTM-VT-004.
8. **[WARNING]** Add 'Closes #35' to PR body.
9. **[WARNING]** Add version history note to SRS footer for Amendment C.
