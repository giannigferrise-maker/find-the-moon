'use strict';

/**
 * tilt.test.js
 *
 * Tests for betaToElevation() — the pure math function that converts a
 * DeviceOrientationEvent beta angle into an elevation angle above the horizon.
 *
 * Convention:
 *   beta ≈ 90 → phone upright  → looking at horizon  → 0° elevation
 *   beta ≈  0 → phone face-up  → looking straight up → 90° elevation
 *   elevation = clamp(90 − beta, 0, 90)
 */

const { betaToElevation } = require('../src/moonLogic');

describe('betaToElevation()', () => {

  // ── Key reference points ──────────────────────────────────────────────────

  it('returns 0° when phone is upright (beta = 90) — looking at horizon', () => {
    expect(betaToElevation(90)).toBe(0);
  });

  it('returns 90° when phone is flat face-up (beta = 0) — looking straight up', () => {
    expect(betaToElevation(0)).toBe(90);
  });

  it('returns 45° when phone is at 45° (beta = 45)', () => {
    expect(betaToElevation(45)).toBe(45);
  });

  it('returns 30° when beta = 60', () => {
    expect(betaToElevation(60)).toBe(30);
  });

  it('returns 60° when beta = 30', () => {
    expect(betaToElevation(30)).toBe(60);
  });

  // ── Clamping — below horizon ───────────────────────────────────────────────

  it('clamps to 0° when phone is past vertical (beta = 100) — pointing downward', () => {
    expect(betaToElevation(100)).toBe(0);
  });

  it('clamps to 0° for large beta values (beta = 180)', () => {
    expect(betaToElevation(180)).toBe(0);
  });

  it('clamps to 0° for negative beta (phone tilted forward past vertical)', () => {
    expect(betaToElevation(-10)).toBe(90); // 90 - (-10) = 100, clamped to 90
  });

  // ── Clamping — above zenith ───────────────────────────────────────────────

  it('clamps to 90° for very negative beta values', () => {
    expect(betaToElevation(-45)).toBe(90);
  });

  // ── Output range ─────────────────────────────────────────────────────────

  it('always returns a value between 0 and 90 inclusive', () => {
    [-180, -90, -45, 0, 45, 90, 135, 180].forEach(beta => {
      const result = betaToElevation(beta);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(90);
    });
  });

  // ── Monotonicity ──────────────────────────────────────────────────────────

  it('elevation decreases as beta increases (tilting phone down lowers elevation)', () => {
    expect(betaToElevation(0)).toBeGreaterThan(betaToElevation(30));
    expect(betaToElevation(30)).toBeGreaterThan(betaToElevation(60));
    expect(betaToElevation(60)).toBeGreaterThan(betaToElevation(89));
  });

});
