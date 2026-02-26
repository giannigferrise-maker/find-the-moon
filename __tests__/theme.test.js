'use strict';

/**
 * theme.test.js
 *
 * Tests for the day/night theme selection logic.
 *
 * The app switches between a "night" sky (dark, with stars) and a "day" sky
 * (bright blue, with clouds) based on the sun's altitude at the observer's
 * location.  The threshold is −6°:
 *
 *   sun altitude < −6°  →  night theme
 *   sun altitude ≥ −6°  →  day theme
 *
 * We test isNighttime() (the boolean predicate) and getTheme() (the string
 * selector) by spying on SunCalc.getPosition and injecting controlled sun
 * altitude values.
 */

const SunCalc = require('suncalc');
const { isNighttime, getTheme } = require('../src/moonLogic');

// ── helpers ───────────────────────────────────────────────────────────────────
const d2r = deg => deg * Math.PI / 180;

// Stub latitude/longitude – only the mocked sun altitude matters in these tests
const LAT = 40.7128;
const LON = -74.0060;
const NOW = new Date();

// ── isNighttime() ─────────────────────────────────────────────────────────────

describe('isNighttime()', () => {
  let spy;

  beforeEach(() => {
    spy = jest.spyOn(SunCalc, 'getPosition');
  });

  afterEach(() => {
    spy.mockRestore();
  });

  // ── clearly nighttime ─────────────────────────────────────────────────────
  it('returns true when sun is well below the horizon (−30°)', () => {
    spy.mockReturnValue({ altitude: d2r(-30) });
    expect(isNighttime(NOW, LAT, LON)).toBe(true);
  });

  it('returns true at astronomical twilight threshold (−18°)', () => {
    spy.mockReturnValue({ altitude: d2r(-18) });
    expect(isNighttime(NOW, LAT, LON)).toBe(true);
  });

  it('returns true just past the −6° threshold (−6.1°)', () => {
    spy.mockReturnValue({ altitude: d2r(-6.1) });
    expect(isNighttime(NOW, LAT, LON)).toBe(true);
  });

  it('returns true for a sun altitude of exactly −7°', () => {
    spy.mockReturnValue({ altitude: d2r(-7) });
    expect(isNighttime(NOW, LAT, LON)).toBe(true);
  });

  // ── daytime / civil twilight ──────────────────────────────────────────────
  it('returns false when sun is well above the horizon (+45°)', () => {
    spy.mockReturnValue({ altitude: d2r(45) });
    expect(isNighttime(NOW, LAT, LON)).toBe(false);
  });

  it('returns false at solar noon (+70°)', () => {
    spy.mockReturnValue({ altitude: d2r(70) });
    expect(isNighttime(NOW, LAT, LON)).toBe(false);
  });

  it('returns false for sun just above the horizon (+1°)', () => {
    spy.mockReturnValue({ altitude: d2r(1) });
    expect(isNighttime(NOW, LAT, LON)).toBe(false);
  });

  it('returns false when sun is exactly at 0° (on the horizon)', () => {
    spy.mockReturnValue({ altitude: 0 });
    expect(isNighttime(NOW, LAT, LON)).toBe(false);
  });

  it('returns false when sun altitude is exactly −6° (on the boundary)', () => {
    // −6° is NOT < −6, so it is daytime by the appʼs definition
    spy.mockReturnValue({ altitude: d2r(-6) });
    expect(isNighttime(NOW, LAT, LON)).toBe(false);
  });

  it('returns false for sun at −5° (civil twilight, still "day")', () => {
    spy.mockReturnValue({ altitude: d2r(-5) });
    expect(isNighttime(NOW, LAT, LON)).toBe(false);
  });

  // ── SunCalc is called with the correct arguments ──────────────────────────
  it('passes the date, lat, and lon to SunCalc.getPosition', () => {
    spy.mockReturnValue({ altitude: d2r(-30) });
    const testDate = new Date('2025-06-21T12:00:00Z');
    isNighttime(testDate, 51.5, -0.1);
    expect(spy).toHaveBeenCalledWith(testDate, 51.5, -0.1);
  });
});

// ── getTheme() ────────────────────────────────────────────────────────────────

describe('getTheme()', () => {
  let spy;

  beforeEach(() => {
    spy = jest.spyOn(SunCalc, 'getPosition');
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('returns "night" when sun is below −6°', () => {
    spy.mockReturnValue({ altitude: d2r(-30) });
    expect(getTheme(NOW, LAT, LON)).toBe('night');
  });

  it('returns "day" when sun is above −6°', () => {
    spy.mockReturnValue({ altitude: d2r(45) });
    expect(getTheme(NOW, LAT, LON)).toBe('day');
  });

  it('returns "day" when sun is exactly at −6°', () => {
    spy.mockReturnValue({ altitude: d2r(-6) });
    expect(getTheme(NOW, LAT, LON)).toBe('day');
  });

  it('returns "night" when sun is at −6.001° (just past threshold)', () => {
    spy.mockReturnValue({ altitude: d2r(-6.001) });
    expect(getTheme(NOW, LAT, LON)).toBe('night');
  });

  it('returns only "night" or "day" (no other values possible)', () => {
    const altitudes = [-90, -30, -7, -6.001, -6, -5, 0, 30, 90];
    altitudes.forEach(alt => {
      spy.mockReturnValue({ altitude: d2r(alt) });
      const theme = getTheme(NOW, LAT, LON);
      expect(['night', 'day']).toContain(theme);
    });
  });
});

// ── Integration: real SunCalc for known dates ─────────────────────────────────

describe('isNighttime() — integration with real SunCalc', () => {
  // Summer solstice noon UTC – sun is high above the horizon everywhere in
  // the northern hemisphere
  it('returns false (daytime) at summer solstice noon UTC for NYC', () => {
    const summerNoon = new Date('2025-06-21T17:00:00Z'); // ~1 pm EDT
    expect(isNighttime(summerNoon, LAT, LON)).toBe(false);
  });

  // 3 AM local in New York in winter – sun is well below the horizon
  it('returns true (nighttime) at 3 AM EST winter for NYC', () => {
    const winterNight = new Date('2025-01-15T08:00:00Z'); // 3 AM EST
    expect(isNighttime(winterNight, LAT, LON)).toBe(true);
  });
});
