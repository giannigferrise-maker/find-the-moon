

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


## Quality Review — Issue #35: Update Visual Themes

| Field | Value |
|---|---|
| **Review Date** | 2026-03-14 |
| **Branch** | feature/issue-35-visual-themes |
| **Reviewer** | Quality Engineer (automated ISO 62304 review) |
| **Overall Verdict** | ❌ FAIL — Must resolve before merge |

### Summary

This review evaluated the Issue #35 branch against ISO 62304-inspired lifecycle activities. The feature itself (lavender cloud color and constellation overlay art) is implemented correctly and the day-theme color change is clean and focused. However, the branch contains four FAIL-severity findings that must be resolved before merge.

### Findings

#### 🔴 FAIL Findings

1. **[Traceability] VTM not updated for FTM-VT-001 through FTM-VT-009** 
   Nine new requirements added in Amendment C have no rows in the Verification Traceability Matrix. The VTM must be updated with test file, suite, and notes for all nine requirements before merge.

2. **[Code/Test] FTM-FR-012 UI-layer tests deleted without justification** 
   Two complete test.describe blocks covering the compass direction UI (four tests total) were removed from verification.spec.js. FTM-FR-012 requires UI-layer Test verification per the VTM. No requirement change or waiver justifies this deletion. Tests must be restored or the removal must be formally documented and the VTM updated.

3. **[Test Coverage] Missing tests for FTM-VT-001, -002, -003, -005, -006** 
   Five requirements assigned verification method 'Test' have no implementing test. Required additions include: constellation count verification (FTM-VT-001), line/dot marker rendering (FTM-VT-002), opacity range assertion (FTM-VT-003), static behavior confirmation (FTM-VT-005), and label presence per constellation (FTM-VT-006).

4. **[Process] Self-critique did not detect pre-existing test deletions or VTM gaps** 
   The SDLC self-critique step returned 'No defects found' despite the above issues being present. The self-critique must be re-run with explicit checks against: (a) deleted tests vs. VTM entries, (b) new SRS requirements vs. VTM, (c) new SRS requirements vs. test implementations.

#### 🟡 WARNING Findings

5. **[Requirements] FTM-VT-007 uses subjective language** — 'overpower' lacks a measurable threshold. Acceptable as Inspection but recommend cross-referencing FTM-VT-003 opacity bounds.

6. **[Requirements] FTM-VT-009 'unchanged' is relative** — Should reference a named baseline version or enumerate preserved attributes.

7. **[Code] Constellation drawing on shared #stars-canvas** — Couples static and animated concerns; weakens per-feature testability.

8. **[Test] Day-theme constellation absence test weakened** — Replacement test only checks body class, not actual canvas visibility.

9. **[Traceability] No 'Closes #35' in PR body** — Issue will not auto-close on merge.

10. **[Process] Unit test maintenance note is inaccurate** — Claims no test changes required; verification.spec.js has extensive changes.

#### ✅ PASS Findings

- New requirements are uniquely identified and well-formed (FTM-VT-001 to FTM-VT-009)
- Day-theme color change is minimal, focused, and complete
- Cloud color tests correctly expanded to handle rgba() browser normalization
- SRI placeholder tests replaced with real implementations
- SRS Amendment C follows established document structure and versioning conventions

### Required Actions Before Merge

| # | Action | Owner |
|---|---|---|
| 1 | Add FTM-VT-001 through FTM-VT-009 to Verification Traceability Matrix | Dev/QE |
| 2 | Restore FTM-FR-012 UI-layer tests or formally document and approve removal | Dev + QE sign-off |
| 3 | Implement tests for FTM-VT-001, -002, -003, -005, -006 | Dev |
| 4 | Re-run SDLC self-critique with explicit deletion audit and VTM gap check | Dev |
| 5 | Add 'Closes #35' to PR body | Dev |


## Quality Review — Issue #35: Update Visual Themes

| Field | Value |
|---|---|
| **PR / Issue** | Issue #35 — Update visual themes (constellation art at night, lavender clouds by day) |
| **Review Date** | 2026-03-14 |
| **Framework** | ISO 62304-inspired best-practice (non-medical adaptation) |
| **Overall Verdict** | ❌ FAIL — issues must be resolved before merge |

### Summary of Findings

| # | Activity | Severity | Title |
|---|---|---|---|
| 1 | Requirements Quality §5.2 | ✅ PASS | New requirements are uniquely identified and well-formed |
| 2 | Requirements Quality §5.2 | ⚠️ WARNING | SRS version number and requirement count not updated for Amendment C |
| 3 | Requirements Quality §5.2 | ⚠️ WARNING | FTM-VT-007 acceptance criterion is subjective and not fully testable |
| 4 | Requirements Quality §5.2 | ⚠️ WARNING | FTM-VT-009 lacks a cited baseline for 'unchanged' animation behaviour |
| 5 | Code Quality §5.5 | ✅ PASS | Lavender cloud color change is minimal and consistent |
| 6 | Code Quality §5.5 | ❌ FAIL | drawConstellations() called inside drawStars() — fragile coupling risks opacity accumulation and FTM-VT-003/FTM-VT-005 violations on re-draw |
| 7 | Code Quality §5.5 | ⚠️ WARNING | CSS font fallback logic contains a JavaScript operator precedence bug |
| 8 | Code Quality §5.5 | ⚠️ WARNING | Constellation star positions are undocumented and aspect-ratio-sensitive |
| 9 | Code Quality §5.5 | ⚠️ WARNING | Removed FTM-FR-012 UI Playwright tests have no replacement |
| 10 | Code Quality §5.5 | ✅ PASS | Constellation rendering uses save/restore correctly |
| 11 | Test Coverage §5.6 | ❌ FAIL | FTM-VT-001/002/005/006 tests are trivially passing and do not verify constellation rendering |
| 12 | Test Coverage §5.6 | ❌ FAIL | FTM-VT-003 and FTM-VT-008 config-layer Jest tests cited in matrix do not exist in diff |
| 13 | Test Coverage §5.6 | ⚠️ WARNING | No documented inspection record for FTM-VT-004 and FTM-VT-007 |
| 14 | Test Coverage §5.6 | ⚠️ WARNING | Cloud color tests check stylesheet presence rather than computed element style |
| 15 | Test Coverage §5.6 | ✅ PASS | FTM-SC-004 placeholder tests replaced with real implementations |
| 16 | Traceability §5.7 | ❌ FAIL | Removal of FTM-FR-012 UI tests breaks the traceability chain without matrix update |
| 17 | Traceability §5.7 | ✅ PASS | All nine new VT requirements have traceability matrix entries |
| 18 | Traceability §5.7 | ⚠️ WARNING | Traceability matrix document header still references v1.0 / 2026-02-20 |
| 19 | Traceability §5.7 | ⚠️ WARNING | FTM-VT-003 matrix entry cites a Jest test suite that does not exist |
| 20 | Process Compliance | ❌ FAIL | No inspection record provided for FTM-VT-004 and FTM-VT-007 |
| 21 | Process Compliance | ⚠️ WARNING | SRS version control is inconsistent across amendments |
| 22 | Process Compliance | ⚠️ WARNING | verification.spec.js diff is truncated; FTM-VT-006/009 tests cannot be fully reviewed |
| 23 | Process Compliance | ✅ PASS | Change is scoped to Issue #35 with no unrelated functional modifications |

### Required Actions Before Merge

1. **[FAIL-6]** Decouple `drawConstellations()` from `drawStars()` or add a re-entry guard so that repeated calls to `drawStars()` do not accumulate constellation paint on the canvas.
2. **[FAIL-11]** Replace trivially-passing FTM-VT-001/002/005/006 Playwright tests with tests that actually verify constellation rendering (e.g. pixel-sampling the canvas, intercepting canvas 2D API calls via a page script injected before page load, or adding accessible `data-constellation` attributes to a companion DOM layer).
3. **[FAIL-12]** Implement the missing Jest unit tests for FTM-VT-003 (opacity range assertion) and FTM-VT-008 (cloud color constant assertion) in `verification.test.js`.
4. **[FAIL-16]** Either restore the removed FTM-FR-012 UI Playwright tests or update the traceability matrix to reflect that UI-layer verification for FTM-FR-012 is now covered by a different test suite or method.
5. **[FAIL-20]** Attach a documented inspection record (reviewer, date, pass/fail, notes) for FTM-VT-004 and FTM-VT-007 before merge.

### Recommended Actions

- Update SRS version to 1.3, last-updated date to 2026-03-14, Requirements Summary table (add VT row, update total to 63), and version history note.
- Fix the JavaScript operator precedence bug in the font fallback: `'11px ' + (getComputedStyle(document.body).getPropertyValue('--font').trim() || 'sans-serif')`.
- Add a comment in `drawConstellations()` documenting the coordinate system and aspect-ratio assumption.
- Update the traceability matrix header to reflect the current version and date.
- Provide a complete (non-truncated) diff of `verification.spec.js` for re-review.
- Add a cited baseline snapshot or reference document for FTM-VT-009.


## Quality Review — Issue #35: Update Visual Themes (Canonical Review)

| Field | Value |
|---|---|
| **PR / Issue** | Issue #35 — Update visual themes (constellation art at night, lavender clouds by day) |
| **Review Date** | 2026-03-14 |
| **Branch** | feature/issue-35-visual-themes |
| **Reviewer Role** | Quality Engineer |
| **Framework** | ISO 62304 (adapted, non-medical best-practice) |
| **Overall Verdict** | ❌ FAIL — Must resolve before merge |

> **Note:** This is the canonical quality review for Issue #35. Three earlier draft review sections in this document are superseded by this entry.

### Summary

This PR implements constellation art (Orion, Cassiopeia, Big Dipper) for the night theme and lavender cloud color (#c9b8e8) for the day theme. The lavender color change is clean and minimal. The constellation implementation is directionally correct but contains a fragile architectural coupling, a JavaScript operator precedence bug, and — critically — Playwright tests for FTM-VT-001/002/005/006 that are trivially passing and do not verify actual canvas rendering. Additionally, two FTM-FR-012 UI Playwright suites were deleted without justification, breaking the traceability chain for an existing requirement.

### Findings

| # | Activity | Severity | Title |
|---|---|---|---|
| 1 | Requirements Quality §5.2 | ✅ PASS | Amendment C requirements are uniquely identified and well-formed |
| 2 | Requirements Quality §5.2 | ⚠️ WARNING | SRS version, date, and requirements count not updated for Amendment C |
| 3 | Requirements Quality §5.2 | ⚠️ WARNING | FTM-VT-007 uses subjective language without a measurable threshold |
| 4 | Requirements Quality §5.2 | ⚠️ WARNING | FTM-VT-004 'light blue' not quantitatively defined |
| 5 | Requirements Quality §5.2 | ⚠️ WARNING | FTM-VT-009 'unchanged' lacks a cited baseline version or enumerated attributes |
| 6 | Code Quality §5.5 | ✅ PASS | Lavender cloud color change is minimal, focused, and consistent |
| 7 | Code Quality §5.5 | ✅ PASS | drawConstellations() uses canvas save/restore correctly |
| 8 | Code Quality §5.5 | ❌ FAIL | drawConstellations() called inside drawStars() — opacity accumulation risk on re-draw |
| 9 | Code Quality §5.5 | ⚠️ WARNING | JavaScript operator precedence bug in constellation label font assignment |
| 10 | Code Quality §5.5 | ⚠️ WARNING | Constellation star positions undocumented and aspect-ratio-sensitive |
| 11 | Code Quality §5.5 | ❌ FAIL | Two FTM-FR-012 UI Playwright suites deleted with no requirements change or waiver |
| 12 | Code Quality §5.5 | ⚠️ WARNING | FTM-FR-031 unit test suite now contains duplicate test descriptions |
| 13 | Test Coverage §5.6 | ❌ FAIL | FTM-VT-001/002/005/006 Playwright tests are trivially passing — do not verify canvas rendering |
| 14 | Test Coverage §5.6 | ❌ FAIL | FTM-FR-012 UI-layer Playwright tests deleted — requirement now untested at UI layer |
| 15 | Test Coverage §5.6 | ❌ FAIL | FTM-VT-003 Jest test uses upper bound 0.55 instead of SRS-mandated 0.5; pattern too broad |
| 16 | Test Coverage §5.6 | ✅ PASS | FTM-VT-008 UI-layer test correctly reads computed background color from .cloud element |
| 17 | Test Coverage §5.6 | ✅ PASS | FTM-VT-009 cloud animation and shape tests substantively implemented |
| 18 | Test Coverage §5.6 | ✅ PASS | FTM-SC-004 placeholder tests fully replaced with real implementations |
| 19 | Test Coverage §5.6 | ⚠️ WARNING | innerHTML-based lavender color checks in FTM-FR-033 block weaker than computed style |
| 20 | Test Coverage §5.6 | ⚠️ WARNING | No documented inspection record for FTM-VT-004 and FTM-VT-007 |
| 21 | Traceability §5.7 | ✅ PASS | All nine Amendment C requirements have VTM entries in Section 12 |
| 22 | Traceability §5.7 | ❌ FAIL | VTM FTM-FR-012 entry references deleted Playwright suites — traceability chain broken |
| 23 | Traceability §5.7 | ⚠️ WARNING | VTM document header still references v1.0 / 2026-02-20 |
| 24 | Traceability §5.7 | ⚠️ WARNING | FTM-VT-003 VTM notes describe a test strategy not matching the implementation |
| 25 | Traceability §5.7 | ⚠️ WARNING | FTM-VT-001/002/005/006 VTM notes imply verification fidelity not achieved by actual tests |
| 26 | Process Compliance | ❌ FAIL | No inspection record for FTM-VT-004 and FTM-VT-007 |
| 27 | Process Compliance | ❌ FAIL | FTM-VT-001/002/005/006 tests trivially passing — canvas rendering not verified |
| 28 | Process Compliance | ⚠️ WARNING | quality-review.md contains three superseded draft reviews for Issue #35 |
| 29 | Process Compliance | ⚠️ WARNING | PR body missing 'Closes #35' issue link |
| 30 | Process Compliance | ⚠️ WARNING | FTM-SC-004 live network tests require CI network access — offline CI will fail |

### Required Actions Before Merge

1. **[FAIL-8 — Blocker]** Decouple `drawConstellations()` from `drawStars()` or add a re-entry guard (e.g. `if (constellationsDrawn) return;`) so that repeated calls to `drawStars()` do not repaint constellation art and accumulate opacity, which would violate FTM-VT-003 and FTM-VT-007.

2. **[FAIL-11 — Blocker]** Restore the two deleted FTM-FR-012 UI Playwright test suites (`[FTM-FR-012] Compass direction display (UI)` and `[FTM-FR-012] Compass direction display (UI) — additional tests`), or provide an SRS amendment formally removing or modifying FTM-FR-012 and FTM-UR-002 with QE sign-off, and update the VTM accordingly.

3. **[FAIL-13 / FAIL-27 — Blocker]** Replace trivially-passing FTM-VT-001, FTM-VT-002, FTM-VT-005, and FTM-VT-006 Playwright tests with tests that actually verify constellation rendering on the canvas. Viable approaches: (a) inject a canvas 2D API spy via `page.addInitScript()` to record `fillText`, `lineTo`, and `arc` calls and assert expected call signatures; (b) pixel-sample the `#stars-canvas` at known constellation star coordinates (e.g. Orion belt star at approximately [0.22*W, 0.22*H]) and assert the sampled pixel differs from the background; or (c) add `data-constellation` attributes to a lightweight companion DOM layer created alongside the canvas draw calls.

4. **[FAIL-15 — Blocker]** Fix the FTM-VT-003 Jest test: (a) correct the upper filter bound from 0.55 to 0.50 to match the SRS requirement; (b) narrow the regex to target only constellation-specific rgba values, not all rgba values in the file (e.g. anchor the search to the constellation code block by line proximity, or export constellation color constants from a testable module).

5. **[FAIL-22 — Blocker]** Update the VTM entry for FTM-FR-012 to reflect the current state of UI-layer verification. If the UI tests are restored (action 2), no change is needed. If the deletion is formally approved, update the VTM to remove the Playwright suite references and document the new verification coverage.

6. **[FAIL-26 — Blocker]** Attach a documented inspection record for FTM-VT-004 and FTM-VT-007 before merge. The record must include: reviewer name, review date, items inspected (specific code lines), and a pass/fail determination with supporting notes.

### Recommended Actions (Warnings)

- Update SRS to v1.3: increment version number, update last-updated date to 2026-03-14, add VT row to Requirements Summary table with count 9, update total to 63, and add version history note for Amendment C.
- Fix the JavaScript operator precedence bug: `starsCtx.font = '11px ' + (getComputedStyle(document.body).getPropertyValue('--font').trim() || 'sans-serif');`
- Add a comment in `drawConstellations()` documenting the fractional coordinate system and the assumed aspect ratio.
- Add a quantitative definition for 'light blue' in FTM-VT-004 (e.g. enumerate the permitted rgba values used in the implementation).
- Add a cited baseline reference to FTM-VT-009 (SRS v1.2, or pre-amendment index.html commit hash).
- Update the VTM document header to reflect SRS v1.3 and generation date 2026-03-14.
- Remove the three superseded draft quality review sections for Issue #35 from quality-review.md, retaining only this canonical entry.
- Add `Closes #35` to the PR body.
- Resolve the duplicate test descriptions in the FTM-FR-031 Jest describe block.
- Document CI network access requirements for FTM-SC-004 live SRI tests, or add a network-availability guard.


## Quality Review — Issue #35: Update Visual Themes (Canonical Review)

| Field | Value |
|---|---|
| **PR / Issue** | Issue #35 — Update visual themes (constellation art at night, lavender clouds by day) |
| **Review Date** | 2026-03-14 |
| **Branch** | feature/issue-35-visual-themes |
| **Reviewer Role** | Quality Engineer |
| **Framework** | ISO 62304 (adapted, non-medical best-practice) |
| **Overall Verdict** | ❌ FAIL — Must resolve before merge |

> **Note:** Earlier draft review sections for Issue #35 in this document are superseded by this entry and should be removed.

### Summary

This PR implements constellation art (Orion, Cassiopeia, Big Dipper) for the night theme and lavender cloud color (#c9b8e8) for the day theme. The lavender color change is clean, minimal, and correctly implemented. The constellation implementation is directionally correct but contains a critical architectural defect (opacity accumulation on repeated redraws), a JavaScript operator precedence bug, and Playwright tests for FTM-VT-001/002/005/006 that are trivially passing and do not verify actual canvas rendering. Two FTM-FR-012 UI Playwright suites were deleted without justification, breaking the traceability chain for an active requirement. No inspection records have been provided for the two Inspection-method requirements (FTM-VT-004, FTM-VT-007).

### Findings

| # | Activity | Severity | Title |
|---|---|---|---|
| 1 | Requirements Quality §5.2 | ✅ PASS | Amendment C requirements are uniquely identified and well-formed |
| 2 | Requirements Quality §5.2 | ⚠️ WARNING | SRS version, date, and requirements count not updated for Amendment C |
| 3 | Requirements Quality §5.2 | ⚠️ WARNING | FTM-VT-007 uses subjective language without a measurable threshold |
| 4 | Requirements Quality §5.2 | ⚠️ WARNING | FTM-VT-004 'light blue' not quantitatively defined |
| 5 | Requirements Quality §5.2 | ⚠️ WARNING | FTM-VT-009 'unchanged' lacks a cited baseline version or enumerated attributes |
| 6 | Code Quality §5.5 | ✅ PASS | Lavender cloud color change is minimal, focused, and correctly implemented |
| 7 | Code Quality §5.5 | ✅ PASS | drawConstellations() uses canvas save/restore correctly |
| 8 | Code Quality §5.5 | ❌ FAIL | drawConstellations() called inside drawStars() — opacity accumulation risk on repeated redraws |
| 9 | Code Quality §5.5 | ⚠️ WARNING | JavaScript operator precedence bug in constellation label font assignment |
| 10 | Code Quality §5.5 | ⚠️ WARNING | Constellation star positions undocumented and aspect-ratio-sensitive |
| 11 | Code Quality §5.5 | ❌ FAIL | Two FTM-FR-012 UI Playwright suites deleted with no requirements change or waiver |
| 12 | Code Quality §5.5 | ⚠️ WARNING | FTM-FR-031 Jest describe block contains duplicate test descriptions |
| 13 | Test Coverage §5.6 | ❌ FAIL | FTM-VT-001/002/005/006 Playwright tests are trivially passing — canvas rendering not verified |
| 14 | Test Coverage §5.6 | ❌ FAIL | FTM-FR-012 UI-layer Playwright tests deleted — requirement now untested at UI layer |
| 15 | Test Coverage §5.6 | ❌ FAIL | FTM-VT-003 Jest test regex is overly broad — false-positive risk from non-constellation rgba values |
| 16 | Test Coverage §5.6 | ✅ PASS | FTM-VT-008 UI-layer test correctly reads computed background color from .cloud element |
| 17 | Test Coverage §5.6 | ✅ PASS | FTM-VT-009 cloud animation and shape tests are substantively implemented |
| 18 | Test Coverage §5.6 | ✅ PASS | FTM-SC-004 placeholder tests fully replaced with real implementations |
| 19 | Test Coverage §5.6 | ⚠️ WARNING | innerHTML-based lavender color checks in FTM-FR-033 block weaker than computed style |
| 20 | Test Coverage §5.6 | ⚠️ WARNING | No documented inspection record for FTM-VT-004 and FTM-VT-007 |
| 21 | Traceability §5.7 | ✅ PASS | All nine Amendment C requirements have VTM entries |
| 22 | Traceability §5.7 | ❌ FAIL | VTM FTM-FR-012 entry references deleted Playwright suites — traceability chain broken |
| 23 | Traceability §5.7 | ⚠️ WARNING | VTM document header still references v1.0 / 2026-02-20 |
| 24 | Traceability §5.7 | ⚠️ WARNING | FTM-VT-001/002/005/006 VTM entries imply verification fidelity not achieved by actual tests |
| 25 | Process Compliance | ❌ FAIL | No inspection record provided for FTM-VT-004 and FTM-VT-007 |
| 26 | Process Compliance | ⚠️ WARNING | quality-review.md contains three superseded draft reviews for Issue #35 |
| 27 | Process Compliance | ⚠️ WARNING | PR body missing 'Closes #35' issue link |
| 28 | Process Compliance | ⚠️ WARNING | FTM-SC-004 live network tests require CI network access — offline CI will fail |
| 29 | Process Compliance | ✅ PASS | Change is scoped to Issue #35 with no unrelated functional modifications |

### Required Actions Before Merge

1. **[FAIL-8 — Blocker]** Decouple `drawConstellations()` from `drawStars()` or add a re-entry guard (e.g. a module-level `constellationsDrawn` boolean reset in `clearStars()`) so that repeated calls to `drawStars()` do not repaint constellation art and accumulate opacity. Opacity accumulation directly violates FTM-VT-003 (opacity 0.4–0.5) and FTM-VT-007 (artwork shall not overpower star field).

2. **[FAIL-11 / FAIL-14 / FAIL-22 — Blocker]** Restore the two deleted FTM-FR-012 UI Playwright test suites (`[FTM-FR-012] Compass direction display (UI)` and `[FTM-FR-012] Compass direction display (UI) — additional tests`), or provide an SRS amendment formally removing or modifying FTM-FR-012 and FTM-UR-002 with QE sign-off, and update the VTM FTM-FR-012 entry accordingly. The deletion is unrelated to Issue #35 scope.

3. **[FAIL-13 — Blocker]** Replace trivially-passing FTM-VT-001, FTM-VT-002, FTM-VT-005, and FTM-VT-006 Playwright tests with tests that actually verify constellation rendering on the canvas. Recommended approach: inject a Canvas 2D API spy via `page.addInitScript()` before page load to record `arc()`, `lineTo()`, and `fillText()` calls, then assert that exactly three `fillText()` calls with the constellation names occurred, that `arc()` was called at least eight times (Orion's eight stars), and that `lineTo()` was called with expected coordinates.

4. **[FAIL-15 — Blocker]** Narrow the FTM-VT-003 Jest test regex to target only constellation-specific rgba values rather than all rgba values in index.html. Recommended approach: extract the `drawConstellations` function body from index.html before scanning (e.g. using a regex bounded by the function declaration and closing brace), or export constellation color constants from a dedicated module and import them into the test.

5. **[FAIL-25 — Blocker]** Attach a documented inspection record for FTM-VT-004 and FTM-VT-007 before merge. The record must include: reviewer name, review date, specific code lines reviewed, and a pass/fail determination with supporting notes. For FTM-VT-004 specifically, identify and enumerate the rgba values used for constellation lines (`rgba(180,210,255,0.42)`), dots (`rgba(220,235,255,0.50)`), and labels (`rgba(200,220,255,0.45)`) and confirm they satisfy 'white or light blue'.

### Recommended Actions (Warnings)

- Update SRS to v1.3: increment version number, update last-updated date to 2026-03-14, add VT row to Requirements Summary table (count 9), update total to 63, and add version history note for Amendment C.
- Fix the JavaScript operator precedence bug: `starsCtx.font = '11px ' + (getComputedStyle(document.body).getPropertyValue('--font').trim() || 'sans-serif');`
- Add a comment in `drawConstellations()` documenting the fractional coordinate system and the assumed viewport aspect ratio.
- Add a quantitative definition for 'light blue' in FTM-VT-004 by enumerating the permitted rgba values used in the implementation.
- Add a cited baseline reference (SRS v1.2 or pre-amendment index.html commit hash) to FTM-VT-009 and enumerate the preserved attributes: border-radius, filter, animation-name, animation-timing-function.
- Update the VTM document header to reflect SRS v1.3 and generation date 2026-03-14.
- Update FTM-VT-001/002/005/006 VTM notes to accurately describe what the tests currently verify (DOM/structural checks) versus what is not yet verified (canvas pixel content).
- Remove the three superseded draft quality review sections for Issue #35 from quality-review.md, retaining only this canonical entry.
- Add `Closes #35` to the PR body.
- Resolve the duplicate test descriptions in the FTM-FR-031 Jest describe block.
- Document CI network access requirements for FTM-SC-004 live SRI tests, or add a `page.route()` intercept to serve SunCalc locally during CI runs.


## Quality Review — Issue #37: Cloud color lavender → sage green

| Field | Value |
|---|---|
| **Review Date** | 2026-03-14 |
| **Issue** | #37 |
| **Change Summary** | Update daytime cloud fill color from soft lavender (#c9b8e8) to soft sage green (#a8d5a2) |
| **Artifacts Reviewed** | FTM-SRS-001.md, index.html, traceability-matrix.txt, verification.test.js, verification.spec.js, docs/security-review.md |
| **Framework** | ISO 62304 (adapted, non-medical) |
| **Overall Verdict** | **PASS — Ready to merge with documented warnings** |

### Findings Summary

| # | Activity | Severity | Title |
|---|---|---|---|
| 1 | Requirements Quality §5.2 | PASS | FTM-VT-008 requirement updated correctly and unambiguously |
| 2 | Requirements Quality §5.2 | WARNING | SRS document version header not updated to reflect Amendment D |
| 3 | Requirements Quality §5.2 | WARNING | Version numbering gap — no evidence of Amendment C |
| 4 | Code Quality §5.5 | PASS | Implementation change is minimal, focused, and internally consistent |
| 5 | Code Quality §5.5 | PASS | No orphaned code changes detected |
| 6 | Code Quality §5.5 | PASS | Hex color value correctly converts to rgba values used in implementation |
| 7 | Test Coverage §5.6 | PASS | FTM-VT-008 has comprehensive test coverage at both config and UI layers |
| 8 | Test Coverage §5.6 | PASS | FTM-VT-009 test coverage maintained for shape/animation invariance |
| 9 | Test Coverage §5.6 | WARNING | Legacy negative test weakened: white color guard replaced with lavender guard |
| 10 | Test Coverage §5.6 | WARNING | Duplicate FTM-FR-033 describe blocks in verification.spec.js |
| 11 | Traceability §5.7 | PASS | Traceability matrix updated consistently with SRS and implementation |
| 12 | Traceability §5.7 | PASS | No orphaned traceability entries introduced |
| 13 | Traceability §5.7 | WARNING | Traceability matrix document header still references v1.0 / 2026-02-20 |
| 14 | Process Compliance | PASS | Security review completed and documented |
| 15 | Process Compliance | PASS | Change is consistent across all SDLC artifacts |
| 16 | Process Compliance | WARNING | SRS Amendment D label skips Amendment C with no documented rationale |

### Warnings Requiring Follow-up

1. **SRS version header** — Update FTM-SRS-001.md header block to Version 1.3, Last Updated 2026-03-14.
2. **Amendment C gap** — Clarify whether Amendment C exists outside this diff or whether the label should be corrected to Amendment C.
3. **Traceability matrix header** — Update to reference SRS v1.3 / 2026-03-14.
4. **White cloud negative test** — Consider re-adding a guard asserting cloud color is not white alongside the lavender-absence test.
5. **Duplicate FTM-FR-033 describe blocks** — Raise a cleanup issue to consolidate the three duplicate Playwright describe blocks for FTM-FR-033.

### Pre-existing Open Issues (not introduced by this PR)

- MEDIUM: Missing SRI integrity attribute on SunCalc CDN script (FTM-SC-001/FTM-SC-004)
- MEDIUM: Missing HTTP security headers
- LOW: FTM-SC-004 tests require live CDN network access in CI
- LOW: Constellation-absence test uses CSS class check rather than label string
- INFO: FTM-FR-012 compass-direction end-to-end test coverage reduced in prior PR


## Quality Review — Issue #47 (Duplicate FTM-FR-033 test blocks consolidation)

**Date:** 2026-03-14  
**Reviewer:** Quality Engineering  
**Standard:** ISO 62304-inspired SDLC (non-medical adaptation)  
**Verdict:** FAIL — Issues must be resolved before merge

### Change Summary

Consolidate three duplicate Playwright `test.describe` blocks for FTM-FR-033 (animated clouds in daytime theme) into a single canonical block. No application code, SRS requirements, or other test files are modified.

### Findings Summary

| Severity | Activity | Title |
|---|---|---|
| PASS | Requirements Quality §5.2 | No new requirements introduced |
| WARNING | Requirements Quality §5.2 | FTM-FR-033 SRS text does not specify sage green color #a8d5a2 |
| PASS | Code Quality §5.5 | Change is minimal and focused on test consolidation |
| **FAIL** | Code Quality §5.5 | Canonical FTM-FR-033 test block absent from diff — net result may be zero coverage |
| WARNING | Code Quality §5.5 | Security review references files not present in diff; reviewer is AI model |
| **FAIL** | Test Coverage §5.6 | Post-consolidation FTM-FR-033 test coverage cannot be confirmed |
| WARNING | Test Coverage §5.6 | Night-theme negative assertion must be confirmed in canonical block |
| PASS | Test Coverage §5.6 | No orphaned tests introduced |
| **FAIL** | Traceability §5.7 | VTM Test Suite name for FTM-FR-033 will be stale if canonical block has different describe() name |
| WARNING | Traceability §5.7 | VTM Notes do not reflect all four required coverage points |
| WARNING | Process Compliance | Security reviewer listed as AI model, not human engineer |
| PASS | Process Compliance | Security review documented for Issue #47 |
| WARNING | Process Compliance | CI scripting changes referenced in security review not visible in diff |

### Required Actions Before Merge

1. **[FAIL — Code/Test]** Provide the canonical FTM-FR-033 `test.describe` block in the diff. The four required coverage points must be present: (a) cloud layer DOM presence in day theme, (b) sage green fill color #a8d5a2, (c) cloud animation active, (d) clouds absent in night theme.
2. **[FAIL — Traceability]** Update the VTM entry for FTM-FR-033: correct the Test Suite name to match the canonical block's exact `describe()` string, and update Notes to enumerate all active test cases.
3. **[FAIL — Test Coverage]** Confirm the night-theme negative assertion (clouds absent / cloudCount === 0 at night) is present in the canonical block.

### Recommended Actions (Non-Blocking)

4. **[WARNING — Requirements]** Consider adding a sub-requirement to FTM-FR-033 (or a new FTM-FR-033a) to formally specify the sage green color constraint #a8d5a2, providing a traceable basis for the color assertion in the test.
5. **[WARNING — Process]** Replace AI model name with a human reviewer name in the security review entry, or add a human sign-off line.
6. **[WARNING — Process]** Clarify whether `.github/scripts/sdlc_session3.py` and `.github/scripts/sdlc_session5.py` were modified; if so, include them in the diff for review.
7. **[WARNING — Traceability]** Update VTM Notes for FTM-FR-033 to enumerate all four coverage points once canonical block is confirmed.


## Quality Review — Issue #49 (Cloud color revert: sage green → lavender)

**Date:** 2026-03-14  
**Reviewer:** Quality Engineering (ISO 62304-adapted review)  
**Branch:** issue-49  
**Verdict:** FAIL — Issues must be resolved before merge

---

### Summary

Issue #49 requests a single cosmetic change: revert the daytime cloud fill color in `index.html` from sage green (`rgba(168,213,162,0.7)`) back to lavender (`rgba(201,184,232,0.7)`). The core implementation change in `index.html` is correct, minimal, and well-executed. However, four blocking or significant issues were identified that prevent merge approval.

---

### FAIL Findings

| # | Activity | Title |
|---|---|---|
| F1 | Test Coverage §5.6 | Three FTM-FR-031 unit tests removed without documented rationale |
| F2 | Traceability §5.7 | Traceability matrix FTM-VT-008 structured entry not updated — append-only note is insufficient |
| F3 | Traceability §5.7 | Traceability matrix header still references SRS v1.4 instead of v1.5 |
| F4 | Process Compliance §5.7 | Out-of-scope test deletions violate minimal-change principle and Issue #49 scope |

**F1 — Three FTM-FR-031 unit tests removed without rationale:**  
The following tests were deleted from `verification.test.js` with no justification, no SRS change, and no traceability entry:
- `'identifies day when sun altitude is 0° (at the horizon)'`
- `'identifies day when sun altitude is positive (sun above horizon)'`
- `'returns false (day) for real noon UTC conditions in New York in summer'`

These tests cover boundary and integration scenarios for FTM-FR-031 (daytime theme threshold). Issue #49 explicitly states the scope is limited to `.cloud` background color in `index.html`. Removing unrelated tests without a documented change request or rationale is a scope violation and reduces coverage of a functionally important threshold.

**F2 — Traceability matrix FTM-VT-008 structured entry not updated:**  
The Section 12 structured entry for FTM-VT-008 still describes sage green (`#a8d5a2 / rgba(168,213,162)`) as the required color and states "Verify no legacy lavender (#c9b8e8) remains" — which is now the opposite of the requirement. An UPDATE note appended to the bottom of the file is not a substitute for correcting the primary structured entry. Auditors reading the matrix will encounter contradictory information.

**F3 — Traceability matrix version header not updated:**  
The matrix header reads `FTM-SRS-001 v1.4`. With Amendment E in effect, this should read `v1.5`. The SRS document header also still reads Version 1.4. Both must be updated.

**F4 — Out-of-scope changes violate minimal-change principle:**  
ISO 62304-inspired practice requires that changes to verification artifacts be traceable to a corresponding requirement change. The three deleted FTM-FR-031 tests have no corresponding requirement change, no change request, and no documented rationale. This is an undocumented process deviation.

---

### WARNING Findings

| # | Activity | Title |
|---|---|---|
| W1 | Requirements Quality §5.2 | SRS document version field not incremented to v1.5 |
| W2 | Requirements Quality §5.2 | Amendment E 'date TBD' in version history |
| W3 | Test Coverage §5.6 | CSS rule Playwright test fragility noted (stylesheet scan) |
| W4 | Traceability §5.7 | FTM-FR-033 Notes and Test Suite name in matrix not updated |
| W5 | Process Compliance §5.7 | Security review INFO finding (SRS version) not resolved before merge |

---

### PASS Findings

- FTM-VT-008 SRS requirement updated correctly and unambiguously
- Implementation change in `index.html` is correct, minimal, and limited to three color substitutions
- No orphaned code changes; all modifications traceable to Issue #49
- Jest FTM-VT-008 tests updated correctly with improved `getRenderCloudsFnBody()` scoping
- Playwright FTM-VT-008 and FTM-FR-033 tests updated correctly
- Stylesheet scan fallback correctly tightened (false return instead of innerHTML scan)
- Security review completed and documented in `docs/security-review.md`
- No XSS, COPPA, privacy, or injection concerns introduced

---

### Required Actions Before Merge

1. **Restore the three deleted FTM-FR-031 unit tests** in `verification.test.js`, or provide a separate change request with documented rationale for their removal.
2. **Update the FTM-VT-008 structured entry** in `traceability-matrix.txt` (Section 12) to reflect lavender (#c9b8e8 / rgba(201,184,232,0.7)) as the required color and remove the stale sage-green references.
3. **Update the traceability matrix header** from `v1.4` to `v1.5`.
4. **Update the SRS document version field** from 1.4 to 1.5.
5. **Populate the Amendment E date** in the SRS version history (replace 'date TBD').
6. **Update the FTM-FR-033 Notes and Test Suite fields** in the traceability matrix to reference lavender and the renamed describe block.


## Quality Review — Issue #49 (Cloud color revert: sage green → lavender) — Review Cycle 2

**Date:** 2026-03-23  
**Reviewer:** Quality Engineering (ISO 62304-adapted review)  
**Branch:** issue-49  
**Verdict:** FAIL — Blocking issues must be resolved before merge

---

### Summary

This is the second quality review cycle for Issue #49. Several findings from the first review cycle (documented above) have been resolved: the FTM-VT-008 structured traceability entry has been corrected, the traceability matrix header has been updated to v1.5, the SRS version field has been incremented to v1.5, and the FTM-FR-033 matrix entry and test suite names have been updated. The core implementation in `index.html` remains correct and minimal.

However, three blocking FAIL findings remain unresolved, all stemming from the same root cause: the undocumented deletion of three FTM-FR-031 unit tests from `verification.test.js`. These deletions are outside the scope of Issue #49, have no change request, no rationale, and create a traceability discrepancy in the FTM-FR-031 matrix entry.

---

### FAIL Findings

| # | Activity | Title |
|---|---|---|
| F1 | Code Quality §5.5 | Three FTM-FR-031 unit tests deleted with no change request, rationale, or SRS change |
| F2 | Test Coverage §5.6 | FTM-FR-031 test coverage reduced below documented level without authorization |
| F3 | Traceability §5.7 | FTM-FR-031 traceability matrix Notes no longer match actual test coverage |

**F1 — Three FTM-FR-031 unit tests deleted without rationale:**  
The following tests were removed from `verification.test.js` with no corresponding change request, no SRS requirement change, and no documented justification:
- `'identifies day when sun altitude is 0° (at the horizon)'`
- `'identifies day when sun altitude is positive (sun above horizon)'`
- `'returns false (day) for real noon UTC conditions in New York in summer'`

Issue #49 restricts scope to the `.cloud` background color in `index.html`. These deletions are an undocumented scope deviation.

**F2 — FTM-FR-031 test coverage reduced below documented level:**  
The traceability matrix Notes for FTM-FR-031 state coverage at 0°, positive altitude, and real-noon integration scenarios. Those tests no longer exist in the test suite. The documented coverage claim is false.

**F3 — FTM-FR-031 traceability matrix Notes inaccurate:**  
The matrix Notes for FTM-FR-031 describe test scenarios that are not present in `verification.test.js` following the deletions. The matrix must be corrected to reflect actual coverage, or the tests must be restored.

---

### WARNING Findings

| # | Activity | Title |
|---|---|---|
| W1 | Requirements Quality §5.2 | Amendment E date in SRS version history inconsistent with 'Last Updated' field |
| W2 | Requirements Quality §5.2 | SRS Section 10 summary table does not include FTM-VT series row |
| W3 | Test Coverage §5.6 | getRenderCloudsFnBody() scoping heuristic has edge-case fragility |
| W4 | Traceability §5.7 | Traceability matrix 'Generated' date not updated to reflect Amendment E date |
| W5 | Process Compliance §5.7 | Security review Reviewer field identifies AI model rather than human reviewer |

---

### PASS Findings

- FTM-VT-008 SRS requirement updated correctly to lavender (#c9b8e8) — prior F2 resolved
- Traceability matrix header updated to v1.5 — prior F3 resolved
- SRS version field incremented to v1.5 — prior W1 resolved
- FTM-VT-008 structured entry in Section 12 corrected — prior F2 resolved
- FTM-FR-033 matrix Notes and Test Suite name updated to lavender — prior W4 resolved
- Implementation in `index.html` correct and limited to three color substitutions
- FTM-VT-008 Jest and Playwright tests updated correctly with improved scoping
- Stylesheet scan fallback correctly tightened (returns false instead of innerHTML scan)
- Security review completed and documented in `docs/security-review.md`
- No XSS, COPPA, privacy, or injection concerns introduced

---

### Required Actions Before Merge

1. **[BLOCKING] Restore the three deleted FTM-FR-031 unit tests** in `verification.test.js`, or file a separate change request with documented rationale for their removal and update the FTM-FR-031 traceability matrix Notes to reflect the reduced coverage.
2. **[BLOCKING] Correct the FTM-FR-031 traceability matrix Notes** to accurately describe the tests that exist in the test file (whether the tests are restored or the deletions are formally accepted via a separate CR).
3. **[RECOMMENDED] Update the SRS 'Last Updated' field** from March 14, 2026 to March 23, 2026 to match the Amendment E date.
4. **[RECOMMENDED] Update the traceability matrix 'Generated' date** to match the Amendment E date.
5. **[RECOMMENDED] Add a human reviewer sign-off** to the security review entry in `docs/security-review.md`.


## Quality Review — Issue #54 (Cloud color: lavender → peach orange)

**Date:** 2026-03-23  
**Reviewer:** Quality Engineering (automated ISO 62304-inspired review)  
**Branch:** issue-54  
**SRS Version:** FTM-SRS-001 v1.6  
**Overall Verdict:** ❌ FAIL — Must resolve before merge

---

### Summary

The primary change (FTM-VT-008 cloud fill color lavender → peach orange / #FFB347) is implemented correctly and completely in all three required locations in `index.html`, with dual-layer test coverage and correct traceability matrix updates. However, this PR bundles **five undeclared scope additions** beyond Issue #54, creating traceability gaps, an unexplained test assertion weakening, and stale documentation defects in test header comments.

---

### Findings

| # | Activity | Severity | Title |
|---|---|---|---|
| 1 | Requirements Quality | PASS | FTM-VT-008 requirement updated correctly and unambiguously |
| 2 | Requirements Quality | WARNING | Security review references undisclosed secondary change (FTM-FR-032 opacity fix) |
| 3 | Requirements Quality | WARNING | SRS v1.3 history note references lavender as 'initial' color — minor narrative ambiguity |
| 4 | Code Quality | PASS | Cloud color change minimal, correct, and consistently applied in all three locations |
| 5 | Code Quality | FAIL | Undeclared secondary code change in applyTheme() (starsCanvas opacity) not traceable to Issue #54 |
| 6 | Code Quality | WARNING | FTM-FR-011 test assertion weakened (toBeCloseTo → toBeLessThan) with no requirement justification |
| 7 | Code Quality | WARNING | FTM-FR-043 test substantially expanded with no linked requirement change |
| 8 | Test Coverage | PASS | FTM-VT-008 has correct dual-layer config + UI test coverage with positive and negative assertions |
| 9 | Test Coverage | PASS | FTM-FR-033 suite updated in place; no test blocks removed |
| 10 | Test Coverage | FAIL | Stale section header comment in verification.test.js still references #a8d5a2 (sage green) for FTM-VT-008 |
| 11 | Test Coverage | FAIL | Stale section header comment in verification.spec.js still references #a8d5a2 (sage green) for FTM-VT-008 |
| 12 | Test Coverage | FAIL | FTM-SC-001/002/003 TODO comment removal bundled with no linked issue or requirement change |
| 13 | Traceability | PASS | VTM updated correctly for FTM-VT-008 and FTM-FR-033 |
| 14 | Traceability | FAIL | FTM-FR-032 opacity fix has no issue number, no requirement amendment, no formal traceability chain |
| 15 | Traceability | WARNING | VTM FTM-FR-032 notes expanded from two to four tests with no Issue #54 justification |
| 16 | Traceability | WARNING | FTM-FR-011 test assertion change not reflected in VTM notes |
| 17 | Process Compliance | FAIL | PR bundles ≥5 undeclared changes beyond Issue #54 scope |
| 18 | Process Compliance | PASS | Security review completed and addresses primary change adequately |
| 19 | Process Compliance | WARNING | Security review acknowledges but does not formally flag the opacity fix scope addition |
| 20 | Process Compliance | PASS | SRS version incremented correctly with complete version history |

---

### Required Actions Before Merge

1. **[FAIL — Code/Traceability]** Open a separate GitHub issue for the `starsCanvas.style.opacity` fix in `applyTheme()`. Link it to FTM-FR-032. Add a requirement amendment or defect closure note to the SRS. Update the VTM FTM-FR-032 entry with the issue reference. Do not merge this fix as part of Issue #54.
2. **[FAIL — Test Coverage]** Fix the stale section header comment in `verification.test.js` above the `[FTM-VT-008]` describe block: replace `#a8d5a2 (soft sage green)` with `#FFB347 (soft peach orange / rgba(255,179,71))`.
3. **[FAIL — Test Coverage]** Fix the identical stale section header comment in `verification.spec.js` above the `[FTM-VT-008]` describe block.
4. **[FAIL — Process]** Either revert the FTM-SC-001/002/003 TODO comment removals (out of scope) or open a separate housekeeping issue and reference it in the commit message.
5. **[WARNING — Code]** Document or revert the FTM-FR-011 assertion change (`toBeCloseTo` → `toBeLessThan`). If the weaker assertion is intentional, open a separate issue with rationale.
6. **[WARNING — Code]** Document or revert the FTM-FR-043 test expansion. If the expanded test is intentional, open a separate issue.
7. **[WARNING — Traceability]** Update VTM FTM-FR-011 notes to reflect the changed assertion if it is retained.

---

### Primary Change Assessment

The Issue #54 primary deliverable (FTM-VT-008 cloud color change) is **correctly implemented** and would be mergeable in isolation. All three color locations in `index.html` are updated, the SRS and VTM are correctly amended, and test coverage is thorough with both positive and negative assertions. The blocking issues are entirely due to bundled out-of-scope changes.
