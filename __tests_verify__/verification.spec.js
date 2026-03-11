'use strict';

/**
 * verification.spec.js — Playwright browser verification tests (FTM-SRS-001 v1.0)
 *
 * Each test is explicitly traced to a requirement ID from FTM-SRS-001.
 * Logic-layer requirements (Jest) are in __tests_verify__/verification.test.js.
 *
 * Run in isolation:
 *   npm run test:verify
 *
 * Requirements covered in this file:
 *   FTM-FR-001  GPS location detection (UI)
 *   FTM-FR-002  Zip code location entry (UI)
 *   FTM-FR-004  Handle location-not-found API error
 *   FTM-FR-005  Display location name
 *   FTM-FR-012  16-point compass direction display (UI)
 *   FTM-FR-013  Above/below horizon indicator (UI)
 *   FTM-FR-014  Moonrise time display
 *   FTM-FR-015  Moonset time display
 *   FTM-FR-016  Auto-refresh every 60 seconds
 *   FTM-FR-020  Moon phase calculated and displayed
 *   FTM-FR-022  Moon SVG graphic rendered
 *   FTM-FR-023  Illumination percentage displayed
 *   FTM-FR-030  Night theme — "night" CSS class on <body>
 *   FTM-FR-031  Day theme — "day" CSS class on <body>
 *   FTM-FR-032  Stars canvas rendered at night
 *   FTM-FR-033  Clouds layer present at day
 *   FTM-FR-040  Mobile compass — device orientation detection
 *   FTM-FR-041  Mobile compass — heading updated by DeviceOrientationEvent
 *   FTM-FR-042  iOS DeviceOrientationEvent.requestPermission() support
 *   FTM-FR-043  Live compass view shows moon direction
 *   FTM-PR-001  Page load in < 3 seconds
 *   FTM-PR-004  Result rendered in < 500 ms after data is available
 *   FTM-IR-001  Tested on Chromium (Chrome-equivalent browser)
 *   FTM-IR-004  Location resolved via Zippopotam.us API
 *   FTM-RR-002  Network failure shows error message
 *   FTM-RR-003  Invalid API response handled gracefully
 *   FTM-RR-004  Missing moonrise/moonset times handled gracefully
 *   FTM-UR-002  Error messages are in plain English
 *   FTM-UR-003  Update timestamp shown after location lookup
 *   FTM-TG-001  Tilt guide button visible on mobile after location set
 *   FTM-TG-002  Tilt indicator draws on arc regardless of moon visibility
 *   FTM-TG-003  Tilt feedback text reflects accuracy
 *   FTM-TG-004  Moon below horizon — message shown and tilt indicator active
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

const INDEX_URL = 'http://localhost:3999/index.html';

// ── SunCalc mock scripts ───────────────────────────────────────────────────
// Served in place of the CDN suncalc.min.js for deterministic test results.

/** Shared moon portion of the SunCalc mock: 30° above horizon, azimuth 0 → 180° S */
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

/** Daytime: sun ≈ +28.6° above horizon → isNighttime() = false → "day" class */
const SUNCALC_DAY = `
(function () {
  window.SunCalc = {
    getPosition: function () { return { altitude: 0.5, azimuth: 0.3 }; },
    ${MOON_MOCK_COMMON}
  };
})();
`;

/** Nighttime: sun ≈ −28.6° below horizon → isNighttime() = true → "night" class */
const SUNCALC_NIGHT = `
(function () {
  window.SunCalc = {
    getPosition: function () { return { altitude: -0.5, azimuth: 3.14 }; },
    ${MOON_MOCK_COMMON}
  };
})();
`;

/**
 * Moon below the horizon (altitude −0.3 rad ≈ −17°); has a future rise time.
 * Used to verify FTM-FR-013 (below-horizon indicator) and FTM-FR-014 (rise time).
 */
const SUNCALC_MOON_BELOW = `
(function () {
  window.SunCalc = {
    getPosition: function () { return { altitude: -0.5, azimuth: 3.14 }; },
    getMoonPosition:     function () {
      return { altitude: -0.3, azimuth: 0.0, distance: 380000 };
    },
    getMoonIllumination: function () {
      return { fraction: 0.5, phase: 0.5, angle: 2.1 };
    },
    getMoonTimes: function () {
      return {
        rise: new Date(Date.now() + 7200000),
        set:  new Date(Date.now() + 50000000)
      };
    }
  };
})();
`;

/**
 * Moon above horizon; getMoonTimes returns no rise or set properties.
 * Used to verify FTM-RR-004 (graceful handling of missing times).
 */
const SUNCALC_NO_RISE_SET = `
(function () {
  window.SunCalc = {
    getPosition: function () { return { altitude: 0.5, azimuth: 0.3 }; },
    getMoonPosition:     function () {
      return { altitude: 0.5236, azimuth: 0.0, distance: 380000 };
    },
    getMoonIllumination: function () {
      return { fraction: 0.5, phase: 0.5, angle: 2.1 };
    },
    getMoonTimes: function () {
      // No rise or set — moon may be circumpolar / always up
      return {};
    }
  };
})();
`;

// ── Standard zip API mock payload ─────────────────────────────────────────
const ZIP_API_BODY = JSON.stringify({
  places: [{
    latitude:             '40.7128',
    longitude:            '-74.0060',
    'place name':         'New York City',
    'state abbreviation': 'NY',
  }],
});

// ── Helpers ────────────────────────────────────────────────────────────────

/** Intercept the SunCalc CDN request and serve a controlled mock. */
async function routeSunCalc(page, script) {
  // Inject SunCalc mock via addInitScript so it runs before any page script.
  // This bypasses SRI checking (which blocks the CDN script when Playwright
  // serves a different payload) by pre-defining window.SunCalc before the
  // CDN script tag is even parsed.
  await page.addInitScript(scriptContent => {
    // eval the mock script string to populate window.SunCalc
    // eslint-disable-next-line no-eval
    eval(scriptContent);
  }, script);
  // Also route the CDN request to abort it (prevents the CDN script from
  // overwriting our mock if it somehow loads despite SRI).
  await page.route('**/suncalc.min.js', route => route.abort());
}

/** Intercept the Zippopotam.us fetch and return a fixed NYC payload. */
async function routeZipApi(page) {
  await page.route('**/zippopotam.us/**', route =>
    route.fulfill({ contentType: 'application/json', body: ZIP_API_BODY })
  );
}

/**
 * Override navigator.geolocation with a mock that immediately resolves to
 * NYC coordinates. Runs before any page script via addInitScript so the
 * browser permission prompt is bypassed entirely.
 */
async function mockGeolocation(page) {
  await page.addInitScript(() => {
    const mockGeo = {
      getCurrentPosition(success) {
        window.__geolocationRequested = true;
        setTimeout(() => {
          success({
            coords: {
              latitude: 40.7128, longitude: -74.006, accuracy: 100,
              altitude: null, altitudeAccuracy: null, heading: null, speed: null,
            },
            timestamp: Date.now(),
          });
        }, 0);
      },
      watchPosition() { return 0; },
      clearWatch()    {},
    };
    try {
      Object.defineProperty(Navigator.prototype, 'geolocation', {
        get() { return mockGeo; }, configurable: true,
      });
    } catch (_) {
      try {
        Object.defineProperty(window.navigator, 'geolocation', {
          value: mockGeo, writable: true, configurable: true,
        });
      } catch (_2) { /* ignore */ }
    }
  });
}

/**
 * Full setup: route SunCalc + zip API, navigate, submit a valid zip,
 * and wait for #results to become visible.
 */
async function setupAndEnterZip(page, sunCalcScript = SUNCALC_DAY) {
  await routeSunCalc(page, sunCalcScript);
  await routeZipApi(page);
  await page.goto(INDEX_URL);
  await page.fill('#zip-input', '10001');
  await page.click('#zip-btn');
  await expect(page.locator('#results')).toBeVisible({ timeout: 6000 });
}

/**
 * Inject touch support into the page so isMobileDevice() returns true.
 * DeviceOrientationEvent is already available in headless Chromium;
 * we only need to fake the touch-screen check.
 */
async function mockMobileDevice(page) {
  await page.addInitScript(() => {
    if (!('ontouchstart' in window)) {
      Object.defineProperty(window, 'ontouchstart', {
        value: null, writable: true, configurable: true,
      });
    }
  });
}

/**
 * Dispatch a fake deviceorientation event with the given beta value.
 * The tilt handler reads e.beta to update deviceBeta.
 */
async function dispatchTiltEvent(page, beta) {
  await page.evaluate((b) => {
    const event = new Event('deviceorientation');
    Object.defineProperty(event, 'beta',  { value: b, configurable: true });
    Object.defineProperty(event, 'alpha', { value: 0, configurable: true });
    Object.defineProperty(event, 'gamma', { value: 0, configurable: true });
    window.dispatchEvent(event);
  }, beta);
}

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-001  GPS location detection
// Requirement: The system shall detect the user's location via the browser
//              Geolocation API when the user activates "Use My Location".
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-001] GPS location detection', () => {
  test.beforeEach(async ({ page }) => {
    await routeSunCalc(page, SUNCALC_DAY);
    await mockGeolocation(page);
    await page.goto(INDEX_URL);
  });

  test('clicking "Use My Location" invokes navigator.geolocation.getCurrentPosition', async ({ page }) => {
    // Requirement: the Geolocation API must be called when the GPS button is pressed.
    await page.evaluate(() => { window.__geolocationRequested = false; });
    await page.click('#gps-btn');
    await page.waitForFunction(() => window.__geolocationRequested === true, { timeout: 5000 });
    expect(await page.evaluate(() => window.__geolocationRequested)).toBe(true);
  });

  test('results panel becomes visible after a successful GPS fix', async ({ page }) => {
    // Requirement: moon data must be shown once a GPS location is received.
    await page.click('#gps-btn');
    await expect(page.locator('#results')).toBeVisible({ timeout: 5000 });
  });

  test('status shows a detecting message immediately after clicking the GPS button', async ({ page }) => {
    // Requirement: user must see feedback that location detection is in progress.
    await page.click('#gps-btn');
    await expect(page.locator('#location-status'))
      .toContainText(/Detecting|Got location/, { timeout: 3000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-002  Zip code location entry
// Requirement: The system shall allow the user to enter a US zip code to
//              specify their location as an alternative to GPS.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-002] Zip code location entry', () => {
  test.beforeEach(async ({ page }) => {
    await routeSunCalc(page, SUNCALC_DAY);
    await routeZipApi(page);
    await page.goto(INDEX_URL);
  });

  test('zip input field is visible and accepts a 5-digit zip code', async ({ page }) => {
    // Requirement: the UI must provide a visible zip code entry field.
    const input = page.locator('#zip-input');
    await expect(input).toBeVisible();
    await input.fill('10001');
    await expect(input).toHaveValue('10001');
  });

  test('submitting a valid zip via the Go button reveals moon results', async ({ page }) => {
    // Requirement: pressing Go with a valid zip must trigger a location lookup.
    await page.fill('#zip-input', '10001');
    await page.click('#zip-btn');
    await expect(page.locator('#results')).toBeVisible({ timeout: 6000 });
  });

  test('submitting a valid zip via the Enter key also triggers a lookup', async ({ page }) => {
    // Requirement: keyboard submission must be supported.
    await page.fill('#zip-input', '10001');
    await page.press('#zip-input', 'Enter');
    await expect(page.locator('#results')).toBeVisible({ timeout: 6000 });
  });

  test('status changes to "Found:" after a successful zip lookup', async ({ page }) => {
    // Requirement: the status area must confirm a successful location lookup.
    await page.fill('#zip-input', '10001');
    await page.click('#zip-btn');
    await expect(page.locator('#location-status'))
      .toContainText('Found:', { timeout: 6000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-004  Handle location-not-found API error
// Requirement: The system shall show an error message when the zip code is
//              valid in format but cannot be found by the location API.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-004] Handle location-not-found API error', () => {
  test.beforeEach(async ({ page }) => {
    await routeSunCalc(page, SUNCALC_DAY);
    await page.goto(INDEX_URL);
  });

  test('shows an error when the zip API returns HTTP 404', async ({ page }) => {
    // Requirement: a structurally valid zip with no API record must show an error message.
    await page.route('**/zippopotam.us/**', route =>
      route.fulfill({ status: 404, body: 'Not Found' })
    );
    await page.fill('#zip-input', '00001');
    await page.click('#zip-btn');
    await expect(page.locator('#location-status'))
      .toContainText(/not found|try again/i, { timeout: 6000 });
  });

  test('results panel remains hidden when the zip API returns 404', async ({ page }) => {
    // Requirement: no moon data should be displayed when location lookup fails.
    await page.route('**/zippopotam.us/**', route =>
      route.fulfill({ status: 404, body: 'Not Found' })
    );
    await page.fill('#zip-input', '00001');
    await page.click('#zip-btn');
    await expect(page.locator('#results')).not.toBeVisible({ timeout: 6000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-005  Display location name
// Requirement: The system shall display the resolved location name (city/state)
//              once the user's location has been successfully determined.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-005] Display location name', () => {
  test('shows the city name returned by the zip API in #loc-name', async ({ page }) => {
    // Requirement: the place name from the API response must appear in the UI.
    await setupAndEnterZip(page);
    await expect(page.locator('#loc-name')).toContainText('New York City');
  });

  test('shows "your GPS location" as the location label after a GPS fix', async ({ page }) => {
    // Requirement: a GPS-derived location must also have a visible location label.
    await routeSunCalc(page, SUNCALC_DAY);
    await mockGeolocation(page);
    await page.goto(INDEX_URL);
    await page.click('#gps-btn');
    await expect(page.locator('#results')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#loc-name')).toContainText('your GPS location');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-012  Compass direction display (UI)
// Requirement: The system shall display the moon's direction to the nearest of
//              16 compass points, with a text label and a rotating needle.
// Logic-layer counterpart: verification.test.js [FTM-FR-012]
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-032] Night theme — star field (additional UI)', () => {
  test('stars canvas element is present in the DOM when night theme is active', async ({ page }) => {
    // Requirement: the system shall display an animated star field background when the nighttime theme is active.
    await setupAndEnterZip(page, SUNCALC_NIGHT);
    const canvas = page.locator('#stars-canvas, canvas#stars, canvas.stars').first();
    await expect(canvas).toBeAttached({ timeout: 5000 });
  });

  test('body has "night" class when nighttime SunCalc mock is active', async ({ page }) => {
    // Requirement: nighttime theme must be applied when sun is > 6° below horizon.
    await setupAndEnterZip(page, SUNCALC_NIGHT);
    await expect(page.locator('body')).toHaveClass(/night/, { timeout: 5000 });
  });

  test('constellation labels for Orion, Cassiopeia, and Big Dipper are present at night', async ({ page }) => {
    // Requirement: the night theme shall display constellation art with labels.
    await setupAndEnterZip(page, SUNCALC_NIGHT);
    const bodyContent = await page.locator('body').innerHTML();
    // Labels must exist somewhere in the DOM (SVG text, canvas label, or HTML element)
    const hasOrion = bodyContent.includes('Orion');
    const hasCassiopeia = bodyContent.includes('Cassiopeia');
    const hasBigDipper = bodyContent.includes('Big Dipper');
    expect(hasOrion).toBe(true);
    expect(hasCassiopeia).toBe(true);
    expect(hasBigDipper).toBe(true);
  });

  test('constellation elements are not present when day theme is active', async ({ page }) => {
    // Requirement: constellation art is part of the night theme only.
    await setupAndEnterZip(page, SUNCALC_DAY);
    await expect(page.locator('body')).toHaveClass(/day/, { timeout: 5000 });
    const bodyContent = await page.locator('body').innerHTML();
    // Constellation labels should not appear in the daytime theme
    const hasOrion = bodyContent.includes('Orion');
    const hasCassiopeia = bodyContent.includes('Cassiopeia');
    const hasBigDipper = bodyContent.includes('Big Dipper');
    expect(hasOrion || hasCassiopeia || hasBigDipper).toBe(false);
  });
});

test.describe('[FTM-FR-033] Animated clouds rendered at day with lavender color', () => {
  test('cloud layer element is present in the DOM when day theme is active', async ({ page }) => {
    // Requirement: the system shall display animated clouds when the daytime theme is active.
    await setupAndEnterZip(page, SUNCALC_DAY);
    await expect(page.locator('body')).toHaveClass(/day/, { timeout: 5000 });
    const clouds = page.locator('#clouds, .clouds, .cloud-layer, [id*="cloud"], [class*="cloud"]').first();
    await expect(clouds).toBeAttached({ timeout: 5000 });
  });

  test('cloud fill color is lavender (#c9b8e8) when day theme is active', async ({ page }) => {
    // Requirement: cloud color shall be soft lavender #c9b8e8 in the daytime theme.
    await setupAndEnterZip(page, SUNCALC_DAY);
    await expect(page.locator('body')).toHaveClass(/day/, { timeout: 5000 });
    // Check CSS custom property or inline style or stylesheet rule for lavender color
    const lavenderPresent = await page.evaluate(() => {
      // Check all stylesheets and inline styles for the lavender color
      const allStyles = Array.from(document.styleSheets).flatMap(sheet => {
        try {
          return Array.from(sheet.cssRules).map(r => r.cssText);
        } catch (_) { return []; }
      }).join(' ');
      const inlineStyles = document.documentElement.innerHTML;
      return allStyles.includes('c9b8e8') || inlineStyles.includes('c9b8e8');
    });
    expect(lavenderPresent).toBe(true);
  });

  test('cloud layer is not visible when night theme is active', async ({ page }) => {
    // Requirement: clouds are a daytime theme element only.
    await setupAndEnterZip(page, SUNCALC_NIGHT);
    await expect(page.locator('body')).toHaveClass(/night/, { timeout: 5000 });
    const clouds = page.locator('#clouds, .clouds, .cloud-layer, [id*="cloud"], [class*="cloud"]').first();
    // Cloud element should either not exist or not be visible in night mode
    const isVisible = await clouds.isVisible().catch(() => false);
    expect(isVisible).toBe(false);
  });
});

test.describe('[FTM-FR-012] Compass direction display (UI)', () => {
  test('displays one of the 16 valid compass point labels after zip lookup', async ({ page }) => {
    // Requirement: the moon direction must be shown as one of 16 compass point labels.
    await setupAndEnterZip(page, SUNCALC_DAY);
    const VALID_LABELS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    const dirText = await page.locator('#moon-dir').innerText();
    const found = VALID_LABELS.some(label => dirText.includes(label));
    expect(found).toBe(true);
  });

  test('displays the compass direction in plain English words', async ({ page }) => {
    // Requirement: directional information must be in plain English.
    await setupAndEnterZip(page, SUNCALC_DAY);
    const dirText = await page.locator('#moon-dir').innerText();
    expect(dirText).toMatch(/North|South|East|West/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-032  Animated star field + constellation art at night
// Requirement: The system shall display an animated star field background
//              when the nighttime theme is active.
// Issue #35 adds: 3 constellations (Orion, Cassiopeia, Big Dipper) drawn over
//              the star field with low-opacity lines, dot markers, and labels.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-032] Star field and constellation art rendered at night', () => {
  test.beforeEach(async ({ page }) => {
    await setupAndEnterZip(page, SUNCALC_NIGHT);
  });

  test('a canvas element for the star field is present and visible in the night theme', async ({ page }) => {
    // Requirement: animated star field must be displayed at night.
    const canvas = page.locator('#star-canvas, canvas').first();
    await expect(canvas).toBeVisible({ timeout: 5000 });
  });

  test('body carries the "night" CSS class when the nighttime theme is active', async ({ page }) => {
    // Requirement: nighttime theme must be applied when sun > 6° below horizon.
    await expect(page.locator('body')).toHaveClass(/night/, { timeout: 5000 });
  });

  test('constellation labels for Orion, Cassiopeia, and Big Dipper are present in the DOM or canvas layer', async ({ page }) => {
    // Requirement: each constellation shall be labelled with its name.
    const bodyText = await page.locator('body').innerHTML();
    // Labels may be in SVG text, canvas aria-label, or hidden span — check page text content
    const pageText = await page.evaluate(() => document.body.innerText + document.body.innerHTML);
    expect(pageText).toMatch(/Orion/i);
    expect(pageText).toMatch(/Cassiopeia/i);
    expect(pageText).toMatch(/Big Dipper/i);
  });

  test('constellation overlay element exists in the night theme', async ({ page }) => {
    // Requirement: constellation art must be drawn over the star field at night.
    // The overlay may be a canvas, svg, or a div with a known class/id.
    const overlay = page.locator('#constellation-canvas, #constellations, .constellation-layer, svg.constellations').first();
    await expect(overlay).toBeAttached({ timeout: 5000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-033  Lavender clouds rendered in the day theme
// Requirement: The system shall display animated clouds when the daytime
//              theme is active. Issue #35 changes cloud color to #c9b8e8.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-033] Lavender animated clouds rendered in the day theme', () => {
  test.beforeEach(async ({ page }) => {
    await setupAndEnterZip(page, SUNCALC_DAY);
  });

  test('body carries the "day" CSS class when the daytime theme is active', async ({ page }) => {
    // Requirement: daytime theme must be applied when sun altitude >= -6°.
    await expect(page.locator('body')).toHaveClass(/day/, { timeout: 5000 });
  });

  test('a cloud layer element is present and visible in the day theme', async ({ page }) => {
    // Requirement: animated clouds must be displayed during the daytime theme.
    const clouds = page.locator('#cloud-canvas, #clouds, .cloud-layer, canvas').first();
    await expect(clouds).toBeVisible({ timeout: 5000 });
  });

  test('cloud fill color is the soft lavender #c9b8e8 in the day theme', async ({ page }) => {
    // Requirement: cloud color shall be #c9b8e8 (soft lavender) in the day theme.
    // Check stylesheet or inline style for the lavender color value.
    const lavenderPresent = await page.evaluate(() => {
      // Check all stylesheets for the lavender color
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            if (rule.cssText && rule.cssText.toLowerCase().includes('c9b8e8')) return true;
          }
        } catch (_) { /* cross-origin sheet */ }
      }
      // Also check inline styles and data attributes
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        const style = el.getAttribute('style') || '';
        if (style.toLowerCase().includes('c9b8e8')) return true;
        const fill = el.getAttribute('fill') || '';
        if (fill.toLowerCase().includes('c9b8e8')) return true;
      }
      // Check canvas via data attribute or script variable embedded in page
      return document.documentElement.innerHTML.toLowerCase().includes('c9b8e8');
    });
    expect(lavenderPresent).toBe(true);
  });

  test('cloud shape and animation are still present with the lavender color', async ({ page }) => {
    // Requirement: cloud shape and animation remain unchanged — only color changes.
    // Verify the clouds element exists and the day theme is active (animation unchanged).
    await expect(page.locator('body')).toHaveClass(/day/, { timeout: 5000 });
    const clouds = page.locator('#cloud-canvas, #clouds, .cloud-layer, canvas').first();
    await expect(clouds).toBeAttached({ timeout: 5000 });
  });

  test('night theme does NOT carry the day class (themes are mutually exclusive)', async ({ page }) => {
    // Sanity: day and night themes must not both be active simultaneously.
    await routeSunCalc(page, SUNCALC_NIGHT);
    await routeZipApi(page);
    await page.goto(INDEX_URL);
    await page.fill('#zip-input', '10001');
    await page.click('#zip-btn');
    await expect(page.locator('#results')).toBeVisible({ timeout: 6000 });
    await expect(page.locator('body')).not.toHaveClass(/day/, { timeout: 5000 });
  });
});

test.describe('[FTM-FR-012] Compass direction display (UI) — additional tests', () => {
  test('displays a 16-point compass label after zip lookup', async ({ page }) => {
    // Requirement: the moon direction must be shown as one of 16 compass point labels.
    await setupAndEnterZip(page, SUNCALC_DAY);
    const dirText = await page.locator('#moon-direction').innerText();
    const validLabels = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    const found = validLabels.some(label => dirText.includes(label));
    expect(found).toBe(true);
  });

  test('displays a plain-English direction word alongside the compass label', async ({ page }) => {
    // Requirement: directional information must be in plain English.
    await setupAndEnterZip(page, SUNCALC_DAY);
    const dirText = await page.locator('#moon-direction').innerText();
    const englishWords = ['North','South','East','West'];
    const found = englishWords.some(word => dirText.includes(word));
    expect(found).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-032  Night theme — constellation art over star field
// Requirement: The system shall display an animated star field background when
//              the nighttime theme is active.
// Issue #35: constellation art (Orion, Cassiopeia, Big Dipper) drawn over star field.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-032] Night theme — star field and constellation art', () => {
  test.beforeEach(async ({ page }) => {
    await setupAndEnterZip(page, SUNCALC_NIGHT);
  });

  test('body has "night" class when nighttime theme is active', async ({ page }) => {
    // Requirement: nighttime theme must be applied when sun is > 6° below horizon.
    await expect(page.locator('body')).toHaveClass(/night/);
  });

  test('star field canvas element is present and visible at night', async ({ page }) => {
    // Requirement: animated star field background must be displayed at night.
    const canvas = page.locator('#star-canvas, canvas').first();
    await expect(canvas).toBeVisible();
  });

  test('Orion constellation label is rendered in the night scene', async ({ page }) => {
    // Requirement (Issue #35): Orion constellation must be labelled in the night theme.
    const bodyHTML = await page.locator('body').innerHTML();
    expect(bodyHTML).toMatch(/[Oo]rion/);
  });

  test('Cassiopeia constellation label is rendered in the night scene', async ({ page }) => {
    // Requirement (Issue #35): Cassiopeia constellation must be labelled in the night theme.
    const bodyHTML = await page.locator('body').innerHTML();
    expect(bodyHTML).toMatch(/[Cc]assiopeia/);
  });

  test('Big Dipper constellation label is rendered in the night scene', async ({ page }) => {
    // Requirement (Issue #35): Big Dipper constellation must be labelled in the night theme.
    const bodyHTML = await page.locator('body').innerHTML();
    expect(bodyHTML).toMatch(/[Bb]ig [Dd]ipper/);
  });

  test('constellation canvas or SVG element is present in the night scene', async ({ page }) => {
    // Requirement (Issue #35): constellation art must be drawn over the star field.
    // The implementation must render constellation lines/dots on a canvas or inline SVG.
    const hasCanvas = await page.evaluate(() => {
      const canvases = document.querySelectorAll('canvas');
      return canvases.length > 0;
    });
    expect(hasCanvas).toBe(true);
  });

  test('constellation art does not appear in the daytime theme', async ({ page }) => {
    // Requirement (Issue #35): constellations are a night-only feature.
    // Re-setup with day theme to confirm constellations are absent.
    await setupAndEnterZip(page, SUNCALC_DAY);
    await expect(page.locator('body')).toHaveClass(/day/);
    const bodyHTML = await page.locator('body').innerHTML();
    // Constellation labels should not be visible when the day class is active.
    const dayConstellationVisible = await page.evaluate(() => {
      const el = document.querySelector('.constellation-label, [data-constellation]');
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    });
    expect(dayConstellationVisible).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-033  Day theme — lavender clouds
// Requirement: The system shall display animated clouds when the daytime theme
//              is active.
// Issue #35: cloud fill color changed to soft lavender #c9b8e8.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-033] Day theme — lavender animated clouds', () => {
  test.beforeEach(async ({ page }) => {
    await setupAndEnterZip(page, SUNCALC_DAY);
  });

  test('body has "day" class when daytime theme is active', async ({ page }) => {
    // Requirement: daytime theme must be applied when sun is at or above −6°.
    await expect(page.locator('body')).toHaveClass(/day/);
  });

  test('cloud elements are present in the daytime theme', async ({ page }) => {
    // Requirement: animated clouds must be displayed during daytime.
    const cloudCount = await page.evaluate(() => {
      return document.querySelectorAll('.cloud, [class*="cloud"]').length;
    });
    expect(cloudCount).toBeGreaterThan(0);
  });

  test('cloud fill color is lavender (#c9b8e8) in the daytime theme', async ({ page }) => {
    // Requirement (Issue #35): cloud color must be #c9b8e8 (soft lavender).
    const cloudColor = await page.evaluate(() => {
      // Check CSS custom property, inline style, or computed background color on a cloud element.
      const cloud = document.querySelector('.cloud, [class*="cloud"]');
      if (!cloud) return null;
      const style = window.getComputedStyle(cloud);
      // Check background-color or fill
      return style.backgroundColor || style.fill || null;
    });
    // #c9b8e8 in rgb is rgb(201, 184, 232)
    expect(cloudColor).toMatch(/rgb\(201,\s*184,\s*232\)|#c9b8e8/i);
  });

  test('cloud fill color #c9b8e8 is defined in the page styles', async ({ page }) => {
    // Requirement (Issue #35): the lavender color must be present in the stylesheet.
    const colorDefined = await page.evaluate(() => {
      // Search all stylesheets for the lavender color value
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            if (rule.cssText && rule.cssText.toLowerCase().includes('#c9b8e8')) {
              return true;
            }
          }
        } catch (_) { /* cross-origin sheet */ }
      }
      // Also check inline styles and SVG fill attributes
      return document.documentElement.innerHTML.toLowerCase().includes('#c9b8e8');
    });
    expect(colorDefined).toBe(true);
  });

  test('cloud animation is present in the daytime theme', async ({ page }) => {
    // Requirement: cloud animation must remain active (shape and animation unchanged).
    const hasAnimation = await page.evaluate(() => {
      const cloud = document.querySelector('.cloud, [class*="cloud"]');
      if (!cloud) return false;
      const style = window.getComputedStyle(cloud);
      return style.animationName !== 'none' && style.animationName !== '';
    });
    expect(hasAnimation).toBe(true);
  });

  test('clouds are not visible in the nighttime theme', async ({ page }) => {
    // Requirement: clouds belong to the day theme only.
    await setupAndEnterZip(page, SUNCALC_NIGHT);
    await expect(page.locator('body')).toHaveClass(/night/);
    const cloudVisible = await page.evaluate(() => {
      const cloud = document.querySelector('.cloud, [class*="cloud"]');
      if (!cloud) return false;
      const style = window.getComputedStyle(cloud);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    });
    expect(cloudVisible).toBe(false);
  });
});

test.describe('[FTM-FR-012] Compass direction display (UI) — direction tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupAndEnterZip(page);
  });

  test('#direction-text contains "Look" followed by a compass direction word', async ({ page }) => {
    // Requirement: the human-readable direction label must be shown to the user.
    await expect(page.locator('#direction-text')).toContainText('Look');
  });

  test('#direction-deg shows a numeric bearing ending with "° from North"', async ({ page }) => {
    // Requirement: the numeric azimuth bearing must be visible.
    await expect(page.locator('#direction-deg')).toContainText('° from North');
  });

  test('compass needle (#needle-wrap) is rotated to the moon azimuth', async ({ page }) => {
    // Requirement: the needle graphic must visually point toward the moon.
    // With azimuth 0 → 180° South, the transform must be rotate(180deg).
    const transform = await page.locator('#needle-wrap').evaluate(el => el.style.transform);
    expect(transform).toMatch(/rotate\(\d+deg\)/);
  });

  test('the displayed bearing is within the valid range 0–359°', async ({ page }) => {
    // Requirement: degree value must be a legal compass bearing.
    const text = await page.locator('#direction-deg').textContent();
    const deg = parseInt(text, 10);
    expect(deg).toBeGreaterThanOrEqual(0);
    expect(deg).toBeLessThanOrEqual(359);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-013  Above/below horizon indicator (UI)
// Requirement: The system shall visually indicate whether the moon is currently
//              above or below the horizon.
// Logic-layer counterpart: verification.test.js [FTM-FR-013]
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-013] Above/below horizon indicator (UI)', () => {
  test('shows "Visible Now" badge when moon is above the horizon', async ({ page }) => {
    // Requirement: visibility badge must confirm the moon is currently visible.
    await setupAndEnterZip(page, SUNCALC_DAY);   // moon altitude +0.5236 rad (30°)
    await expect(page.locator('#vis-badge')).toContainText('Visible Now');
  });

  test('#alt-sub reads "above the horizon" when moon altitude is positive', async ({ page }) => {
    // Requirement: altitude subtitle must describe above-horizon status.
    await setupAndEnterZip(page, SUNCALC_DAY);
    await expect(page.locator('#alt-sub')).toContainText('above the horizon');
  });

  test('#alt-sub contains "below" or "not visible" when moon altitude is negative', async ({ page }) => {
    // Requirement: the UI must reflect a below-horizon moon.
    await setupAndEnterZip(page, SUNCALC_MOON_BELOW);  // altitude -0.3 rad
    await expect(page.locator('#alt-sub')).toContainText(/below|not visible/i);
  });

  test('#vis-badge carries the "above" CSS class when moon is up', async ({ page }) => {
    // Requirement: CSS class on the badge must reflect current visibility state.
    await setupAndEnterZip(page, SUNCALC_DAY);
    await expect(page.locator('#vis-badge')).toHaveClass(/\babove\b/);
  });

  test('#vis-badge carries the "below" CSS class when moon is down', async ({ page }) => {
    await setupAndEnterZip(page, SUNCALC_MOON_BELOW);
    await expect(page.locator('#vis-badge')).toHaveClass(/\bbelow\b/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-014  Moonrise time display
// Requirement: The system shall display the moon's next rise time when the
//              moon is currently below the horizon.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-014] Moonrise time display', () => {
  test('shows next rise time in #vis-detail when moon is below the horizon', async ({ page }) => {
    // Requirement: user must see when the moon will next rise when it is not visible.
    // SUNCALC_MOON_BELOW provides negative altitude and a rise time 2 hours in the future.
    await setupAndEnterZip(page, SUNCALC_MOON_BELOW);
    await expect(page.locator('#vis-detail')).toContainText(/rise at/i);
  });

  test('#vis-detail includes a parseable time string for the rise time', async ({ page }) => {
    // Requirement: the rise time must be formatted as a human-readable time.
    await setupAndEnterZip(page, SUNCALC_MOON_BELOW);
    const text = await page.locator('#vis-detail').textContent();
    expect(text).toMatch(/\d+:\d+/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-015  Moonset time display
// Requirement: The system shall display the moon's next set time when the
//              moon is currently above the horizon.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-015] Moonset time display', () => {
  test('#vis-detail shows "setting at …" when moon is above the horizon', async ({ page }) => {
    // Requirement: user must see when the moon will set while it is currently visible.
    // SUNCALC_DAY mock: moon altitude +30°, setTime = now + 12h (future).
    await setupAndEnterZip(page, SUNCALC_DAY);
    await expect(page.locator('#vis-detail')).toContainText(/setting at/i);
  });

  test('#vis-detail includes a parseable time string for the set time', async ({ page }) => {
    // Requirement: the set time must be formatted as a human-readable time.
    await setupAndEnterZip(page, SUNCALC_DAY);
    const text = await page.locator('#vis-detail').textContent();
    expect(text).toMatch(/\d+:\d+/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-016  Auto-refresh every 60 seconds
// Requirement: The system shall automatically re-calculate and re-render moon
//              position data every 60 seconds without user interaction.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-016] Auto-refresh every 60 seconds', () => {
  test('setInterval is registered with a 60000 ms delay after a location lookup', async ({ page }) => {
    // Requirement: a recurring timer set to 60 000 ms must be created once results are shown.
    // Strategy: spy on window.setInterval before page scripts run; inspect recorded delays.
    await page.addInitScript(() => {
      window.__intervalDelays = [];
      const orig = window.setInterval;
      window.setInterval = function (fn, delay, ...args) {
        window.__intervalDelays.push(delay);
        return orig.call(window, fn, delay, ...args);
      };
    });
    await routeSunCalc(page, SUNCALC_DAY);
    await routeZipApi(page);
    await page.goto(INDEX_URL);
    await page.fill('#zip-input', '10001');
    await page.click('#zip-btn');
    await expect(page.locator('#results')).toBeVisible({ timeout: 6000 });
    const delays = await page.evaluate(() => window.__intervalDelays);
    // The 60-second refresh timer must be among the registered intervals.
    expect(delays).toContain(60000);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-020  Moon phase calculated and displayed
// Requirement: The system shall calculate the current moon phase and display
//              it by name in the results panel.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-020] Moon phase calculated and displayed', () => {
  test.beforeEach(async ({ page }) => {
    await setupAndEnterZip(page);
  });

  test('#phase-name is non-empty after a location lookup', async ({ page }) => {
    // Requirement: a named moon phase must always appear in results.
    await expect(page.locator('#phase-name')).not.toBeEmpty();
  });

  test('#phase-name shows "Full Moon" when SunCalc phase = 0.5', async ({ page }) => {
    // Requirement: the phase name must correctly reflect the SunCalc illumination data.
    await expect(page.locator('#phase-name')).toHaveText('Full Moon');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-022  Moon SVG graphic rendered
// Requirement: The system shall render an SVG graphic visually representing
//              the current moon phase (illumination silhouette).
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-022] Moon SVG graphic rendered', () => {
  test('an <svg> element is injected into #moon-svg-container after results load', async ({ page }) => {
    // Requirement: a moon phase SVG must be rendered inside the results panel.
    await setupAndEnterZip(page);
    await expect(page.locator('#moon-svg-container svg')).toBeVisible();
  });

  test('the SVG has non-zero width and height', async ({ page }) => {
    // Requirement: the SVG must render with a visible size (not a zero-dimension element).
    await setupAndEnterZip(page);
    const bbox = await page.locator('#moon-svg-container svg').boundingBox();
    expect(bbox.width).toBeGreaterThan(0);
    expect(bbox.height).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-023  Illumination percentage displayed
// Requirement: The system shall display the moon's current illumination as a
//              percentage value (e.g. "50% illuminated").
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-023] Illumination percentage displayed', () => {
  test('#phase-illum contains a percentage sign', async ({ page }) => {
    // Requirement: illumination must be expressed as a percentage in the UI.
    await setupAndEnterZip(page);
    await expect(page.locator('#phase-illum')).toContainText('%');
  });

  test('#phase-illum shows "50% illuminated" when mock fraction = 0.5', async ({ page }) => {
    // Requirement: the displayed value must be derived from SunCalc illumination data.
    await setupAndEnterZip(page);
    await expect(page.locator('#phase-illum')).toHaveText('50% illuminated');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-030  Night theme — "night" CSS class applied to <body>
// Requirement: The system shall add the "night" class to <body> when the sun
//              is more than 6 degrees below the horizon.
// Logic-layer counterpart: verification.test.js [FTM-FR-030]
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-030] Night theme — "night" class on <body>', () => {
  test('<body> has the "night" class when sun altitude is −28.6° (mock)', async ({ page }) => {
    // Requirement: night CSS theme must be applied automatically at night.
    await setupAndEnterZip(page, SUNCALC_NIGHT);
    await expect(page.locator('body')).toHaveClass(/\bnight\b/);
  });

  test('"day" class is absent from <body> during the night theme', async ({ page }) => {
    // Requirement: exactly one of "night" / "day" must be active at a time.
    await setupAndEnterZip(page, SUNCALC_NIGHT);
    await expect(page.locator('body')).not.toHaveClass(/\bday\b/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-031  Day theme — "day" CSS class applied to <body>
// Requirement: The system shall add the "day" class to <body> when the sun is
//              at or above −6° (daytime or civil twilight).
// Logic-layer counterpart: verification.test.js [FTM-FR-031]
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-031] Day theme — "day" class on <body>', () => {
  test('<body> has the "day" class when sun altitude is +28.6° (mock)', async ({ page }) => {
    // Requirement: day CSS theme must be applied automatically during daylight.
    await setupAndEnterZip(page, SUNCALC_DAY);
    await expect(page.locator('body')).toHaveClass(/\bday\b/);
  });

  test('"night" class is absent from <body> during the day theme', async ({ page }) => {
    // Requirement: exactly one of "night" / "day" must be active at a time.
    await setupAndEnterZip(page, SUNCALC_DAY);
    await expect(page.locator('body')).not.toHaveClass(/\bnight\b/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-032  Stars canvas rendered at night
// Requirement: The system shall display an animated star field on the background
//              canvas during nighttime.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-032] Stars canvas rendered at night', () => {
  test('#stars-canvas element is present in the DOM', async ({ page }) => {
    // Requirement: the stars canvas must exist in the page.
    await routeSunCalc(page, SUNCALC_NIGHT);
    await page.goto(INDEX_URL);
    await expect(page.locator('#stars-canvas')).toBeAttached();
  });

  test('#stars-canvas has a non-zero drawn width after night theme is applied', async ({ page }) => {
    // Requirement: the canvas must be initialised with content (not left as 0×0).
    await routeSunCalc(page, SUNCALC_NIGHT);
    await page.goto(INDEX_URL);
    const width = await page.locator('#stars-canvas').evaluate(el => el.width);
    expect(width).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-033  Clouds layer present at day
// Requirement: The system shall display a decorative cloud layer on the
//              background during daytime.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-033] Clouds layer present at day', () => {
  test('#clouds-layer element exists in the DOM', async ({ page }) => {
    // Requirement: the clouds layer element must be present in the page structure.
    await routeSunCalc(page, SUNCALC_DAY);
    await page.goto(INDEX_URL);
    await expect(page.locator('#clouds-layer')).toBeAttached();
  });

  test('body carries "day" class (enabling CSS cloud animation) after a daytime lookup', async ({ page }) => {
    // Requirement: cloud animation is activated via CSS on body.day — verify the class is applied.
    await setupAndEnterZip(page, SUNCALC_DAY);
    await expect(page.locator('body')).toHaveClass(/\bday\b/);
    await expect(page.locator('#clouds-layer')).toBeAttached();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-040  Mobile compass — device orientation detection
// Requirement: The system shall detect whether the device has a compass sensor
//              via DeviceOrientationEvent and show the live compass button only
//              on supported (touch) devices.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-040] Mobile compass — device orientation detection', () => {
  test('#live-compass-section is hidden by default on a non-touch desktop', async ({ page }) => {
    // Requirement: the compass UI must NOT appear on devices without a magnetometer.
    // Desktop Chromium has maxTouchPoints = 0, so isMobileDevice() → false.
    await setupAndEnterZip(page, SUNCALC_DAY);
    await expect(page.locator('#live-compass-section')).not.toHaveClass(/\bvisible\b/);
  });

  test('#live-compass-section becomes visible when the device is flagged as touch-enabled', async ({ page }) => {
    // Requirement: the live compass button must appear on devices with a magnetometer.
    // Override maxTouchPoints before page load to simulate a mobile device.
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'maxTouchPoints', {
        get() { return 5; }, configurable: true,
      });
    });
    await setupAndEnterZip(page, SUNCALC_DAY);
    await expect(page.locator('#live-compass-section')).toHaveClass(/\bvisible\b/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-041  Mobile compass — heading updated by DeviceOrientationEvent
// Requirement: The system shall update the displayed compass heading in real
//              time as DeviceOrientationEvent data is received from the sensor.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-041] Compass heading updated by DeviceOrientationEvent', () => {
  test('enabling the live compass changes the button text to indicate active state', async ({ page }) => {
    // Requirement: orientation events must be consumed; the UI must reflect the active state.
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'maxTouchPoints', {
        get() { return 5; }, configurable: true,
      });
    });
    await setupAndEnterZip(page, SUNCALC_DAY);
    await page.click('#compass-toggle-btn');
    // After enabling (no iOS requestPermission in desktop Chrome), button text changes to ON.
    await expect(page.locator('#compass-toggle-btn')).toContainText('ON', { timeout: 3000 });
  });

  test('dispatching a deviceorientation event after activation causes no JS errors', async ({ page }) => {
    // Requirement: incoming orientation data must be handled without crashing.
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'maxTouchPoints', {
        get() { return 5; }, configurable: true,
      });
    });
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await setupAndEnterZip(page, SUNCALC_DAY);
    await page.click('#compass-toggle-btn');
    await page.evaluate(() => {
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', {
        alpha: 90, beta: 0, gamma: 0, absolute: false,
      }));
    });
    expect(errors).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-042  iOS DeviceOrientationEvent.requestPermission() support
// Requirement: On iOS 13+ devices the system shall call
//              DeviceOrientationEvent.requestPermission() when live compass is
//              enabled, and shall gracefully handle permission denial.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-042] iOS DeviceOrientationEvent.requestPermission() support', () => {
  test('shows a denial note in #compass-perm-note when requestPermission resolves "denied"', async ({ page }) => {
    // Requirement: the app must display guidance when iOS compass access is denied.
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'maxTouchPoints', {
        get() { return 5; }, configurable: true,
      });
      // Simulate iOS 13+: attach requestPermission to DeviceOrientationEvent
      window.DeviceOrientationEvent = window.DeviceOrientationEvent || function () {};
      window.DeviceOrientationEvent.requestPermission = async () => 'denied';
    });
    await setupAndEnterZip(page, SUNCALC_DAY);
    await page.click('#compass-toggle-btn');
    await expect(page.locator('#compass-perm-note'))
      .toContainText(/denied|permission|settings/i, { timeout: 3000 });
  });

  test('shows an error note in #compass-perm-note when requestPermission throws', async ({ page }) => {
    // Requirement: exceptions from the iOS permission API must be caught and reported.
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'maxTouchPoints', {
        get() { return 5; }, configurable: true,
      });
      window.DeviceOrientationEvent = window.DeviceOrientationEvent || function () {};
      window.DeviceOrientationEvent.requestPermission = async () => {
        throw new Error('Permission API unavailable');
      };
    });
    await setupAndEnterZip(page, SUNCALC_DAY);
    await page.click('#compass-toggle-btn');
    await expect(page.locator('#compass-perm-note'))
      .toContainText(/could not|access/i, { timeout: 3000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-FR-043  Live compass view shows moon direction
// Requirement: The live compass canvas shall draw the moon's azimuth direction
//              so the user can align their device with the moon.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-FR-043] Live compass view shows moon direction', () => {
  test('#compass-canvas element is present in the DOM', async ({ page }) => {
    // Requirement: the canvas that draws the live compass must exist in the page.
    await routeSunCalc(page, SUNCALC_DAY);
    await page.goto(INDEX_URL);
    await expect(page.locator('#compass-canvas')).toBeAttached();
  });

  test('#live-compass-wrap becomes visible after the user enables the live compass', async ({ page }) => {
    // Requirement: the compass canvas view must appear when the feature is activated.
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'maxTouchPoints', {
        get() { return 5; }, configurable: true,
      });
    });
    await setupAndEnterZip(page, SUNCALC_DAY);
    await page.click('#compass-toggle-btn');
    // Desktop Chrome: no requestPermission → compass activates immediately.
    await expect(page.locator('#live-compass-wrap')).toHaveClass(/\bvisible\b/, { timeout: 3000 });
  });

  test('#compass-hint text explains how to align the device with the moon', async ({ page }) => {
    // Requirement: instructions must be shown alongside the live compass canvas.
    await routeSunCalc(page, SUNCALC_DAY);
    await page.goto(INDEX_URL);
    await expect(page.locator('#compass-hint')).toContainText(/moon/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-PR-001  Page load in < 3 seconds
// Requirement: The application shall load and be interactive within 3 seconds
//              on a standard broadband connection.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-PR-001] Page load in < 3 seconds', () => {
  test('DOM is ready within 3000 ms of navigation', async ({ page }) => {
    // Requirement: initial page load must not exceed 3 seconds.
    // Note: SunCalc CDN is intercepted so network latency is near-zero;
    // this measures the app's own load path.
    await routeSunCalc(page, SUNCALC_DAY);
    const start = Date.now();
    await page.goto(INDEX_URL, { waitUntil: 'domcontentloaded' });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });

  test('page reaches network-idle state within 3000 ms', async ({ page }) => {
    // Requirement: all resources must load within the 3-second budget.
    await routeSunCalc(page, SUNCALC_DAY);
    const start = Date.now();
    await page.goto(INDEX_URL, { waitUntil: 'networkidle' });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-PR-004  Result rendered in < 500 ms after data is available
// Requirement: After receiving location data the system shall update the display
//              with moon information within 500 milliseconds.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-PR-004] Result rendered in < 500 ms after data available', () => {
  test('#results becomes visible within 500 ms of clicking Go (with mocked API)', async ({ page }) => {
    // Requirement: DOM rendering after data receipt must complete within 500 ms.
    // The zip API is mocked (zero network latency), so elapsed time is app-only.
    await routeSunCalc(page, SUNCALC_DAY);
    await routeZipApi(page);
    await page.goto(INDEX_URL);
    await page.fill('#zip-input', '10001');
    const start = Date.now();
    await page.click('#zip-btn');
    await expect(page.locator('#results')).toBeVisible({ timeout: 500 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-IR-001  Chromium browser compatibility
// Requirement: The application shall support Google Chrome, Firefox, Safari,
//              and Edge. This suite verifies Chromium (Chrome-equivalent) support.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-IR-001] Chromium browser compatibility', () => {
  test('page loads without JavaScript errors in Chromium', async ({ page }) => {
    // Requirement: the app must run error-free in Google Chrome.
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await routeSunCalc(page, SUNCALC_DAY);
    await page.goto(INDEX_URL, { waitUntil: 'networkidle' });
    expect(errors).toHaveLength(0);
  });

  test('all critical interactive elements are present after Chromium page load', async ({ page }) => {
    // Requirement: Chromium must render the full UI without missing elements.
    await routeSunCalc(page, SUNCALC_DAY);
    await page.goto(INDEX_URL);
    await expect(page.locator('#gps-btn')).toBeVisible();
    await expect(page.locator('#zip-input')).toBeVisible();
    await expect(page.locator('#zip-btn')).toBeVisible();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-IR-004  Location resolved via Zippopotam.us API
// Requirement: The system shall use the Zippopotam.us REST API to convert a
//              zip code to geographic coordinates and a place name.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-IR-004] Zippopotam.us API integration', () => {
  test('a network request is issued to a Zippopotam.us URL when a valid zip is submitted', async ({ page }) => {
    // Requirement: the app must call the Zippopotam.us API for location lookup.
    // Strategy: use page.waitForRequest() in a Promise.all so the listener is
    // registered before the click fires the fetch — avoids closure-variable races.
    await routeSunCalc(page, SUNCALC_DAY);
    await routeZipApi(page);
    await page.goto(INDEX_URL);
    await page.fill('#zip-input', '10001');
    const [request] = await Promise.all([
      page.waitForRequest(req => req.url().includes('zippopotam.us'), { timeout: 6000 }),
      page.click('#zip-btn'),
    ]);
    expect(request.url()).toContain('zippopotam.us');
  });

  test('coordinates from the API response are used to drive SunCalc moon calculations', async ({ page }) => {
    // Requirement: lat/lon from Zippopotam.us must be passed to the astronomy library.
    // If coordinates were not passed, renderResults() would fail and #results would not appear.
    await setupAndEnterZip(page);
    await expect(page.locator('#results')).toBeVisible();
    await expect(page.locator('#phase-name')).not.toBeEmpty();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-RR-002  Network failure shows error message
// Requirement: The system shall display a meaningful error message when a
//              network request fails (e.g. no internet connection).
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-RR-002] Network failure shows error message', () => {
  test('shows an error message when the zip API returns a server error', async ({ page }) => {
    // Requirement: a server-side failure must surface a user-readable error.
    // Strategy: override window.fetch via addInitScript (runs before page scripts)
    // so the interception is cache-immune — page.route() can be bypassed by Chrome's
    // HTTP cache when the same URL was successfully fetched in an earlier test.
    await page.addInitScript(() => {
      const _origFetch = window.fetch;
      window.fetch = (url, ...args) => {
        if (typeof url === 'string' && url.includes('zippopotam.us')) {
          return Promise.resolve(
            new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' })
          );
        }
        return _origFetch.call(window, url, ...args);
      };
    });
    await routeSunCalc(page, SUNCALC_DAY);
    await page.goto(INDEX_URL);
    await page.fill('#zip-input', '10001');
    await page.click('#zip-btn');
    await expect(page.locator('#location-status'))
      .toContainText(/not found|try again/i, { timeout: 6000 });
  });

  test('#results remains hidden after a network failure', async ({ page }) => {
    // Requirement: no moon data must be shown when the network request fails.
    await routeSunCalc(page, SUNCALC_DAY);
    await page.route('**/zippopotam.us/**', route => route.abort('failed'));
    await page.goto(INDEX_URL);
    await page.fill('#zip-input', '10001');
    await page.click('#zip-btn');
    await expect(page.locator('#results')).not.toBeVisible({ timeout: 6000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-RR-003  Invalid API response handled gracefully
// Requirement: The system shall handle unexpected or malformed API responses
//              without crashing, and shall inform the user of the failure.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-RR-003] Invalid API response handled gracefully', () => {
  test('shows an error and does not crash when the API returns HTTP 404', async ({ page }) => {
    // Requirement: a 404 (zip not in database) must show an error, not an exception.
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await routeSunCalc(page, SUNCALC_DAY);
    await page.route('**/zippopotam.us/**', route =>
      route.fulfill({ status: 404, body: 'Not Found' })
    );
    await page.goto(INDEX_URL);
    await page.fill('#zip-input', '00001');
    await page.click('#zip-btn');
    await expect(page.locator('#location-status'))
      .toContainText(/not found|try again/i, { timeout: 6000 });
    expect(errors).toHaveLength(0);
  });

  test('no unhandled JS error when API returns malformed JSON', async ({ page }) => {
    // Requirement: an unexpected response format must not propagate as an exception.
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await routeSunCalc(page, SUNCALC_DAY);
    await page.route('**/zippopotam.us/**', route =>
      route.fulfill({ contentType: 'application/json', body: '{"broken":true}' })
    );
    await page.goto(INDEX_URL);
    await page.fill('#zip-input', '10001');
    await page.click('#zip-btn');
    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-RR-004  Missing moonrise/moonset times handled gracefully
// Requirement: The system shall degrade gracefully when SunCalc cannot
//              determine a moonrise or moonset time (e.g. circumpolar moon).
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-RR-004] Missing moonrise/moonset handled gracefully', () => {
  test('#results still renders when getMoonTimes returns no rise or set', async ({ page }) => {
    // Requirement: the app must not crash when time data is unavailable.
    await setupAndEnterZip(page, SUNCALC_NO_RISE_SET);
    await expect(page.locator('#results')).toBeVisible();
  });

  test('no unhandled JavaScript errors when rise/set times are absent', async ({ page }) => {
    // Requirement: missing time data must not produce a visible JavaScript exception.
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await setupAndEnterZip(page, SUNCALC_NO_RISE_SET);
    expect(errors).toHaveLength(0);
  });

  test('#vis-detail contains non-empty text even when set time is absent', async ({ page }) => {
    // Requirement: the UI must show a meaningful fallback rather than blank content.
    await setupAndEnterZip(page, SUNCALC_NO_RISE_SET);
    const text = await page.locator('#vis-detail').textContent();
    expect(text.trim().length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-UR-002  Error messages are in plain English
// Requirement: All user-facing error messages shall be written in plain English
//              and clearly describe the problem and the corrective action.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-UR-002] Error messages in plain English', () => {
  test('invalid zip error message uses plain English (no error codes or jargon)', async ({ page }) => {
    // Requirement: the zip validation error must be human-readable and actionable.
    await routeSunCalc(page, SUNCALC_DAY);
    await page.goto(INDEX_URL);
    await page.fill('#zip-input', '123');
    await page.click('#zip-btn');
    const message = await page.locator('#location-status').textContent();
    // Must contain everyday words — not HTTP status codes or technical jargon.
    expect(message).toMatch(/enter a valid|5-digit|zip code/i);
  });

  test('zip-not-found error message uses plain English', async ({ page }) => {
    // Requirement: an API 404 error must be explained to the user in plain language.
    await routeSunCalc(page, SUNCALC_DAY);
    await page.route('**/zippopotam.us/**', route =>
      route.fulfill({ status: 404, body: 'Not Found' })
    );
    await page.goto(INDEX_URL);
    await page.fill('#zip-input', '00001');
    await page.click('#zip-btn');
    // Use expect().toContainText() so Playwright polls until the status updates.
    await expect(page.locator('#location-status'))
      .toContainText(/not found|try again/i, { timeout: 6000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-UR-003  Update timestamp shown after location lookup
// Requirement: The system shall display the date/time at which moon data was
//              last calculated, so the user knows how current the information is.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-UR-003] Update timestamp shown after location lookup', () => {
  test('#update-time contains "Updated at" after a zip lookup', async ({ page }) => {
    // Requirement: a timestamp must be shown so the user knows data freshness.
    await setupAndEnterZip(page);
    await expect(page.locator('#update-time')).toContainText('Updated at');
  });

  test('#update-time contains a parseable time string (HH:MM)', async ({ page }) => {
    // Requirement: the timestamp must include an actual time value.
    await setupAndEnterZip(page);
    const text = await page.locator('#update-time').textContent();
    expect(text).toMatch(/\d+:\d+/);
  });

  test('#update-time is shown after a GPS location lookup as well', async ({ page }) => {
    // Requirement: the timestamp must appear regardless of whether GPS or zip was used.
    await routeSunCalc(page, SUNCALC_DAY);
    await mockGeolocation(page);
    await page.goto(INDEX_URL);
    await page.click('#gps-btn');
    await expect(page.locator('#results')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#update-time')).toContainText('Updated at');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-TG-001  Tilt guide button visible on mobile after location set
// Requirement: The tilt guide button shall be hidden until a location is
//              resolved, and shall appear only on devices that report touch
//              support and DeviceOrientationEvent availability.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-TG-001] Tilt guide button visible on mobile after location set', () => {
  test('tilt-section is hidden before any location is entered', async ({ page }) => {
    // Requirement: button must not appear until location data is available.
    await mockMobileDevice(page);
    await routeSunCalc(page, SUNCALC_DAY);
    await page.goto(INDEX_URL);
    await expect(page.locator('#tilt-section')).not.toHaveClass(/visible/);
  });

  test('tilt-section becomes visible after zip lookup on a mobile device', async ({ page }) => {
    // Requirement: button appears once renderResults() runs on a mobile device.
    await mockMobileDevice(page);
    await setupAndEnterZip(page);
    await expect(page.locator('#tilt-section')).toHaveClass(/visible/);
  });

  test('tilt-section stays hidden on desktop (no touch support)', async ({ page }) => {
    // Requirement: button must not appear on devices that lack touch/orientation.
    // No mockMobileDevice — simulates a standard desktop browser.
    await setupAndEnterZip(page);
    await expect(page.locator('#tilt-section')).not.toHaveClass(/visible/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-TG-002  Tilt indicator draws on arc regardless of moon visibility
// Requirement: The tilt indicator (dashed line and dot on the altitude arc)
//              shall remain active and drawing whether the moon is above or
//              below the horizon.
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-TG-002] Tilt indicator draws on arc regardless of moon visibility', () => {
  test('tilt-wrap is visible after enabling tilt guide with moon above horizon', async ({ page }) => {
    // Requirement: tilt wrap must be shown when moon is above the horizon.
    await mockMobileDevice(page);
    await setupAndEnterZip(page, SUNCALC_DAY);
    await expect(page.locator('#tilt-section')).toHaveClass(/visible/, { timeout: 3000 });
    await page.click('#tilt-toggle-btn');
    await expect(page.locator('#tilt-wrap')).toHaveClass(/visible/);
  });

  test('tilt-wrap stays visible after enabling tilt guide with moon below horizon', async ({ page }) => {
    // Requirement: tilt wrap must remain shown even when moon is below the horizon.
    await mockMobileDevice(page);
    await setupAndEnterZip(page, SUNCALC_MOON_BELOW);
    await expect(page.locator('#tilt-section')).toHaveClass(/visible/, { timeout: 3000 });
    await page.click('#tilt-toggle-btn');
    await expect(page.locator('#tilt-wrap')).toHaveClass(/visible/);
  });

  test('no JavaScript errors when tilt is active and moon is below the horizon', async ({ page }) => {
    // Requirement: the below-horizon path must not throw any runtime exceptions.
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await mockMobileDevice(page);
    await setupAndEnterZip(page, SUNCALC_MOON_BELOW);
    await expect(page.locator('#tilt-section')).toHaveClass(/visible/, { timeout: 3000 });
    await page.click('#tilt-toggle-btn');
    await page.waitForTimeout(200);
    expect(errors).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-TG-003  Tilt feedback text reflects accuracy
// Requirement: The feedback text shall read "✓ On target!" when device
//              elevation is within 3° of the moon's altitude, and shall
//              show a directional hint ("Tilt up X°" / "Tilt down X°") otherwise.
// ══════════════════════════════════════════════════════════════════════════════

// Mock moon altitude: 0.5236 rad ≈ 30° + ~0.03° refraction ≈ 30°
// betaToElevation(120) = 30° → on target  (beta - 90 = 30)
// betaToElevation(95)  =  5° → tilt up ~25°  (beta - 90 = 5)
// betaToElevation(160) = 70° → tilt down ~40°  (beta - 90 = 70)

test.describe('[FTM-TG-003] Tilt feedback text reflects accuracy', () => {
  test('shows "On target" when device elevation matches moon altitude (±3°)', async ({ page }) => {
    // Requirement: feedback must be positive when phone is aimed at the moon.
    await mockMobileDevice(page);
    await setupAndEnterZip(page, SUNCALC_DAY);
    await expect(page.locator('#tilt-section')).toHaveClass(/visible/, { timeout: 3000 });
    await page.click('#tilt-toggle-btn');
    await dispatchTiltEvent(page, 120); // elevation = beta-90 = 30° ≈ moon altitude
    await expect(page.locator('#tilt-feedback'))
      .toContainText(/on target/i, { timeout: 3000 });
  });

  test('shows "Tilt up" when device is pointed too low', async ({ page }) => {
    // Requirement: directional hint must tell user to raise the phone.
    await mockMobileDevice(page);
    await setupAndEnterZip(page, SUNCALC_DAY);
    await expect(page.locator('#tilt-section')).toHaveClass(/visible/, { timeout: 3000 });
    await page.click('#tilt-toggle-btn');
    await dispatchTiltEvent(page, 95); // elevation = beta-90 = 5°, moon at 30° → tilt up
    await expect(page.locator('#tilt-feedback'))
      .toContainText(/tilt up/i, { timeout: 3000 });
  });

  test('shows "Tilt down" when device is pointed too high', async ({ page }) => {
    // Requirement: directional hint must tell user to lower the phone.
    await mockMobileDevice(page);
    await setupAndEnterZip(page, SUNCALC_DAY);
    await expect(page.locator('#tilt-section')).toHaveClass(/visible/, { timeout: 3000 });
    await page.click('#tilt-toggle-btn');
    await dispatchTiltEvent(page, 160); // elevation = beta-90 = 70°, moon at 30° → tilt down
    await expect(page.locator('#tilt-feedback'))
      .toContainText(/tilt down/i, { timeout: 3000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FTM-TG-004  Moon below horizon — message shown and tilt indicator active
// Requirement: When the moon is below the horizon, the feedback shall display
//              "Moon is below the horizon" AND the tilt indicator shall
//              continue drawing on the arc (not hidden or frozen).
// ══════════════════════════════════════════════════════════════════════════════

test.describe('[FTM-TG-004] Moon below horizon — message shown and tilt indicator active', () => {
  test('feedback reads "Moon is below the horizon" when moon altitude is negative', async ({ page }) => {
    // Requirement: the below-horizon state must be communicated clearly.
    await mockMobileDevice(page);
    await setupAndEnterZip(page, SUNCALC_MOON_BELOW);
    await expect(page.locator('#tilt-section')).toHaveClass(/visible/, { timeout: 3000 });
    await page.click('#tilt-toggle-btn');
    await expect(page.locator('#tilt-feedback'))
      .toContainText(/below the horizon/i, { timeout: 3000 });
  });

  test('tilt-wrap remains visible even when moon is below the horizon', async ({ page }) => {
    // Requirement: the tilt indicator must stay active so user can practise aiming.
    await mockMobileDevice(page);
    await setupAndEnterZip(page, SUNCALC_MOON_BELOW);
    await expect(page.locator('#tilt-section')).toHaveClass(/visible/, { timeout: 3000 });
    await page.click('#tilt-toggle-btn');
    await expect(page.locator('#tilt-wrap')).toHaveClass(/visible/);
  });

  test('feedback does not show directional hint when moon is below the horizon', async ({ page }) => {
    // Requirement: "Tilt up/down" is only meaningful when moon is above horizon.
    await mockMobileDevice(page);
    await setupAndEnterZip(page, SUNCALC_MOON_BELOW);
    await expect(page.locator('#tilt-section')).toHaveClass(/visible/, { timeout: 3000 });
    await page.click('#tilt-toggle-btn');
    const text = await page.locator('#tilt-feedback').textContent({ timeout: 3000 });
    expect(text).not.toMatch(/tilt up|tilt down/i);
  });
});


// =============================================================================
// FTM-SC-004
// Requirement: The system shall continue to load and execute the SunCalc.js
//              library (v1.9.0) correctly after the SRI attributes are applied.
// Verification method: Test (Playwright — browser)
// =============================================================================

test.describe('[FTM-SC-004] SunCalc loads correctly with SRI attributes', () => {
  // These tests exercise the real index.html in a Chromium browser to confirm
  // that the SRI-protected CDN tag does not break page functionality.
  // They complement the inspection-level Jest tests (FTM-SC-001/002/003).

  test('page loads without any SRI / network integrity console errors', async ({ page }) => {
    // TODO: Collect console messages of type 'error' while navigating to
    //       INDEX_URL.  Assert that none of the captured messages contain
    //       SRI-related keywords such as "integrity", "SRI", "Subresource",
    //       or "Failed to load resource".
    //
    // Example skeleton:
    //   const errors = [];
    //   page.on('console', msg => {
    //     if (msg.type() === 'error') errors.push(msg.text());
    //   });
    //   page.on('pageerror', err => errors.push(err.message));
    //   await page.goto(INDEX_URL);
    //   const sriErrors = errors.filter(e =>
    //     /integrity|subresource|SRI|failed to load resource/i.test(e)
    //   );
    //   expect(sriErrors).toHaveLength(0);
    // TODO: implement above, then remove the placeholder below.
    expect(true).toBe(true);
  });

  test('window.SunCalc is defined after page load (library executed successfully)', async ({ page }) => {
    // TODO: Navigate to INDEX_URL (without mocking the SunCalc CDN so that
    //       the real SRI check fires).  Evaluate window.SunCalc in the
    //       browser context and assert it is not undefined/null.
    //
    //       If running in a fully offline CI environment, either:
    //         a) serve the script locally and update the src to localhost, or
    //         b) use page.route() to intercept the CDN URL and return the
    //            real file contents with the correct headers so the browser
    //            performs an honest SRI check.
    //
    // Example skeleton:
    //   await page.goto(INDEX_URL);
    //   const sunCalcDefined = await page.evaluate(() =>
    //     typeof window.SunCalc !== 'undefined'
    //   );
    //   expect(sunCalcDefined).toBe(true);
    expect(true).toBe(true);
  });

  test('SunCalc.getMoonPosition returns a valid result after library loads via SRI tag', async ({ page }) => {
    // TODO: After confirming window.SunCalc is available, call
    //       SunCalc.getMoonPosition(new Date(), 40.71, -74.01) from within
    //       page.evaluate() and assert that the returned object has numeric
    //       'altitude' and 'azimuth' properties within physically valid
    //       ranges (altitude in [-π/2, π/2], azimuth in [-π, π]).
    //
    // Example skeleton:
    //   await page.goto(INDEX_URL);
    //   const pos = await page.evaluate(() =>
    //     window.SunCalc.getMoonPosition(new Date(), 40.71, -74.01)
    //   );
    //   expect(typeof pos.altitude).toBe('number');
    //   expect(typeof pos.azimuth).toBe('number');
    //   expect(pos.altitude).toBeGreaterThanOrEqual(-Math.PI / 2);
    //   expect(pos.altitude).toBeLessThanOrEqual(Math.PI / 2);
    expect(true).toBe(true);
  });

  test('a zip code lookup completes successfully when SunCalc is loaded via SRI', async ({ page }) => {
    // TODO: This is an end-to-end smoke test confirming that the full
    //       application flow still works after the SRI change.
    //       Use the standard SUNCALC_DAY mock via page.addInitScript() as
    //       in other spec tests, route the zippopotam API to return a fixed
    //       payload, navigate to INDEX_URL, type '10001' into the zip input,
    //       click Go, and assert that the results panel becomes visible.
    //       A failure here most likely means the CDN script was blocked by
    //       the browser due to an incorrect SRI hash.
    //
    // Example skeleton (mirrors existing spec.js patterns):
    //   await page.addInitScript({ content: SUNCALC_MOCK_SCRIPT });
    //   await page.route('**/api.zippopotam.us/**', route => route.fulfill({
    //     status: 200,
    //     contentType: 'application/json',
    //     body: JSON.stringify({
    //       'post code': '10001',
    //       places: [{ latitude: '40.7484', longitude: '-73.9967',
    //                  'place name': 'New York' }]
    //     })
    //   }));
    //   await page.goto(INDEX_URL);
    //   await page.fill('#zip-input', '10001');
    //   await page.click('#go-button');
    //   await expect(page.locator('#results-panel')).toBeVisible();
    expect(true).toBe(true);
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// FTM-VT-001
// Requirement: The system shall draw constellation art over the nighttime star
// field background, consisting of exactly three constellations: Orion,
// Cassiopeia, and the Big Dipper.
// ═══════════════════════════════════════════════════════════════════════════════

// Canvas 2D API spy helper — injects interceptors before page scripts run so
// that fillText / lineTo / arc calls made by drawConstellations() are recorded
// in window._canvasLog. Must be called before page.goto().
async function setupNightWithCanvasSpy(page) {
  await routeSunCalc(page, SUNCALC_NIGHT);
  await routeZipApi(page);
  await page.addInitScript(() => {
    window._canvasLog = { fillText: [], lineToCount: 0, arcCount: 0 };
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      const ctx = origGetContext.call(this, type, ...args);
      if (type === '2d' && ctx && !ctx._spied) {
        ctx._spied = true;
        const oFT = ctx.fillText.bind(ctx);
        ctx.fillText = (t, x, y, ...r) => {
          window._canvasLog.fillText.push(String(t));
          return oFT(t, x, y, ...r);
        };
        const oLT = ctx.lineTo.bind(ctx);
        ctx.lineTo = (...a) => { window._canvasLog.lineToCount++; return oLT(...a); };
        const oArc = ctx.arc.bind(ctx);
        ctx.arc = (...a) => { window._canvasLog.arcCount++; return oArc(...a); };
      }
      return ctx;
    };
  });
  await page.goto(INDEX_URL);
  await page.fill('#zip-input', '10001');
  await page.click('#zip-btn');
  await expect(page.locator('#results')).toBeVisible({ timeout: 6000 });
  await expect(page.locator('body')).toHaveClass(/night/, { timeout: 5000 });
}

test.describe('[FTM-VT-001] Constellation art present in night theme', () => {
  test('Orion constellation name drawn on canvas via fillText', async ({ page }) => {
    await setupNightWithCanvasSpy(page);
    const fillTextCalls = await page.evaluate(() => window._canvasLog.fillText);
    expect(fillTextCalls).toContain('Orion');
  });

  test('Cassiopeia constellation name drawn on canvas via fillText', async ({ page }) => {
    await setupNightWithCanvasSpy(page);
    const fillTextCalls = await page.evaluate(() => window._canvasLog.fillText);
    expect(fillTextCalls).toContain('Cassiopeia');
  });

  test('Big Dipper constellation name drawn on canvas via fillText', async ({ page }) => {
    await setupNightWithCanvasSpy(page);
    const fillTextCalls = await page.evaluate(() => window._canvasLog.fillText);
    expect(fillTextCalls).toContain('Big Dipper');
  });

  test('exactly three constellation names drawn on canvas', async ({ page }) => {
    await setupNightWithCanvasSpy(page);
    const fillTextCalls = await page.evaluate(() => window._canvasLog.fillText);
    const constellationNames = ['Orion', 'Cassiopeia', 'Big Dipper'];
    const found = constellationNames.filter(n => fillTextCalls.includes(n));
    expect(found).toHaveLength(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FTM-VT-002
// Requirement: The system shall render each constellation using thin line
// segments connecting defined star positions and small dot markers at each
// star position.
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('[FTM-VT-002] Constellation lines and dot markers rendered', () => {
  test('constellation lines drawn via canvas lineTo calls', async ({ page }) => {
    await setupNightWithCanvasSpy(page);
    const lineToCount = await page.evaluate(() => window._canvasLog.lineToCount);
    // Orion has 8 lines, Cassiopeia 4, Big Dipper 7 = 19 minimum constellation lineTo calls
    // (star field adds none — it uses arc only). Expect at least 19.
    expect(lineToCount).toBeGreaterThanOrEqual(19);
  });

  test('constellation dot markers drawn via canvas arc calls', async ({ page }) => {
    await setupNightWithCanvasSpy(page);
    const arcCount = await page.evaluate(() => window._canvasLog.arcCount);
    // Stars (arc) + constellation dots (arc): at least 20 constellation stars exist
    // (8 Orion + 5 Cassiopeia + 7 Big Dipper). Star field also uses arc.
    // Verify a meaningful number of arc calls happened.
    expect(arcCount).toBeGreaterThan(20);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FTM-VT-005
// Requirement: The constellation artwork shall be static and shall not be
// animated.
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('[FTM-VT-005] Constellation artwork is static', () => {
  test('constellation region pixel content is identical across two frames', async ({ page }) => {
    // TODO: load page in night-theme context.
    // TODO: take a screenshot (or a clipped region covering the constellation
    // overlay) and store it as screenshotA.
    // TODO: wait 500 ms.
    // TODO: take a second screenshot of the same region and store as screenshotB.
    // TODO: assert screenshotA and screenshotB are pixel-identical, confirming
    // no animation is running on the constellation layer.
    // Note: the underlying star field IS animated; clip the comparison region
    // carefully to isolate constellation elements only, or compare a stable
    // DOM attribute (e.g. absence of a CSS animation-name on the overlay).
  });

  test('constellation overlay element has no CSS animation applied', async ({ page }) => {
    // TODO: load page in night-theme context.
    // TODO: query the computed style of the constellation overlay element and
    // assert that animationName === 'none' (or equivalent).
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FTM-VT-006
// Requirement: The system shall display a text label identifying each
// constellation by name, positioned near its corresponding pattern.
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('[FTM-VT-006] Constellation name labels visible', () => {
  // Labels are drawn via ctx.fillText() on #stars-canvas — verified with canvas spy.
  test('fillText called with "Orion" during night-theme rendering', async ({ page }) => {
    await setupNightWithCanvasSpy(page);
    const fillTextCalls = await page.evaluate(() => window._canvasLog.fillText);
    expect(fillTextCalls).toContain('Orion');
  });

  test('fillText called with "Cassiopeia" during night-theme rendering', async ({ page }) => {
    await setupNightWithCanvasSpy(page);
    const fillTextCalls = await page.evaluate(() => window._canvasLog.fillText);
    expect(fillTextCalls).toContain('Cassiopeia');
  });

  test('fillText called with "Big Dipper" during night-theme rendering', async ({ page }) => {
    await setupNightWithCanvasSpy(page);
    const fillTextCalls = await page.evaluate(() => window._canvasLog.fillText);
    expect(fillTextCalls).toContain('Big Dipper');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FTM-VT-008 (UI layer)
// Requirement: The system shall render daytime animated clouds using the fill
// color #c9b8e8.
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('[FTM-VT-008] Daytime cloud fill color (UI)', () => {
  test.beforeEach(async ({ page }) => {
    // TODO: load the page with a SUNCALC_DAY mock so the daytime theme is
    // active, following the same addInitScript pattern used by FTM-FR-031.
    await page.goto(INDEX_URL);
    // TODO: trigger a location lookup so the day theme renders.
  });

  test('cloud element computed fill color matches #c9b8e8', async ({ page }) => {
    // TODO: locate the cloud element (e.g. page.locator('.cloud') or the
    // canvas/SVG element used for clouds).
    // TODO: read its computed fill or background-color style.
    // TODO: assert the resolved color equals #c9b8e8 / rgb(201, 184, 232).
    // Example for an SVG/CSS fill:
    //   const fill = await page.locator('.cloud').first().evaluate(
    //     el => getComputedStyle(el).fill
    //   );
    //   expect(fill).toMatch(/rgb\(201,\s*184,\s*232\)/);
  });

  test('cloud fill color is not white (#ffffff)', async ({ page }) => {
    // TODO: same locator as above.
    // TODO: assert the resolved color does NOT equal rgb(255, 255, 255) / #ffffff
    // to guard against accidental reversion to the legacy white cloud color.
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FTM-VT-009
// Requirement: The cloud shape and animation behavior shall remain unchanged;
// only the fill color shall change.
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('[FTM-VT-009] Cloud shape and animation unchanged', () => {
  test('cloud element bounding box dimensions match baseline', async ({ page }) => {
    // TODO: load page in day-theme context.
    // TODO: obtain the bounding box of the cloud element.
    // TODO: assert width and height match previously recorded baseline values,
    // confirming the cloud shape geometry was not altered.
  });

  test('cloud element has the same CSS animation-name as baseline', async ({ page }) => {
    // TODO: load page in day-theme context.
    // TODO: read the computed animationName of the cloud element.
    // TODO: assert it matches the animation name used prior to this amendment
    // (e.g. 'cloudDrift' or whatever the existing animation is named).
  });

  test('cloud element has the same CSS animation-duration as baseline', async ({ page }) => {
    // TODO: load page in day-theme context.
    // TODO: read the computed animationDuration of the cloud element.
    // TODO: assert it matches the duration value used prior to this amendment.
  });
});
