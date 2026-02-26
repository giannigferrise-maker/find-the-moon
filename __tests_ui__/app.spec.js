'use strict';

/**
 * app.spec.js — Playwright UI tests for Find the Moon
 *
 * Strategy
 * ────────
 * • Load index.html as a file:// URL in a real Chromium browser.
 * • Intercept the SunCalc CDN <script> via page.route(), serving a controlled
 *   JavaScript mock so every test has deterministic moon/sun data.
 * • Override navigator.geolocation via page.addInitScript() (runs before any
 *   page script) so clicking the GPS button triggers our fake coordinates
 *   without needing HTTPS or real device sensors.
 * • Intercept the Zippopotam.us fetch() for zip-code tests.
 *
 * SunCalc mock values used throughout:
 *   getMoonPosition  → altitude 0.5236 rad (≈30°) | azimuth 0.0 rad (→ 180° S)
 *   getMoonIllumination → fraction 0.5, phase 0.5  (Full Moon)
 *   getMoonTimes     → rise +1 h, set +12 h from now
 *
 *   DAY  mock: sun getPosition altitude  0.5 rad (≈+28.6°)  → day  theme
 *   NIGHT mock: sun getPosition altitude -0.5 rad (≈−28.6°) → night theme
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

// Absolute file URL to the app
const INDEX_URL = `file://${path.resolve(__dirname, '../index.html')}`;

// ── SunCalc mock scripts ───────────────────────────────────────────────────
// These are served in place of the CDN suncalc.min.js to keep results
// deterministic regardless of real moon position at test execution time.

const MOON_MOCK_COMMON = `
  getMoonPosition:     function () {
    return { altitude: 0.5236, azimuth: 0.0, distance: 380000 };
  },
  getMoonIllumination: function () {
    return { fraction: 0.5, phase: 0.5, angle: 2.1 };
  },
  getMoonTimes: function () {
    return {
      rise: new Date(Date.now() + 3600000),
      set:  new Date(Date.now() + 43200000)
    };
  }
`;

/** Daytime: sun ≈ +28.6° above horizon → isNighttime() returns false → 'day' class */
const SUNCALC_DAY = `
(function () {
  window.SunCalc = {
    getPosition: function () { return { altitude: 0.5, azimuth: 0.3 }; },
    ${MOON_MOCK_COMMON}
  };
})();
`;

/** Nighttime: sun ≈ −28.6° below horizon → isNighttime() returns true → 'night' class */
const SUNCALC_NIGHT = `
(function () {
  window.SunCalc = {
    getPosition: function () { return { altitude: -0.5, azimuth: 3.14 }; },
    ${MOON_MOCK_COMMON}
  };
})();
`;

// ── Zip API mock ───────────────────────────────────────────────────────────
const ZIP_API_BODY = JSON.stringify({
  places: [{
    latitude:            '40.7128',
    longitude:           '-74.0060',
    'place name':        'New York City',
    'state abbreviation': 'NY',
  }],
});

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Intercept the SunCalc CDN request and serve a controlled mock instead.
 * Must be called BEFORE page.goto().
 */
async function routeSunCalc(page, script) {
  await page.route('**/suncalc.min.js', route =>
    route.fulfill({ contentType: 'application/javascript', body: script })
  );
}

/**
 * Replace navigator.geolocation with a mock that immediately calls the
 * success callback with NYC coordinates.  Runs before any page script via
 * addInitScript so permission prompts are bypassed entirely.
 * Sets window.__geolocationRequested = true when getCurrentPosition is called.
 */
async function mockGeolocation(page) {
  await page.addInitScript(() => {
    const mockGeo = {
      getCurrentPosition(success) {
        window.__geolocationRequested = true;
        // Simulate the async nature of the real Geolocation API
        setTimeout(() => {
          success({
            coords: {
              latitude: 40.7128,
              longitude: -74.006,
              accuracy: 100,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          });
        }, 0);
      },
      watchPosition() { return 0; },
      clearWatch()     {},
    };

    // Attempt to override on Navigator.prototype (standard Chrome approach)
    try {
      Object.defineProperty(Navigator.prototype, 'geolocation', {
        get()        { return mockGeo; },
        configurable: true,
      });
    } catch (_) {
      // Fallback: define directly on the navigator instance
      try {
        Object.defineProperty(window.navigator, 'geolocation', {
          value: mockGeo, writable: true, configurable: true,
        });
      } catch (_2) { /* ignore */ }
    }
  });
}

/**
 * Intercept the Zippopotam.us fetch and return a fixed NYC payload.
 * Must be called BEFORE page.goto().
 */
async function routeZipApi(page) {
  await page.route('**/zippopotam.us/**', route =>
    route.fulfill({ contentType: 'application/json', body: ZIP_API_BODY })
  );
}

/**
 * Full setup for tests that trigger a location via the zip input.
 * Navigates to the page and submits a valid zip so #results becomes visible.
 */
async function setupAndEnterZip(page, sunCalcScript = SUNCALC_DAY) {
  await routeSunCalc(page, sunCalcScript);
  await routeZipApi(page);
  await page.goto(INDEX_URL);
  await page.fill('#zip-input', '10001');
  await page.click('#zip-btn');
  await expect(page.locator('#results')).toBeVisible({ timeout: 6000 });
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. PAGE LOAD
// ══════════════════════════════════════════════════════════════════════════════

test.describe('1. Page load — key elements are present', () => {
  test.beforeEach(async ({ page }) => {
    await routeSunCalc(page, SUNCALC_DAY);
    await page.goto(INDEX_URL);
  });

  test('has the correct page title', async ({ page }) => {
    await expect(page).toHaveTitle('Find the Moon');
  });

  test('shows the app heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Find the Moon');
  });

  test('GPS button is present and visible', async ({ page }) => {
    const btn = page.locator('#gps-btn');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('Use My Location');
  });

  test('zip code input is visible and accepts input', async ({ page }) => {
    const input = page.locator('#zip-input');
    await expect(input).toBeVisible();
    await input.fill('90210');
    await expect(input).toHaveValue('90210');
  });

  test('Go button is visible', async ({ page }) => {
    const btn = page.locator('#zip-btn');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('Go');
  });

  test('results panel is hidden before any location is entered', async ({ page }) => {
    // CSS: #results { display: none } → not visible until .visible class is added
    await expect(page.locator('#results')).not.toBeVisible();
  });

  test('shows an initial status prompt', async ({ page }) => {
    await expect(page.locator('#location-status'))
      .toContainText('Enter your location');
  });

  test('page body has a theme class (night or day) on load', async ({ page }) => {
    const body = page.locator('body');
    // Init() applies clock-based theme — one of these classes must be present
    const hasNight = await body.evaluate(el => el.classList.contains('night'));
    const hasDay   = await body.evaluate(el => el.classList.contains('day'));
    expect(hasNight || hasDay).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. GPS BUTTON
// ══════════════════════════════════════════════════════════════════════════════

test.describe('2. GPS button — triggers a location request', () => {
  test.beforeEach(async ({ page }) => {
    await routeSunCalc(page, SUNCALC_DAY);
    await mockGeolocation(page);
    await page.goto(INDEX_URL);
  });

  test('calls navigator.geolocation.getCurrentPosition when clicked', async ({ page }) => {
    // Reset the sentinel before clicking so we know the click triggered it
    await page.evaluate(() => { window.__geolocationRequested = false; });
    await page.click('#gps-btn');
    await page.waitForFunction(
      () => window.__geolocationRequested === true,
      { timeout: 5000 }
    );
    expect(await page.evaluate(() => window.__geolocationRequested)).toBe(true);
  });

  test('shows a status message immediately after clicking', async ({ page }) => {
    await page.click('#gps-btn');
    // "Detecting…" appears synchronously; "Got location" after async callback
    await expect(page.locator('#location-status'))
      .toContainText(/Detecting|Got location/, { timeout: 3000 });
  });

  test('reveals the results panel after a successful GPS fix', async ({ page }) => {
    await page.click('#gps-btn');
    await expect(page.locator('#results')).toBeVisible({ timeout: 5000 });
  });

  test('shows "your GPS location" as the location label', async ({ page }) => {
    await page.click('#gps-btn');
    await expect(page.locator('#results')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#loc-name')).toContainText('your GPS location');
  });

  test('shows an update timestamp after GPS resolves', async ({ page }) => {
    await page.click('#gps-btn');
    await expect(page.locator('#results')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#update-time')).toContainText('Updated at');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. ZIP CODE — VALID INPUT
// ══════════════════════════════════════════════════════════════════════════════

test.describe('3. Zip code — valid input shows moon results', () => {
  test.beforeEach(async ({ page }) => {
    await routeSunCalc(page, SUNCALC_DAY);
    await routeZipApi(page);
    await page.goto(INDEX_URL);
  });

  test('reveals the results panel for a valid 5-digit zip', async ({ page }) => {
    await page.fill('#zip-input', '10001');
    await page.click('#zip-btn');
    await expect(page.locator('#results')).toBeVisible({ timeout: 6000 });
  });

  test('shows the location name from the API response', async ({ page }) => {
    await page.fill('#zip-input', '10001');
    await page.click('#zip-btn');
    await expect(page.locator('#results')).toBeVisible({ timeout: 6000 });
    await expect(page.locator('#loc-name')).toContainText('New York City');
  });

  test('updates the status to "Found:" on a successful lookup', async ({ page }) => {
    await page.fill('#zip-input', '10001');
    await page.click('#zip-btn');
    await expect(page.locator('#location-status'))
      .toContainText('Found:', { timeout: 6000 });
  });

  test('also works when submitted via the Enter key', async ({ page }) => {
    await page.fill('#zip-input', '10001');
    await page.press('#zip-input', 'Enter');
    await expect(page.locator('#results')).toBeVisible({ timeout: 6000 });
  });

  test('accepts a leading-zero zip code (00501)', async ({ page }) => {
    await page.fill('#zip-input', '00501');
    await page.click('#zip-btn');
    // Zip passed validation and fetch was attempted (API is mocked to succeed)
    await expect(page.locator('#results')).toBeVisible({ timeout: 6000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. ZIP CODE — INVALID INPUT
// ══════════════════════════════════════════════════════════════════════════════

test.describe('4. Zip code — invalid input shows an error', () => {
  test.beforeEach(async ({ page }) => {
    await routeSunCalc(page, SUNCALC_DAY);
    await page.goto(INDEX_URL);
  });

  test('shows an error for a 4-digit zip (too short)', async ({ page }) => {
    await page.fill('#zip-input', '1234');
    await page.click('#zip-btn');
    await expect(page.locator('#location-status')).toContainText('valid 5-digit');
  });

  test('shows an error for a 6-digit zip (too long) — set via JS to bypass maxlength', async ({ page }) => {
    // The HTML input has maxlength="5", so page.fill() is silently truncated.
    // We bypass that with page.evaluate() to exercise the JS validation path.
    await page.evaluate(() => {
      document.getElementById('zip-input').value = '123456';
    });
    await page.click('#zip-btn');
    await expect(page.locator('#location-status')).toContainText('valid 5-digit');
  });

  test('shows an error for alphabetic input', async ({ page }) => {
    await page.fill('#zip-input', 'abcde');
    await page.click('#zip-btn');
    await expect(page.locator('#location-status')).toContainText('valid 5-digit');
  });

  test('shows an error for an empty input', async ({ page }) => {
    // Leave the input blank
    await page.click('#zip-btn');
    await expect(page.locator('#location-status')).toContainText('valid 5-digit');
  });

  test('keeps the results panel hidden after an invalid zip', async ({ page }) => {
    await page.fill('#zip-input', '123');
    await page.click('#zip-btn');
    // Error is synchronous; results must remain hidden
    await expect(page.locator('#results')).not.toBeVisible();
  });

  test('error message is cleared and results appear after fixing the zip', async ({ page }) => {
    // First attempt: invalid
    await page.fill('#zip-input', '999');
    await page.click('#zip-btn');
    await expect(page.locator('#location-status')).toContainText('valid 5-digit');

    // Route the zip API only now (valid attempt), then fix the zip
    await routeZipApi(page);
    await page.fill('#zip-input', '10001');
    await page.click('#zip-btn');
    await expect(page.locator('#results')).toBeVisible({ timeout: 6000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. DAY / NIGHT THEME
// ══════════════════════════════════════════════════════════════════════════════

test.describe('5. Day/night theme — correct CSS class applied to <body>', () => {
  /**
   * renderResults() calls isNighttime() → SunCalc.getPosition() → applyTheme().
   * With our mock:
   *   SUNCALC_DAY   → altitude +0.5 rad (+28.6°) → day  → body.classList: 'day',  not 'night'
   *   SUNCALC_NIGHT → altitude −0.5 rad (−28.6°) → night → body.classList: 'night', not 'day'
   */

  test('applies "day" class to <body> when sun altitude is above −6°', async ({ page }) => {
    await setupAndEnterZip(page, SUNCALC_DAY);
    await expect(page.locator('body')).toHaveClass(/\bday\b/);
  });

  test('removes "night" class from <body> when theme is day', async ({ page }) => {
    await setupAndEnterZip(page, SUNCALC_DAY);
    await expect(page.locator('body')).not.toHaveClass(/\bnight\b/);
  });

  test('applies "night" class to <body> when sun altitude is below −6°', async ({ page }) => {
    await setupAndEnterZip(page, SUNCALC_NIGHT);
    await expect(page.locator('body')).toHaveClass(/\bnight\b/);
  });

  test('removes "day" class from <body> when theme is night', async ({ page }) => {
    await setupAndEnterZip(page, SUNCALC_NIGHT);
    await expect(page.locator('body')).not.toHaveClass(/\bday\b/);
  });

  test('body always has exactly one of "day" or "night" after a location lookup', async ({ page }) => {
    await setupAndEnterZip(page, SUNCALC_DAY);
    const hasDay   = await page.locator('body').evaluate(el => el.classList.contains('day'));
    const hasNight = await page.locator('body').evaluate(el => el.classList.contains('night'));
    // Exactly one must be true
    expect(hasDay).toBe(true);
    expect(hasNight).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. RESULTS DISPLAY
// ══════════════════════════════════════════════════════════════════════════════

test.describe('6. Results display — moon phase, compass, altitude all appear', () => {
  /**
   * With SUNCALC_DAY mock, renderResults() produces these deterministic values:
   *
   *   #phase-name    "Full Moon"         (phase = 0.50 → getPhaseName)
   *   #phase-illum   "50% illuminated"   (fraction = 0.5)
   *   #direction-text "Look South"       (azimuth 0 → compass 180° S → compassToWords)
   *   #direction-deg  "180° from North"
   *   #alt-text       "30°"              (altitude 0.5236 rad ≈ 30°)
   *   #alt-sub        "above the horizon"
   *   #vis-badge      "● Visible Now"    (altDeg > 0)
   */
  test.beforeEach(async ({ page }) => {
    await setupAndEnterZip(page, SUNCALC_DAY);
  });

  // ── Moon phase ─────────────────────────────────────────────────────────────
  test('shows the moon phase name', async ({ page }) => {
    await expect(page.locator('#phase-name')).not.toBeEmpty();
    await expect(page.locator('#phase-name')).toHaveText('Full Moon');
  });

  test('shows the illumination percentage', async ({ page }) => {
    await expect(page.locator('#phase-illum')).toContainText('%');
    await expect(page.locator('#phase-illum')).toHaveText('50% illuminated');
  });

  test('renders the moon SVG inside the phase card', async ({ page }) => {
    // renderMoonSVG injects an <svg> element
    await expect(page.locator('#moon-svg-container svg')).toBeVisible();
  });

  // ── Compass direction ──────────────────────────────────────────────────────
  test('shows the compass direction text starting with "Look"', async ({ page }) => {
    await expect(page.locator('#direction-text')).toContainText('Look');
    await expect(page.locator('#direction-text')).toHaveText('Look South');
  });

  test('shows the compass degree label', async ({ page }) => {
    await expect(page.locator('#direction-deg')).toContainText('° from North');
    await expect(page.locator('#direction-deg')).toHaveText('180° from North');
  });

  test('rotates the compass needle to the correct angle', async ({ page }) => {
    // The needle-wrap div gets style="transform: rotate(180deg)"
    const transform = await page.locator('#needle-wrap').evaluate(
      el => el.style.transform
    );
    expect(transform).toContain('180deg');
  });

  // ── Altitude ───────────────────────────────────────────────────────────────
  test('shows the moon altitude in degrees', async ({ page }) => {
    await expect(page.locator('#alt-text')).toContainText('°');
    await expect(page.locator('#alt-text')).toHaveText('30°');
  });

  test('shows the altitude subtitle "above the horizon"', async ({ page }) => {
    await expect(page.locator('#alt-sub')).toContainText('above the horizon');
  });

  test('renders the altitude arc canvas', async ({ page }) => {
    await expect(page.locator('#alt-arc')).toBeVisible();
  });

  // ── Visibility badge ───────────────────────────────────────────────────────
  test('shows the visibility badge', async ({ page }) => {
    await expect(page.locator('#vis-badge')).toBeVisible();
  });

  test('badge reads "Visible Now" when moon is above the horizon', async ({ page }) => {
    await expect(page.locator('#vis-badge')).toContainText('Visible Now');
  });

  test('visibility detail mentions the moon altitude', async ({ page }) => {
    await expect(page.locator('#vis-detail')).toContainText('30°');
  });

  // ── Location + timestamp ───────────────────────────────────────────────────
  test('shows the location name', async ({ page }) => {
    await expect(page.locator('#loc-name')).toContainText('New York City');
  });

  test('shows an "Updated at" timestamp', async ({ page }) => {
    await expect(page.locator('#update-time')).toContainText('Updated at');
  });
});
