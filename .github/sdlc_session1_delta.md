# Session 1 Requirements Delta — Issue #49

**This delta is the authoritative specification for Sessions 2 and 3.**
Sessions 2 and 3 implement and verify against this delta — not the original issue body.

## Classification
Enhancement-A2

## Diagnosis
The issue requests reverting the daytime cloud fill color from sage green back to lavender. The SRS already formally specifies the cloud fill color: FTM-VT-008 currently mandates '#a8d5a2 (soft sage green)' following the Amendment D in-place update recorded in v1.4. The issue is therefore a change to an existing specified value — not a defect (the code is meeting the current v1.4 requirement) and not a new capability. This is a clean Enhancement-A2: the one affected requirement, FTM-VT-008, must be updated in-place. Scanning the full SRS for all occurrences of the cloud color: the value '#a8d5a2' (and its rgba equivalent 'rgba(168, 213, 162, 0.7)') appears only in FTM-VT-008 and in the issue body; it does not appear in any other requirement row. The rgba form 'rgba(168, 213, 162, 0.7)' is cited in the GitHub issue body but is not present in any SRS requirement text, so no additional row needs updating. FTM-VT-009 references cloud shape and animation but not fill color, so it is unaffected. The Amendment D version-history note in Section 12 describes the prior color change and should also be updated to record this reversal, but that note is prose metadata, not a requirement row — it is captured in implementation_guidance for the document maintainer. No new amendment section is needed because no new requirement is being added; only an existing requirement value changes.

## New requirements
*(Session 2: implement | Session 3: write new test block)*
(none)

## Updated requirements in-place
*(Session 2: update code to new values | Session 3: update expected values in existing tests — do not write new test blocks)*
| Req ID | What changed | Old value | New value |
|---|---|---|---|
| FTM-VT-008 | Cloud fill color | #a8d5a2 (soft sage green) | #c9b8e8 (lavender) |
| N/A — version history note | Version history note to record the revert | v1.4 note only | v1.4 note retained; v1.5 note appended |

## Deleted requirements
*(Session 2: remove code implementing this | Session 3: remove the corresponding test block)*
(none)

## Violated requirements — defect fix
*(Session 2: fix code to comply with these requirements | Session 3: existing tests should now pass — do not modify them)*
(none)

## Implementation guidance
*(Session 2: apply this | Session 3: no test change needed)*
In index.html, locate the CSS rule for the `.cloud` selector. Change the `background` (or `background-color`) property value from `rgba(168, 213, 162, 0.7)` to `rgba(201, 184, 232, 0.7)`. This is the only file and the only property that must change. No JavaScript, no layout, no animation timing, and no other CSS selector should be touched. After the change, the hex value rendered by the browser must resolve to #c9b8e8 at 70% opacity, consistent with updated FTM-VT-008. The document version header in FTM-SRS-001.md should be incremented to v1.5 and the Last Updated date set to the date of merge when the SRS in-place update is applied.
