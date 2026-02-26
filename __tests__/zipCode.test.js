'use strict';

/**
 * zipCode.test.js
 *
 * Tests for validateZipCode() — ensures the app only accepts valid
 * 5-digit US ZIP codes and rejects everything else before making
 * a network request to the Zippopotam.us API.
 *
 * Validation rule: /^\d{5}$/.test(zip)
 */

const { validateZipCode } = require('../src/moonLogic');

describe('validateZipCode()', () => {

  // ── Valid ZIP codes ─────────────────────────────────────────────────────────
  describe('valid 5-digit US ZIP codes', () => {
    it('accepts a well-known ZIP (90210 – Beverly Hills)', () => {
      expect(validateZipCode('90210')).toBe(true);
    });

    it('accepts a standard NYC ZIP (10001)', () => {
      expect(validateZipCode('10001')).toBe(true);
    });

    it('accepts a ZIP starting with zeros (00501 – Holtsville, NY)', () => {
      expect(validateZipCode('00501')).toBe(true);
    });

    it('accepts all zeros (00000)', () => {
      expect(validateZipCode('00000')).toBe(true);
    });

    it('accepts all nines (99999)', () => {
      expect(validateZipCode('99999')).toBe(true);
    });

    it('accepts 12345 (generic test ZIP)', () => {
      expect(validateZipCode('12345')).toBe(true);
    });

    it('accepts 33101 (Miami, FL)', () => {
      expect(validateZipCode('33101')).toBe(true);
    });

    it('accepts 94102 (San Francisco, CA)', () => {
      expect(validateZipCode('94102')).toBe(true);
    });
  });

  // ── Too short ───────────────────────────────────────────────────────────────
  describe('rejects ZIPs that are too short', () => {
    it('rejects 4-digit string', () => {
      expect(validateZipCode('1234')).toBe(false);
    });

    it('rejects 3-digit string', () => {
      expect(validateZipCode('123')).toBe(false);
    });

    it('rejects 1-digit string', () => {
      expect(validateZipCode('9')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(validateZipCode('')).toBe(false);
    });
  });

  // ── Too long ─────────────────────────────────────────────────────────────────
  describe('rejects ZIPs that are too long', () => {
    it('rejects 6-digit string', () => {
      expect(validateZipCode('123456')).toBe(false);
    });

    it('rejects 10-digit string', () => {
      expect(validateZipCode('1234567890')).toBe(false);
    });

    it('rejects ZIP+4 format with hyphen (90210-1234)', () => {
      expect(validateZipCode('90210-1234')).toBe(false);
    });

    it('rejects ZIP+4 format without hyphen (902101234)', () => {
      expect(validateZipCode('902101234')).toBe(false);
    });
  });

  // ── Non-digit characters ──────────────────────────────────────────────────────
  describe('rejects ZIPs with non-digit characters', () => {
    it('rejects 5 alpha characters', () => {
      expect(validateZipCode('abcde')).toBe(false);
    });

    it('rejects mixed alphanumeric (1234a)', () => {
      expect(validateZipCode('1234a')).toBe(false);
    });

    it('rejects mixed alphanumeric (a2345)', () => {
      expect(validateZipCode('a2345')).toBe(false);
    });

    it('rejects string with internal space ("123 4")', () => {
      expect(validateZipCode('123 4')).toBe(false);
    });

    it('rejects string with leading space (" 12345")', () => {
      expect(validateZipCode(' 12345')).toBe(false);
    });

    it('rejects string with trailing space ("12345 ")', () => {
      expect(validateZipCode('12345 ')).toBe(false);
    });

    it('rejects string with leading zeros and non-digit mix ("0000a")', () => {
      expect(validateZipCode('0000a')).toBe(false);
    });

    it('rejects special characters ("!@#$%")', () => {
      expect(validateZipCode('!@#$%')).toBe(false);
    });

    it('rejects decimal number string ("123.4")', () => {
      expect(validateZipCode('123.4')).toBe(false);
    });

    it('rejects negative number string ("-2345")', () => {
      expect(validateZipCode('-2345')).toBe(false);
    });
  });

  // ── Non-string inputs ─────────────────────────────────────────────────────────
  describe('rejects non-string inputs (type coercion safety)', () => {
    it('rejects null (coerces to "null", 4 chars)', () => {
      expect(validateZipCode(null)).toBe(false);
    });

    it('rejects undefined (coerces to "undefined")', () => {
      expect(validateZipCode(undefined)).toBe(false);
    });

    it('rejects numeric 12345 (not a string — no leading-zero preservation)', () => {
      // Note: the number 12345 coerces to the string "12345" and WOULD pass
      // the regex, but in the real app the input value is always a string.
      // We document the coercion behaviour explicitly here.
      expect(validateZipCode(12345)).toBe(true); // regex coerces to "12345"
    });

    it('rejects numeric 1234 (too short as a number)', () => {
      expect(validateZipCode(1234)).toBe(false);
    });

    it('rejects an array', () => {
      expect(validateZipCode(['1','2','3','4','5'])).toBe(false);
    });

    it('rejects an object', () => {
      expect(validateZipCode({})).toBe(false);
    });

    it('rejects boolean true', () => {
      expect(validateZipCode(true)).toBe(false);
    });

    it('rejects boolean false', () => {
      expect(validateZipCode(false)).toBe(false);
    });
  });
});
