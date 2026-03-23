# Session 1 Requirements Delta — Issue #49

**This delta is the authoritative specification for Sessions 2 and 3.**
Sessions 2 and 3 implement and verify against this delta — not the original issue body.

## Classification
Enhancement-A2

## Diagnosis
The issue requests reverting the daytime cloud fill color from sage green (rgba(168, 213, 162, 0.7) / #a8d5a2) back to lavender (rgba(201, 184, 232, 0.7) / #c9b8e8). This is a change to an already-specified SRS value. FTM-VT-008 currently mandates the sage green fill color (#a8d5a2), which was set by Amendment D (v1.4). FTM-VT-009 is a companion requirement that must be reviewed — it constrains only shape and animation, not color, so it does not require update. The cloud color value appears in exactly one formal requirement (FTM-VT-008); there are no other SRS occurrences of the sage green value or the cloud fill color. This is a straightforward Enhancement-A2: update FTM-VT-008 in place. The version history note for v1.4 in the Amendment C section also references the sage green color and must be updated to remain internally consistent. The issue also references the CSS value rgba(168, 213, 162, 0.7) in the implementation; the requirement uses the hex shorthand #a8d5a2, which is equivalent — both must revert to lavender. No new requirements are needed; no requirements are deleted.

## New requirements
*(Session 2: implement | Session 3: write new test block)*
(none)

## Updated requirements in-place
*(Session 2: update code to new values | Session 3: update expected values in existing tests — do not write new test blocks)*
| Req ID | What changed | Old value | New value |
|---|---|---|---|
| FTM-VT-008 | Cloud fill color reverted from sage green to lavender | #a8d5a2 (soft sage green) | #c9b8e8 (lavender) |
| version_history_note | Version history updated to record Amendment E revert | v1.4 note only | v1.4 note plus new v1.5 / Amendment E entry |

## Deleted requirements
*(Session 2: remove code implementing this | Session 3: remove the corresponding test block)*
(none)

## Violated requirements — defect fix
*(Session 2: fix code to comply with these requirements | Session 3: existing tests should now pass — do not modify them)*
(none)

## Implementation guidance
*(Session 2: apply this | Session 3: no test change needed)*
In index.html, locate the CSS rule for the `.cloud` selector. Change the `background` (or `background-color`) property value from `rgba(168, 213, 162, 0.7)` to `rgba(201, 184, 232, 0.7)`. No other CSS properties, no other selectors, and no JavaScript logic should be modified. The hex equivalents are #a8d5a2 (old) and #c9b8e8 (new); if the codebase stores the value in hex form rather than rgba, apply the equivalent hex change. Confirm that no other file (e.g. a separate stylesheet or a canvas drawing call) independently sets the cloud fill color — if found, update those occurrences to rgba(201, 184, 232, 0.7) as well so the rendered color is consistent.
