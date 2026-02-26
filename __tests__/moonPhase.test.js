'use strict';

/**
 * moonPhase.test.js
 *
 * Tests for getPhaseName() — maps a SunCalc illumination phase value (0–1)
 * to a human-readable moon phase string.
 *
 * SunCalc phase thresholds used in the app:
 *   < 0.03           → New Moon
 *   0.03 – < 0.22    → Waxing Crescent
 *   0.22 – < 0.28    → First Quarter
 *   0.28 – < 0.47    → Waxing Gibbous
 *   0.47 – < 0.53    → Full Moon
 *   0.53 – < 0.72    → Waning Gibbous
 *   0.72 – < 0.78    → Last Quarter
 *   0.78 – < 0.97    → Waning Crescent
 *   >= 0.97          → New Moon
 */

const { getPhaseName } = require('../src/moonLogic');

// The fraction parameter is not used by getPhaseName's logic, but we pass
// representative values so tests mirror real SunCalc output.

describe('getPhaseName()', () => {

  // ── New Moon ────────────────────────────────────────────────────────────────
  describe('New Moon', () => {
    it('returns "New Moon" for phase = 0.00 (exact new moon)', () => {
      expect(getPhaseName(0.0, 0.00)).toBe('New Moon');
    });

    it('returns "New Moon" for phase = 0.01', () => {
      expect(getPhaseName(0.01, 0.01)).toBe('New Moon');
    });

    it('returns "New Moon" for phase = 0.02 (just below 0.03 threshold)', () => {
      expect(getPhaseName(0.02, 0.02)).toBe('New Moon');
    });

    it('returns "New Moon" for phase = 0.97 (start of new-moon tail)', () => {
      expect(getPhaseName(0.02, 0.97)).toBe('New Moon');
    });

    it('returns "New Moon" for phase = 0.99', () => {
      expect(getPhaseName(0.01, 0.99)).toBe('New Moon');
    });

    it('returns "New Moon" for phase = 1.00', () => {
      expect(getPhaseName(0.0, 1.00)).toBe('New Moon');
    });
  });

  // ── Waxing Crescent ─────────────────────────────────────────────────────────
  describe('Waxing Crescent', () => {
    it('returns "Waxing Crescent" for phase = 0.03 (lower boundary)', () => {
      expect(getPhaseName(0.05, 0.03)).toBe('Waxing Crescent');
    });

    it('returns "Waxing Crescent" for phase = 0.10 (mid crescent)', () => {
      expect(getPhaseName(0.15, 0.10)).toBe('Waxing Crescent');
    });

    it('returns "Waxing Crescent" for phase = 0.18', () => {
      expect(getPhaseName(0.25, 0.18)).toBe('Waxing Crescent');
    });

    it('returns "Waxing Crescent" for phase = 0.219 (just below 0.22)', () => {
      expect(getPhaseName(0.30, 0.219)).toBe('Waxing Crescent');
    });
  });

  // ── First Quarter ───────────────────────────────────────────────────────────
  describe('First Quarter', () => {
    it('returns "First Quarter" for phase = 0.22 (lower boundary)', () => {
      expect(getPhaseName(0.50, 0.22)).toBe('First Quarter');
    });

    it('returns "First Quarter" for phase = 0.25 (classic quarter-moon)', () => {
      expect(getPhaseName(0.50, 0.25)).toBe('First Quarter');
    });

    it('returns "First Quarter" for phase = 0.279 (just below 0.28)', () => {
      expect(getPhaseName(0.50, 0.279)).toBe('First Quarter');
    });
  });

  // ── Waxing Gibbous ──────────────────────────────────────────────────────────
  describe('Waxing Gibbous', () => {
    it('returns "Waxing Gibbous" for phase = 0.28 (lower boundary)', () => {
      expect(getPhaseName(0.75, 0.28)).toBe('Waxing Gibbous');
    });

    it('returns "Waxing Gibbous" for phase = 0.38 (mid gibbous)', () => {
      expect(getPhaseName(0.88, 0.38)).toBe('Waxing Gibbous');
    });

    it('returns "Waxing Gibbous" for phase = 0.469 (just below 0.47)', () => {
      expect(getPhaseName(0.95, 0.469)).toBe('Waxing Gibbous');
    });
  });

  // ── Full Moon ───────────────────────────────────────────────────────────────
  describe('Full Moon', () => {
    it('returns "Full Moon" for phase = 0.47 (lower boundary)', () => {
      expect(getPhaseName(1.0, 0.47)).toBe('Full Moon');
    });

    it('returns "Full Moon" for phase = 0.50 (exact full moon)', () => {
      expect(getPhaseName(1.0, 0.50)).toBe('Full Moon');
    });

    it('returns "Full Moon" for phase = 0.529 (just below 0.53)', () => {
      expect(getPhaseName(1.0, 0.529)).toBe('Full Moon');
    });
  });

  // ── Waning Gibbous ──────────────────────────────────────────────────────────
  describe('Waning Gibbous', () => {
    it('returns "Waning Gibbous" for phase = 0.53 (lower boundary)', () => {
      expect(getPhaseName(0.90, 0.53)).toBe('Waning Gibbous');
    });

    it('returns "Waning Gibbous" for phase = 0.62 (mid waning gibbous)', () => {
      expect(getPhaseName(0.80, 0.62)).toBe('Waning Gibbous');
    });

    it('returns "Waning Gibbous" for phase = 0.719 (just below 0.72)', () => {
      expect(getPhaseName(0.70, 0.719)).toBe('Waning Gibbous');
    });
  });

  // ── Last Quarter ─────────────────────────────────────────────────────────────
  describe('Last Quarter', () => {
    it('returns "Last Quarter" for phase = 0.72 (lower boundary)', () => {
      expect(getPhaseName(0.50, 0.72)).toBe('Last Quarter');
    });

    it('returns "Last Quarter" for phase = 0.75 (classic last quarter)', () => {
      expect(getPhaseName(0.50, 0.75)).toBe('Last Quarter');
    });

    it('returns "Last Quarter" for phase = 0.779 (just below 0.78)', () => {
      expect(getPhaseName(0.50, 0.779)).toBe('Last Quarter');
    });
  });

  // ── Waning Crescent ──────────────────────────────────────────────────────────
  describe('Waning Crescent', () => {
    it('returns "Waning Crescent" for phase = 0.78 (lower boundary)', () => {
      expect(getPhaseName(0.20, 0.78)).toBe('Waning Crescent');
    });

    it('returns "Waning Crescent" for phase = 0.88 (mid crescent)', () => {
      expect(getPhaseName(0.10, 0.88)).toBe('Waning Crescent');
    });

    it('returns "Waning Crescent" for phase = 0.969 (just below 0.97)', () => {
      expect(getPhaseName(0.03, 0.969)).toBe('Waning Crescent');
    });
  });

  // ── Boundary transition sanity checks ────────────────────────────────────────
  describe('phase boundary transitions', () => {
    const transitions = [
      { phase: 0.029, expected: 'New Moon'        },
      { phase: 0.030, expected: 'Waxing Crescent'  },
      { phase: 0.219, expected: 'Waxing Crescent'  },
      { phase: 0.220, expected: 'First Quarter'    },
      { phase: 0.279, expected: 'First Quarter'    },
      { phase: 0.280, expected: 'Waxing Gibbous'   },
      { phase: 0.469, expected: 'Waxing Gibbous'   },
      { phase: 0.470, expected: 'Full Moon'         },
      { phase: 0.529, expected: 'Full Moon'         },
      { phase: 0.530, expected: 'Waning Gibbous'   },
      { phase: 0.719, expected: 'Waning Gibbous'   },
      { phase: 0.720, expected: 'Last Quarter'     },
      { phase: 0.779, expected: 'Last Quarter'     },
      { phase: 0.780, expected: 'Waning Crescent'  },
      { phase: 0.969, expected: 'Waning Crescent'  },
      { phase: 0.970, expected: 'New Moon'         },
    ];

    test.each(transitions)(
      'phase $phase → "$expected"',
      ({ phase, expected }) => {
        expect(getPhaseName(0.5, phase)).toBe(expected);
      }
    );
  });
});
