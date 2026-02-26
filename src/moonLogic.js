/**
 * moonLogic.js
 *
 * Pure logic functions extracted from index.html for unit testing.
 * DOM-dependent rendering (drawStars, renderClouds, applyTheme, drawAltArc)
 * is intentionally excluded — only the data/calculation layer lives here.
 */

const SunCalc = require('suncalc');

/* ================================================================
   ANGLE UTILITIES
================================================================ */
function radToDeg(r) {
  return r * (180 / Math.PI);
}

function degToRad(d) {
  return d * (Math.PI / 180);
}

/* ================================================================
   COMPASS CONVERSION
================================================================ */

/**
 * Convert a SunCalc azimuth (radians, 0=South clockwise) to a
 * standard compass bearing (degrees, 0=North clockwise) and label.
 *
 * SunCalc azimuth convention:
 *   0      = South
 *   π/2    = West
 *   π / -π = North
 *  -π/2    = East
 *
 * @param {number} az – azimuth in radians (SunCalc convention)
 * @returns {{ deg: number, label: string }}
 */
function azimuthToCompass(az) {
  let deg = radToDeg(az) + 180;
  deg = ((deg % 360) + 360) % 360;
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const idx = Math.round(deg / 22.5) % 16;
  return { deg: Math.round(deg), label: dirs[idx] };
}

/**
 * Expand a compass abbreviation to its full English name.
 * Returns the original label unchanged for unknown values.
 *
 * @param {string} label – e.g. 'NNE'
 * @returns {string}     – e.g. 'North-Northeast'
 */
function compassToWords(label) {
  const map = {
    'N':   'North',
    'NNE': 'North-Northeast',
    'NE':  'Northeast',
    'ENE': 'East-Northeast',
    'E':   'East',
    'ESE': 'East-Southeast',
    'SE':  'Southeast',
    'SSE': 'South-Southeast',
    'S':   'South',
    'SSW': 'South-Southwest',
    'SW':  'Southwest',
    'WSW': 'West-Southwest',
    'W':   'West',
    'WNW': 'West-Northwest',
    'NW':  'Northwest',
    'NNW': 'North-Northwest',
  };
  return map[label] || label;
}

/* ================================================================
   MOON PHASE
================================================================ */

/**
 * Return the human-readable phase name from a SunCalc illumination phase value.
 *
 * SunCalc phase is a value 0–1 where:
 *   0 / 1 = New Moon
 *   0.25  = First Quarter
 *   0.5   = Full Moon
 *   0.75  = Last Quarter
 *
 * @param {number} fraction – illumination fraction 0–1 (unused in name lookup, kept for API symmetry)
 * @param {number} angle    – SunCalc phase value 0–1
 * @returns {string}
 */
function getPhaseName(fraction, angle) {
  const phase = angle;
  if (phase < 0.03 || phase > 0.97) return 'New Moon';
  if (phase < 0.22) return 'Waxing Crescent';
  if (phase < 0.28) return 'First Quarter';
  if (phase < 0.47) return 'Waxing Gibbous';
  if (phase < 0.53) return 'Full Moon';
  if (phase < 0.72) return 'Waning Gibbous';
  if (phase < 0.78) return 'Last Quarter';
  if (phase < 0.97) return 'Waning Crescent';
  return 'New Moon';
}

/* ================================================================
   SUN / THEME LOGIC
================================================================ */

/**
 * Return true when it is astronomically night at the given position.
 * "Night" is defined as sun altitude below −6° (astronomical dusk/dawn).
 *
 * @param {Date}   date
 * @param {number} lat – latitude in decimal degrees
 * @param {number} lon – longitude in decimal degrees
 * @returns {boolean}
 */
function isNighttime(date, lat, lon) {
  const sun = SunCalc.getPosition(date, lat, lon);
  return radToDeg(sun.altitude) < -6;
}

/**
 * Return the theme name ('night' | 'day') for the given time and location.
 * This is the pure-data equivalent of applyTheme() without any DOM side-effects.
 *
 * @param {Date}   date
 * @param {number} lat
 * @param {number} lon
 * @returns {'night'|'day'}
 */
function getTheme(date, lat, lon) {
  return isNighttime(date, lat, lon) ? 'night' : 'day';
}

/* ================================================================
   MOON CALCULATION
================================================================ */

/**
 * Calculate the current moon position and illumination for a given
 * latitude/longitude (and optional date for testing).
 *
 * @param {number} lat
 * @param {number} lon
 * @param {Date}   [date] – defaults to now; pass a specific Date for testing
 * @returns {{
 *   altDeg:   number,
 *   az:       { deg: number, label: string },
 *   isAbove:  boolean,
 *   illum:    { fraction: number, phase: number, angle: number },
 *   riseTime: Date|null,
 *   setTime:  Date|null,
 *   nextRise: Date|null,
 *   now:      Date
 * }}
 */
function calcMoon(lat, lon, date) {
  const now = date || new Date();
  const pos   = SunCalc.getMoonPosition(now, lat, lon);
  const illum = SunCalc.getMoonIllumination(now);
  const times = SunCalc.getMoonTimes(now, lat, lon);

  const altDeg = radToDeg(pos.altitude);
  const az     = azimuthToCompass(pos.azimuth);
  const isAbove = altDeg > 0;

  let riseTime = times.rise || null;
  let setTime  = times.set  || null;

  // If moon already rose and set today, look up tomorrow's rise time
  let nextRise = riseTime;
  if (!nextRise || nextRise < now) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowTimes = SunCalc.getMoonTimes(tomorrow, lat, lon);
    if (tomorrowTimes.rise) nextRise = tomorrowTimes.rise;
  }

  return { altDeg, az, isAbove, illum, riseTime, setTime, nextRise, now };
}

/* ================================================================
   ZIP CODE VALIDATION
================================================================ */

/**
 * Return true when zip is a valid 5-digit US zip code string.
 * Rejects anything with non-digit characters, wrong length, or whitespace.
 *
 * @param {string} zip
 * @returns {boolean}
 */
function validateZipCode(zip) {
  return /^\d{5}$/.test(zip);
}

/* ================================================================
   EXPORTS
================================================================ */
module.exports = {
  radToDeg,
  degToRad,
  azimuthToCompass,
  compassToWords,
  getPhaseName,
  isNighttime,
  getTheme,
  calcMoon,
  validateZipCode,
};
