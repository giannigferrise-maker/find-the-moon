'use strict';

/**
 * moonPosition.test.js
 *
 * Tests for calcMoon() — verifies that given a known latitude, longitude,
 * and date/time the function returns correctly transformed moon position data.
 *
 * Strategy:
 *  1. Unit tests  – spy on SunCalc methods to inject controlled values and
 *                   verify the math transformations inside calcMoon.
 *  2. Integration – use the real SunCalc library with astronomically
 *                   significant dates (full moon / new moon) to confirm
 *                   qualitative correctness.
 */

const SunCalc  = require('suncalc');
const { calcMoon, radToDeg, refractionCorrection } = require('../src/moonLogic');

// ── Shared test coordinates ───────────────────────────────────────────────────
// New York City
const NYC_LAT =  40.7128;
const NYC_LON = -74.0060;

// ── Helper ────────────────────────────────────────────────────────────────────
/** Convert degrees → radians inline for readability in tests */
const d2r = deg => deg * Math.PI / 180;

// ── UNIT TESTS (mocked SunCalc) ───────────────────────────────────────────────

describe('calcMoon() — unit tests with mocked SunCalc', () => {
  let spyPosition, spyIllum, spyTimes;

  const FUTURE_RISE = new Date(Date.now() + 3 * 60 * 60 * 1000); // 3 h from now
  const FUTURE_SET  = new Date(Date.now() + 9 * 60 * 60 * 1000); // 9 h from now

  beforeEach(() => {
    // Provide a default mock that each individual test can override
    spyPosition = jest.spyOn(SunCalc, 'getMoonPosition').mockReturnValue({
      altitude: d2r(30),  // 30° above horizon (SunCalc returns radians)
      azimuth:  0,        // 0 rad = South in SunCalc convention
    });
    spyIllum = jest.spyOn(SunCalc, 'getMoonIllumination').mockReturnValue({
      fraction: 1.0,
      phase:    0.50,
      angle:    2.1,
    });
    spyTimes = jest.spyOn(SunCalc, 'getMoonTimes').mockReturnValue({
      rise: FUTURE_RISE,
      set:  FUTURE_SET,
    });
  });

  afterEach(() => {
    spyPosition.mockRestore();
    spyIllum.mockRestore();
    spyTimes.mockRestore();
  });

  // ── altitude conversion ───────────────────────────────────────────────────
  it('converts altitude from radians to degrees and applies refraction (30° above horizon)', () => {
    // Mock returns 30° exactly; refraction at 30° adds ~0.029°, so result > 30
    const result = calcMoon(NYC_LAT, NYC_LON, new Date());
    expect(result.altDeg).toBeGreaterThan(30);
    expect(result.altDeg).toBeCloseTo(30, 1); // within 0.1° of 30
  });

  it('sets isAbove = true when altitude is positive', () => {
    const result = calcMoon(NYC_LAT, NYC_LON, new Date());
    expect(result.isAbove).toBe(true);
  });

  it('sets isAbove = false when moon is below the horizon', () => {
    spyPosition.mockReturnValue({ altitude: d2r(-15), azimuth: Math.PI });
    const result = calcMoon(NYC_LAT, NYC_LON, new Date());
    expect(result.altDeg).toBeCloseTo(-15, 4);
    expect(result.isAbove).toBe(false);
  });

  it('moon at geometric horizon (0°) appears above horizon after refraction correction', () => {
    // Refraction lifts the moon ~0.48° at 0° geometric altitude —
    // so a moon sitting exactly on the geometric horizon IS actually visible.
    spyPosition.mockReturnValue({ altitude: 0, azimuth: 0 });
    const result = calcMoon(NYC_LAT, NYC_LON, new Date());
    expect(result.altDeg).toBeGreaterThan(0);
    expect(result.isAbove).toBe(true);
  });

  // ── azimuth conversion ────────────────────────────────────────────────────
  it('converts SunCalc azimuth 0 (South) to compass 180° S', () => {
    spyPosition.mockReturnValue({ altitude: d2r(30), azimuth: 0 });
    const result = calcMoon(NYC_LAT, NYC_LON, new Date());
    expect(result.az.deg).toBe(180);
    expect(result.az.label).toBe('S');
  });

  it('converts SunCalc azimuth π (North) to compass 0° N', () => {
    spyPosition.mockReturnValue({ altitude: d2r(30), azimuth: Math.PI });
    const result = calcMoon(NYC_LAT, NYC_LON, new Date());
    expect(result.az.deg).toBe(0);
    expect(result.az.label).toBe('N');
  });

  it('converts SunCalc azimuth π/2 (West) to compass 270° W', () => {
    spyPosition.mockReturnValue({ altitude: d2r(30), azimuth: Math.PI / 2 });
    const result = calcMoon(NYC_LAT, NYC_LON, new Date());
    expect(result.az.deg).toBe(270);
    expect(result.az.label).toBe('W');
  });

  it('converts SunCalc azimuth -π/2 (East) to compass 90° E', () => {
    spyPosition.mockReturnValue({ altitude: d2r(30), azimuth: -Math.PI / 2 });
    const result = calcMoon(NYC_LAT, NYC_LON, new Date());
    expect(result.az.deg).toBe(90);
    expect(result.az.label).toBe('E');
  });

  // ── illumination pass-through ─────────────────────────────────────────────
  it('passes illumination data from SunCalc through unchanged', () => {
    spyIllum.mockReturnValue({ fraction: 0.75, phase: 0.65, angle: 1.8 });
    const result = calcMoon(NYC_LAT, NYC_LON, new Date());
    expect(result.illum.fraction).toBe(0.75);
    expect(result.illum.phase).toBe(0.65);
    expect(result.illum.angle).toBe(1.8);
  });

  // ── rise/set time handling ────────────────────────────────────────────────
  it('returns riseTime and setTime when provided by SunCalc', () => {
    const result = calcMoon(NYC_LAT, NYC_LON, new Date());
    expect(result.riseTime).toEqual(FUTURE_RISE);
    expect(result.setTime).toEqual(FUTURE_SET);
  });

  it('returns null for riseTime/setTime when SunCalc provides none', () => {
    spyTimes.mockReturnValue({ rise: undefined, set: undefined });
    const result = calcMoon(NYC_LAT, NYC_LON, new Date());
    expect(result.riseTime).toBeNull();
    expect(result.setTime).toBeNull();
  });

  it('looks up next-day rise when todayʼs rise is already past', () => {
    const PAST_RISE   = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5 h ago
    const FUTURE_RISE_TOMORROW = new Date(Date.now() + 20 * 60 * 60 * 1000);

    spyTimes
      .mockReturnValueOnce({ rise: PAST_RISE,             set: FUTURE_SET })  // today
      .mockReturnValueOnce({ rise: FUTURE_RISE_TOMORROW,  set: null       }); // tomorrow

    const result = calcMoon(NYC_LAT, NYC_LON, new Date());
    expect(result.nextRise).toEqual(FUTURE_RISE_TOMORROW);
  });

  // ── date parameter ────────────────────────────────────────────────────────
  it('passes the supplied date to SunCalc (not the current time)', () => {
    const specificDate = new Date('2025-01-13T22:00:00Z');
    calcMoon(NYC_LAT, NYC_LON, specificDate);
    expect(spyPosition).toHaveBeenCalledWith(specificDate, NYC_LAT, NYC_LON);
    expect(spyIllum).toHaveBeenCalledWith(specificDate);
    expect(spyTimes).toHaveBeenCalledWith(specificDate, NYC_LAT, NYC_LON);
  });

  it('echoes the supplied date as result.now', () => {
    const specificDate = new Date('2025-06-15T12:00:00Z');
    const result = calcMoon(NYC_LAT, NYC_LON, specificDate);
    expect(result.now).toBe(specificDate);
  });
});

// ── REFRACTION CORRECTION TESTS ──────────────────────────────────────────────

describe('refractionCorrection()', () => {
  it('returns a positive correction at the horizon (0°)', () => {
    expect(refractionCorrection(0)).toBeGreaterThan(0);
  });

  it('returns less than 0.6° at the horizon (physically plausible max)', () => {
    expect(refractionCorrection(0)).toBeLessThan(0.6);
  });

  it('returns a smaller correction at 10° than at 0°', () => {
    expect(refractionCorrection(10)).toBeLessThan(refractionCorrection(0));
  });

  it('returns less than 0.1° above 20° (negligible in practice)', () => {
    expect(refractionCorrection(20)).toBeLessThan(0.1);
  });

  it('returns exactly 0 when moon is well below horizon (-2°)', () => {
    expect(refractionCorrection(-2)).toBe(0);
  });

  it('returns exactly 0 for deeply negative altitudes (-45°)', () => {
    expect(refractionCorrection(-45)).toBe(0);
  });

  it('correction decreases monotonically from horizon to overhead', () => {
    const c0  = refractionCorrection(0);
    const c10 = refractionCorrection(10);
    const c30 = refractionCorrection(30);
    const c60 = refractionCorrection(60);
    expect(c0).toBeGreaterThan(c10);
    expect(c10).toBeGreaterThan(c30);
    expect(c30).toBeGreaterThan(c60);
  });

  it('correction is always positive for altitudes between -1° and 90°', () => {
    [-1, 0, 5, 10, 30, 60, 90].forEach(alt => {
      expect(refractionCorrection(alt)).toBeGreaterThanOrEqual(0);
    });
  });
});

// ── INTEGRATION TESTS (real SunCalc) ─────────────────────────────────────────

describe('calcMoon() — integration tests with real SunCalc', () => {
  /**
   * January 13 2025 22:27 UTC was the exact moment of the Full Moon.
   * At this date the illumination fraction from SunCalc should be very close
   * to 1.0 and the phase close to 0.50.
   */
  describe('Full Moon – January 13 2025', () => {
    const FULL_MOON_DATE = new Date('2025-01-13T22:27:00Z');

    it('reports illumination fraction > 0.95 (full moon)', () => {
      const result = calcMoon(NYC_LAT, NYC_LON, FULL_MOON_DATE);
      expect(result.illum.fraction).toBeGreaterThan(0.95);
    });

    it('reports phase value between 0.45 and 0.55 (full moon region)', () => {
      const result = calcMoon(NYC_LAT, NYC_LON, FULL_MOON_DATE);
      expect(result.illum.phase).toBeGreaterThanOrEqual(0.45);
      expect(result.illum.phase).toBeLessThanOrEqual(0.55);
    });

    it('returns altitude within valid range [-90°, 90°]', () => {
      const result = calcMoon(NYC_LAT, NYC_LON, FULL_MOON_DATE);
      expect(result.altDeg).toBeGreaterThanOrEqual(-90);
      expect(result.altDeg).toBeLessThanOrEqual(90);
    });

    it('returns compass degree within [0, 359]', () => {
      const result = calcMoon(NYC_LAT, NYC_LON, FULL_MOON_DATE);
      expect(result.az.deg).toBeGreaterThanOrEqual(0);
      expect(result.az.deg).toBeLessThanOrEqual(359);
    });

    it('altitude and isAbove are consistent', () => {
      const result = calcMoon(NYC_LAT, NYC_LON, FULL_MOON_DATE);
      expect(result.isAbove).toBe(result.altDeg > 0);
    });

    it('altDeg is higher than raw SunCalc altitude by the refraction amount', () => {
      const rawPos = SunCalc.getMoonPosition(FULL_MOON_DATE, NYC_LAT, NYC_LON);
      const rawAlt = rawPos.altitude * (180 / Math.PI);
      const result = calcMoon(NYC_LAT, NYC_LON, FULL_MOON_DATE);
      // Refraction always adds a positive correction
      expect(result.altDeg).toBeGreaterThanOrEqual(rawAlt);
      // But never more than 1° higher (max refraction is ~0.57°)
      expect(result.altDeg - rawAlt).toBeLessThan(1);
    });

    it('transformation matches direct SunCalc call (azimuth degrees)', () => {
      const rawPos = SunCalc.getMoonPosition(FULL_MOON_DATE, NYC_LAT, NYC_LON);
      const expectedDeg = Math.round(
        ((rawPos.azimuth * 180 / Math.PI) + 180 + 360) % 360
      );
      const result = calcMoon(NYC_LAT, NYC_LON, FULL_MOON_DATE);
      expect(result.az.deg).toBe(expectedDeg);
    });
  });

  /**
   * January 29 2025 12:36 UTC was the New Moon.
   * Illumination fraction should be very close to 0.
   */
  describe('New Moon – January 29 2025', () => {
    const NEW_MOON_DATE = new Date('2025-01-29T12:36:00Z');

    it('reports illumination fraction < 0.05 (new moon)', () => {
      const result = calcMoon(NYC_LAT, NYC_LON, NEW_MOON_DATE);
      expect(result.illum.fraction).toBeLessThan(0.05);
    });

    it('reports phase value close to 0 or 1 (new moon region)', () => {
      const result = calcMoon(NYC_LAT, NYC_LON, NEW_MOON_DATE);
      const phase = result.illum.phase;
      const isNearNewMoon = phase < 0.05 || phase > 0.95;
      expect(isNearNewMoon).toBe(true);
    });
  });

  describe('different geographic locations', () => {
    const TEST_DATE = new Date('2025-06-15T12:00:00Z');

    it('produces valid altitude for Sydney, Australia', () => {
      const result = calcMoon(-33.8688, 151.2093, TEST_DATE);
      expect(result.altDeg).toBeGreaterThanOrEqual(-90);
      expect(result.altDeg).toBeLessThanOrEqual(90);
    });

    it('produces valid compass degree for London, UK', () => {
      const result = calcMoon(51.5074, -0.1278, TEST_DATE);
      expect(result.az.deg).toBeGreaterThanOrEqual(0);
      expect(result.az.deg).toBeLessThanOrEqual(359);
    });

    it('produces valid altitude for Reykjavik, Iceland (high latitude)', () => {
      const result = calcMoon(64.1355, -21.8954, TEST_DATE);
      expect(result.altDeg).toBeGreaterThanOrEqual(-90);
      expect(result.altDeg).toBeLessThanOrEqual(90);
    });
  });
});
