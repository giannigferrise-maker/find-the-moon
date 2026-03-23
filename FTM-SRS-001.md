# SOFTWARE REQUIREMENTS SPECIFICATION
## Find the Moon — Web Application

| Field | Value |
|---|---|
| **Document ID** | FTM-SRS-001 |
| **Version** | 1.5 |
| **Original Date** | February 20, 2026 |
| **Last Updated** | March 14, 2026 |
| **Standard** | INCOSE Systems Engineering Standard |

---

## 1. Purpose and Scope

This document defines the system requirements for the Find the Moon web application, a browser-based tool that displays the current position of the moon relative to the user's geographic location. The system is intended for general public use including children.

Requirements in this document are written in accordance with INCOSE Systems Engineering standards. Each requirement uses the keyword **shall** to denote a mandatory requirement, **should** to denote a recommendation, and is assigned a unique traceable identifier.

---

## 2. Definitions

| Term | Definition |
|---|---|
| Shall | Mandatory requirement |
| Should | Recommended but not mandatory |
| Azimuth | Horizontal angle of the moon measured clockwise from North (0–360 degrees) |
| Altitude | Vertical angle of the moon above or below the horizon (−90 to +90 degrees) |
| User | Any person accessing the application including minors |
| SunCalc.js | Open source astronomical calculation library (v1.9.0) |

---

## 3. Functional Requirements

### 3.1 Location Detection

| ID | Requirement | Verification |
|---|---|---|
| FTM-FR-001 | The system shall detect the user's geographic location via browser GPS when the user grants permission | Test |
| FTM-FR-002 | The system shall provide a zip code input field as an alternative to GPS location detection | Test |
| FTM-FR-003 | The system shall accept only valid 5-digit US zip codes | Test |
| FTM-FR-004 | The system shall display a descriptive error message when an invalid zip code is entered | Test |
| FTM-FR-005 | The system shall convert a valid zip code to geographic coordinates (latitude/longitude) prior to moon position calculation | Test |

### 3.2 Moon Position

| ID | Requirement | Verification |
|---|---|---|
| FTM-FR-010 | The system shall calculate the moon's azimuth angle for the user's location and current date/time | Test |
| FTM-FR-011 | The system shall calculate the moon's altitude angle above or below the horizon for the user's location and current date/time | Test |
| FTM-FR-012 | The system shall display the moon's compass direction to the nearest one of 16 compass points (N, NNE, NE, ENE, E, ESE, SE, SSE, S, SSW, SW, WSW, W, WNW, NW, NNW) | Test |
| FTM-FR-013 | The system shall indicate whether the moon is currently above or below the horizon | Test |
| FTM-FR-014 | The system shall display the moon's next rise time when the moon is below the horizon | Test |
| FTM-FR-015 | The system shall display the moon's next set time when the moon is above the horizon | Test |
| FTM-FR-016 | The system shall automatically refresh moon position data every 60 seconds without requiring user interaction | Test |

### 3.3 Moon Phase

| ID | Requirement | Verification |
|---|---|---|
| FTM-FR-020 | The system shall calculate and display the current moon phase | Test |
| FTM-FR-021 | The system shall classify the moon phase as one of eight named phases: New Moon, Waxing Crescent, First Quarter, Waxing Gibbous, Full Moon, Waning Gibbous, Last Quarter, Waning Crescent | Test |
| FTM-FR-022 | The system shall display a graphical representation of the current moon phase | Test |
| FTM-FR-023 | The system shall display the current illumination percentage of the moon | Test |

### 3.4 Visual Theme

| ID | Requirement | Verification |
|---|---|---|
| FTM-FR-030 | The system shall automatically apply a nighttime visual theme when the sun is more than 6 degrees below the horizon at the user's location | Test |
| FTM-FR-031 | The system shall automatically apply a daytime visual theme when the sun is at or above 6 degrees below the horizon at the user's location | Test |
| FTM-FR-032 | The system shall display an animated star field background when the nighttime theme is active | Test |
| FTM-FR-033 | The system shall display animated clouds when the daytime theme is active | Test |

### 3.5 Mobile Compass

| ID | Requirement | Verification |
|---|---|---|
| FTM-FR-040 | The system shall detect when the user is accessing the application from a mobile device with a compass sensor | Test |
| FTM-FR-041 | The system shall display a live compass option on devices with compass sensor capability | Test |
| FTM-FR-042 | The system shall request device orientation permission on iOS 13 and later before activating the live compass | Test |
| FTM-FR-043 | The system shall display the moon's position relative to the user's current facing direction when the live compass is active | Test |

---

## 4. Performance Requirements

| ID | Requirement | Verification |
|---|---|---|
| FTM-PR-001 | The system shall display moon position data within 3 seconds of the user providing a valid location on a standard broadband connection | Test |
| FTM-PR-002 | The moon position calculation shall be accurate to within 5 degrees of azimuth | Analysis |
| FTM-PR-003 | The moon altitude calculation shall be accurate to within 5 degrees | Analysis |
| FTM-PR-004 | The system shall complete the automatic 60-second refresh within 1 second of the refresh interval | Test |

---

## 5. Interface Requirements

| ID | Requirement | Verification |
|---|---|---|
| FTM-IR-001 | The system shall function correctly on Google Chrome version 90 and later | Test |
| FTM-IR-002 | The system shall function correctly on Microsoft Edge version 90 and later | Test |
| FTM-IR-003 | The system shall function correctly on Apple Safari version 14 and later | Test |
| FTM-IR-004 | The system shall be responsive and usable on mobile screen sizes as small as 375px wide | Test |
| FTM-IR-005 | The system shall use the SunCalc.js open source library (v1.9.0) for all astronomical calculations | Inspection |
| FTM-IR-006 | The system shall use the zippopotam.us API for zip code to coordinate conversion | Inspection |

---

## 6. Reliability Requirements

| ID | Requirement | Verification |
|---|---|---|
| FTM-RR-001 | The system shall maintain 99.5% availability on a monthly basis | Analysis |
| FTM-RR-002 | The system shall display a descriptive error message when GPS location detection fails | Test |
| FTM-RR-003 | The system shall display a descriptive error message when zip code lookup fails | Test |
| FTM-RR-004 | The system shall not crash or produce an unhandled error when the user denies GPS permission | Test |

---

## 7. Privacy and Child Safety Requirements

| ID | Requirement | Verification |
|---|---|---|
| FTM-PS-001 | The system shall not store, log, or transmit user location data to any server | Inspection |
| FTM-PS-002 | The system shall not collect any personally identifiable information (PII) from users | Inspection |
| FTM-PS-003 | The system shall not display any advertising content | Inspection |
| FTM-PS-004 | The system shall not require user account creation or login | Inspection |
| FTM-PS-005 | All location data shall be processed locally within the user's browser only | Inspection |
| FTM-PS-006 | The system shall comply with the Children's Online Privacy Protection Act (COPPA) by collecting no personal data from any user | Inspection |

---

## 8. Usability Requirements

| ID | Requirement | Verification |
|---|---|---|
| FTM-UR-001 | The system shall be operable by a child aged 8 or older without adult assistance | Test |
| FTM-UR-002 | The system shall display all directional information in plain English (e.g. "Look Southeast") in addition to numeric degrees | Test |
| FTM-UR-003 | The primary moon finding function shall be accessible within one user interaction from the home screen | Test |

---

## 9. Amendment A — Tilt Guide Requirements
*Added: March 2, 2026*

| ID | Requirement | Verification |
|---|---|---|
| FTM-TG-001 | The system shall display a tilt guide button on mobile devices after the user's location has been set | Test |
| FTM-TG-002 | The system shall display a tilt elevation indicator on the altitude arc regardless of whether the moon is above or below the horizon | Test |
| FTM-TG-003 | The tilt guide shall provide directional feedback text reflecting the accuracy of the user's current device tilt relative to the moon's altitude | Test |
| FTM-TG-004 | The system shall display a "Moon is below the horizon" message in the tilt feedback area when the moon altitude is at or below 0 degrees | Test |

---

## 10. Requirements Summary

| Category | Description | Count | Primary Method |
|---|---|---|---|
| FTM-FR | Functional Requirements | 23 | Test |
| FTM-PR | Performance Requirements | 4 | Test / Analysis |
| FTM-IR | Interface Requirements | 6 | Test / Inspection |
| FTM-RR | Reliability Requirements | 4 | Test / Analysis |
| FTM-PS | Privacy & Child Safety Requirements | 6 | Inspection |
| FTM-UR | Usability Requirements | 3 | Test |
| FTM-TG | Tilt Guide Requirements (Amendment A) | 4 | Test |
| **TOTAL** | | **50** | |

---

> **Note on version history:**
> v1.0 (Feb 20, 2026) — Original release, 46 requirements
> v1.1 (Mar 7, 2026) — Added Amendment A (FTM-TG-001 through FTM-TG-004); converted to Markdown from FTM-SRS-001.docx


## 11. Amendment B — Supply Chain Security Requirements
*Added: 2026-03-07*

| ID | Requirement | Verification |
|---|---|---|
| FTM-SC-001 | The system shall include a Subresource Integrity (SRI) `integrity` attribute on every externally hosted `<script>` element in index.html | Inspection |
| FTM-SC-002 | The SRI hash used in the `integrity` attribute shall be a SHA-384 or SHA-512 digest of the exact file served by the CDN, encoded in base64 | Inspection |
| FTM-SC-003 | Every externally hosted `<script>` element that carries an `integrity` attribute shall also carry `crossorigin="anonymous"` | Inspection |
| FTM-SC-004 | The system shall continue to load and execute the SunCalc.js library (v1.9.0) correctly after the SRI attributes are applied | Test |

> **Note on version history:**
> v1.2 (Mar 7, 2026) — Added Amendment B (FTM-SC-001 through FTM-SC-004); total requirements now 54


## 12. Amendment C — Visual Theme Update Requirements
*Added: 2026-03-14*

| ID | Requirement | Verification |
|---|---|---|
| FTM-VT-001 | The system shall draw constellation art over the nighttime star field background, consisting of exactly three constellations: Orion, Cassiopeia, and the Big Dipper | Test |
| FTM-VT-002 | The system shall render each constellation using thin line segments connecting defined star positions and small dot markers at each star position | Test |
| FTM-VT-003 | The constellation lines and dot markers shall be rendered at an opacity between 0.4 and 0.5 inclusive | Test |
| FTM-VT-004 | The constellation lines and dot markers shall be rendered in white or light blue only | Inspection |
| FTM-VT-005 | The constellation artwork shall be static and shall not be animated | Test |
| FTM-VT-006 | The system shall display a text label identifying each constellation by name, positioned near its corresponding pattern | Test |
| FTM-VT-007 | The constellation artwork and labels shall not obscure or overpower the existing animated star field | Inspection |
| FTM-VT-008 | The system shall render daytime animated clouds using the fill color #c9b8e8 (lavender) | Test |
| FTM-VT-009 | The cloud shape and animation behavior shall remain unchanged from the pre-amendment daytime theme; only the fill color shall change | Test |

> **Note on version history:**
> v1.3 (Mar 14, 2026) — Added Amendment C (FTM-VT-001 through FTM-VT-009): constellation artwork over nighttime star field; initial daytime cloud color set to lavender (#c9b8e8)
> v1.4 (Mar 14, 2026) — Amendment D: updated FTM-VT-008 cloud fill color from lavender (#c9b8e8) to soft sage green (#a8d5a2). No other changes.
> v1.5 (Mar 23, 2026) — Amendment E: reverted FTM-VT-008 cloud fill color from soft sage green (#a8d5a2) back to lavender (#c9b8e8) per Issue #49. No other changes.
