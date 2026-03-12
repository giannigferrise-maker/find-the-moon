# SDLC Pipeline — Design Decisions and Lessons Learned

This document explains *why* the pipeline is built the way it is. Each section covers a design decision, the problem it solves, and — where relevant — what we tried first and why it didn't work. This context is essential for anyone extending the pipeline without accidentally undoing a hard-won fix.

---

## 1. Code-level guardrails, not prompt-only instructions

**Decision:** Critical constraints are enforced in Python code, not just in the Claude prompt.

**Why:** Prompt instructions are unreliable for constraints that must hold 100% of the time. Claude follows them most of the time, but under certain conditions — long prompts where instructions are buried in the middle ("lost in the middle" effect), or when the model's reasoning leads it to believe an exception is warranted — they get ignored.

**Example:** Session 1's prompt said "do NOT add stubs for requirements that already have test coverage." This worked most of the time. But when a related issue touched the same requirement, Claude would reason "this requirement is *affected* by this issue" and add a duplicate stub anyway. The fix was `strip_covered_stubs()` — a Python function that removes duplicate stubs from Claude's output regardless of what Claude returned.

**Rule of thumb:** If a constraint failing once causes a hard-to-reverse defect (duplicate stubs, corrupted traceability matrix), enforce it in code. If it's a quality suggestion that just improves output, the prompt is fine.

---

## 2. Self-critique only sees newly added content

**Decision:** The self-critique loop in Session 1 receives only the content generated in the current session (`data['srs_additions']`, etc.), not the full SRS or traceability matrix.

**Why:** Early versions passed the full SRS file to the self-critique. The model would then apply its "wrong verification method" check to pre-existing requirements it could see, and "fix" them — changing `Inspection` to `Test` for requirements that were never part of the current issue, rewriting requirement text with invented thresholds, or bumping the SRS version metadata.

**What happened concretely:** Session 1 for a test cleanup issue rewrote `FTM-VT-007` (pre-existing) with a made-up "30% canvas coverage" threshold, and updated the SRS version from 1.3 to 1.4 — none of which was requested.

**Fix:** Pass only `srs_new`, `traceability_new`, `jest_new`, `pw_new` — the strings Claude just generated — to the self-critique. If nothing was added, skip the self-critique entirely. The self-critique literally cannot see or touch pre-existing content.

---

## 3. Session 3's TODO guard

**Decision:** `apply_replacement()` in Session 3 raises an error if `old_string` does not contain `TODO`. Session 3 can only replace stub placeholders, never modify existing passing tests.

**Why:** The self-critique in Session 3 reviews the full test files for defects. Without this guard, it would propose "fixes" to existing passing tests — changing assertion values, restructuring describe blocks, or consolidating blocks it considered redundant. This would silently alter the meaning of established tests.

**Consequence:** The guard also means Session 3 cannot be used to consolidate duplicate test blocks (as we discovered during the W5 cleanup). Consolidating existing passing tests is a manual operation, not a Session 3 responsibility. This is by design — Session 3 is a stub-filler, not a test maintenance tool.

---

## 4. Empty commit when Session 1 makes no document changes

**Decision:** When Session 1 determines no SRS, traceability, or test stub changes are needed, it creates a `git commit --allow-empty` before pushing.

**Why:** GitHub's API rejects PR creation with "No commits between main and branch" if the branch has no new commits relative to `main`. For issues that are pure code or test cleanup (no new requirements needed), Session 1 correctly produces no document changes — but the pipeline still needs a PR to proceed through Sessions 2–5.

**What failed:** Without this, the Session 1 workflow would succeed (no errors in the Python script) but the `gh pr create` step would fail with a GitHub API error. The issue would be stuck with no PR and Sessions 2–5 unable to run.

---

## 5. Sessions 2–5 sync scripts from main before running

**Decision:** The workflow for Sessions 2–5 begins with a step that copies `.github/scripts/` from `main` onto the feature branch before running.

**Why:** SDLC improvements (bug fixes, prompt improvements, new guardrails) are committed to `main` as they're developed. Without the sync, a long-running feature branch would use the old session scripts from when the branch was created. With the sync, every pipeline improvement takes effect immediately on all active branches — no rebase required.

**Risk:** If a script improvement is incompatible with mid-flight branch state, the sync could break a running pipeline. In practice this hasn't been an issue because script changes are additive (better prompts, new guardrails) rather than breaking changes.

---

## 6. Duplicate stub prevention (the root cause of W5)

**Problem:** The test suite accumulated three duplicate `test.describe` blocks for `FTM-FR-033`. All three were passing, all three tested the same requirement, all three had slightly different names and assertion styles.

**Root cause:** Over multiple issues that touched cloud-related requirements, Session 1 (before our fixes) would add new TODO stubs for `FTM-FR-033` because it was "affected" by each issue. It had no awareness that a stub already existed.

**Fix (three layers):**
1. `extract_covered_req_ids()` — greps test files for `[FTM-XX-NNN]` patterns before calling Claude, building an `already_covered` set
2. Prompt — explicitly lists covered IDs: "do NOT add stubs for these"
3. `strip_covered_stubs()` — code-level removal of any describe blocks for covered IDs from Claude's output

Each layer addresses a different failure mode. The prompt handles the easy cases. The code guardrail handles cases where Claude ignores the prompt. `extract_covered_req_ids()` provides the data both need.

---

## 7. Duplicate test ID detection (Sessions 3 and 5)

**Decision:** Both Session 3 and Session 5 run a deterministic Python check for requirement IDs that appear in more than one describe block.

**Why Sessions 3 AND 5:**
- Session 3 fails fast — if this session's changes introduced a duplicate, it fails before Sessions 4 and 5 run, saving CI time
- Session 5 is the ISO 62304 §5.6 audit trail — it catches pre-existing duplicates that weren't created by the current session (e.g. manually added outside the pipeline)

**Severity difference:** Session 3 treats duplicates as a hard failure (`all_passed = False`). Session 5 treats them as a WARNING — by Session 5 the branch has already been through security review and the duplicate is a quality issue, not a blocking defect.

---

## 8. Missing test coverage detection (Sessions 3 and 5)

**Decision:** Both Session 3 and Session 5 run a deterministic Python check that compares all Test-method requirement IDs in the SRS against describe blocks in the test files.

**Why this matters:** A requirement with `Verification = Test` in the SRS has no value without a test. ISO 62304 §5.6 requires every testable requirement to be verified. Claude's quality review prompt asks it to check this, but model-only checks are unreliable — Claude can miss requirements, especially when reviewing a large SRS.

**How it works:**
- Parse `FTM-SRS-001.md` for lines matching `| FTM-XX-NNN | ... | Test |`
- Parse describe block headers in both test files for `[FTM-XX-NNN]` patterns
- Report any requirement IDs in the first set but not the second

**Session 3 role:** Session 3 is the verification engineer. After filling stubs and running tests, if any Test-method requirement still has no describe block, Session 3 fails. This cannot happen silently.

**Session 5 role:** Injects a FAIL finding (ISO 62304 §5.6) and overrides the verdict to FAIL via the verdict consistency guard.

---

## 9. Verdict consistency guard (Session 5)

**Decision:** After the Claude call, Session 5 checks whether any finding has `severity = FAIL`. If so, the verdict is overridden to FAIL regardless of what Claude returned in the `verdict` field.

**Why:** On one occasion, Claude returned `"verdict": "PASS"` in the JSON but wrote "Verdict: ❌ FAIL — 3 blocking issues" in the `pr_comment` text. The script used the `verdict` field for the badge and the `add_closes_to_pr` call — so the PR would have been auto-linked to close the issue despite a FAIL verdict. The guard catches this self-contradiction deterministically.

---

## 10. Session 3's test fix loop never weakens assertions

**Decision:** The fix loop prompt in Session 3 contains explicit rules: "NEVER change what a test is asserting to match broken app behavior. NEVER weaken an assertion. NEVER change an expected value just because the app currently returns something different."

**Why:** When a test fails because the *app* doesn't meet a requirement, the naive fix is to update the test's expected value to match what the app actually returns. This silently converts a failing test into a passing test that no longer verifies the requirement. The fix loop distinguishes between test *authoring* errors (wrong selector, missing await, wrong value format) and app *bugs* (requirement not implemented). Only authoring errors are fixed; app bugs are reported and left as failures.

---

## 11. Diff-based reviews can misread deleted lines

**Known limitation:** Sessions 4 and 5 read the diff against `main`, not the full branch state. This means:
- Deleted lines (prefixed `-`) can be misread as current content
- Files that existed before the branch and weren't modified are invisible to the review
- A change that removes three blocks and relies on a fourth pre-existing block looks like "all blocks removed, nothing added"

**Impact:** During the W5 cleanup (Issue #47), Sessions 4, 5, and the automated PR review all concluded that `FTM-FR-033` had zero test coverage after the deletions — because the canonical block at line 553 was pre-existing and invisible in the diff.

**Mitigation:** The deterministic missing-coverage check in Sessions 3 and 5 reads the actual file state, not the diff. So even if Claude misreads the diff, the code-level check provides an accurate verdict.
