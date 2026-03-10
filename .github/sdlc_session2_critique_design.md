# Design: Self-Critique Loop for SDLC Session 2
*v2 — updated after self-review*

## Background

Session 2 generates `{file, old_string, new_string}` replacements to implement a GitHub issue
in `index.html` and/or `src/moonLogic.js`. The known failure modes discovered during pipeline
development:

| Failure | Example | Impact |
|---|---|---|
| Fabricated SRI hash (no TODO) | Plausible-looking `sha384-abc...` that was just invented | Security — wrong hash silently deployed |
| TODO placeholder left in output | `integrity="TODO: compute hash"` shipped to branch | Feature incomplete |
| Broken DOM reference | `getElementById('zipBtn')` but ID is `zip-btn` | Runtime error |
| JS syntax error | Unclosed bracket, unmatched backtick | App crash |
| `async` added, caller not awaited | Promise silently ignored | Silent logic failure |
| Security regression | `element.innerHTML = userInput` | XSS |
| Scope creep | Rewrites adjacent functions | Review noise, merge conflicts |

> **Note:** The fabricated-hash failure is the highest-priority case and the direct motivation
> for this feature. The original failure produced a *plausible-looking* hash — no TODO — so
> the generation-step guard ("do not generate hashes, use TODO") was insufficient alone.
> This critique must explicitly catch the case where a hash appears in `new_string` but not
> in the corresponding `old_string`.

---

## Two-layer defense

The critique uses two complementary mechanisms:

### Layer 1 — Python pre-checks (deterministic, run before any LLM call)

After applying replacements, scan `new_string` values in Python:

```python
SRI_HASH_RE = re.compile(r'integrity=["\']sha(256|384|512)-[A-Za-z0-9+/]{20,}')
TODO_RE = re.compile(r'TODO', re.IGNORECASE)

for r in replacements:
    new = r['new_string']
    old = r.get('old_string', '')
    # Flag fabricated hash: hash in new_string that wasn't already in old_string
    if SRI_HASH_RE.search(new) and not SRI_HASH_RE.search(old):
        print(f"⚠️  FABRICATED HASH DETECTED in {r['file']} — aborting")
        sys.exit(1)
    # Flag leftover TODOs
    if TODO_RE.search(new):
        print(f"⚠️  TODO placeholder found in {r['file']} — will flag in PR body")
        todos_remaining.append(r['file'])
```

### Layer 2 — LLM critique (semantic, catches what regex can't)

Focused second Claude call. Runs up to 2 rounds, stops early when `fixes` is empty.

---

## Defect categories for LLM critique

The prompt lists these **specific, concrete patterns** (matching the specificity of Session 3's
critique prompt, which lists exact API misuse patterns):

**DOM references (in new_string regions only):**
- `getElementById('X')` where `id="X"` does not appear anywhere in index.html
- `querySelector('.X')` where `class="X"` (or `class="... X ..."`) does not appear in index.html
- `getElementsByClassName('X')` where `X` does not appear as a class in index.html

**SRI hashes (critical):**
- Any `integrity="sha256-..."` / `sha384-...` / `sha512-...` appearing in a `new_string` where
  the corresponding `old_string` did NOT already contain the same attribute → **flag as
  fabricated hash**, replace with `integrity="TODO: compute correct SHA-512 hash before merging"`

**Security patterns (new code only):**
- `element.innerHTML = ` followed by a variable (not a string literal) → flag as XSS risk
- `document.write(` → flag
- `eval(` → flag
- `new Function(` → flag

**JS syntax patterns:**
- Backtick opens a template literal in `new_string` with no matching closing backtick
- `{` count ≠ `}` count within the `new_string` block (imbalanced braces)
- `async function` or `async (` introduced in new code, where the call site in `old_string`
  did not use `await`

**Scope creep:**
- `new_string` is substantially longer than `old_string` (> 3× length) with changes outside
  the lines directly required by the issue → flag for human review (do not auto-fix)

**Do NOT flag:**
- Code style, spacing, quote style
- Existing code outside the changed regions
- Hash values that need to be computed (flag only; do not fill in)

---

## What the critique does NOT do

- Does not generate cryptographic hashes
- Does not refactor or improve working code
- Does not check requirement completeness (that's Session 5's job)
- Does not re-check existing code that wasn't touched

---

## Context provided to the critique prompt

1. Issue title + body
2. **SRS requirements** (needed for light requirement-alignment check) — `max_chars=8000`
3. The **complete list of replacements just applied** (so Claude knows old vs new precisely)
4. The **full modified index.html** — re-read from disk, same `max_chars=30000` cap
5. The **full modified moonLogic.js** — re-read from disk, same `max_chars=10000` cap

> The SRS was missing from the original design v1. Including it enables Claude to check whether
> the generated code aligns with the stated requirement at all — a light completeness check.

---

## Output format

Same as Session 3:

```json
{
  "fixes": [
    {
      "file": "index.html or src/moonLogic.js",
      "old_string": "exact verbatim text",
      "new_string": "corrected text"
    }
  ],
  "critique_summary": "brief description of what was found and fixed"
}
```

If no defects: `{"fixes": [], "critique_summary": "No defects found."}`

---

## Rounds and termination

- **Max rounds**: 2
- **Early exit**: if `fixes` is empty, stop immediately
- After max rounds, pipeline continues (does not block) — downstream safeguards are Session 4
  (security) and Session 5 (quality)
- **Exception**: Python pre-check Layer 1 DOES exit with code 1 on fabricated hash detection,
  blocking the commit

---

## PR body changes

Two additions to the PR body template:

1. **Critique audit trail** (unconditional): a "Self-Critique" section listing what each round
   found, even if it's "No defects found." Provides traceability.

2. **TODO warning** (conditional): if `todos_remaining` is non-empty after Layer 1 checks, the
   PR body gets a blocking checklist item:
   ```
   - [ ] ⚠️ HUMAN ACTION REQUIRED: compute and insert correct hash in `index.html` before merging
   ```
   This is a checklist item, not prose, so it can't be accidentally ignored.

---

## Integration point in sdlc_session2.py

```
[existing: generate replacements via Claude]
[existing: apply replacements]
[NEW: Layer 1 Python pre-checks — regex scan for hashes and TODOs]
  → fabricated hash detected? sys.exit(1)
  → TODO found? add to todos_remaining list
[NEW: Layer 2 LLM critique round 1]
  → re-read modified files from disk
  → call Claude with critique prompt
  → apply fixes (if any)
[NEW: Layer 2 LLM critique round 2 (only if round 1 had fixes)]
  → re-read modified files from disk
  → call Claude with critique prompt
  → apply fixes (if any), then stop
[existing: write PR body — augmented with critique audit trail and TODO warnings]
```

---

## Key differences from Session 3 critique

| | Session 2 critique | Session 3 critique |
|---|---|---|
| Files reviewed | index.html, moonLogic.js | verification.test.js, verification.spec.js |
| Python pre-checks | Yes (hash regex, TODO scan) | No |
| Primary LLM concern | DOM refs, security, syntax, fabricated hashes | Jest/Playwright API syntax |
| Pipeline blocking | Yes on fabricated hash (sys.exit) | No |
| Rounds | 2 | 2 |
| SRS provided to prompt | Yes | No |

---

## Token budget

- Critique prompt: ~25k input tokens × 2 rounds × (up to) 2 runs per issue = modest
- `max_tokens=4096` for critique response (fixes are small)
