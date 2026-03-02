'use strict';

/**
 * verification.test.js — Logic-layer verification tests (Jest)
 *
 * Each test is explicitly traced to a requirement ID from FTM-SRS-001 v1.0.
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
 */

const SunCalc = require('suncalc');

const {
  azimuthToCompass,
  compassToWords,
  getPhaseName,
  isNighttime,
  calcMoon,
  validateZipCode,
} = require('../src/moonLogic');

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

  it('identifies day when sun is on the horizon (0°)', () => {
    jest.spyOn(SunCalc, 'getPosition').mockReturnValue({ altitude: 0 });
    expect(isNighttime(new Date(), 40.7, -74.0)).toBe(false);
  });

  it('identifies day when sun is 45° above the horizon', () => {
    jest.spyOn(SunCalc, 'getPosition').mockReturnValue({ altitude: d2r(45) });
    expect(isNighttime(new Date(), 40.7, -74.0)).toBe(false);
  });

  it('returns false (day) for real summer solstice noon conditions in New York', () => {
    // Integration: real SunCalc; 17:00 UTC ≈ 1 PM EDT
    expect(isNighttime(new Date('2025-06-21T17:00:00Z'), 40.7128, -74.006)).toBe(false);
  });
});
