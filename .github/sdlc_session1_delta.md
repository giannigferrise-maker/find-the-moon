# Session 1 Requirements Delta — Issue #49

**This delta is the authoritative specification for Sessions 2 and 3.**
Sessions 2 and 3 implement and verify against this delta — not the original issue body.

## Classification
Enhancement-A2

## Diagnosis
The issue requests reverting the daytime cloud fill color from sage green back to lavender. This is a change to an existing formally specified value: FTM-VT-008 currently mandates the cloud fill color as #a8d5a2 (soft sage green), a value that was itself set by an in-place update recorded in the v1.4 version note under Amendment C. Because the color is explicitly specified in an existing SRS requirement, this is Enhancement-A2 — an update to an existing specified value. The full SRS must be scanned for all occurrences of the sage green value: it appears in FTM-VT-008 (the requirement text itself) and in the Amendment C version history note (v1.4 entry). Both must be updated for internal consistency. The rgba form rgba(168, 213, 162, 0.7) mentioned in the issue body is the CSS runtime equivalent of #a8d5a2 at 0.7 opacity; the SRS uses the hex form, so the update targets hex. The target lavender value is rgba(201, 184, 232, 0.7) per the issue, which corresponds to hex #c9b8e8 — the value previously used before the v1.4 amendment, as confirmed by the v1.3 version note. No new requirements are needed; no requirements are deleted; only the existing FTM-VT-008 requirement text and the version history note require updating.

## New requirements
*(Session 2: implement | Session 3: write new test block)*
(none)

## Updated requirements in-place
*(Session 2: update code to new values | Session 3: update expected values in existing tests — do not write new test blocks)*
| Req ID | What changed | Old value | New value |
|---|---|---|---|
| FTM-VT-008 | Cloud fill color reverted from sage green to lavender | #a8d5a2 (soft sage green) | #c9b8e8 (lavender) |
| FTM-VT-008 | Version history note updated to record Amendment E revert | No v1.5 entry present | v1.5 entry recording revert of cloud fill color to lavender (#c9b8e8) |

## Deleted requirements
*(Session 2: remove code implementing this | Session 3: remove the corresponding test block)*
(none)

## Violated requirements — defect fix
*(Session 2: fix code to comply with these requirements | Session 3: existing tests should now pass — do not modify them)*
(none)

## Implementation guidance
*(Session 2: apply this | Session 3: no test change needed)*
In index.html, locate the CSS rule for the `.cloud` selector. Change the `background` (or `background-color`) property value from rgba(168, 213, 162, 0.7) to rgba(201, 184, 232, 0.7). This is the only change required. No JavaScript, no layout, no animation timing, and no other CSS properties should be modified. The hex equivalent of the target value is #c9b8e8 at 70% opacity. If the color is defined as a CSS custom property or in a separate stylesheet rather than directly on `.cloud`, trace it to its declaration and update it there instead, but the rendered value must resolve to rgba(201, 184, 232, 0.7).
