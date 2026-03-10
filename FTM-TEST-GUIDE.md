# VERIFICATION ENGINEER'S TEST GUIDE
## Find the Moon — Web Application

| Field | Value |
|---|---|
| **Document ID** | FTM-TEST-GUIDE-001 |
| **Version** | 1.0 |
| **Date** | 2026-03-10 |
| **Audience** | Automated verification test authors (human and AI) |

This document gives verification engineers the system-level facts they need to write
correct, deterministic tests — without reading implementation source code. It is a
living document; update it whenever implementation facts change that affect testability.

---

## 1. Application Structure

The app is a **single-page application** served from `index.html`. There is no build
step. All logic lives in inline `<script>` tags at the bottom of `index.html` and in
`src/moonLogic.js` (pure astronomical math, no DOM).

**Entry point:** `http://localhost:3999/index.html` (served by `python3 -m http.server 3999`
in the Playwright test environment).

---

## 2. Key DOM Element IDs

These are the stable element IDs tests should target. Do not invent IDs — if an ID is
not in this list, check the HTML before writing a test against it.

| Element | ID | Notes |
|---|---|---|
| Zip code input | `#zip-input` | `type="tel"` |
| Go / submit button | `#zip-btn` | Triggers zip lookup |
| GPS button | `#gps-btn` | |
| Results container | `#results` | Hidden until first lookup; wait for this to be visible |
| Location status line | `#location-status` | |
| Location name display | `#loc-name` | Filled after lookup |
| Moon phase name | `#phase-name` | e.g. "Waxing Gibbous" |
| Moon illumination | `#phase-illum` | e.g. "73% illuminated" |
| Moon SVG container | `#moon-svg-container` | Contains inline SVG |
| Compass direction text | `#direction-text` | e.g. "Look Southeast" |
| Compass bearing degrees | `#direction-deg` | e.g. "142° from North" |
| Compass needle wrapper | `#needle-wrap` | Rotated via `style.transform` |
| Altitude text | `#alt-text` | e.g. "42°" |
| Altitude sub-label | `#alt-sub` | "above the horizon" or "below the horizon" |
| Altitude arc canvas | `#alt-arc` | 200×110 px canvas |
| Visibility badge | `#vis-badge` | Has class `above` or `below` |
| Visibility detail | `#vis-detail` | Rise/set time text |
| Update timestamp | `#update-time` | |
| Live compass canvas | `#compass-canvas` | 224×224 px; only visible when enabled |
| Compass toggle button | `#compass-toggle-btn` | |
| Compass tilt warning | `#compass-tilt-warning` | Shown when tilt > 45° |
| Tilt toggle button | `#tilt-toggle-btn` | Only on mobile after lookup |
| Tilt feedback text | `#tilt-feedback` | |
| Star field canvas | `#stars-canvas` | See §4 |
| Cloud layer container | `#clouds-layer` | See §5 |
| Feedback modal | `#feedback-modal` | |

---

## 3. Day / Night Theme

The app applies a CSS class to `<body>` after every location lookup:

- `body.night` — sun is more than 6° below the horizon
- `body.day` — sun is at or above −6°

These classes are **mutually exclusive**. Tests should wait for one of these classes
before asserting theme-specific behaviour.

**Threshold:** `sunAltitudeDeg < -6` → night; otherwise → day.

---

## 4. Star Field and Constellation Art (Canvas)

> **Critical for test authors:** All star field and constellation rendering is done
> via the HTML5 Canvas 2D API. There are **no DOM text nodes** for star labels or
> constellation names — they are drawn with `ctx.fillText()` on the canvas pixel
> buffer and cannot be detected via `innerHTML`, `innerText`, or any DOM selector.

### Canvas element
```
<canvas id="stars-canvas"></canvas>
```

### Visibility rule (CSS)
```css
#stars-canvas { opacity: 0; }              /* hidden by default */
body.night #stars-canvas { opacity: 1; }   /* visible at night */
```

### What this means for tests
- **Do:** check `#stars-canvas` is attached/visible and that `body` has `night` class.
- **Do:** check computed `opacity` on `#stars-canvas` to distinguish day vs. night.
- **Don't:** search `innerHTML` or `innerText` for "Orion", "Cassiopeia", or "Big Dipper"
  — these strings appear in the inline `<script>` source and will always be found
  regardless of the active theme.
- **Don't:** look for `#constellation-canvas`, `.constellation-layer`, or any
  constellation-specific selector — there is only one canvas: `#stars-canvas`.

### Constellation implementation facts
- Three constellations: Orion, Cassiopeia, Big Dipper
- Drawn only when `body.night` is active
- Lines, dots, and name labels are all drawn on `#stars-canvas` (shared with stars)
- No separate overlay element exists

---

## 5. Daytime Animated Clouds

### DOM structure
The cloud container is always in the DOM:
```html
<div class="clouds" id="clouds-layer"></div>
```
Individual cloud `<div class="cloud">` elements are **dynamically created and destroyed**
by the `renderClouds(show)` function:
- `renderClouds(true)` — called at day; creates `.cloud` child divs inside `#clouds-layer`
- `renderClouds(false)` — called at night; sets `layer.innerHTML = ''` (removes all `.cloud` divs)

### Visibility rule (CSS)
```css
.clouds { opacity: 0; transition: opacity 1s ease; }  /* hidden by default */
body.day .clouds { opacity: 1; }                       /* visible at day */
```

> **Important:** The `transition: opacity 1s ease` means the container opacity takes
> **1 second** to reach 0 after the day class is removed. Do **not** check `.clouds`
> computed opacity to assert "not visible at night" — it will be mid-transition.

### Cloud color
Cloud fill color is `rgba(201, 184, 232, 0.7)` — the CSS/rgba equivalent of `#c9b8e8`.
The literal string `#c9b8e8` does **not** appear in any stylesheet rule. When asserting
the lavender color requirement:
- Check for `rgba(201,184,232` or `rgba(201, 184, 232` in stylesheet text, OR
- Check `getComputedStyle(cloudEl).backgroundColor` against `/rgba?\(201,\s*184,\s*232/i`

### What this means for tests
- **Do:** count `.cloud` elements to test "clouds present at day" (expect > 0)
- **Do:** count `.cloud` elements to test "clouds absent at night" (expect 0, since
  `renderClouds(false)` empties the container immediately — no transition delay)
- **Don't:** use `isVisible()` to check cloud visibility — Playwright's `isVisible()`
  does not consider CSS `opacity`
- **Don't:** check `.clouds` opacity to assert "not visible at night" — the CSS
  transition means it won't reach 0 for 1 second after the theme switches

---

## 6. SunCalc Mock Pattern

All Playwright tests must mock `SunCalc` to produce deterministic results. Because
`index.html` loads SunCalc from a CDN with an **SRI `integrity` attribute**, the
standard `page.route().fulfill()` approach will fail (the browser checks the hash and
blocks the mock).

**Correct pattern:**
```javascript
async function routeSunCalc(page, script) {
  // Inject mock before any page script runs — bypasses SRI entirely
  await page.addInitScript(scriptContent => { eval(scriptContent); }, script);
  // Abort the CDN request so the real SunCalc never loads
  await page.route('**/suncalc.min.js', route => route.abort());
}
```

Always call `routeSunCalc()` **before** `page.goto()`.

### Standard mock constants (already defined in the spec file)
- `SUNCALC_DAY` — sun altitude > −6°, produces daytime theme + azimuth ~180° South
- `SUNCALC_NIGHT` — sun altitude < −6°, produces nighttime theme

---

## 7. Zip Code / API Mock Pattern

The app calls `https://api.zippopotam.us/us/{zip}` to convert zip to coordinates.
All tests must mock this call. The helper `routeZipApi(page)` (defined in the spec
file) intercepts this request and returns fake NYC coordinates (40.7128°N, 74.0060°W).

The standard test zip code is `10001`. Always use this zip in tests.

---

## 8. Test Setup Helper

The spec file defines `setupAndEnterZip(page, sunCalcScript)` which:
1. Calls `routeSunCalc(page, sunCalcScript)` and `routeZipApi(page)`
2. Navigates to `INDEX_URL`
3. Fills `#zip-input` with `10001` and clicks `#zip-btn`
4. Waits for `#results` to be visible (up to 6 seconds)

Use this helper as the `beforeEach` setup for any test that needs moon data displayed.
When calling from inside a test (not beforeEach), call it directly:
```javascript
await setupAndEnterZip(page, SUNCALC_DAY);
```

---

## 9. Mobile-Only Features

The following features only appear on mobile (touch) devices or when
`DeviceOrientationEvent` is available:

- **Tilt guide** (`#tilt-toggle-btn`, `#tilt-section`) — only rendered on mobile after lookup
- **Live compass** (`#compass-toggle-btn`, `#live-compass-section`) — only when device
  orientation API is present

Tests for these features must mock `DeviceOrientationEvent` via `page.addInitScript()`
before navigating (see existing FTM-TG and FTM-FR-040 tests for the mock pattern).

---

## 10. What Verification Tests Should NOT Do

- Do not make real network calls — mock all external requests (SunCalc CDN, zippopotam.us)
- Do not use real GPS / geolocation — mock `navigator.geolocation` if needed
- Do not use real timestamps — mock `Date` or `SunCalc.getPosition` return values
- Do not search `innerHTML` for strings that appear in inline `<script>` source code
- Do not use `isVisible()` for elements hidden via CSS `opacity` (use computed style
  or a DOM-state check instead)
- Do not invent element IDs or selectors — consult §2 of this document

---

*Update this document whenever a new feature changes the DOM structure, adds a canvas
element, changes a color value's encoding, or introduces a new mock pattern.*
