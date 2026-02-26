'use strict';

/**
 * compass.test.js
 *
 * Tests for azimuth → compass direction conversion and compass label expansion.
 *
 * SunCalc azimuth convention (radians):
 *   0      = South   →  compass 180° (S)
 *   π/2    = West    →  compass 270° (W)
 *   π / -π = North   →  compass   0° (N)
 *  -π/2    = East    →  compass  90° (E)
 */

const { azimuthToCompass, compassToWords } = require('../src/moonLogic');

// ── azimuthToCompass ─────────────────────────────────────────────────────────

describe('azimuthToCompass()', () => {
  describe('cardinal directions', () => {
    it('converts SunCalc 0 (South) to 180° S', () => {
      const result = azimuthToCompass(0);
      expect(result.deg).toBe(180);
      expect(result.label).toBe('S');
    });

    it('converts SunCalc π (North) to 0° N', () => {
      const result = azimuthToCompass(Math.PI);
      expect(result.deg).toBe(0);
      expect(result.label).toBe('N');
    });

    it('converts SunCalc π/2 (West) to 270° W', () => {
      const result = azimuthToCompass(Math.PI / 2);
      expect(result.deg).toBe(270);
      expect(result.label).toBe('W');
    });

    it('converts SunCalc -π/2 (East) to 90° E', () => {
      const result = azimuthToCompass(-Math.PI / 2);
      expect(result.deg).toBe(90);
      expect(result.label).toBe('E');
    });

    it('converts SunCalc -π (North, negative side) to 0° N', () => {
      const result = azimuthToCompass(-Math.PI);
      expect(result.deg).toBe(0);
      expect(result.label).toBe('N');
    });
  });

  describe('intercardinal directions', () => {
    // SunCalc π/4 = 45° raw → +180 = 225° → SW
    it('converts SunCalc π/4 to 225° SW', () => {
      const result = azimuthToCompass(Math.PI / 4);
      expect(result.deg).toBe(225);
      expect(result.label).toBe('SW');
    });

    // SunCalc -π/4 = -45° raw → +180 = 135° → SE
    it('converts SunCalc -π/4 to 135° SE', () => {
      const result = azimuthToCompass(-Math.PI / 4);
      expect(result.deg).toBe(135);
      expect(result.label).toBe('SE');
    });

    // SunCalc 3π/4 = 135° raw → +180 = 315° → NW
    it('converts SunCalc 3π/4 to 315° NW', () => {
      const result = azimuthToCompass(3 * Math.PI / 4);
      expect(result.deg).toBe(315);
      expect(result.label).toBe('NW');
    });

    // SunCalc -3π/4 = -135° raw → +180 = 45° → NE
    it('converts SunCalc -3π/4 to 45° NE', () => {
      const result = azimuthToCompass(-3 * Math.PI / 4);
      expect(result.deg).toBe(45);
      expect(result.label).toBe('NE');
    });
  });

  describe('output shape and ranges', () => {
    it('always returns an integer degree (Math.round applied)', () => {
      // A slightly off-cardinal value – degree should still be an integer
      const result = azimuthToCompass(1.0);
      expect(Number.isInteger(result.deg)).toBe(true);
    });

    it('always returns a degree in [0, 359]', () => {
      const azimuths = [0, Math.PI / 6, Math.PI / 3, Math.PI / 2,
                        -Math.PI / 6, -Math.PI / 2, -Math.PI, Math.PI];
      azimuths.forEach(az => {
        const { deg } = azimuthToCompass(az);
        expect(deg).toBeGreaterThanOrEqual(0);
        expect(deg).toBeLessThanOrEqual(359);
      });
    });

    it('always returns a label that is one of the 16 compass points', () => {
      const validLabels = ['N','NNE','NE','ENE','E','ESE','SE','SSE',
                           'S','SSW','SW','WSW','W','WNW','NW','NNW'];
      const azimuths = [0, Math.PI / 8, Math.PI / 4, Math.PI / 2,
                        -Math.PI / 4, -Math.PI / 2, Math.PI, -Math.PI];
      azimuths.forEach(az => {
        const { label } = azimuthToCompass(az);
        expect(validLabels).toContain(label);
      });
    });
  });

  describe('wraparound / edge cases', () => {
    it('handles azimuth = 2π (same as 0, South) correctly', () => {
      const result = azimuthToCompass(2 * Math.PI);
      expect(result.deg).toBe(180);
      expect(result.label).toBe('S');
    });

    it('handles azimuth = -2π (same as 0, South) correctly', () => {
      const result = azimuthToCompass(-2 * Math.PI);
      expect(result.deg).toBe(180);
      expect(result.label).toBe('S');
    });
  });
});

// ── compassToWords ───────────────────────────────────────────────────────────

describe('compassToWords()', () => {
  const cases = [
    ['N',   'North'],
    ['NNE', 'North-Northeast'],
    ['NE',  'Northeast'],
    ['ENE', 'East-Northeast'],
    ['E',   'East'],
    ['ESE', 'East-Southeast'],
    ['SE',  'Southeast'],
    ['SSE', 'South-Southeast'],
    ['S',   'South'],
    ['SSW', 'South-Southwest'],
    ['SW',  'Southwest'],
    ['WSW', 'West-Southwest'],
    ['W',   'West'],
    ['WNW', 'West-Northwest'],
    ['NW',  'Northwest'],
    ['NNW', 'North-Northwest'],
  ];

  test.each(cases)('"%s" maps to "%s"', (label, expected) => {
    expect(compassToWords(label)).toBe(expected);
  });

  it('returns the original label for unknown abbreviations', () => {
    expect(compassToWords('XYZ')).toBe('XYZ');
    expect(compassToWords('')).toBe('');
  });
});
