# Session 1 Requirements Delta — Issue #54

**This delta is the authoritative specification for Sessions 2 and 3.**
Sessions 2 and 3 implement and verify against this delta — not the original issue body.

## Classification
Enhancement-A2

## Diagnosis
Issue #54 requests changing the daytime animated cloud fill color from lavender (#c9b8e8) to soft peach orange (#FFB347 / rgba(255,179,71)). This is a change to an explicitly specified value in the SRS — FTM-VT-008 currently mandates the fill color #c9b8e8. Because the SRS already formally specifies this color value, this is Enhancement-A2: an in-place update to an existing requirement. FTM-VT-009 references cloud shape and animation behavior but does not mention the fill color, so no change is needed there. A full scan of the SRS confirms #c9b8e8 appears only in FTM-VT-008 and in the Amendment C version history note (v1.5 history line references the revert back to #c9b8e8) — the history line is a narrative record and should be left intact. Only FTM-VT-008 contains a normative color specification that must be updated.

## New requirements
*(Session 2: implement | Session 3: write new test block)*
(none)

## Updated requirements in-place
*(Session 2: update code to new values | Session 3: update expected values in existing tests — do not write new test blocks)*
| Req ID | What changed | Old value | New value |
|---|---|---|---|
| FTM-VT-008 | Cloud fill color | #c9b8e8 (lavender) | #FFB347 (soft peach orange / rgba(255,179,71)) |
| HEADER | Document version bump | 1.5 | 1.6 |
| HEADER | Document last updated date | March 14, 2026 | March 23, 2026 |
| VERSION_HISTORY | Version history entry added for Amendment F | v1.5 entry only | v1.5 entry plus new v1.6 entry |

## Deleted requirements
*(Session 2: remove code implementing this | Session 3: remove the corresponding test block)*
(none)

## Violated requirements — defect fix
*(Session 2: fix code to comply with these requirements | Session 3: existing tests should now pass — do not modify them)*
(none)

## Implementation guidance
*(Session 2: apply this | Session 3: no test change needed)*
In the daytime theme cloud-rendering code, locate all references to the cloud fill color and replace the lavender value with the new peach orange value. Specifically: (1) Any canvas fillStyle or CSS fill property set to '#c9b8e8' or 'rgb(201,184,232)' or 'lavender' used for cloud drawing should be changed to '#FFB347' or 'rgba(255,179,71,1)'. (2) If the color is defined as a named constant or CSS custom property (e.g. --cloud-color or CLOUD_FILL), update the constant/variable definition; do not scatter the hex value at each draw call. (3) No changes to cloud path geometry, animation timing, opacity, blur, or any other property — only the fill color changes. Both hex (#FFB347) and rgba (rgba(255,179,71,1)) forms are acceptable; use whichever form is consistent with the existing codebase style.


## Orchestrator — App Bug Report (Session 3 Failure)
Session 3 tests identified the following app bugs that must be fixed in the implementation. The tests are correct — the code is wrong.

- [FTM-FR-032] star canvas has opacity 0 and body has no 'night' class in the daytime theme: the #stars-canvas element has computed opacity ~0.967 instead of 0 when the daytime theme is active (SUNCALC_DAY mock, sun altitude +0.5). The app should set opacity:0 on #stars-canvas when the day theme is applied, but it is not doing so correctly. This is not explained by any delta entry and is an app defect to be fixed in Session 2.

Fix these issues in index.html or src/moonLogic.js. Do not modify the test files.


## Orchestrator — Fix Guidance (Bundled out-of-scope changes + stale comments)
The primary Issue #54 change (cloud color to peach orange) is correct. The failures are due to out-of-scope changes bundled into the same PR and stale comments in test files. Perform ALL of the following:

1. **Revert the `starsCanvas.style.opacity` fix in `applyTheme()`.** This FTM-FR-032 change must not ship with Issue #54. Remove it from the PR entirely. (A separate issue will need to be opened for it later, but that is outside this session's scope.)

2. **Revert the FTM-SC-001/002/003 TODO comment removals.** These are housekeeping changes out of Issue #54 scope. Restore the original TODO comments.

3. **Revert the FTM-FR-011 assertion change** (`toBeCloseTo` → `toBeLessThan`) in the relevant test file(s). Restore the original `toBeCloseTo` assertion.

4. **Revert the FTM-FR-043 test expansion** if it is not directly required by Issue #54. Restore the original test.

5. **Fix the stale section header comment in `verification.test.js`** above the `[FTM-VT-008]` describe block: replace `#a8d5a2 (soft sage green)` with `#FFB347 (soft peach orange / rgba(255,179,71))`.

6. **Fix the identical stale section header comment in `verification.spec.js`** above the `[FTM-VT-008]` describe block: same replacement as above.

After these changes the PR should contain ONLY the Issue #54 cloud color change and its directly associated SRS/VTM/test updates. No other functional or cosmetic changes should remain.
