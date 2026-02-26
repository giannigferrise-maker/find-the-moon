# 🌙 Find the Moon
## Project Design Document

*A single-page web application that tells you exactly where to look in the sky to find the moon — right now.*

**Version 1.0 · Single-File Web App**

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Features](#2-features)
3. [How It Works](#3-how-it-works)
4. [Libraries & Dependencies](#4-libraries--dependencies)
5. [File Structure](#5-file-structure)
6. [Future Enhancement Ideas](#6-future-enhancement-ideas)

---

## 1. Project Overview

Find the Moon is a simple, beautiful web application that answers one magical question: **"Where is the moon right now?"** In just a few seconds, the app figures out your location, does the astronomical math behind the scenes, and shows you exactly which direction to look and how high up in the sky the moon will be. No telescopes, no star charts, no complicated apps — just open it in your browser and go outside.

The app was designed to feel wonder-inspiring, especially for children. Its visual style automatically shifts between a glittering night sky (when it's dark outside) and a soft daytime sky (when the sun is up), making every visit feel immersive and alive.

### Who Is It For?

| Audience | Why They'll Love It |
|---|---|
| **Families and children** | A fun way to go moon-hunting together on a clear evening |
| **Casual stargazers** | Quick answer for anyone curious about the moon's location without learning astronomy |
| **Educators** | A great classroom or homework tool for discussing moon phases, the solar system, and navigation |
| **Photographers** | Quickly scout the moon's position before a shoot |
| **Anyone with curiosity** | Because the night sky is endlessly fascinating |

### Platform & Accessibility

Find the Moon runs entirely in any modern web browser — Chrome, Safari, Firefox, Edge — on phones, tablets, and desktop computers alike. No app store download is needed. No account, no subscription, no tracking. Because it is a single self-contained HTML file, it can even work offline once downloaded.

---

## 2. Features

### 2.1 Location Detection (GPS)

When you first open the app, it offers to detect your location automatically using your device's built-in GPS. You simply tap **"Use My Location"** and — if you grant permission — the app instantly knows where you are in the world. No typing required. This works on phones, tablets, and most laptops that have a location sensor.

> 💡 **Privacy note:** Your location data never leaves your device. The app calculates everything locally in your browser — it is never sent to any server or stored anywhere.

### 2.2 Zip Code Lookup

If you prefer not to share your GPS location, or if you want to check the moon from a different city, you can simply type any US zip code into the search box. The app looks up the geographic coordinates for that zip code and uses them for the moon calculations. This is great for planning ahead — for example, checking tonight's moon position for a camping trip destination.

### 2.3 Moon Direction Compass

The heart of the app is the moon direction compass. It shows a beautiful circular compass with a moon icon needle pointing in the exact direction you need to look. Below it, the app spells out the direction in plain English — for example, **"Look Southeast"** — along with the precise compass bearing in degrees. You don't need to know anything about degrees; the plain-language direction is all you need.

### 2.4 Live Compass (Mobile Devices)

On smartphones and tablets that have a built-in compass sensor (magnetometer), the app offers an interactive live compass experience. When enabled, a real compass rose appears that rotates in real time as you physically move your phone. A small moon icon sits on the compass ring at the moon's exact position. A fixed purple arrow at the top of the compass represents "the direction you are currently pointing your phone." Simply rotate your body until the moon icon lines up with that arrow — **and you're facing the moon!**

- **iOS devices** — The app requests motion sensor permission, as required by Apple's privacy guidelines.
- **Android devices** — Activates automatically when you tap the button — no extra permission step needed.

### 2.5 Moon Altitude Display

Knowing which direction to look is only half the story — you also need to know how far up to tilt your head. The app shows the moon's current altitude (height above the horizon) as a number in degrees. It also draws a semicircular arc — like a protractor laid on its flat side — with a glowing moon dot showing exactly how high up the moon currently sits in the sky arc from horizon to directly overhead.

| Altitude | What It Means |
|---|---|
| **0°** | The moon is right at the horizon (just rising or setting) |
| **45°** | The moon is halfway up the sky |
| **90°** | The moon is directly overhead |

### 2.6 Moon Phase Display

The app shows the current moon phase with a hand-drawn graphical representation of the moon's illuminated shape — from a thin crescent sliver all the way to a glowing full moon. The phase name is shown in plain English along with the percentage of the moon's face that is currently lit up by the sun.

| Term | Meaning |
|---|---|
| **Waxing** | The moon is growing — more of it becomes lit each night |
| **Waning** | The moon is shrinking — less of it is lit each night |
| **Crescent** | A thin sliver is visible |
| **Quarter** | Half of the moon's face is lit |
| **Gibbous** | More than half is lit, but not yet full |

### 2.7 Visibility Status

The app clearly tells you whether the moon is currently above the horizon (visible) or below it (not yet visible). If the moon is visible, it shows when it will set. If the moon is below the horizon, it tells you exactly what time the moon will rise so you know when to head outside.

- 🟢 **Visible Now** — shown with the time the moon will set
- 🔴 **Below Horizon** — shown with the time the moon will next rise

### 2.8 Automatic Day / Night Theme

The app automatically detects whether it is currently daytime or nighttime at your location and switches its visual appearance accordingly.

- 🌙 **Night theme** — A rich, deep navy sky filled with hundreds of softly twinkling stars, rendered as tiny points of light across the background.
- ☀️ **Day theme** — A bright blue sky gradient with gently drifting white clouds that drift slowly across the screen.

The theme is determined by whether the sun is currently above or below the horizon at your location — not just by the clock — so it is accurate even near sunrise and sunset.

### 2.9 Auto-Refresh

The moon moves continuously across the sky. To keep the information accurate without you needing to do anything, the app automatically recalculates and updates all of the moon's data **every 60 seconds** in the background.

---

## 3. How It Works

### 3.1 Getting Your Location

The app needs to know two things about your location: your **latitude** (how far north or south you are) and your **longitude** (how far east or west you are). It gets these in one of two ways:

1. **GPS** — Your browser asks your device's location sensor for your current coordinates. This is instant and very precise.
2. **Zip Code** — You type in a US zip code, and the app contacts a free public service called Zippopotam.us to look up the latitude and longitude of that zip code's town centre. This takes about one second.

### 3.2 How the Moon's Position Is Calculated

Once the app knows where you are on Earth, it uses a well-tested astronomy library called **SunCalc.js** to figure out exactly where the moon is in the sky. Here is what happens, in plain English:

1. The app notes the exact current date and time down to the second.
2. It passes your location and the current time to SunCalc.js.
3. SunCalc.js uses established astronomical formulas to calculate the moon's position relative to your specific spot on Earth. These are the same kinds of formulas used by observatories.
4. The result is the moon's **azimuth** (the compass direction, measured in degrees clockwise from North) and its **altitude** (how high above the horizon it is, in degrees).
5. These two numbers are turned into the visual compass needle, the altitude arc, and the plain-English direction text.

> 💡 **What are azimuth and altitude?** Azimuth and altitude are the two coordinates of the "horizontal coordinate system" — the simplest way to describe where something is in the sky as seen from a specific point on Earth. Think of azimuth as the direction on a compass, and altitude as the angle you tilt your head up.

### 3.3 Moon Phase Calculation

SunCalc.js also calculates the moon's illumination — what fraction of the moon's face is currently lit up by the sun. This is determined by the angle between the Earth, the Moon, and the Sun at any given moment. From this angle, the app determines:

- **The illumination fraction** — 0% = new moon (dark), 100% = full moon (completely lit).
- **Whether the moon is waxing or waning** — based on which half of the lunar cycle we're in.
- **The phase name** — such as "Waxing Crescent" or "Waning Gibbous."

The graphical moon shape is then drawn as an SVG (a scalable graphic) directly in the browser, using the mathematical shape of the illuminated crescent or gibbous.

### 3.4 Rise and Set Times

SunCalc.js also calculates what time the moon rises and sets for your location on any given day. If the moon is currently below the horizon, the app finds the next scheduled rise time — including checking the following day if necessary — and displays it.

### 3.5 The Live Compass

On mobile devices, the compass works by reading the phone's built-in orientation sensor (called a magnetometer or compass sensor). The browser provides this data through a standard feature called the **DeviceOrientation API**:

- **iPhone / iPad (iOS)** — Reports compass heading directly in degrees from North via a property called `webkitCompassHeading`.
- **Android phones** — Reports orientation data through the `deviceorientationabsolute` event, which the app converts to a compass heading.

The app reads the compass heading many times per second and redraws the compass rose accordingly, so it moves smoothly in real time as you rotate your phone. The moon icon on the compass ring stays fixed at the moon's true azimuth, while the compass rose rotates beneath it — exactly like a real physical compass.

### 3.6 Zip Code to Coordinates

When a zip code is entered, the app makes a simple request to the free **Zippopotam.us API** — a public database of US (and international) postal codes with their geographic coordinates. The response comes back in about half a second and includes the town name, state, latitude, and longitude. No API key is required, and the service is completely free.

---

## 4. Libraries & Dependencies

Find the Moon is intentionally lightweight. It uses only one external JavaScript library and one external web API, both of which are completely free and require no account or API key to use.

| Name | Type | What It Does | Cost / License |
|---|---|---|---|
| **SunCalc.js** | JavaScript Library | Calculates the position of the moon (and sun) for any location and time. Provides azimuth, altitude, illumination fraction, phase angle, and rise/set times. | Free & Open Source (BSD-2-Clause) |
| **Zippopotam.us API** | Web API | Converts a US zip code into geographic coordinates (latitude & longitude) plus a human-readable city and state name. | Free, no key needed — public service |
| **Browser APIs (built-in)** | Browser Feature | Geolocation API (GPS), DeviceOrientation API (live compass sensor), Canvas 2D API (drawing graphics), and RequestAnimationFrame (smooth animation). All built into every modern browser — nothing to install. | Free — part of web standards |

> 💡 Because SunCalc.js is loaded from a public content-delivery network (CDN), the app requires an internet connection to load for the first time. Once loaded, all moon calculations happen entirely in the browser with no further network requests (except for zip code lookups).

---

## 5. File Structure

One of the design goals for Find the Moon was radical simplicity. The entire application is a **single file**. There is no build process, no package manager, no server required.

```
find-the-moon/
├── index.html                  # The entire application (~40 KB)
├── find-the-moon-design.docx   # This design document (Word format)
└── find-the-moon-design.md     # This design document (Markdown format)
```

### Inside `index.html`

The single HTML file is organised into three clear sections:

| Section | What It Does | Approx. Lines |
|---|---|---|
| **HTML** | Defines the layout — header, location inputs, compass card, phase display, altitude arc, visibility card, live compass | ~80 lines |
| **CSS** | All visual design: colours, fonts, card layouts, animations (stars, clouds, needle), day/night themes, mobile-responsive layout | ~380 lines |
| **JavaScript** | All logic: GPS, zip lookup, SunCalc calls, compass animation, altitude arc drawing, moon SVG rendering, live compass, theme switching, auto-refresh | ~350 lines |

---

## 6. Future Enhancement Ideas

The current version of Find the Moon is intentionally focused and simple. Here are some directions the project could grow in the future:

### Astronomy & Sky Features

- **Interactive star map** — Show the major constellations around the moon's current position, with names and mythology — turning the app into a light star-chart companion.
- **Planet finder** — Extend the same direction/altitude display to the visible planets (Venus, Mars, Jupiter, Saturn) so users can find all the bright objects at once.
- **Sun position** — Add a "Find the Sun" mode using the same SunCalc.js library, useful for photographers and solar panel owners.
- **Lunar calendar** — A small monthly calendar showing upcoming full moon, new moon, and eclipse dates.
- **Augmented reality mode** — Use the phone's camera feed as a background and overlay the compass and moon indicator on top of the real world, like a simple AR sky guide.

### Location & Personalization

- **International postal codes** — The Zippopotam.us API supports many countries. Extending the input to accept UK postcodes, Canadian postal codes, etc. would make the app globally useful.
- **Search by city name** — Let users type "Paris" or "Tokyo" instead of a zip code, using a geocoding API.
- **Saved locations** — Remember favourite locations (home, cabin, grandparents' house) in the browser's local storage so users can switch between them quickly.

### Social & Sharing

- **Share the moon** — A "Share" button that generates a link or an image card showing the current moon phase and direction, ready to post on social media.
- **Tonight's moon alert** — A browser notification (if the user opts in) that pings when the moon rises or when it reaches its highest point in the sky tonight.
- **Moonrise / moonset countdown** — A live countdown timer to the next moonrise or moonset event.

### Design & Experience

- **Animated moon phase transitions** — Smoothly animate the SVG moon shape as the phase changes over time, making it feel like a living astronomical illustration.
- **Sound design** — Optional gentle ambient sounds — a light breeze, soft night crickets, or a quiet musical note when the moon is found — to add to the magical feeling.
- **Kid mode** — A special extra-simplified view with larger text, a talking guide character, and fun moon facts for younger children.
- **Dark-sky quality indicator** — Use the user's location to fetch local light-pollution data and tell them how good their stargazing conditions are tonight.
- **Offline / PWA support** — Package the app as a Progressive Web App so it can be added to the home screen and work without an internet connection using cached data.

### Technical Improvements

- **Atmospheric refraction correction** — The moon appears slightly higher in the sky near the horizon due to how the atmosphere bends light. Adding this correction would make the altitude reading even more accurate.
- **Compass calibration hint** — On Android, compass accuracy varies. Adding an on-screen prompt to "draw a figure 8" (the standard compass calibration gesture) would improve accuracy.
- **Multiple language support** — Translate the interface into Spanish, French, German, Japanese, and other languages to make it accessible to a global audience.

---

> *"The moon is a loyal companion. It never leaves. It's always there, watching, steadfast, knowing us in our light and dark moments."*
>
> — Tahereh Mafi

---

*Find the Moon · Project Design Document · 2026*
