# System Architecture Document
## Find the Moon — Web Application + AI-Powered SDLC Pipeline

| Field | Value |
|---|---|
| **Document ID** | FTM-SA-001 |
| **Version** | 1.0 |
| **Date** | March 2026 |

---

## 1. Overview

The Find the Moon system consists of two distinct but connected architectures:

1. **Application Architecture** — the runtime system that end users interact with; a static single-page web application served globally via CDN
2. **Pipeline Architecture** — the development and quality system that produces, validates, and deploys changes to the application; an AI-powered automated SDLC pipeline running on GitHub Actions

These two architectures share a single artifact — the GitHub repository — as the boundary between them. The pipeline writes to the repository; the application is served from it.

---

## 2. Application Architecture

### 2.1 Overview

Find the Moon is a **static single-page application (SPA)**. There is no backend server, no database, and no server-side processing. All computation happens in the user's browser at runtime.

### 2.2 Components

```
User's Browser
│
├── Cloudflare Pages CDN
│     └── Serves: index.html, src/moonLogic.js
│
├── Cloudflare CDN (cdnjs.cloudflare.com)
│     └── Serves: SunCalc.js v1.9.0 (with SRI integrity check)
│
├── zippopotam.us API (external, HTTPS)
│     └── Zip code → latitude/longitude conversion
│
└── Device Hardware (mobile only)
      ├── GPS sensor → browser Geolocation API
      └── Compass/magnetometer → DeviceOrientationEvent API
```

### 2.3 Component Details

**Cloudflare Pages**
- Hosts and serves the static application files (`index.html`, `src/moonLogic.js`)
- Connected directly to the GitHub repository (`main` branch)
- Auto-deploys on every merge to `main` — no manual deployment step required
- Provides global CDN distribution, HTTPS, and DDoS protection
- No build step required — files are served as-is

**SunCalc.js v1.9.0**
- Open-source astronomical calculation library
- Loaded from Cloudflare's public CDN (`cdnjs.cloudflare.com`)
- Protected by Subresource Integrity (SRI) — a SHA-512 hash in the `integrity` attribute ensures the exact correct file is loaded; any tampering causes the browser to refuse execution
- `crossorigin="anonymous"` required alongside SRI for cross-origin scripts
- Provides: moon position (azimuth, altitude), moon phase, moon illumination, moon rise/set times, sun position (for day/night theme)

**zippopotam.us API**
- Free, public REST API for US zip code lookups
- Called client-side via `fetch()` — no API key required
- Returns latitude and longitude for a given 5-digit US zip code
- Used when the user enters a zip code instead of granting GPS permission
- No user data is sent to or stored by this API beyond the zip code itself

**Browser Geolocation API**
- Standard W3C browser API for GPS location
- Requires explicit user permission — browser prompts the user
- If denied, the application falls back gracefully to zip code input
- Coordinates are used locally for calculation only — never transmitted to any server

**Device Orientation API (mobile)**
- Standard browser API for compass/magnetometer data
- Used for the live compass feature on mobile devices
- Requires explicit permission on iOS 13+
- All processing is local to the device

### 2.4 Data Flow — User Session

```
1. User opens app in browser
2. Browser loads index.html from Cloudflare Pages
3. Browser loads SunCalc.js from cdnjs.cloudflare.com (SRI verified)
4. User grants GPS permission
   └── Browser Geolocation API returns lat/lon
   OR
   User enters zip code
   └── fetch() → zippopotam.us API → returns lat/lon
5. moonLogic.js calls SunCalc.getPosition(), getMoonPosition(), etc.
   └── All computation runs locally in the browser
6. Results rendered to DOM (direction, altitude, phase, rise/set time)
7. Auto-refresh every 60 seconds → repeat from step 5
```

### 2.5 Privacy Architecture

By design, **no user data ever leaves the browser**:
- GPS coordinates: used locally, never transmitted
- Zip codes: sent only to zippopotam.us for coordinate lookup (no PII)
- No analytics, no tracking, no cookies, no user accounts
- Compliant with COPPA — no personal data collected from any user

---

## 3. Pipeline Architecture

### 3.1 Overview

The SDLC pipeline automates the full software development lifecycle from GitHub issue to merged, verified, production-deployed code. It uses Claude (Anthropic's AI) as a specialized agent at each of five stages, coordinated by GitHub Actions.

### 3.2 Components

```
GitHub
│
├── Issues (feature requests, bug reports)
│     └── Labels trigger pipeline sessions
│
├── Actions (CI/CD platform)
│     ├── Provides: Ubuntu VMs, secrets management, workflow orchestration
│     └── Runs: Python 3.12 scripts for each session
│
├── Repository (main branch)
│     ├── Application source: index.html, src/moonLogic.js
│     ├── Verification tests: __tests_verify__/
│     ├── Unit tests: __tests__/
│     ├── Requirements: FTM-SRS-001.md
│     ├── Traceability: traceability-matrix.txt
│     └── Quality docs: docs/
│
└── Pull Requests
      └── Branch per issue: sdlc/issue-N

Anthropic API
└── claude-sonnet-4-6 model
      ├── Session 1: requirements engineering
      ├── Session 2: code implementation
      ├── Session 3: test authoring + verification
      ├── Session 4: security review
      └── Session 5: quality review

Cloudflare Pages
└── Watches main branch → auto-deploys on merge
```

### 3.3 Pipeline Trigger Chain

Each session is triggered by a human engineer applying a GitHub issue label. This is intentional — a human reviews and approves each stage before advancing.

```
GitHub Issue created
        │
        ▼
Label: 1-reqs-ready
        │
        ▼
GitHub webhook → GitHub Actions
        │
        ▼
Ubuntu VM spins up
        │
        ├── Checks out repository
        ├── Installs Python 3.12 + anthropic SDK
        ├── Runs sdlc_session1.py
        │     └── Calls Anthropic API (claude-sonnet-4-6)
        │           ├── Main prompt (requirements analysis)
        │           └── Self-critique loop (up to 2 API calls)
        ├── Commits to sdlc/issue-N branch
        └── Opens draft PR on GitHub
                │
                ▼
        Human reviews Session 1 output
                │
                ▼
        Label: 2-code-ready → Session 2 → ...
                │
                ▼
        Label: 3-tests-ready → Session 3
                │     └── Runs Jest + Playwright on the VM
                ▼
        Label: 4-security-ready → Session 4
                │
                ▼
        Label: 5-quality-ready → Session 5
                │
                ▼
        Human reviews quality report → merges PR
                │
                ▼
        Cloudflare Pages detects merge to main
                │
                ▼
        Auto-deploy → live in production (~30 seconds)
```

### 3.4 GitHub Actions — VM Environment

Each session runs in a fresh, ephemeral Ubuntu VM provided by GitHub:
- **OS:** Ubuntu Latest
- **Runtime:** Python 3.12
- **Node.js:** Installed by Session 2 and 3 for `npm test` and Playwright
- **Secrets available to the VM:**
  - `ANTHROPIC_API_KEY` — authenticates calls to the Anthropic API
  - `GITHUB_TOKEN` — auto-provisioned by GitHub Actions; used to commit, push, open PRs, and post issue comments
- **VM is destroyed** after each session completes — no state persists between sessions (state lives in the repository)

### 3.5 Anthropic API Integration

- **Endpoint:** `https://api.anthropic.com/v1/messages`
- **Model:** `claude-sonnet-4-6`
- **Authentication:** Bearer token via `ANTHROPIC_API_KEY` secret
- **Billing:** Pay-per-token, separate from Claude.ai subscription
- **Typical usage per pipeline run:** 8–11 API calls across 5 sessions; well under $0.50 per issue
- **Max tokens per call:** 16,000 for primary prompts; 8,192 for critique/fix loops
- **No data retention:** API calls are stateless; Anthropic does not retain prompt content for training by default on API tier

### 3.6 Script Sync Mechanism

Sessions 2–5 sync their Python scripts from the `main` branch at the start of each run, before executing:

```yaml
- name: Sync SDLC scripts from main
  run: git checkout origin/main -- .github/scripts/
```

This means pipeline improvements committed to `main` take effect immediately on all active feature branches — no rebase required. A bug fix to `sdlc_session3.py` on `main` is picked up by the next time any branch triggers Session 3.

### 3.7 Automated PR Review

In addition to the 5-session SDLC pipeline, every pull request (including non-SDLC PRs) triggers a separate automated code review:

```
PR opened or updated
        │
        ▼
GitHub webhook → pr-review.yml workflow
        │
        ▼
Ubuntu VM: generates git diff against base branch
        │
        ▼
Calls Anthropic API → claude-sonnet-4-6
        │
        ▼
Posts review comment directly to PR
```

This is a lightweight, single-call review — no sessions, no commits, no branching. It provides an immediate first-pass code review on any PR.

### 3.8 Cloudflare Pages Deployment

- **Trigger:** Any push or merge to the `main` branch on GitHub
- **Connection:** Cloudflare Pages is connected to the GitHub repository via OAuth — no webhook configuration required
- **Build:** No build step — the app is pure HTML/JS, served as static files
- **Deploy time:** Approximately 30 seconds from merge to live
- **Rollback:** Cloudflare Pages maintains deployment history; any prior deployment can be instantly promoted back to production from the Cloudflare dashboard

---

## 4. External Dependencies Summary

| Dependency | Type | Used By | Auth Required | Data Sent |
|---|---|---|---|---|
| Cloudflare Pages | Hosting/CDN | Application | GitHub OAuth (setup only) | None |
| cdnjs.cloudflare.com | CDN | Application (SunCalc.js) | None | None |
| zippopotam.us | REST API | Application | None | Zip code only |
| Browser Geolocation API | Browser API | Application | User permission | None (local) |
| DeviceOrientation API | Browser API | Application | User permission (iOS) | None (local) |
| Anthropic API | AI API | Pipeline (Sessions 1–5) | API key (secret) | Prompts/code |
| GitHub Actions | CI/CD | Pipeline | GitHub token (auto) | Repo content |
| GitHub Issues/PRs | Project mgmt | Pipeline | GitHub token (auto) | Issue content |

---

## 5. Security Boundaries

| Boundary | Protection |
|---|---|
| SunCalc.js CDN load | SRI hash (`sha512-...`) + `crossorigin="anonymous"` |
| Anthropic API key | GitHub Actions secret — never exposed in logs or code |
| GitHub token | Auto-provisioned per-run, scoped to repo, expires after job |
| User location data | Never leaves browser — processed locally only |
| Cloudflare Pages deploy | Requires GitHub OAuth; only `main` branch triggers deploy |

---

## 6. Architecture Diagram Request

*The following diagram should be created as a visual flowchart showing both the Application Architecture and Pipeline Architecture side by side, connected at the GitHub repository boundary. Suggested tools: Mermaid, Lucidchart, or Claude.ai. Key elements to include:*

- *User browser with GPS/compass hardware inputs*
- *Cloudflare Pages serving static files*
- *SunCalc.js CDN load with SRI shield*
- *zippopotam.us API call*
- *GitHub repository as the central artifact*
- *GitHub Actions VM with Anthropic API call*
- *5-session pipeline flow with label triggers*
- *Cloudflare Pages auto-deploy on merge*
- *Human review checkpoints between sessions*
