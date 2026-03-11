'use strict';

/**
 * verification.test.js — Logic-layer verification tests (Jest)
 *
 * Each test is explicitly traced to a requirement ID from FTM-SRS-001 v1.4.
 * Tests in this file cover requirements whose verification method is
 * "Test" and whose logic can be exercised without a browser.
 *
 * Browser-dependent requirements are covered in:
 *   __tests_verify__/verification.spec.js  (Playwright)
 *
 * Run in isolation:
 *   npm run test:verify
 *
 * Requirements covered in this file:
 *   FTM-FR-003  Zip code validation (logic)
 *   FTM-FR-010  Moon azimuth calculation
 *   FTM-FR-011  Moon altitude calculation
 *   FTM-FR-012  16-point compass mapping (logic)
 *   FTM-FR-013  Above/below horizon flag (logic)
 *   FTM-FR-021  Eight named moon phases
 *   FTM-FR-030  Nighttime theme threshold
 *   FTM-FR-031  Daytime theme threshold
 *   FTM-SC-001  SRI integrity attribute on every external script element
 *   FTM-SC-002  SRI hash is SHA-384 or SHA-512 base64 digest
 *   FTM-SC-003  crossorigin=anonymous on SRI-protected script elements
 */

const SunCalc = require('suncalc');

const fs = require('fs');
const htmlparser2 = require('htmlparser2');

const {
  azimuthToCompass,
  compassToWords,
  getPhaseName,
  isNighttime,
  calcMoon,
  validateZipCode,
} = require('../src/moonLogic');

// ═══════════════════════════════════════════════════════════════════════════════
// FTM-SC-001
// Requirement: The system shall include a Subresource Integrity (SRI) integrity
//              attribute on every externally hosted <script> element in index.html
// ═══════════════════════════════════════════════════════════════════════════════
describe('[FTM-SC-001] SRI integrity attribute on every external script element', () => {
  let externalScripts;

  beforeAll(() => {
    const html = fs.readFileSync(require('path').resolve(__dirname, '../index.html'), 'utf8');
    externalScripts = [];
    const parser = new htmlparser2.Parser({
      onopentag(name, attrs) {
        if (name === 'script' && attrs.src && /^https?:\/\//.test(attrs.src)) {
          externalScripts.push(attrs);
        }
      },
    });
    parser.write(html);
    parser.end();
  });

  it('finds at least one external script element', () => {
    // TODO: [FTM-SC-001] assert at least one external <script> exists in index.html
    expect(externalScripts.length).toBeGreaterThan(0);
  });

  it('every external <script> element has an integrity attribute', () => {
    // TODO: [FTM-SC-001] assert every external <script> has a non-empty integrity attribute
    for (const attrs of externalScripts) {
      expect(attrs).toHaveProperty('integrity');
      expect(attrs.integrity.length).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FTM-SC-002
// Requirement: The SRI hash used in the integrity attribute shall be a SHA-384
//              or SHA-512 digest of the exact file served by the CDN, encoded
//              in base64.
// ═══════════════════════════════════════════════════════════════════════════════
describe('[FTM-SC-002] SRI hash is SHA-384 or SHA-512 base64 digest', () => {
  let externalScripts;

  beforeAll(() => {
    const html = fs.readFileSync(require('path').resolve(__dirname, '../index.html'), 'utf8');
    externalScripts = [];
    const parser = new htmlparser2.Parser({
      onopentag(name, attrs) {
        if (name === 'script' && attrs.src && /^https?:\/\//.test(attrs.src) && attrs.integrity) {
          externalScripts.push(attrs);
        }
      },
    });
    parser.write(html);
    parser.end();
  });

  it('every integrity attribute value starts with sha384- or sha512-', () => {
    // TODO: [FTM-SC-002] assert integrity values use sha384- or sha512- prefix
    for (const attrs of externalScripts) {
      expect(attrs.integrity).toMatch(/^(sha384-|sha512-)[A-Za-z0-9+/]+=*$/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FTM-SC-003
// Requirement: Every externally hosted <script> element that carries an integrity
//              attribute shall also carry crossorigin="anonymous".
// ═══════════════════════════════════════════════════════════════════════════════
describe('[FTM-SC-003] crossorigin=anonymous on SRI-protected script elements', () => {
  let sriScripts;

  beforeAll(() => {
    const html = fs.readFileSync(require('path').resolve(__dirname, '../index.html'), 'utf8');
    sriScripts = [];
    const parser = new htmlparser2.Parser({
      onopentag(name, attrs) {
        if (name === 'script' && attrs.src && /^https?:\/\//.test(attrs.src) && attrs.integrity) {
          sriScripts.push(attrs);
        }
      },
    });
    parser.write(html);
    parser.end();
  });

  it('every SRI-protected external <script> carries crossorigin="anonymous"', () => {
    // TODO: [FTM-SC-003] assert crossorigin="anonymous" present on every <script> with integrity
    for (const attrs of sriScripts) {
      expect(attrs.crossorigin).toBe('anonymous');
    }
  });
});

// Convenience: degrees → radians
const d2r = deg => deg * Math.PI / 180;

// ═══════════════════════════════════════════════════════════════════════════════
// FTM-FR-003
// Requirement: The system shall accept only valid 5-digit US zip codes.
// ═══════════════════════════════════════════════════════════════════════════════
describe('[FTM-FR-003] Accept only valid 5-digit US zip codes', () => {
  // Requirement: the system accepts exactly 5 consecutive numeric digits.

  it('accepts a standard 5-digit numeric zip code', () => {
    expect(validateZipCode('10001')).toBe(true);
    expect(validateZipCode('90210')).toBe(true);
    expect(validateZipCode('33101')).toBe(true);
  });

  it('accepts a zip code with leading zeros (e.g. 00501)', () => {
    expect(validateZipCode('00501')).toBe(true);
    expect(validateZipCode('00000')).toBe(true);
  });

  it('rejects a zip code shorter than 5 digits', () => {
    expect(validateZipCode('1234')).toBe(false);
    expect(validateZipCode('123')).toBe(false);
    expect(validateZipCode('1')).toBe(false);
    expect(validateZipCode('')).toBe(false);
  });

  it('rejects a zip code longer than 5 digits', () => {
    expect(validateZipCode('123456')).toBe(false);
    expect(validateZipCode('902101234')).toBe(false);  // ZIP+4 without hyphen
  });

  it('rejects a zip code containing non-digit characters', () => {
    expect(validateZipCode('abcde')).toBe(false);
    expect(validateZipCode('1234a')).toBe(false);
    expect(validateZipCode('12 34')).toBe(false);   // internal space
    expect(validateZipCode(' 12345')).toBe(false);  // leading space
    expect(validateZipCode('12345 ')).toBe(false);  // trailing space
    expect(validateZipCode('!@#$%')).toBe(false);
  });

  it('rejects null, undefined, and non-string types', () => {
    expect(validateZipCode(null)).toBe(false);
    expect(validateZipCode(undefined)).toBe(false);
    expect(validateZipCode([])).toBe(false);
    expect(validateZipCode({})).toBe(false);
    expect(validateZipCode(true)).toBe(false);
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// FTM-FR-010
// Requirement: The system shall calculate the moon's azimuth angle for the
//              user's location and current date/time.
// ═══════════════════════════════════════════════════════════════════════════════
describe('[FTM-FR-010] Calculate moon azimuth angle', () => {
  let spyPos, spyIllum, spyTimes;

  beforeEach(() => {
    // SunCalc returns azimuth −π/2, which is East in SunCalc convention (90° compass)
    spyPos = jest.spyOn(SunCalc, 'getMoonPosition').mockReturnValue({
      altitude: 0.5236,    // 30° above horizon
      azimuth:  -Math.PI / 2,  // SunCalc East → compass 90°
    });
    spyIllum = jest.spyOn(SunCalc, 'getMoonIllumination').mockReturnValue(
      { fraction: 0.5, phase: 0.5, angle: 2.1 }
    );
    spyTimes = jest.spyOn(SunCalc, 'getMoonTimes').mockReturnValue({
      rise: new Date(Date.now() + 3_600_000),
      set:  new Date(Date.now() + 43_200_000),
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns an azimuth with an integer degree in the range [0, 359]', () => {
    const { az } = calcMoon(40.7128, -74.006, new Date());
    expect(Number.isInteger(az.deg)).toBe(true);
    expect(az.deg).toBeGreaterThanOrEqual(0);
    expect(az.deg).toBeLessThanOrEqual(359);
  });

  it('converts SunCalc convention (−π/2 = East) to compass bearing 90°', () => {
    const { az } = calcMoon(40.7128, -74.006, new Date());
    expect(az.deg).toBe(90);
    expect(az.label).toBe('E');
  });

  it('passes the supplied latitude and longitude to SunCalc', () => {
    calcMoon(34.0522, -118.2437, new Date());
    expect(spyPos).toHaveBeenCalledWith(
      expect.any(Date), 34.0522, -118.2437
    );
  });

  it('passes the supplied date to SunCalc (not a hardcoded "now")', () => {
    const specificDate = new Date('2025-06-21T12:00:00Z');
    calcMoon(40.7128, -74.006, specificDate);
    expect(spyPos).toHaveBeenCalledWith(specificDate, expect.any(Number), expect.any(Number));
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// FTM-FR-011
// Requirement: The system shall calculate the moon's altitude angle above or
//              below the horizon for the user's location and current date/time.
// ═══════════════════════════════════════════════════════════════════════════════
describe('[FTM-FR-011] Calculate moon altitude angle', () => {
  afterEach(() => jest.restoreAllMocks());

  function mockPosition(altitudeRad) {
    jest.spyOn(SunCalc, 'getMoonPosition').mockReturnValue({ altitude: altitudeRad, azimuth: 0 });
    jest.spyOn(SunCalc, 'getMoonIllumination').mockReturnValue({ fraction: 0.5, phase: 0.5, angle: 2.1 });
    jest.spyOn(SunCalc, 'getMoonTimes').mockReturnValue({
      rise: new Date(Date.now() + 3_600_000),
      set:  new Date(Date.now() + 43_200_000),
    });
  }

  it('converts altitude from radians to degrees and applies refraction (30°)', () => {
    mockPosition(Math.PI / 6);  // 30° raw; refraction adds ~0.03°
    const { altDeg } = calcMoon(40.7128, -74.006, new Date());
    expect(altDeg).toBeGreaterThan(30);
    expect(altDeg).toBeCloseTo(30, 1); // within 0.1° of 30
  });

  it('returns a negative altitude when the moon is below the horizon', () => {
    mockPosition(d2r(-20));
    const { altDeg } = calcMoon(40.7128, -74.006, new Date());
    expect(altDeg).toBeCloseTo(-20, 2);
  });

  it('returns altitude in the valid range of −90° to +90°', () => {
    // Integration check: use real SunCalc with a known date
    const { altDeg } = calcMoon(40.7128, -74.006, new Date('2025-06-15T12:00:00Z'));
    expect(altDeg).toBeGreaterThanOrEqual(-90);
    expect(altDeg).toBeLessThanOrEqual(90);
  });

  it('moon at geometric horizon (0°) appears slightly above after refraction correction', () => {
    mockPosition(0);
    const { altDeg } = calcMoon(40.7128, -74.006, new Date());
    // Refraction lifts the moon ~0.48° at 0° geometric altitude
    expect(altDeg).toBeGreaterThan(0);
    expect(altDeg).toBeLessThan(1);
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// FTM-FR-012
// Requirement: The system shall display the moon's compass direction to the
//              nearest one of 16 compass points
//              (N, NNE, NE, ENE, E, ESE, SE, SSE, S, SSW, SW, WSW, W, WNW, NW, NNW).
// ═══════════════════════════════════════════════════════════════════════════════
describe('[FTM-FR-012] Display compass direction to nearest of 16 compass points', () => {
  const VALID_LABELS = [
    'N','NNE','NE','ENE','E','ESE','SE','SSE',
    'S','SSW','SW','WSW','W','WNW','NW','NNW',
  ];

  it('always returns one of the 16 valid compass point labels', () => {
    // Sweep a full circle in fine steps
    for (let i = 0; i < 360; i++) {
      const azRad = d2r(i) - Math.PI;  // convert to SunCalc convention
      const { label } = azimuthToCompass(azRad);
      expect(VALID_LABELS).toContain(label);
    }
  });

  it('produces exactly 16 distinct labels across a full 360° sweep', () => {
    const labels = new Set();
    for (let i = 0; i < 360; i++) {
      const azRad = d2r(i) - Math.PI;
      labels.add(azimuthToCompass(azRad).label);
    }
    expect(labels.size).toBe(16);
  });

  it('each label maps to a unique full-word English compass direction', () => {
    VALID_LABELS.forEach(label => {
      const word = compassToWords(label);
      // Should expand to a longer, human-readable string
      expect(typeof word).toBe('string');
      expect(word.length).toBeGreaterThan(label.length);
    });
  });

  it('returns correct labels for the 4 cardinal directions', () => {
    expect(azimuthToCompass(Math.PI).label).toBe('N');      // SunCalc π = North
    expect(azimuthToCompass(0).label).toBe('S');            // SunCalc 0 = South
    expect(azimuthToCompass(-Math.PI / 2).label).toBe('E'); // SunCalc −π/2 = East
    expect(azimuthToCompass(Math.PI / 2).label).toBe('W'); // SunCalc π/2 = West
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// FTM-FR-013
// Requirement: The system shall indicate whether the moon is currently above
//              or below the horizon.
// ═══════════════════════════════════════════════════════════════════════════════
describe('[FTM-FR-013] Indicate whether moon is above or below the horizon', () => {
  afterEach(() => jest.restoreAllMocks());

  function mockAlt(altRad) {
    jest.spyOn(SunCalc, 'getMoonPosition').mockReturnValue({ altitude: altRad, azimuth: 0 });
    jest.spyOn(SunCalc, 'getMoonIllumination').mockReturnValue({ fraction: 0.5, phase: 0.5, angle: 2.1 });
    jest.spyOn(SunCalc, 'getMoonTimes').mockReturnValue({
      rise: new Date(Date.now() + 3_600_000),
      set:  new Date(Date.now() + 43_200_000),
    });
  }

  it('sets isAbove = true when the moon altitude is positive', () => {
    mockAlt(d2r(30));
    expect(calcMoon(40.7128, -74.006, new Date()).isAbove).toBe(true);
  });

  it('sets isAbove = false when the moon altitude is negative', () => {
    mockAlt(d2r(-15));
    expect(calcMoon(40.7128, -74.006, new Date()).isAbove).toBe(false);
  });

  it('sets isAbove = true when the moon is exactly on the geometric horizon (0°)', () => {
    // Refraction lifts a 0° moon to ~0.48° — so it IS above the visible horizon
    mockAlt(0);
    expect(calcMoon(40.7128, -74.006, new Date()).isAbove).toBe(true);
  });

  it('isAbove is always logically consistent with altDeg > 0', () => {
    const dates = [
      new Date('2025-01-13T22:00:00Z'),
      new Date('2025-06-21T12:00:00Z'),
      new Date('2025-09-01T04:00:00Z'),
    ];
    dates.forEach(date => {
      const result = calcMoon(40.7128, -74.006, date);
      expect(result.isAbove).toBe(result.altDeg > 0);
    });
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// FTM-FR-021
// Requirement: The system shall classify the moon phase as one of eight named
//              phases: New Moon, Waxing Crescent, First Quarter, Waxing Gibbous,
//              Full Moon, Waning Gibbous, Last Quarter, Waning Crescent.
// ═══════════════════════════════════════════════════════════════════════════════
describe('[FTM-FR-021] Classify moon into one of exactly eight named phases', () => {
  const EIGHT_PHASES = [
    'New Moon',
    'Waxing Crescent',
    'First Quarter',
    'Waxing Gibbous',
    'Full Moon',
    'Waning Gibbous',
    'Last Quarter',
    'Waning Crescent',
  ];

  // Representative phase values for each named phase (SunCalc 0–1 scale)
  const REPRESENTATIVE = {
    'New Moon':        [0.00, 0.01, 0.98, 1.00],
    'Waxing Crescent': [0.05, 0.15, 0.20],
    'First Quarter':   [0.22, 0.25, 0.27],
    'Waxing Gibbous':  [0.30, 0.38, 0.46],
    'Full Moon':       [0.47, 0.50, 0.52],
    'Waning Gibbous':  [0.55, 0.63, 0.71],
    'Last Quarter':    [0.72, 0.75, 0.77],
    'Waning Crescent': [0.80, 0.88, 0.96],
  };

  EIGHT_PHASES.forEach(phase => {
    it(`correctly identifies the "${phase}" phase`, () => {
      REPRESENTATIVE[phase].forEach(angle => {
        expect(getPhaseName(0.5, angle)).toBe(phase);
      });
    });
  });

  it('returns only one of the eight valid phase names for any input', () => {
    for (let i = 0; i <= 200; i++) {
      const angle = i / 200;
      expect(EIGHT_PHASES).toContain(getPhaseName(0.5, angle));
    }
  });

  it('covers all eight distinct phases across a full lunar cycle (0–1)', () => {
    const seen = new Set();
    for (let i = 0; i <= 400; i++) {
      seen.add(getPhaseName(0.5, i / 400));
    }
    expect(seen.size).toBe(8);
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// FTM-FR-030
// Requirement: The system shall automatically apply a nighttime visual theme
//              when the sun is more than 6 degrees below the horizon.
// ═══════════════════════════════════════════════════════════════════════════════
describe('[FTM-FR-030] Apply nighttime theme when sun > 6° below horizon', () => {
  afterEach(() => jest.restoreAllMocks());

  it('identifies night when sun altitude is −7° (just past the −6° threshold)', () => {
    jest.spyOn(SunCalc, 'getPosition').mockReturnValue({ altitude: d2r(-7) });
    expect(isNighttime(new Date(), 40.7, -74.0)).toBe(true);
  });

  it('identifies night at −18° (astronomical twilight)', () => {
    jest.spyOn(SunCalc, 'getPosition').mockReturnValue({ altitude: d2r(-18) });
    expect(isNighttime(new Date(), 40.7, -74.0)).toBe(true);
  });

  it('identifies night at −90° (sun at its lowest point)', () => {
    jest.spyOn(SunCalc, 'getPosition').mockReturnValue({ altitude: d2r(-90) });
    expect(isNighttime(new Date(), 40.7, -74.0)).toBe(true);
  });

  it('returns true (night) for real 3 AM EST winter conditions in New York', () => {
    // Integration: real SunCalc; 08:00 UTC = 03:00 EST in January
    expect(isNighttime(new Date('2025-01-15T08:00:00Z'), 40.7128, -74.006)).toBe(true);
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// FTM-FR-031
// Requirement: The system shall automatically apply a daytime visual theme
//              when the sun is at or above 6 degrees below the horizon
//              (i.e. sun altitude ≥ −6°).
// ═══════════════════════════════════════════════════════════════════════════════
describe('[FTM-FR-031] Apply daytime theme when sun altitude ≥ −6°', () => {
  afterEach(() => jest.restoreAllMocks());

  it('identifies day when sun altitude is exactly −6° (the boundary, inclusive)', () => {
    // −6° is NOT below −6°, so it is daytime
    jest.spyOn(SunCalc, 'getPosition').mockReturnValue({ altitude: d2r(-6) });
    expect(isNighttime(new Date(), 40.7, -74.0)).toBe(false);
  });

  it('identifies day when sun altitude is −5° (above the threshold)', () => {
    jest.spyOn(SunCalc, 'getPosition').mockReturnValue({ altitude: d2r(-5) });
    expect(isNighttime(new Date(), 40.7, -74.0)).toBe(false);
  });

  it('identifies day when sun altitude is 0° (on the horizon)', () => {
    jest.spyOn(SunCalc, 'getPosition').mockReturnValue({ altitude: d2r(0) });
    expect(isNighttime(new Date(), 40.7, -74.0)).toBe(false);
  });

  it('identifies day when sun altitude is positive (sun above horizon)', () => {
    jest.spyOn(SunCalc, 'getPosition').mockReturnValue({ altitude: d2r(30) });
    expect(isNighttime(new Date(), 40.7, -74.0)).toBe(false);
  });

  it('returns false (day) for real noon UTC conditions in New York in summer', () => {
    // Integration: real SunCalc; 17:00 UTC = 13:00 EDT in July
    expect(isNighttime(new Date('2025-07-15T17:00:00Z'), 40.7128, -74.006)).toBe(false);
  });

  it('identifies day when sun altitude is 0° (at the horizon)', () => {
    jest.spyOn(SunCalc, 'getPosition').mockReturnValue({ altitude: d2r(0) });
    expect(isNighttime(new Date(), 40.7, -74.0)).toBe(false);
  });

  it('identifies day when sun altitude is positive (sun above horizon)', () => {
    jest.spyOn(SunCalc, 'getPosition').mockReturnValue({ altitude: d2r(30) });
    expect(isNighttime(new Date(), 40.7, -74.0)).toBe(false);
  });

  it('returns false (day) for real noon UTC conditions in New York in summer', () => {
    // Integration: real SunCalc; 16:00 UTC = 12:00 EDT in July
    expect(isNighttime(new Date('2025-07-15T16:00:00Z'), 40.7128, -74.006)).toBe(false);
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// FTM-SC-001, FTM-SC-002, FTM-SC-003, FTM-SC-004
// Requirement FTM-SC-001: Every externally hosted <script> element shall include
//              an integrity attribute.
// Requirement FTM-SC-002: The SRI hash shall be a SHA-384 digest encoded in base64.
// Requirement FTM-SC-003: Every externally hosted <script> with integrity shall
//              also carry crossorigin="anonymous".
// Requirement FTM-SC-004: The SunCalc.js library shall continue to load and execute.
// ═══════════════════════════════════════════════════════════════════════════════
describe('[FTM-SC-001/002/003] SRI integrity and crossorigin attributes on external scripts', () => {
  const fs = require('fs');
  const path = require('path');

  let htmlContent;
  let externalScripts;

  beforeAll(() => {
    const htmlPath = path.resolve(__dirname, '../index.html');
    htmlContent = fs.readFileSync(htmlPath, 'utf8');

    // Parse all <script> tags that have an external src attribute
    const scriptTagRegex = /<script[^>]+src=["'][^"']*:\/\/[^"']+["'][^>]*>/gi;
    externalScripts = htmlContent.match(scriptTagRegex) || [];
  });

  it('[FTM-SC-001] every externally hosted <script> element has an integrity attribute', () => {
    expect(externalScripts.length).toBeGreaterThan(0);
    externalScripts.forEach(tag => {
      expect(tag).toMatch(/integrity\s*=/i);
    });
  });

  it('[FTM-SC-002] the integrity attribute value uses a sha384- or sha512- prefix (SHA-384 or SHA-512, base64 encoded)', () => {
    expect(externalScripts.length).toBeGreaterThan(0);
    externalScripts.forEach(tag => {
      // integrity attribute value must start with sha384- or sha512- followed by base64 characters
      expect(tag).toMatch(/integrity\s*=\s*["']sha(384|512)-[A-Za-z0-9+/]+=*["']/i);
    });
  });

  it('[FTM-SC-003] every externally hosted <script> with an integrity attribute also has crossorigin="anonymous"', () => {
    expect(externalScripts.length).toBeGreaterThan(0);
    externalScripts.forEach(tag => {
      if (/integrity\s*=/i.test(tag)) {
        expect(tag).toMatch(/crossorigin\s*=\s*["']anonymous["']/i);
      }
    });
  });

  it('[FTM-SC-001] the SunCalc CDN script tag specifically carries an integrity attribute', () => {
    expect(htmlContent).toMatch(/suncalc\.min\.js/);
    // Find the suncalc script tag
    const suncalcTagMatch = htmlContent.match(/<script[^>]+suncalc\.min\.js[^>]*>/i);
    expect(suncalcTagMatch).not.toBeNull();
    const suncalcTag = suncalcTagMatch[0];
    expect(suncalcTag).toMatch(/integrity\s*=/i);
  });

  it('[FTM-SC-002] the SunCalc script integrity value is a valid sha384 or sha512 base64 hash', () => {
    const suncalcTagMatch = htmlContent.match(/<script[^>]+suncalc\.min\.js[^>]*>/i);
    expect(suncalcTagMatch).not.toBeNull();
    const suncalcTag = suncalcTagMatch[0];
    expect(suncalcTag).toMatch(/integrity\s*=\s*["']sha(384|512)-[A-Za-z0-9+/]+=*["']/i);
  });

  it('[FTM-SC-003] the SunCalc script tag carries crossorigin="anonymous"', () => {
    const suncalcTagMatch = htmlContent.match(/<script[^>]+suncalc\.min\.js[^>]*>/i);
    expect(suncalcTagMatch).not.toBeNull();
    const suncalcTag = suncalcTagMatch[0];
    expect(suncalcTag).toMatch(/crossorigin\s*=\s*["']anonymous["']/i);
  });
});


// =============================================================================
// FTM-SC-001, FTM-SC-002, FTM-SC-003
// Requirement: External scripts shall carry a valid SHA-384 SRI integrity
//              attribute and crossorigin="anonymous".
// Verification method: Inspection (implemented as an automated parse test)
// =============================================================================

const fs   = require('fs');
const path = require('path');

// Parse index.html once for all SRI inspection tests.
const INDEX_HTML = fs.readFileSync(
  path.resolve(__dirname, '../index.html'),
  'utf8'
);

/**
 * Minimal regex-based extractor — returns an array of objects for every
 * <script> tag whose src begins with "http".
 * Each object: { src, integrity, crossorigin }
 */
function extractExternalScripts(html) {
  const scriptTagRe = /<script\b([^>]*)>/gi;
  const attrRe      = name =>
    new RegExp(name + '\\s*=\\s*["\']([^"\']*)["\']', 'i');

  const results = [];
  let match;
  while ((match = scriptTagRe.exec(html)) !== null) {
    const attrs = match[1];
    const srcMatch = attrRe('src').exec(attrs);
    if (!srcMatch) continue;
    const src = srcMatch[1];
    if (!src.startsWith('http')) continue;

    const integrityMatch   = attrRe('integrity').exec(attrs);
    const crossoriginMatch = attrRe('crossorigin').exec(attrs);
    results.push({
      src,
      integrity:   integrityMatch   ? integrityMatch[1]   : null,
      crossorigin: crossoriginMatch ? crossoriginMatch[1] : null,
    });
  }
  return results;
}

describe('[FTM-SC-001] SRI integrity attribute present on all external scripts', () => {
  // Requirement: every externally hosted <script> in index.html shall
  // include a non-empty integrity attribute.

  it('finds at least one external script tag in index.html', () => {
    // TODO: This test verifies the extractor finds the SunCalc CDN tag.
    //       If the tag is missing entirely the test should fail loudly.
    const scripts = extractExternalScripts(INDEX_HTML);
    expect(scripts.length).toBeGreaterThan(0);
  });

  it('every external script tag has a non-empty integrity attribute', () => {
    // TODO: For each external <script>, assert that the integrity attribute
    //       exists and is not an empty string. Fails if the CDN tag was added
    //       without an integrity value.
    const scripts = extractExternalScripts(INDEX_HTML);
    for (const script of scripts) {
      expect(script.integrity).toBeTruthy();
    }
  });

  it('the SunCalc CDN script specifically has an integrity attribute', () => {
    // TODO: Locate the SunCalc 1.9.0 entry by matching its src URL and
    //       assert the integrity attribute is present and non-empty.
    const scripts = extractExternalScripts(INDEX_HTML);
    const sunCalc = scripts.find(s =>
      s.src.includes('suncalc') && s.src.includes('1.9.0')
    );
    expect(sunCalc).toBeDefined();
    expect(sunCalc.integrity).toBeTruthy();
  });
});

describe('[FTM-SC-002] SRI hash is a valid SHA-384 or SHA-512 base64 digest', () => {
  // Requirement: the integrity attribute value shall use sha384 or sha512 algorithm
  // and a correctly formed base64 digest.
  const SRI_RE = /^sha(384|512)-[A-Za-z0-9+/]+=*$/;

  it('every external script integrity value matches the sha384- or sha512-<base64> format', () => {
    const scripts = extractExternalScripts(INDEX_HTML);
    for (const script of scripts) {
      if (!script.integrity) continue; // already caught by FTM-SC-001 tests
      expect(SRI_RE.test(script.integrity)).toBe(true);
    }
  });

  it('the SunCalc SRI value is not a placeholder string', () => {
    // TODO: Assert the integrity attribute does NOT contain "<hash>" or
    //       other placeholder tokens that would indicate the developer
    //       copied the template without filling in the real digest.
    const scripts = extractExternalScripts(INDEX_HTML);
    const sunCalc = scripts.find(s => s.src.includes('suncalc'));
    expect(sunCalc).toBeDefined();
    expect(sunCalc.integrity).not.toMatch(/<hash>/);
    expect(sunCalc.integrity).not.toMatch(/TODO/i);
    expect(sunCalc.integrity).not.toMatch(/PLACEHOLDER/i);
  });

  it('optionally verifies the SHA-384 digest matches the locally cached suncalc.min.js', () => {
    const crypto = require('crypto');
    const vendor = path.resolve(__dirname, '../vendor/suncalc.min.js');
    if (!fs.existsSync(vendor)) { return; } // skip gracefully when no local copy is present
    const digest = crypto.createHash('sha384')
      .update(fs.readFileSync(vendor))
      .digest('base64');
    const expected = `sha384-${digest}`;
    const scripts  = extractExternalScripts(INDEX_HTML);
    const sunCalc  = scripts.find(s => s.src.includes('suncalc'));
    expect(sunCalc).toBeDefined();
    expect(sunCalc.integrity).toBe(expected);
  });
});

describe('[FTM-SC-003] crossorigin attribute present on SRI-protected scripts', () => {
  // Requirement: every external <script> with an integrity attribute shall
  // also carry crossorigin="anonymous".
  // Without crossorigin, browsers refuse SRI checking for cross-origin scripts.

  it('every external script with integrity also has crossorigin="anonymous"', () => {
    // TODO: For each external script whose integrity is non-empty, assert
    //       that crossorigin equals "anonymous" (case-insensitive).
    const scripts = extractExternalScripts(INDEX_HTML);
    for (const script of scripts) {
      if (!script.integrity) continue;
      expect(script.crossorigin).toBeTruthy();
      expect(script.crossorigin.toLowerCase()).toBe('anonymous');
    }
  });

  it('the SunCalc CDN script specifically has crossorigin="anonymous"', () => {
    // TODO: Locate the SunCalc entry and assert crossorigin="anonymous".
    const scripts = extractExternalScripts(INDEX_HTML);
    const sunCalc = scripts.find(s => s.src.includes('suncalc'));
    expect(sunCalc).toBeDefined();
    expect(sunCalc.crossorigin).toBeDefined();
    expect(sunCalc.crossorigin.toLowerCase()).toBe('anonymous');
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// FTM-VT-003
// Requirement: The constellation lines and dot markers shall be rendered at an
// opacity between 0.4 and 0.5 inclusive.
// ═══════════════════════════════════════════════════════════════════════════════
describe('[FTM-VT-003] Constellation opacity in range 0.4–0.5', () => {
  const fs = require('fs');
  const html = fs.readFileSync('index.html', 'utf8');

  it('index.html contains constellation drawing code', () => {
    expect(html).toMatch(/constellation/i);
  });

  it('constellation rgba colors use opacity between 0.4 and 0.5', () => {
    // Scope scan to drawConstellations() body only — avoids false positives from
    // unrelated rgba values elsewhere in index.html that happen to share this range.
    const fnStart = html.indexOf('function drawConstellations()');
    const fnEnd   = html.indexOf('\nfunction ', fnStart + 1);
    const fnBody  = fnStart >= 0 ? html.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 4000) : '';
    expect(fnBody.length).toBeGreaterThan(0); // drawConstellations must exist
    const rgbaMatches = fnBody.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(0\.\d+)\s*\)/g) || [];
    const alphas = rgbaMatches.map(m => parseFloat(m.match(/,\s*(0\.\d+)\s*\)$/)[1]));
    expect(alphas.length).toBeGreaterThan(0); // at least one rgba color defined
    alphas.forEach(a => {
      expect(a).toBeGreaterThanOrEqual(0.4);
      expect(a).toBeLessThanOrEqual(0.50);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FTM-VT-008 (config / logic layer)
// Requirement: The system shall render daytime animated clouds using the fill
// color #a8d5a2 (soft sage green).
// ═══════════════════════════════════════════════════════════════════════════════
describe('[FTM-VT-008] Daytime cloud fill color (config)', () => {
  const fs = require('fs');
  const html = fs.readFileSync('index.html', 'utf8');

  it('index.html contains the sage green cloud color #a8d5a2 or rgba(168,213,162)', () => {
    // rgba(168,213,162,...) is the CSS equivalent of #a8d5a2
    expect(html).toMatch(/rgba\(\s*168\s*,\s*213\s*,\s*162/i);
  });

  it('cloud color is not the legacy lavender value #c9b8e8', () => {
    // The cloud fill must not contain the old lavender color
    expect(html).not.toMatch(/rgba\(\s*201\s*,\s*184\s*,\s*232/i);
  });
});
