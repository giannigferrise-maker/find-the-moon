# Orchestration Architecture — Find the Moon SDLC Pipeline

**Document ID:** FTM-ORCH-001
**Status:** Draft
**Date:** 2026-03-23

---

## 1. Purpose

The current SDLC pipeline automates five engineering sessions but leaves failure recovery as a manual loop. When a session fails — a test suite breaks, a security finding blocks the PR, or quality review identifies gaps — a human must read the output, diagnose the root cause, decide which session to re-run, and apply the appropriate label again. This is exactly the class of work that a capable reasoning model should own.

This document describes an orchestration layer that takes ownership of the fix/retry loop within each unlocked stage, while preserving the human-as-gatekeeper model at every label checkpoint. Workers (Sessions 1–5) are unchanged. The orchestrator is additive.

---

## 2. Design Constraints

These constraints are not up for debate — they are already settled:

1. **Workers stay unchanged.** `sdlc_session1.py` through `sdlc_session5.py` are black boxes to the orchestrator. They run as subprocesses. No modifications.
2. **Labels remain human gates.** The orchestrator never applies a label. A human applies every label. The orchestrator activates after the label is applied and works until the stage passes or escalates.
3. **Orchestrator model: Claude Opus 4.6 via Agent SDK.** Workers continue using `claude-sonnet-4-6` via the raw Anthropic SDK. The orchestrator needs multi-step reasoning and tool use — Opus is the right call.
4. **The orchestrator can loop back.** If Session 5 fails because of bad test coverage, the orchestrator may re-run Session 3 (fix), then Session 4 (re-verify security), then Session 5 again. It does not wait for a human to manually re-trigger.
5. **Maximum retry limit per stage.** The orchestrator will not loop indefinitely. See Section 7.
6. **Structured handoff at every checkpoint.** When the orchestrator stops and waits for a human label, it posts a full summary of what happened since the last label — every session it ran, every fix it made, and why.

---

## 3. High-Level Flow

```
Human applies label
        |
        v
+-----------------------------------------------+
|           ORCHESTRATOR (Opus 4.6)             |
|                                               |
|  1. Determine entry session from label        |
|  2. Run session script as tool (subprocess)   |
|  3. Parse session output / verdict            |
|                                               |
|  On PASS ─────────────────────────────────+  |
|                                           |  |
|  On FAIL:                                 |  |
|    a. Classify failure                    |  |
|    b. Determine re-entry session          |  |
|    c. Apply targeted fix (file edits)     |  |
|    d. Re-run from re-entry session fwd    |  |
|    e. Increment retry counter             |  |
|    f. If counter >= MAX: escalate         |  |
|                                           |  |
+───────────────────────────────────────────+  |
                    |                           |
                    v                           |
        Post handoff report                     |
        (issue comment + PR comment)            |
                    |                           |
                    v                           |
        Notify human: apply next label <────────+
                    |
                    v
               STOP. WAIT.
```

The key invariant: the orchestrator stops and waits exactly where the current pipeline stops and waits — at the human label checkpoints. It just does more work before stopping.

---

## 4. Orchestrator Entry Point

### 4.1 Trigger

The orchestrator is triggered by the same label events that currently trigger individual session workflows. A new GitHub Actions workflow, `sdlc-orchestrator.yml`, listens for all five label events on issues. The existing session workflows (`sdlc-session1.yml` through `sdlc-session5.yml`) are either disabled or left in place but made conditional on the orchestrator not being active. The simplest approach is to disable them once the orchestrator is deployed.

```yaml
on:
  issues:
    types: [labeled]

jobs:
  orchestrate:
    if: >
      github.event.label.name == '1-reqs-ready' ||
      github.event.label.name == '2-code-ready' ||
      github.event.label.name == '3-tests-ready' ||
      github.event.label.name == '4-security-ready' ||
      github.event.label.name == '5-quality-ready'
    runs-on: ubuntu-latest
```

### 4.2 Entry Session Mapping

| Label applied | Orchestrator entry session |
|---|---|
| `1-reqs-ready` | Session 1 |
| `2-code-ready` | Session 2 |
| `3-tests-ready` | Session 3 |
| `4-security-ready` | Session 4 |
| `5-quality-ready` | Session 5 |

This is the initial entry point. The orchestrator may run sessions before this point if failure diagnosis requires it.

### 4.3 Difference from Current Session Triggers

Current session workflows run one script and exit — pass or fail, that is the end of the job. The orchestrator workflow runs the Python orchestrator process, which in turn runs one or more session scripts and manages the loop. The GitHub Actions job does not complete until the orchestrator has either reached a human checkpoint (posting a handoff report and stopping) or exhausted retries and escalated.

---

## 5. Session Runner Tool

The orchestrator calls each session script as a tool — specifically, as a bash subprocess with full environment variable passthrough.

### 5.1 Tool Signature (conceptual)

```python
def run_session(session_number: int, issue_number: int, env_overrides: dict = None) -> SessionResult:
    """
    Runs sdlc_sessionN.py in a subprocess.
    Returns structured result: { verdict, output_text, files_written, exit_code }
    """
```

### 5.2 Environment Variables

Each session script reads its inputs from environment variables (`ISSUE_NUMBER`, `ISSUE_TITLE`, `ISSUE_BODY`, `ANTHROPIC_API_KEY`) and from files on disk. The orchestrator inherits these from the GitHub Actions job environment and passes them through to the subprocess. No changes to the session scripts are required.

### 5.3 Verdict Extraction

Sessions 4 and 5 post PASS/FAIL verdicts as PR comments and also write structured output to files (`docs/security-review.md`, `docs/quality-review.md`). Session 3 writes `session3-status.json`. The orchestrator reads these artifacts after each session run to determine the outcome:

- **Session 1:** Success is determined by exit code and presence of `.github/sdlc_session1_delta.md`.
- **Session 2:** Success is determined by exit code. The script already has an internal fix loop and will exit non-zero if that loop fails.
- **Session 3:** Read `session3-status.json`; `all_passed: true` = PASS.
- **Session 4:** Parse the last appended entry in `docs/security-review.md` for the verdict field.
- **Session 5:** Parse the last appended entry in `docs/quality-review.md` for the verdict field; also apply the same override logic the script applies (any FAIL-severity finding overrides a PASS verdict).

### 5.4 File State Between Runs

When the orchestrator re-runs a session (e.g., Session 3 for a second time), the session script will find the files it previously wrote still on disk. Sessions 3, 4, and 5 all append to their output files. This is correct behavior — the orchestrator does not need to clean up between runs. Session 3's `strip_covered_tests()` guardrail prevents duplicate test blocks from accumulating.

---

## 6. Failure Diagnosis and Re-entry Selection

This is the core reasoning task the orchestrator performs. After a session reports FAIL, Opus reads the failure output and classifies it into one of the categories below, then selects the appropriate re-entry session.

### 6.1 Session 3 FAIL

Session 3 fails if Jest or Playwright tests do not pass, if duplicate requirement IDs are found in the test files, or if coverage is missing for a Test-method requirement.

Session 3 already has an internal fix loop (up to 2 rounds). If Session 3 exits with `all_passed: false`, the internal loop was exhausted. The orchestrator re-enters at Session 3 with a fresh attempt.

**Re-entry:** Session 3.

**Fix applied before re-entry:** The orchestrator may inspect the failing test output and apply a targeted correction to `__tests_verify__/verification.test.js` or `verification.spec.js` before re-running — for example, removing a malformed test block that is syntactically broken. For substantive logic errors, it re-runs Session 3 and lets the session's own reasoning fix the tests.

**Sessions re-run after re-entry:** 3 only (Session 4 and 5 have not run yet at this point).

### 6.2 Session 4 FAIL (Security)

A Session 4 FAIL means the diff contains a security issue in the implementation.

**Root cause:** The code written by Session 2 has a vulnerability.

**Re-entry:** Session 2.

**Fix applied before re-entry:** Opus reads the security finding from `docs/security-review.md`, identifies the specific file and pattern flagged, and either: (a) applies a direct surgical fix to `src/index.html` or `src/moonLogic.js` if the fix is straightforward (e.g., escaping a value, removing an unsafe eval), or (b) re-runs Session 2 with the security finding injected as additional context in a modified prompt. Option (a) is preferred — fewer tokens, faster.

**Sessions re-run after re-entry:** 3 (re-verify tests still pass after code change), 4 (re-run security review on updated diff).

### 6.3 Session 5 FAIL (Quality)

Session 5 failures fall into several sub-categories. Opus must classify which sub-category applies by reading the finding list in `docs/quality-review.md`:

| Sub-category | Indicators | Re-entry |
|---|---|---|
| Stale SRS (requirements gap) | Finding references missing or outdated requirement IDs; new feature has no SRS entry | Session 1 |
| Missing test coverage | ISO 62304 §5.6 finding; a Test-method requirement has no describe block | Session 3 |
| Bad test removal / duplicate test IDs | Finding references duplicate requirement IDs or deleted test blocks | Session 3 |
| Code quality issue | Finding flags implementation defect unrelated to security | Session 2 |
| Stale VTM | VTM entries reference requirement IDs not in SRS, or vice versa | Session 3 |

**For requirements gap (re-entry at Session 1):** The orchestrator re-runs Session 1, then 2, then 3, then 4, then 5. This is a full pipeline re-run from the requirements level — expensive but necessary.

**For all other Session 5 failures:** Re-entry is Session 3 at most. Sessions run after re-entry: 3, 4, 5.

### 6.4 Unclassifiable Failures

If Opus cannot confidently classify a failure into one of the above categories — the output is malformed, the exit code is non-zero but no structured finding is present, or the failure is in infrastructure rather than content — the orchestrator escalates immediately rather than guessing. See Section 7.2.

---

## 7. Orchestrator Levers — How to Influence Each Session

The session scripts are black boxes that cannot be modified. But each session reads from files on disk, and the orchestrator can write to those files before re-triggering a session. These writable inputs are the orchestrator's levers — the only way to produce a different output from a session without changing the script itself.

This constraint is non-trivial: re-running a session with identical inputs will produce the same (or statistically similar) output. A re-run is only useful if something the session reads has changed. The orchestrator must always apply at least one lever before re-running a session, or the retry is wasted.

### 7.1 Session 1 — Requirements Engineering

**Reads:** `FTM-SRS-001.md`, GitHub issue body (env var, not changeable), `ISSUE_TITLE`, `ISSUE_NUMBER`.

**Lever: Patch the delta output directly.**
Session 1's output is `.github/sdlc_session1_delta.md`. If the orchestrator determines that Session 1 produced a delta with an incorrect classification or missing requirement, the most efficient fix is to patch the delta file directly rather than re-running Session 1. Session 1 is difficult to re-run productively because its primary input (the GitHub issue body) is immutable — re-running it with the same issue body will produce the same or similar output.

The orchestrator treats Session 1's delta as an editable artifact, not a sacred output. If a downstream failure traces back to a requirements gap, the orchestrator patches the delta and re-runs from Session 2 forward, bypassing Session 1 entirely.

**When a full Session 1 re-run is warranted:** Only if the SRS itself has become inconsistent and Session 1 must regenerate a clean delta from the corrected SRS. Rare.

### 7.2 Session 2 — Code Implementation

**Reads:** `.github/sdlc_session1_delta.md`, `FTM-SRS-001.md`, `src/index.html`, `src/moonLogic.js`.

**Primary lever: `implementation_guidance` field in the delta file.**
The delta file has an `implementation_guidance` field that gives Session 2 specific coding direction. The orchestrator can edit this field to add, clarify, or correct the guidance before re-running Session 2. For example, if Session 4 flags a security issue in the code, the orchestrator adds a note to `implementation_guidance` like: "Security finding: the cloud color string is being concatenated into a CSS value without sanitization. Use a static literal only — no template expression."

**Secondary lever: Direct patch of `src/index.html` or `src/moonLogic.js`.**
For simple, surgical fixes (correcting a single value, removing an unsafe pattern), the orchestrator can patch the source file directly and skip re-running Session 2 entirely. This is faster and uses fewer tokens. Session 2 is only re-run when the fix requires reasoning about the implementation — not when the orchestrator can identify and apply the fix deterministically.

### 7.3 Session 3 — Verification Engineering

**Reads:** `.github/sdlc_session1_delta.md`, `FTM-SRS-001.md`, `FTM-TEST-GUIDE.md`, `__tests_verify__/verification.test.js`, `__tests_verify__/verification.spec.js`, `traceability-matrix.txt`.

**Lever A: Delta file (add test guidance).** The orchestrator can append a note to the delta file's `implementation_guidance` field instructing Session 3 to focus on specific requirements or avoid a pattern that caused failures in the previous attempt. Example: "Session 3 attempt 1 produced a syntax error in the async Playwright block for FTM-VT-008. Ensure the describe block is properly closed with `});`."

**Lever B: Direct patch of test files.** If Session 3's output contains a specific structural error (malformed block, unclosed brace, duplicate describe), the orchestrator patches the file directly before triggering the next attempt. This is the primary fix for syntax errors — it is faster than asking Session 3 to regenerate the whole test, and Session 3's existing internal fix loop already handles logic-level test failures.

**Lever C: Direct patch of `traceability-matrix.txt`.** If a Session 5 finding identifies a stale VTM entry, the orchestrator can patch the VTM directly and re-run only Session 5 — no Session 3 re-run needed.

### 7.4 Session 4 — Security Review

**Reads:** Git diff (computed at runtime from branch vs main), `FTM-SRS-001.md`, `docs/security-review.md`.

**No direct lever.** Session 4 is a pure reviewer. Its inputs are the diff (which reflects the current state of `index.html` and `src/`) and the SRS. The orchestrator cannot change the diff without changing the source files, and it cannot change the SRS without re-running Session 1.

**The lever is upstream: fix the code.** If Session 4 fails, the orchestrator applies a fix to `src/index.html` or `src/moonLogic.js` (directly or via Session 2 re-run), which changes the diff, which changes what Session 4 sees. Session 4 is then re-run on the updated diff.

### 7.5 Session 5 — Quality Review

**Reads:** Git diffs (computed at runtime — core, Jest tests, Playwright tests), `FTM-SRS-001.md`, `traceability-matrix.txt`.

**No direct lever on the diffs.** Like Session 4, Session 5 reviews artifacts computed at runtime. The orchestrator cannot hand Session 5 a different diff — only a different set of files that produce a different diff when compared to main.

**The levers are the artifacts that produce the diff:**
- If Session 5 flags stale SRS → patch `FTM-SRS-001.md` directly, re-run Session 5.
- If Session 5 flags stale VTM → patch `traceability-matrix.txt` directly, re-run Session 5.
- If Session 5 flags missing test coverage → re-run Session 3 (which updates test files), then Session 4, then Session 5.
- If Session 5 flags a code quality issue → fix code directly or re-run Session 2, then 3, 4, 5.

### 7.6 The Bug vs. Bad Test Problem

A critical diagnostic the orchestrator must perform when Session 3 fails repeatedly: **is the test failing because the test is wrong, or because the code has a genuine bug?**

Session 3 assumes the code is correct and tries to fix the tests. This is right most of the time — Session 2 already has its own internal fix loop with unit tests. But if Session 2 introduced a regression that its unit tests did not catch, Session 3 will loop indefinitely trying to fix tests that are actually correct.

The orchestrator detects this pattern when:
1. Session 3's internal fix loop exhausts itself (2 attempts) on the same failing assertion.
2. The assertion is testing a specific value (e.g., a color, a CSS property) that matches the requirement in the SRS.
3. The test assertion is structurally correct — the test is written right, it just fails.

In this case, the orchestrator classifies the failure as a **code regression**, not a test problem, and re-enters at Session 2 with a note in the delta's `implementation_guidance`: "Session 3 tests are failing on [assertion]. The test is correct per the SRS. The implementation in `index.html` does not match the expected value. Fix the implementation, not the test."

Session 2 re-runs, fixes the code, and the orchestrator re-runs Session 3, 4, 5 forward.

---

## 8. State Management

The orchestrator maintains a state object in memory for the duration of its run. This state is also written to disk as `orchestrator-state.json` on the feature branch after each session completes, so it is recoverable if the GitHub Actions job is interrupted.

### 7.1 State Schema

```json
{
  "issue_number": 42,
  "label_that_triggered": "3-tests-ready",
  "entry_session": 3,
  "current_session": 3,
  "start_time": "2026-03-23T14:00:00Z",
  "sessions_run": [
    {
      "session": 3,
      "attempt": 1,
      "verdict": "FAIL",
      "failure_category": "missing_coverage",
      "timestamp": "2026-03-23T14:01:30Z",
      "summary": "Session 3 failed: REQ-042 has no describe block in verification.test.js"
    },
    {
      "session": 3,
      "attempt": 2,
      "verdict": "PASS",
      "timestamp": "2026-03-23T14:03:15Z",
      "summary": "Session 3 passed on retry: all tests green, VTM updated"
    }
  ],
  "retry_counts": {
    "3": 1
  },
  "fixes_applied": [
    {
      "before_session": 3,
      "attempt": 2,
      "description": "Removed malformed describe block for REQ-041 from verification.test.js (unclosed expect)"
    }
  ],
  "final_verdict": "PASS"
}
```

### 7.2 Retry Limits and Escalation

**Default maximum retries per session: 3.**

This means the orchestrator will attempt any given session at most 3 times within a single label-triggered run. The count resets when a new label is applied by a human.

When a session hits its retry limit without passing:

1. The orchestrator stops the loop immediately — it does not attempt another fix.
2. It posts an escalation comment on the issue with the full failure history, the specific error from the last attempt, and an explicit statement that human intervention is required.
3. It posts the same information as a PR comment.
4. The GitHub Actions job exits non-zero.
5. The human reads the escalation, decides what to do (may involve manually editing files, changing the approach, or re-applying the label with a different strategy), and re-applies the relevant label.

The escalation comment format:

```
ORCHESTRATOR ESCALATION — Session N exceeded 3 retry attempts.

Label that triggered this run: 5-quality-ready
Sessions attempted: 5 (x1), 3 (x3)
Last failure in Session 3, attempt 3:
  [verbatim failure output, truncated to 2000 chars]

Fixes applied during this run:
  - Attempt 2: Removed duplicate describe block for REQ-041
  - Attempt 3: Re-ran Session 3 without pre-fix (no obvious structural error)

Human action required. Review the above, fix the underlying issue, and re-apply
the label to retry.
```

Rationale for 3 as the default: two retries is often enough to recover from transient LLM output quality variance. Three gives one additional chance. Beyond three, the orchestrator is likely stuck in a failure mode that requires human judgment — not more tokens.

---

## 9. Handoff Report

When a session PASS is achieved and the stage is complete, the orchestrator produces a structured handoff report before stopping. This is what the human reads before deciding to apply the next label.

### 8.1 Report Contents

The handoff report is posted as a GitHub issue comment. It contains:

1. **Stage completed:** Which session just passed, and the label that triggered this run.
2. **Sessions run:** Every session that ran in this orchestrator invocation, in order, with attempt numbers.
3. **Fixes applied:** Any direct file edits or diagnostic interventions the orchestrator made, with before/after context if applicable.
4. **Why loops happened:** Plain-language explanation of each failure and why the orchestrator chose the re-entry point it did.
5. **Current state of artifacts:** One-line status of each relevant file (was it written, updated, unchanged).
6. **Next step:** The exact label to apply to unlock the next stage.

### 8.2 Example Handoff Report

```
SDLC Orchestrator — Stage 3 complete (triggered by label: 3-tests-ready)

Sessions run this invocation:
  Session 3, attempt 1 — FAIL
  Session 3, attempt 2 — PASS

What happened:
  Attempt 1 failed: Session 3's internal fix loop was unable to resolve a
  syntax error in the generated Playwright spec (unclosed async block for
  REQ-042). The orchestrator identified the specific malformed block and
  removed it before attempt 2.

Fixes applied by orchestrator:
  - Removed lines 187-203 from verification.spec.js (malformed async block
    for REQ-042 describe; no matching closing brace).

Artifacts:
  - __tests_verify__/verification.test.js — updated (2 new describe blocks)
  - __tests_verify__/verification.spec.js — updated (1 new describe block)
  - traceability-matrix.txt — updated (REQ-041, REQ-042 entries added)
  - session3-status.json — all_passed: true

Next step: Apply label `4-security-ready` to trigger security review.
```

---

## 10. Where the Orchestrator Lives

### 9.1 Option A: GitHub Actions Workflow (recommended)

The orchestrator is a Python script (`sdlc_orchestrator.py`) that runs as a GitHub Actions job, triggered by the same label events as the current session workflows. It runs on `ubuntu-latest`, installs `anthropic` (Agent SDK), and calls the existing session scripts as subprocesses.

**Advantages:**
- No new infrastructure. Same execution environment the workers already use.
- Secrets (`ANTHROPIC_API_KEY`, `GITHUB_TOKEN`) are already available.
- Job logs are visible in the Actions tab — full audit trail.
- If the job is killed (timeout, flaky runner), the `orchestrator-state.json` on the branch preserves the run history. The human can re-apply the label to restart cleanly.
- Deploys alongside the existing pipeline — no separate service to maintain.

**Disadvantages:**
- GitHub Actions job timeout is 6 hours. A multi-session retry loop involving Sessions 1 through 5 with multiple retries could theoretically approach this. In practice, a full 5-session run with retries takes under 30 minutes at current session durations.
- No persistent state between separate label-triggered runs. Each run starts from scratch (reading `orchestrator-state.json` from disk for history, but not resuming in-process state).
- If the GitHub Actions runner dies mid-run, the job is lost and must be re-triggered manually.

### 9.2 Option B: Separate Long-Running Process

An alternative is to run the orchestrator as a persistent service (e.g., a small server on a VPS or a serverless function) that listens to GitHub webhooks directly.

**Advantages:**
- No 6-hour timeout constraint.
- Could maintain persistent in-memory state across label events for the same issue.
- Could theoretically handle more complex multi-issue coordination.

**Disadvantages:**
- Requires infrastructure beyond GitHub Actions — a server, uptime monitoring, deployment pipeline for the orchestrator itself.
- Secrets management becomes more complex.
- Overkill for a project where the current pipeline runs well within Actions constraints.
- Adds operational surface area with no corresponding benefit given current session durations.

**Recommendation:** Option A (GitHub Actions). The constraints are not binding for this project's workload, the operational simplicity is significant, and the audit trail in Actions logs is valuable during early orchestrator development.

---

## 11. Orchestrator Script Structure

The orchestrator lives at `.github/scripts/sdlc_orchestrator.py`. It is triggered by `.github/workflows/sdlc-orchestrator.yml`. Its structure:

```
sdlc_orchestrator.py
  ├── State class            — tracks sessions_run, retry_counts, fixes_applied
  ├── run_session()          — subprocess call to sdlc_sessionN.py
  ├── parse_verdict()        — reads session output files, returns PASS/FAIL + details
  ├── classify_failure()     — Opus call: reads failure text, returns failure category + re-entry session
  ├── apply_fix()            — targeted file edit based on failure category
  ├── post_handoff_report()  — GitHub issue comment with full run summary
  ├── post_escalation()      — GitHub issue + PR comment when retries exhausted
  └── main()                 — entry point: label → entry session → loop
```

The `classify_failure()` function is the only Opus API call in the orchestrator. Everything else is deterministic Python. This keeps token costs predictable and limits the blast radius of model reasoning errors — the orchestrator's Opus call produces a structured classification (JSON: `{failure_category, re_entry_session, reasoning}`), and the rest of the loop is code.

---

## 12. Complete Flow Diagram

The following shows a Session 5 failure with a re-entry at Session 3:

```
Human applies: 5-quality-ready
        |
        v
Orchestrator starts (entry: Session 5)
        |
        v
run_session(5) ──► FAIL
  "Missing coverage for REQ-042 (ISO 62304 §5.6)"
        |
        v
classify_failure(output) ──► Opus 4.6
  returns: { category: "missing_coverage", re_entry: 3 }
        |
        v
retry_counts[3] = 0 < MAX (3)? YES
        |
        v
apply_fix() ──► (no pre-fix needed for missing coverage; Session 3 will write it)
        |
        v
run_session(3) ──► FAIL
  "verification.spec.js syntax error at line 201"
        |
        v
classify_failure(output) ──► deterministic parse (non-zero exit, syntax error)
  returns: { category: "syntax_error", re_entry: 3 }
        |
        v
retry_counts[3] = 1 < MAX (3)? YES
        |
        v
apply_fix() ──► remove malformed block from verification.spec.js
        |
        v
run_session(3) ──► PASS
        |
        v
run_session(4) ──► PASS
        |
        v
run_session(5) ──► PASS
        |
        v
post_handoff_report()
  "Stage 5 complete. 4 sessions run (5x1 FAIL, 3x2 FAIL, 3x3 PASS, 4x1 PASS, 5x2 PASS).
   Fixes applied: removed malformed Playwright block for REQ-042.
   Next step: review PR and merge."
        |
        v
STOP. WAIT FOR HUMAN.
```

---

## 13. Future Considerations

### 12.1 Parallel Sessions 4 and 5

Sessions 4 (security) and 5 (quality) both read the same inputs — the branch diff, `FTM-SRS-001.md`, and the VTM — and neither writes anything the other reads. They are independent. Running them concurrently would reduce end-to-end time for the later stages by roughly half.

The current orchestrator design runs them sequentially because sequential is simpler and the time savings are modest (each session takes 30–90 seconds). This is a straightforward future optimization: spawn two subprocesses, wait for both to complete, then evaluate the combined verdict before deciding whether to loop.

Complication to address: if Session 4 PASS and Session 5 FAIL, the re-entry logic must still run Session 4 again after any code fix, since the diff will have changed. Parallel execution does not eliminate this dependency in the re-run path.

### 12.2 VTM as a Dedicated Agent

The Verification Traceability Matrix (`traceability-matrix.txt`) is currently written by Session 3 as one of several tasks. As the SRS grows, the VTM becomes a complex artifact — it must remain consistent with the SRS, the test files, and the implementation. A future enhancement is to make VTM management a dedicated sub-agent called by the orchestrator, responsible for:

- Validating VTM completeness against the SRS after every session run
- Detecting and repairing orphaned VTM entries (requirements deleted from SRS, tests deleted from test files)
- Producing a VTM diff as part of every handoff report

This would move VTM validation out of Session 5's quality check (where it is currently a post-hoc finding) and into a proactive gate that runs after Session 3.

### 12.3 Structured Outputs Replacing JSON Parsing

The current session scripts extract JSON from Claude's response using regex and repair heuristics (`extract_json()`, `fix_control_chars()`). This is fragile — it works, but it requires maintenance when output format edge cases appear (as seen in several recent fix commits).

The Anthropic API supports structured outputs (JSON schema enforcement) in recent model versions. Migrating session scripts to use structured outputs would eliminate the JSON parsing layer entirely. This is not an orchestrator concern — it is a session script improvement — but the orchestrator should be designed to benefit from it: if session scripts return machine-readable structured verdicts rather than parsed strings, the orchestrator's `parse_verdict()` function becomes trivial.

### 12.4 Orchestrator Observability

As the orchestrator handles more complex retry chains, a lightweight observability layer becomes valuable:

- Structured logs written to `orchestrator-run-log.json` on the feature branch (one entry per session run, with timestamps, token counts, and verdicts)
- A summary table in each handoff report showing session runtimes and API call counts
- A dashboard or periodic report showing which sessions fail most often and what the common failure categories are

This data would inform where to invest in session script improvements — for example, if Session 3 retry rate is high, that points to systemic issues in test generation quality worth addressing directly.

### 12.5 Issue-Level Cost Tracking

The orchestrator knows how many session runs it triggered. Adding Anthropic API token counts (available from the SDK response objects) to the state file would make per-issue cost tracking precise rather than estimated. This is low effort and immediately useful for understanding the cost impact of complex retry chains.

---

## 14. Summary of Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Worker scripts | Unchanged | No regression risk; clear ownership boundary |
| Orchestrator model | Claude Opus 4.6, Agent SDK | Multi-step reasoning; tool use; failure classification quality |
| Worker model | claude-sonnet-4-6, raw SDK | Unchanged from current pipeline |
| Label gates | Human-only | Humans remain accountable for stage progression |
| Max retries per session | 3 | Enough to recover from LLM variance; not so many as to mask real failures |
| Orchestrator host | GitHub Actions | No new infrastructure; consistent with existing pipeline |
| Escalation path | Issue + PR comment, non-zero exit | Human gets clear signal with full context |
| State persistence | `orchestrator-state.json` on branch | Survives runner interruption; auditable |
| Opus API calls | One per failure classification | Keeps costs bounded; rest is deterministic Python |
