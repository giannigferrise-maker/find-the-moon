# Inspection Records

This file documents Inspection-method requirement verifications per the FTM-SRS-001 traceability matrix.

---

## Issue #35 — Visual Theme Update (Amendment C)

**Inspection date:** 2026-03-11
**Inspector:** SDLC automated review + project author (Gianni Ferrise)

### FTM-VT-004 — Constellation lines and dot markers rendered in white or light blue only

**Requirement:** The constellation lines and dot markers shall be rendered in white or light blue only.

**Evidence:** `index.html` `drawConstellations()` function defines:
- `lineColor = 'rgba(180,210,255,0.42)'` — light blue with alpha 0.42 ✅
- `dotColor  = 'rgba(220,235,255,0.50)'` — near-white light blue with alpha 0.50 ✅
- `textColor = 'rgba(200,220,255,0.45)'` — light blue with alpha 0.45 ✅

All three colors are in the white/light-blue range. No red, green, yellow, or other non-compliant colors are used.

**Verdict:** PASS

---

### FTM-VT-007 — Constellation artwork does not obscure or overpower the animated star field

**Requirement:** The constellation artwork and labels shall not obscure or overpower the existing animated star field.

**Evidence:**
- Constellation elements are rendered with opacity in the range 0.42–0.50 (per FTM-VT-003 / FTM-VT-004 inspection above), well below full opacity.
- Constellations are drawn on the same `#stars-canvas` as the star field, after the stars, meaning they layer on top of — but at low opacity do not overpower — the star field.
- The star field animation (random arc drawing on every requestAnimationFrame) runs independently; constellation drawing runs once at load time (`starsDrawn` guard prevents re-entry).
- Visual inspection of the running application confirms star field remains clearly visible through constellation overlay.

**Verdict:** PASS

---

### FTM-FR-012 Playwright test cleanup rationale

Two Playwright `test.describe` blocks for FTM-FR-012 were removed from `verification.spec.js` in this branch. These blocks used the selectors `#moon-dir` and `#moon-direction`, neither of which exists in `index.html`. The actual DOM element is `#direction-text`. The removed blocks were testing non-existent elements and would have passed vacuously (Playwright `toBeVisible` on a non-existent locator times out / fails, but if the block had no assertions, it would pass silently).

The remaining FTM-FR-012 `test.describe('[FTM-FR-012] Compass direction display (UI) — direction tests', ...)` block uses the correct `#direction-text` selector and contains 4 substantive tests covering all aspects of FTM-FR-012.

The traceability matrix entry for FTM-FR-012 already references the correct test suite name and requires no update.
