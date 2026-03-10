"""
SDLC Session 2 — Code Implementation
Triggered by the 'code-ready' label on a GitHub issue.

Reads the issue + SRS + current code, calls Claude to produce targeted
file replacements, then applies them to disk for the workflow to commit and PR.

After applying replacements, runs a two-layer self-critique:
  Layer 1 — Python pre-checks (deterministic regex, blocks pipeline on critical issues)
  Layer 2 — LLM critique (up to 2 rounds, catches semantic issues)

Then maintains unit tests (__tests__/) and runs npm test in a fix loop:
  - If tests fail, Claude reviews the output and fixes code or tests
  - Up to 2 fix rounds; if still failing, pipeline aborts (sys.exit 1)
  - Commit only happens after all tests are green
"""

import os
import re
import sys
import json
import subprocess
import anthropic

# ── helpers ───────────────────────────────────────────────────────────────────

def extract_json(text, message=None):
    """Extract and parse JSON from Claude's response, repairing common issues."""
    # Search for { followed by whitespace then a quote — skips { inside code blocks
    match = re.search(r'\{[\s\n]*"', text)
    if not match:
        raise ValueError(f"No JSON found in response:\n{text[:500]}")
    start = match.start()
    end   = text.rfind('}') + 1
    if end <= start:
        raise ValueError(f"No JSON found in response:\n{text[:500]}")
    json_str = text[start:end]
    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        pass
    cleaned = re.sub(r'//[^\n]*', '', json_str)
    cleaned = re.sub(r',\s*([}\]])', r'\1', cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        stop = message.stop_reason if message else 'unknown'
        print(f"JSON parse error after repair attempt: {e}")
        print(f"stop_reason: {stop}, response length: {len(text)}")
        print(f"First 500 chars of extracted JSON:\n{json_str[:500]}")
        raise

def read_file(path, max_chars=None):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        return content[:max_chars] if max_chars else content
    except FileNotFoundError:
        return ''

def write_file(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True) if os.path.dirname(path) else None
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def apply_replacement(file_path, old_string, new_string):
    content = read_file(file_path)
    if not content:
        raise FileNotFoundError(f"File not found: {file_path}")
    if old_string not in content:
        raise ValueError(f"old_string not found in {file_path}:\n{old_string[:200]}")
    updated = content.replace(old_string, new_string, 1)
    write_file(file_path, updated)
    print(f"Patched {file_path}")

# ── context ───────────────────────────────────────────────────────────────────

issue_number = os.environ['ISSUE_NUMBER']
issue_title  = os.environ['ISSUE_TITLE']
issue_body   = os.environ.get('ISSUE_BODY', '') or '(no description provided)'

srs_content   = read_file('FTM-SRS-001.md', max_chars=8000)
index_html    = read_file('index.html', max_chars=30000)
moon_logic_js = read_file('src/moonLogic.js', max_chars=10000)

# ── prompt ────────────────────────────────────────────────────────────────────

prompt = f"""You are a senior JavaScript developer implementing a change for the "Find the Moon" \
web application — a single-page browser app (index.html + src/moonLogic.js) that shows users \
where the moon is. It is intended for general public use including children.

A GitHub issue is ready for code implementation:

Issue #{issue_number}: {issue_title}
{issue_body}

--- Current SRS requirements (for context on what must be satisfied) ---
{srs_content}

--- Current index.html (first 30 000 chars) ---
{index_html}

--- Current src/moonLogic.js (first 10 000 chars) ---
{moon_logic_js}

Your task:
Implement the changes required by the issue. Follow these rules:
- Match the existing code style exactly (indentation, quotes, naming conventions)
- Make the smallest change that fully satisfies the issue — do not refactor unrelated code
- Do not add comments or docstrings to code you did not change
- Do not introduce new dependencies
- If the fix is only in index.html, leave moonLogic.js empty. Vice versa.
- Do NOT generate, compute, or guess any cryptographic hash values (SHA-256, SHA-384, SHA-512, etc.). If a hash is required, insert a TODO placeholder such as `TODO: compute and insert correct hash` so the human reviewer knows to fill it in.

Return ONLY a valid JSON object — no markdown fences, no preamble — with exactly these keys:
{{
  "replacements": [
    {{
      "file": "index.html or src/moonLogic.js",
      "old_string": "exact verbatim string to find in the file",
      "new_string": "exact replacement string"
    }}
  ],
  "pr_summary": "2–3 sentence description of what was changed and why"
}}

The replacements array may contain multiple entries if changes span multiple locations.
Each old_string must be unique enough in the file to identify exactly one location.
If no code changes are needed, return an empty replacements array.
"""

# ── call Claude ───────────────────────────────────────────────────────────────

client = anthropic.Anthropic()

message = client.messages.create(
    model='claude-sonnet-4-6',
    max_tokens=8192,
    messages=[{'role': 'user', 'content': prompt}],
)

response_text = message.content[0].text
data = extract_json(response_text, message)

# ── apply replacements ────────────────────────────────────────────────────────

replacements = data.get('replacements', [])
if not replacements:
    print("No code changes needed for this issue.")
else:
    for r in replacements:
        apply_replacement(r['file'], r['old_string'], r['new_string'])

# ── layer 1: python pre-checks ────────────────────────────────────────────────
# Deterministic regex scans on every new_string. Does not rely on the LLM.
# Fabricated hash → hard block (sys.exit). TODO leftover → warning in PR body.

SRI_HASH_RE = re.compile(r'integrity=["\']sha(256|384|512)-[A-Za-z0-9+/]{20,}')
TODO_RE      = re.compile(r'TODO', re.IGNORECASE)

todos_remaining  = []  # files with TODO placeholders still present
fabricated_hashes = [] # files where a hash appeared in new_string but not old_string

for r in replacements:
    new_str = r.get('new_string', '')
    old_str = r.get('old_string', '')
    file    = r.get('file', '')

    # Fabricated hash: SRI hash in new_string that wasn't already in old_string
    if SRI_HASH_RE.search(new_str) and not SRI_HASH_RE.search(old_str):
        fabricated_hashes.append(file)

    # TODO leftover
    if TODO_RE.search(new_str):
        todos_remaining.append(file)

if fabricated_hashes:
    print(f"❌ FABRICATED HASH DETECTED in: {', '.join(set(fabricated_hashes))}")
    print("Session 2 generated a cryptographic hash value instead of a TODO placeholder.")
    print("This is a critical error. Aborting before commit.")
    sys.exit(1)

if todos_remaining:
    print(f"⚠️  TODO placeholder(s) found in: {', '.join(set(todos_remaining))}")
    print("These will be flagged in the PR body for human action before merge.")

# ── layer 2: llm self-critique loop ───────────────────────────────────────────
# Up to 2 rounds. Each round re-reads the modified files fresh from disk,
# asks Claude to look for specific defect categories, and applies any fixes.

MAX_CRITIQUE_ROUNDS = 2
critique_summaries  = []

for round_num in range(1, MAX_CRITIQUE_ROUNDS + 1):
    print(f"\nSelf-critique round {round_num}...")

    index_html_after    = read_file('index.html', max_chars=30000)
    moon_logic_js_after = read_file('src/moonLogic.js', max_chars=10000)

    # Format the replacements list so Claude knows exactly what changed
    replacements_summary = '\n'.join(
        f"  [{i+1}] file={r['file']}\n"
        f"      old_string (first 120 chars): {r.get('old_string','')[:120]!r}\n"
        f"      new_string (first 120 chars): {r.get('new_string','')[:120]!r}"
        for i, r in enumerate(replacements)
    ) or '  (none — no replacements were applied)'

    critique_prompt = f"""You are a senior JavaScript developer reviewing AI-generated code changes \
for the "Find the Moon" web app.

Issue being implemented: #{issue_number} — {issue_title}

The following replacements were just applied to the codebase:
{replacements_summary}

Review ONLY the changed regions (new_string values above) in the context of the full files below.
Check for these specific defect categories — nothing else:

1. BROKEN DOM REFERENCES (in new_string regions only)
   - `getElementById('X')` where `id="X"` does not appear anywhere in index.html
   - `querySelector('.X')` or `querySelector('#X')` referencing a class/ID not in index.html
   - `getElementsByClassName('X')` where class X does not appear in index.html

2. FABRICATED SRI HASHES
   - Any `integrity="sha256-..."` / `sha384-...` / `sha512-...` in a new_string where
     the corresponding old_string did NOT already contain the same attribute
   - Fix: replace with `integrity="TODO: compute correct SHA-512 hash before merging"`

3. SECURITY REGRESSIONS (new code only)
   - `element.innerHTML = ` followed by a variable (not a string literal) — XSS risk
   - `document.write(` — any occurrence
   - `eval(` — any occurrence
   - `new Function(` — any occurrence

4. JS SYNTAX ERRORS (in new_string regions only)
   - Template literal opened with backtick but no matching closing backtick in same region
   - `{{` count ≠ `}}` count within a new_string block (imbalanced braces)
   - `async function` or `async (` introduced in new code where call site in old_string
     did NOT use `await` — silent Promise ignored

5. SCOPE CREEP
   - new_string more than 3× longer than old_string with changes clearly outside the
     stated issue scope (flag for human review — do NOT auto-fix, just note in summary)

DO NOT flag: code style, spacing, quote style, or anything in existing unchanged code.
DO NOT generate or fill in cryptographic hash values — use TODO placeholders only.
DO NOT suggest refactoring or improvements.

--- Current index.html (post-patch) ---
{index_html_after}

--- Current src/moonLogic.js (post-patch) ---
{moon_logic_js_after}

If you find NO defects, return:
{{"fixes": [], "critique_summary": "No defects found."}}

If you find defects, return:
{{
  "fixes": [
    {{
      "file": "index.html or src/moonLogic.js",
      "old_string": "exact verbatim text to replace",
      "new_string": "corrected replacement"
    }}
  ],
  "critique_summary": "brief description of each defect found and fixed"
}}

Return ONLY valid JSON — no markdown fences, no preamble.
"""

    critique_msg = client.messages.create(
        model='claude-sonnet-4-6',
        max_tokens=4096,
        messages=[{'role': 'user', 'content': critique_prompt}],
    )

    critique_text = critique_msg.content[0].text
    critique_data = extract_json(critique_text, critique_msg)

    summary = critique_data.get('critique_summary', '')
    fixes   = critique_data.get('fixes', [])
    critique_summaries.append(f"Round {round_num}: {summary}")
    print(f"Critique: {summary}")

    if not fixes:
        print("No defects found — stopping critique loop.")
        break

    for fix in fixes:
        apply_replacement(fix['file'], fix['old_string'], fix['new_string'])
    print(f"Applied {len(fixes)} fix(es) from critique round {round_num}.")

# ── unit test maintenance ─────────────────────────────────────────────────────
# After code changes and self-critique, ask Claude whether any unit tests in
# __tests__/ need to be added or updated to cover the new behaviour.

unit_test_summary = 'Not run (no code replacements were applied).'

if replacements:
    unit_tests = {
        '__tests__/compass.test.js':      read_file('__tests__/compass.test.js',      max_chars=6000),
        '__tests__/moonPhase.test.js':    read_file('__tests__/moonPhase.test.js',    max_chars=6000),
        '__tests__/moonPosition.test.js': read_file('__tests__/moonPosition.test.js', max_chars=8000),
        '__tests__/theme.test.js':        read_file('__tests__/theme.test.js',        max_chars=6000),
        '__tests__/tilt.test.js':         read_file('__tests__/tilt.test.js',         max_chars=4000),
        '__tests__/zipCode.test.js':      read_file('__tests__/zipCode.test.js',       max_chars=6000),
    }

    unit_test_files_block = '\n\n'.join(
        f"--- {path} ---\n{content}" for path, content in unit_tests.items() if content
    )

    replacements_for_prompt = '\n'.join(
        f"  [{i+1}] file={r['file']}\n"
        f"      old_string (first 150 chars): {r.get('old_string','')[:150]!r}\n"
        f"      new_string (first 150 chars): {r.get('new_string','')[:150]!r}"
        for i, r in enumerate(replacements)
    )

    unit_test_prompt = f"""You are a senior JavaScript developer maintaining the unit test suite \
for the "Find the Moon" web application.

The following code changes were just applied to the codebase for issue #{issue_number}: {issue_title}

{issue_body}

--- Code changes applied ---
{replacements_for_prompt}

--- Relevant SRS requirements ---
{srs_content}

--- Existing unit test files (__tests__/) ---
{unit_test_files_block}

Your task: determine whether the code changes above require any additions or updates to the
unit tests in __tests__/. The unit tests cover the pure JS logic in src/moonLogic.js.

Rules:
- Add new test cases or describe blocks ONLY for new functions, new branches, or new behaviour
  introduced by this issue
- Update existing tests ONLY if the code change alters the expected output of an already-tested
  function
- Do NOT modify tests that are unaffected by this change
- Match the existing test style exactly — same 'use strict', same require pattern, same
  describe/it structure, same mock approach (jest.spyOn on SunCalc methods)
- Tests must be deterministic: mock all SunCalc calls, no real network, no real GPS, no real time
- Do not add new imports or dependencies not already in the file
- If the code change is only in index.html (UI/DOM) with no logic changes to moonLogic.js,
  return an empty replacements array — unit tests cover logic, not DOM

Return ONLY a valid JSON object — no markdown fences, no preamble:
{{
  "replacements": [
    {{
      "file": "__tests__/moonPosition.test.js (or whichever file)",
      "old_string": "exact verbatim anchor text to replace or append after",
      "new_string": "updated or appended test content"
    }}
  ],
  "unit_test_summary": "1-2 sentences describing what tests were added/updated, or why none were needed"
}}

If no unit test changes are needed, return an empty replacements array.
"""

    print("\nRunning unit test maintenance check...")
    ut_message = client.messages.create(
        model='claude-sonnet-4-6',
        max_tokens=4096,
        messages=[{'role': 'user', 'content': unit_test_prompt}],
    )

    ut_text = ut_message.content[0].text
    ut_data = extract_json(ut_text, ut_message)

    unit_test_summary = ut_data.get('unit_test_summary', '')
    ut_replacements   = ut_data.get('replacements', [])

    if not ut_replacements:
        print(f"Unit tests: {unit_test_summary}")
    else:
        for r in ut_replacements:
            apply_replacement(r['file'], r['old_string'], r['new_string'])
        print(f"Applied {len(ut_replacements)} unit test change(s): {unit_test_summary}")

# ── unit test fix loop ────────────────────────────────────────────────────────
# Run npm test before the commit. If tests fail, ask Claude to fix the code
# or tests, then re-run. Up to MAX_TEST_FIX_ROUNDS rounds. If still failing
# after max rounds, abort — a broken build never lands on the branch.

MAX_TEST_FIX_ROUNDS = 2
test_loop_summary   = 'All unit tests passed on first run.'

def run_npm_test():
    """Run npm test, return (passed: bool, output: str)."""
    result = subprocess.run(
        ['npm', 'test', '--', '--forceExit'],
        capture_output=True, text=True
    )
    output = (result.stdout + result.stderr).strip()
    return result.returncode == 0, output

passed, test_output = run_npm_test()

if not passed:
    print(f"\n⚠️  npm test failed. Entering test fix loop (max {MAX_TEST_FIX_ROUNDS} rounds)...")
    test_loop_summary = 'Tests failed after code changes.'

    for fix_round in range(1, MAX_TEST_FIX_ROUNDS + 1):
        print(f"\nTest fix round {fix_round}...")

        # Re-read all relevant files fresh from disk
        index_html_current    = read_file('index.html', max_chars=20000)
        moon_logic_current    = read_file('src/moonLogic.js', max_chars=10000)
        unit_tests_current    = {
            '__tests__/compass.test.js':      read_file('__tests__/compass.test.js',      max_chars=5000),
            '__tests__/moonPhase.test.js':    read_file('__tests__/moonPhase.test.js',    max_chars=5000),
            '__tests__/moonPosition.test.js': read_file('__tests__/moonPosition.test.js', max_chars=6000),
            '__tests__/theme.test.js':        read_file('__tests__/theme.test.js',        max_chars=5000),
            '__tests__/tilt.test.js':         read_file('__tests__/tilt.test.js',         max_chars=3000),
            '__tests__/zipCode.test.js':      read_file('__tests__/zipCode.test.js',       max_chars=5000),
        }
        unit_tests_block = '\n\n'.join(
            f"--- {p} ---\n{c}" for p, c in unit_tests_current.items() if c
        )

        # Trim test output to most useful part (last 4000 chars has the failure summary)
        trimmed_output = test_output[-4000:] if len(test_output) > 4000 else test_output

        test_fix_prompt = f"""You are a senior JavaScript developer. The unit test suite for \
the "Find the Moon" web app is failing after code changes were applied for issue \
#{issue_number}: {issue_title}

--- Failing test output ---
{trimmed_output}

--- Current src/moonLogic.js ---
{moon_logic_current}

--- Current unit test files ---
{unit_tests_block}

Your task: fix the failures by fixing the SOURCE CODE. Follow these rules strictly:
- ALWAYS fix src/moonLogic.js or index.html first. A failing test means the code is wrong.
- NEVER modify an existing test to make it pass. Tests are the source of truth.
- The ONE exception: a test that was added earlier in THIS same session (it will be obvious
  because it tests behaviour introduced by this exact issue) may be corrected if it contains
  a factual error in the assertion logic itself (e.g. wrong expected value due to a math
  mistake in the test). Even then, only fix the assertion value — never delete or weaken
  the test.
- If you cannot fix the code to satisfy the test, return an empty replacements array and
  explain why in fix_summary — do NOT touch the test as a workaround.
- Make the minimal change to get the tests passing
- Do not refactor, do not add new tests, do not change passing tests
- Match existing code style exactly

Return ONLY a valid JSON object — no markdown fences, no preamble:
{{
  "replacements": [
    {{
      "file": "src/moonLogic.js, index.html, or __tests__/somefile.test.js",
      "old_string": "exact verbatim text to replace",
      "new_string": "fixed replacement"
    }}
  ],
  "fix_summary": "brief description of what was broken and how it was fixed"
}}

If you cannot determine a safe fix, return an empty replacements array with an explanation
in fix_summary — do NOT guess.
"""

        fix_msg = client.messages.create(
            model='claude-sonnet-4-6',
            max_tokens=4096,
            messages=[{'role': 'user', 'content': test_fix_prompt}],
        )

        fix_data = extract_json(fix_msg.content[0].text, fix_msg)
        fix_summary  = fix_data.get('fix_summary', '')
        test_fixes   = fix_data.get('replacements', [])

        print(f"Fix suggestion: {fix_summary}")

        if not test_fixes:
            print("Claude could not determine a safe fix — aborting.")
            print(f"Last test output:\n{trimmed_output}")
            sys.exit(1)

        for fix in test_fixes:
            apply_replacement(fix['file'], fix['old_string'], fix['new_string'])

        passed, test_output = run_npm_test()
        if passed:
            test_loop_summary = f"Tests fixed in round {fix_round}: {fix_summary}"
            print(f"✅ All unit tests passing after fix round {fix_round}.")
            break
        else:
            print(f"Tests still failing after fix round {fix_round}.")

    if not passed:
        print(f"\n❌ Unit tests still failing after {MAX_TEST_FIX_ROUNDS} fix rounds. Aborting.")
        print(f"Last test output:\n{test_output[-2000:]}")
        sys.exit(1)

# ── write PR body ─────────────────────────────────────────────────────────────

pr_summary = data.get('pr_summary', f'Code implementation for issue #{issue_number}.')

files_changed = list({r['file'] for r in replacements})
changes = [f"- Modified `{f}`" for f in sorted(files_changed)] if files_changed else ["- No code changes required"]

# Build critique audit trail section
critique_trail = '\n'.join(f"- {s}" for s in critique_summaries) if critique_summaries else "- Not run (no replacements applied)"

# Build TODO warning checklist items (blocking)
todo_items = ''
if todos_remaining:
    todo_files = ', '.join(f'`{f}`' for f in sorted(set(todos_remaining)))
    todo_items = f"""
## ⚠️ Human Action Required Before Merging
- [ ] Compute and insert the correct cryptographic hash in {todo_files} — a TODO placeholder was left by the code generation step. Do not merge until this is resolved.
"""

pr_body = f"""## SDLC Session 2: Code Implementation

## Summary
{pr_summary}

## Changes
{chr(10).join(changes)}

## Self-Critique
{critique_trail}

## Unit Tests
- Maintenance: {unit_test_summary}
- Result: {test_loop_summary}

## Review checklist
- [ ] Code matches existing style and conventions
- [ ] Change is minimal — no unrelated refactoring
- [ ] All requirements from the SRS are satisfied
- [ ] No new dependencies introduced
{todo_items}
🤖 Generated by SDLC Session 2 GitHub Action
"""

write_file('.github/sdlc_pr_body.md', pr_body)
print("Done.")
