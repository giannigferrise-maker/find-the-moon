# SDLC Pipeline — Architecture Reference

## Overview

The Find the Moon project uses a 5-session automated SDLC pipeline built on GitHub Actions and Claude. Each session is triggered by applying a label to a GitHub issue and runs a Python script that calls Claude via the Anthropic API. Sessions run sequentially on a shared branch (`sdlc/issue-N`), each building on the previous session's output.

```
GitHub Issue
    │
    ├─ label: 1-reqs-ready  ──▶  Session 1: Requirements & Tests
    │                                 └─ creates branch, opens draft PR
    │
    ├─ label: 2-code-ready  ──▶  Session 2: Code Implementation
    │
    ├─ label: 3-tests-ready ──▶  Session 3: Automated Tests
    │                                 └─ runs Jest + Playwright
    │
    ├─ label: 4-security-ready ▶  Session 4: Security Review
    │
    └─ label: 5-quality-ready ──▶  Session 5: Quality Review
                                      └─ posts verdict, links PR to close issue
```

Human engineers apply each label after reviewing the previous session's output. Sessions 2–5 sync the SDLC scripts from `main` before running, ensuring any pipeline fixes land immediately without needing to rebase the feature branch.

---

## Session 1 — Requirements & Tests

**Trigger label:** `1-reqs-ready`
**Script:** `.github/scripts/sdlc_session1.py`

**Reads:**
- GitHub issue title and body (from environment variables)
- `FTM-SRS-001.md` (first 10,000 chars)
- `traceability-matrix.txt` (first 6,000 chars)
- `__tests_verify__/verification.test.js` (first 3,000 chars, for style reference)
- `__tests_verify__/verification.spec.js` (first 3,000 chars, for style reference)

**Claude's tasks:**
1. Decide whether the issue requires new requirements or updates to existing ones
2. Draft traceability matrix entries for any newly added requirements
3. Write TODO test stubs for any newly added requirements not already covered
4. Write a 2–3 sentence PR summary

**Writes:**
- `FTM-SRS-001.md` — appends new requirements or updates existing values in-place
- `traceability-matrix.txt` — appends new traceability entries
- `__tests_verify__/verification.test.js` — appends Jest TODO stubs
- `__tests_verify__/verification.spec.js` — appends Playwright TODO stubs
- `.github/sdlc_session1_delta.md` — the exact requirements added/changed this session; read by Session 2 as its primary implementation target
- `.github/sdlc_pr_body.md` — PR description used when opening the draft PR

**Guardrails (code-level, not prompt-only):**
- `extract_covered_req_ids()` — greps both test files for existing `[FTM-XX-NNN]` describe blocks and builds an `already_covered` set before calling Claude
- `strip_covered_stubs()` — removes any describe blocks for already-covered IDs from Claude's output, regardless of prompt instructions
- `strip_covered_traceability()` — removes traceability entries for already-covered IDs from Claude's output
- Self-critique loop (up to 2 rounds) — Claude reviews only the newly added content for defects; pre-existing content is not passed to the self-critique

**Workflow actions:**
- Creates branch `sdlc/issue-N`
- Commits changes (or an empty commit if no documents changed — required so GitHub can open a PR)
- Opens a draft PR
- Posts a comment on the issue

---

## Session 2 — Code Implementation

**Trigger label:** `2-code-ready`
**Script:** `.github/scripts/sdlc_session2.py`

**Reads:**
- GitHub issue title and body
- `.github/sdlc_session1_delta.md` — the exact requirements added/changed by Session 1 for this issue; injected at the top of the prompt so Session 2 implements precisely what the requirements engineer specified
- `FTM-SRS-001.md` — full SRS for broader context
- `src/index.html`
- `src/moonLogic.js`

**Claude's tasks:**
- Implement the feature or fix described in the issue
- Ensure the implementation satisfies the requirements from Session 1
- Write unit tests in `__tests__/` if needed

**Writes:**
- `src/index.html`
- `src/moonLogic.js`
- `__tests__/` (unit tests)
- `.github/sdlc_pr_body.md`

**Guardrails:**
- Self-critique loop (up to 2 rounds) reviewing code quality, correctness, and requirement alignment

---

## Session 3 — Automated Tests

**Trigger label:** `3-tests-ready`
**Script:** `.github/scripts/sdlc_session3.py`

**Reads:**
- GitHub issue title and body
- `FTM-SRS-001.md`
- `FTM-TEST-GUIDE.md` — element IDs, DOM facts, mock patterns, known pitfalls
- `__tests_verify__/verification.test.js` (full file, up to 30,000 chars)
- `__tests_verify__/verification.spec.js` — **only the header + TODO-containing describe blocks** (via `extract_todo_blocks()`, up to 25,000 chars)

**Claude's tasks:**
- Replace each TODO stub with real, working test assertions
- Write tests against requirements, not implementation details (adversarial mindset)
- Use correct element IDs and selectors from the Test Guide

**Writes:**
- `__tests_verify__/verification.test.js`
- `__tests_verify__/verification.spec.js`
- `session3-summary.md` — posted as PR comment
- `session3-status.json` — read by the workflow to fail the job if tests didn't pass

**Guardrails (code-level):**
- `apply_replacement()` TODO guard — rejects any replacement where `old_string` does not contain `TODO`; Session 3 can only fill stubs, never modify existing passing tests
- Corruption pattern stripper — removes known LLM output corruptions (e.g. `});pyOn(` fragments)
- Self-critique loop (up to 2 rounds) — checks for syntax errors, wrong framework usage, and test robustness
- Test execution — runs Jest and Playwright after writing; if either fails, a fix loop (up to 2 rounds) asks Claude to diagnose and fix test *authoring* errors only, never app bugs
- **Duplicate test ID check** — scans both test files for describe blocks sharing the same requirement ID; fails the session if duplicates are found
- **Missing test coverage check** — compares all Test-method requirements in the SRS against describe blocks in the test files; fails the session if any requirement has no coverage

**Workflow actions:**
- Commits updated test files
- Posts `session3-summary.md` as a PR comment (always, even on failure)
- Fails the workflow job if `session3-status.json` reports `all_passed: false`

---

## Session 4 — Security Review

**Trigger label:** `4-security-ready`
**Script:** `.github/scripts/sdlc_session4.py`

**Reads:**
- GitHub diff against `main` (split into core diff and test diffs)
- `FTM-SRS-001.md`

**Claude's tasks:**
- Review the diff for security vulnerabilities (XSS, injection, supply chain, privacy/COPPA)
- Assess impact on child safety requirements
- Produce a verdict (PASS / FAIL) with severity-tagged findings

**Writes:**
- `docs/security-review.md` — appended with findings for this issue

---

## Session 5 — Quality Review

**Trigger label:** `5-quality-ready`
**Script:** `.github/scripts/sdlc_session5.py`

**Reads:**
- GitHub diff against `main` (core, Jest, Playwright splits)
- `FTM-SRS-001.md`
- `traceability-matrix.txt`

**Claude's tasks:**
- ISO 62304-inspired quality review: requirements quality, code quality, test coverage, traceability, process compliance
- Produce a verdict (PASS / FAIL) with severity-tagged findings

**Writes:**
- `docs/quality-review.md` — appended with findings for this issue

**Guardrails (code-level):**
- **Duplicate test ID check** — injects a WARNING finding if any requirement ID has more than one describe block
- **Missing test coverage check** — injects a FAIL finding (ISO 62304 §5.6) if any Test-method requirement has no describe block; overrides verdict to FAIL
- **Verdict consistency check** — if any finding has severity FAIL but the model returned `"verdict": "PASS"`, the verdict is overridden to FAIL

**Workflow actions:**
- Posts the full quality report as a PR comment
- If verdict is PASS, adds `Closes #N` to the PR description

---

## File Ownership

Each session is responsible for a specific set of files. Modifying files outside this scope is a pipeline violation.

| File | Owner |
|---|---|
| `FTM-SRS-001.md` | Session 1 |
| `traceability-matrix.txt` | Session 1 |
| `.github/sdlc_session1_delta.md` | Session 1 (writes), Session 2 (reads) |
| `__tests_verify__/verification.test.js` | Session 1 (stubs), Session 3 (implementation) |
| `__tests_verify__/verification.spec.js` | Session 1 (stubs), Session 3 (implementation) |
| `src/index.html` | Session 2 |
| `src/moonLogic.js` | Session 2 |
| `__tests__/` | Session 2 |
| `docs/security-review.md` | Session 4 |
| `docs/quality-review.md` | Session 5 |

---

## Branch and PR Lifecycle

1. Session 1 creates `sdlc/issue-N` from `main` and opens a draft PR
2. Sessions 2–5 commit to the same branch
3. Sessions 2–5 sync `.github/scripts/` from `main` at the start of each run — pipeline improvements land immediately
4. After Session 5 passes, a human reviews and merges the PR
5. The branch is deleted on merge

---

## Model and Infrastructure

- **Model:** `claude-sonnet-4-6` across all sessions
- **Max tokens:** 16,000 for Sessions 1, 3, 5; 8,192 for critique/fix loops
- **Runtime:** GitHub Actions, `ubuntu-latest`, Python 3.12
- **API:** Anthropic API (pay-per-token, separate from Claude.ai/Claude Code subscriptions)
- **Typical cost:** ~8–11 API calls per complete pipeline run; well under $0.50 per issue at Sonnet pricing
