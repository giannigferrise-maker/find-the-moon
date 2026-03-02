'use strict';

/**
 * tilt.test.js
 *
 * Tests for betaToElevation() — the pure math function that converts a
 * DeviceOrientationEvent beta angle into an elevation angle above the horizon.
 *
 * Convention (matches observed iPhone behavior):
 *   beta ≈  90 → phone upright   → camera at horizon  → 0° elevation
 *   beta ≈ 180 → phone face-down → camera at sky      → 90° elevation
 *   beta ≈   0 → phone face-up   → camera at ground   → clamped to 0°
 *   elevation = clamp(beta − 90, 0, 90)
 */

const { betaToElevation } = require('../src/moonLogic');

describe('betaToElevation()', () => {

  // ── Key reference points ──────────────────────────────────────────────────

  it('returns 0° when phone is upright (beta = 90) — camera at horizon', () => {
    expect(betaToElevation(90)).toBe(0);
  });

  it('returns 90° when phone is face-down (beta = 180) — camera pointing at sky', () => {
    expect(betaToElevation(180)).toBe(90);
  });

  it('returns 45° when phone is at 45° above upright (beta = 135)', () => {
    expect(betaToElevation(135)).toBe(45);
  });

  it('returns 30° when beta = 120', () => {
    expect(betaToElevation(120)).toBe(30);
  });

  it('returns 60° when beta = 150', () => {
    expect(betaToElevation(150)).toBe(60);
  });

  // ── Clamping — camera below horizon ───────────────────────────────────────

  it('clamps to 0° when phone is slightly above upright (beta = 100) — still near horizon', () => {
    expect(betaToElevation(100)).toBe(10);
  });

  it('clamps to 0° when phone is face-up (beta = 0) — camera pointing at ground', () => {
    expect(betaToElevation(0)).toBe(0);
  });

  it('clamps to 0° for beta below 90 (phone not yet tilted toward sky)', () => {
    expect(betaToElevation(45)).toBe(0);
    expect(betaToElevation(80)).toBe(0);
  });

  it('clamps to 0° for negative beta (phone tilted forward past vertical)', () => {
    expect(betaToElevation(-10)).toBe(0);
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

  it('elevation increases as beta increases (tilting phone toward sky raises elevation)', () => {
    expect(betaToElevation(120)).toBeGreaterThan(betaToElevation(100));
    expect(betaToElevation(150)).toBeGreaterThan(betaToElevation(120));
    expect(betaToElevation(180)).toBeGreaterThan(betaToElevation(150));
  });

});
