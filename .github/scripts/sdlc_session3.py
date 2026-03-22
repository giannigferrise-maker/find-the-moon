"""
SDLC Session 3 — Verification Engineering
Triggered by the '3-tests-ready' label on a GitHub issue.

Reads the Session 1 requirements delta + full SRS, independently decides what
verification tests are needed for the new/changed requirements, writes complete
working tests (not stubs), and writes VTM entries for those requirements.

Intentionally does NOT read implementation code — tests are written against
requirements, not against what the code happens to do today.

Verification ownership is fully separate from requirements (Session 1). Session 1
writes ONLY requirements; Session 3 owns ALL verification: tests and VTM.
"""

import os
import re
import json
import subprocess
import anthropic

# ── helpers ───────────────────────────────────────────────────────────────────

def fix_control_chars(s):
    """Replace literal control characters inside JSON string values with escape sequences."""
    result = []
    in_string = False
    i = 0
    while i < len(s):
        c = s[i]
        if c == '\\' and in_string:
            result.append(c)
            i += 1
            if i < len(s):
                result.append(s[i])
            i += 1
            continue
        if c == '"':
            in_string = not in_string
            result.append(c)
        elif in_string and c == '\n':
            result.append('\\n')
        elif in_string and c == '\r':
            result.append('\\r')
        elif in_string and c == '\t':
            result.append('\\t')
        else:
            result.append(c)
        i += 1
    return ''.join(result)

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
    cleaned = fix_control_chars(cleaned)
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
        if max_chars and len(content) > max_chars:
            print(f"WARNING: {path} is {len(content)} chars but limit is {max_chars} — content truncated. Consider raising the limit.")
        return content[:max_chars] if max_chars else content
    except FileNotFoundError:
        return ''

def append_to_file(path, text):
    if not text.strip():
        return
    with open(path, 'a', encoding='utf-8') as f:
        f.write('\n\n' + text.strip() + '\n')

def write_file(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True) if os.path.dirname(path) else None
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def apply_fix_replacement(file_path, old_string, new_string):
    """Apply a fix replacement in the test-failure repair loop."""
    content = read_file(file_path)
    if not content:
        raise FileNotFoundError(f"File not found: {file_path}")
    if old_string not in content:
        raise ValueError(f"old_string not found in {file_path}:\n{old_string[:200]}")
    updated = content.replace(old_string, new_string, 1)
    write_file(file_path, updated)
    print(f"Fix applied: {file_path}")

def run_command(cmd):
    """Run a shell command; return (returncode, combined stdout+stderr)."""
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.returncode, result.stdout + result.stderr

def get_covered_req_ids(*paths):
    """Return set of requirement IDs that already have at least one describe block."""
    id_re = re.compile(r'\[FTM-[A-Z]+-\d+\]')
    covered = set()
    for path in paths:
        for line in read_file(path).splitlines():
            if 'test.describe(' in line or 'describe(' in line:
                for req_id in id_re.findall(line):
                    covered.add(req_id.strip('[]'))
    return covered

def strip_covered_tests(code, covered_ids):
    """Remove test.describe / describe blocks whose requirement ID is already in covered_ids.

    Hard guardrail: Session 3 must not add duplicate test blocks for requirements
    that already have coverage, regardless of what the model produces.
    """
    if not code or not covered_ids:
        return code
    lines = code.splitlines(keepends=True)
    result = []
    skip_depth = 0
    for line in lines:
        if skip_depth == 0:
            if any(cid in line for cid in covered_ids) and (
                'test.describe(' in line or 'describe(' in line
            ):
                skip_depth = 1
                continue
        if skip_depth > 0:
            skip_depth += line.count('{') - line.count('}')
            if skip_depth <= 0:
                skip_depth = 0
            continue
        result.append(line)
    stripped = ''.join(result)
    if stripped != code:
        removed = [cid for cid in covered_ids if cid in code]
        print(f"Stripped already-covered test blocks: {removed}")
    return stripped

# ── context ───────────────────────────────────────────────────────────────────

issue_number = os.environ['ISSUE_NUMBER']
issue_title  = os.environ['ISSUE_TITLE']
issue_body   = os.environ.get('ISSUE_BODY', '') or '(no description provided)'

srs_content          = read_file('FTM-SRS-001.md', max_chars=20000)
srs_delta            = read_file('.github/sdlc_session1_delta.md', max_chars=8000)
test_guide           = read_file('FTM-TEST-GUIDE.md', max_chars=8000)
jest_tests           = read_file('__tests_verify__/verification.test.js', max_chars=30000)
playwright_tests     = read_file('__tests_verify__/verification.spec.js', max_chars=30000)
traceability_content = read_file('traceability-matrix.txt', max_chars=40000)

# Determine which requirement IDs already have test coverage — passed to Claude
# so it doesn't write duplicate test blocks, and used as a code-level guardrail.
already_covered = sorted(get_covered_req_ids(
    '__tests_verify__/verification.test.js',
    '__tests_verify__/verification.spec.js',
))

# ── prompt ────────────────────────────────────────────────────────────────────

prompt = f"""You are a verification engineer for the "Find the Moon" web application — \
a browser-based tool showing users where the moon is, intended for general public use \
including children.

A GitHub issue has been through requirements (Session 1) and code implementation (Session 2). \
Your job is to write complete, working verification tests for the requirements that were \
added or changed in this issue, and to write the corresponding Verification Traceability \
Matrix (VTM) entries.

Issue #{issue_number}: {issue_title}
{issue_body}

--- Session 1 Requirements Delta (primary verification target) ---
{srs_delta}

--- Full SRS for broader context ---
{srs_content}

--- Verification Engineer's Test Guide (element IDs, DOM facts, mock patterns, known pitfalls) ---
{test_guide}

--- Current verification.test.js (Jest — logic layer, no browser) ---
{jest_tests}

--- Current verification.spec.js (Playwright — browser/UI layer) ---
{playwright_tests}

--- Current traceability-matrix.txt (VTM) ---
{traceability_content}

--- Requirement IDs that already have test coverage (do NOT add tests for these) ---
{', '.join(already_covered) if already_covered else '(none — all requirements in the delta need tests)'}

Your tasks:
1. Identify which requirements from the Session 1 delta need new test coverage (exclude \
   already-covered IDs listed above).
2. For each requirement needing coverage, decide the appropriate test type:
   - Logic/calculation requirements → Jest (pure JS, no browser)
   - UI/DOM/visual requirements → Playwright (browser)
   - Some requirements may need both
3. Write complete, working test assertions (not stubs). Each new test block must:
   - Use a describe block named: "Requirement ID description [FTM-XX-NNN]"
   - Be placed in the correct file (Jest or Playwright)
   - Follow the exact style, indentation, and mock patterns of the existing tests in that file
4. Write VTM entries for each requirement you write tests for.
   - Format must match the existing VTM style exactly
   - Test Suite name must exactly match the describe block name you wrote
   - Test File must reference the correct file path
5. For requirements in the delta that have Method = Inspection (not Test), do NOT write \
   tests — these are verified by human review, not automation.

MINDSET — think like an adversary, not a confirmer:
- Your goal is NOT to write tests that pass against the current implementation. Your goal is
  to write tests that would FAIL if the requirement was violated or the feature was removed.
- For every test you write, ask yourself: "If a developer deleted the code implementing this
  requirement tomorrow, would my test catch it?" If the answer is no, the test provides no value.
- You have intentionally not seen the implementation — write tests from the requirement alone.
  Do not assume anything about how the feature is built; test the observable behavior.

CORRECTNESS:
- Use the Test Guide for correct element IDs, selectors, color formats, and known pitfalls
- Tests must be deterministic — no real network calls, no real GPS, no real time
- Jest tests: use pure JS logic, no browser, mock external dependencies
- Playwright tests: use page mocks for SunCalc and network calls (follow existing mock patterns)
- Do not modify any existing passing tests
- Do not add new imports or dependencies not already in the file

Return ONLY a valid JSON object — no markdown fences, no preamble — with exactly these keys:
{{
  "jest_tests": "complete Jest test code to append to verification.test.js, or empty string",
  "playwright_tests": "complete Playwright test code to append to verification.spec.js, or empty string",
  "traceability_entries": "VTM entries to append to traceability-matrix.txt, or empty string",
  "summary": "1-2 sentence description of what tests were written"
}}

If there are no requirements in the delta that need new test coverage, return empty strings
for jest_tests, playwright_tests, and traceability_entries.
"""

# ── call Claude ───────────────────────────────────────────────────────────────

client = anthropic.Anthropic()

message = client.messages.create(
    model='claude-sonnet-4-6',
    max_tokens=16000,
    messages=[{'role': 'user', 'content': prompt}],
)

response_text = message.content[0].text
data = extract_json(response_text, message)

# ── apply test additions (with coverage guardrail) ────────────────────────────

jest_code = strip_covered_tests(data.get('jest_tests', ''), already_covered)
if jest_code.strip():
    append_to_file('__tests_verify__/verification.test.js', jest_code)
    print("Updated verification.test.js")
else:
    print("No new Jest tests to add.")

pw_code = strip_covered_tests(data.get('playwright_tests', ''), already_covered)
if pw_code.strip():
    append_to_file('__tests_verify__/verification.spec.js', pw_code)
    print("Updated verification.spec.js")
else:
    print("No new Playwright tests to add.")

if data.get('traceability_entries', '').strip():
    append_to_file('traceability-matrix.txt', data['traceability_entries'])
    print("Updated traceability-matrix.txt")
else:
    print("No new VTM entries to add.")

print(data.get('summary', 'Done.'))

# ── Post-write: strip any residual corruption patterns ────────────────────────
# Occasionally the LLM embeds `});pyOn(` (corrupted jest.spyOn) or `});)', () => {`
# (corrupted test.describe opener) in its output. Strip them deterministically.

_CORRUPTION_RE = re.compile(
    r'(\}\);|\}\)\s*;)pyOn\([^\n]*\n(?:[ \t][^\n]*\n)*?[ \t]*\}\);?\n',
    re.MULTILINE
)
_DESCRIBE_FRAGMENT_RE = re.compile(r"(\}\);)(?:'\s*,\s*\(\)\s*=>\s*\{)+", re.MULTILINE)

for _test_file in ['__tests_verify__/verification.test.js', '__tests_verify__/verification.spec.js']:
    _content = read_file(_test_file)
    if not _content:
        continue
    _fixed = _CORRUPTION_RE.sub(r'', _content)
    _fixed = _DESCRIBE_FRAGMENT_RE.sub(r'\1', _fixed)
    if _fixed != _content:
        write_file(_test_file, _fixed)
        print(f"Post-process: stripped corruption patterns from {_test_file}")

# ── self-critique loop ────────────────────────────────────────────────────────
# After generating tests, ask Claude to review them for common mistakes and
# apply fixes. Runs up to MAX_CRITIQUE_ROUNDS rounds.

MAX_CRITIQUE_ROUNDS = 2

for round_num in range(1, MAX_CRITIQUE_ROUNDS + 1):
    print(f"\nSelf-critique round {round_num}...")

    jest_after       = read_file('__tests_verify__/verification.test.js', max_chars=30000)
    playwright_after = read_file('__tests_verify__/verification.spec.js', max_chars=30000)

    critique_prompt = f"""You are a senior test engineer reviewing freshly generated test code \
for the "Find the Moon" web application.

Review the two test files below for the following defects ONLY (ignore style preferences):

JEST defects to look for:
- `expect(value, "message")` — Jest does NOT support a second argument to `expect()`. \
  Remove any message argument.
- `describe(...)` used at top level instead of being inside a `describe` block — fine as-is, but \
  watch for nested `describe` calls that should be `it` or `test`.
- Missing `await` before async Playwright-style calls inside Jest (should not appear in Jest file).
- Orphaned closing braces `}}}}` or `}}` that don't match any open block.
- Lines containing `}});pyOn(` or `}});pyOn(` — corrupted `jest.spyOn` concatenated onto a closing \
  brace. Remove the entire orphaned fragment (everything from `pyOn(` through the next standalone \
  closing `}});` or `}}));`).

PLAYWRIGHT defects to look for:
- `describe(...)` instead of `test.describe(...)`.
- `it(...)` instead of `test(...)`.
- Missing `async` on test callbacks that use `await`.
- Missing `await` before `page.*` calls.
- Orphaned closing braces that don't match any open block.
- Lines like `}});)', () => {{` — corrupted `test.describe(` callback fragment on a closing brace. \
  Strip everything after the bare `}});`.

BOTH files:
- Unterminated strings or template literals.
- Any `TODO` that was supposed to be replaced but wasn't.

TEST ROBUSTNESS defects to look for (adversarial — ask "would this test catch a regression?"):
- Any test that reads an entire source file (e.g. index.html) and asserts on values anywhere \
  in that file, when the requirement only covers a specific function or section. Example: scanning \
  all rgba() values in index.html to verify constellation opacity — this passes even if the \
  constellation code is deleted, because other rgba values in the same range exist elsewhere. \
  Fix: scope the scan to the relevant function body (e.g. extract the drawConstellations() \
  function body first, then scan within it).
- Any test that checks innerHTML, textContent, or page.content() for strings that are drawn \
  on a canvas element. Canvas draw calls (fillText, arc, lineTo) leave no DOM trace — \
  innerHTML checks will pass even if the canvas rendering is broken or never runs. \
  Fix: use a canvas API spy injected via page.addInitScript() that records fillText/arc/lineTo \
  calls, then assert on those recorded calls.
- Any test that only verifies a DOM element exists or is attached, when the requirement is \
  about the content or behavior rendered inside that element. Presence ≠ correct rendering. \
  Fix: add an assertion on the element's content, computed style, or canvas draw calls.

--- verification.test.js ---
{jest_after}

--- verification.spec.js ---
{playwright_after}

If you find NO defects, return:
{{"fixes": [], "critique_summary": "No defects found."}}

If you find defects, return a JSON object with fix replacements:
{{
  "fixes": [
    {{
      "file": "__tests_verify__/verification.test.js or __tests_verify__/verification.spec.js",
      "old_string": "exact verbatim text to replace",
      "new_string": "corrected replacement"
    }}
  ],
  "critique_summary": "brief description of what was fixed"
}}

Return ONLY valid JSON — no markdown fences, no preamble.
"""

    critique_msg = client.messages.create(
        model='claude-sonnet-4-6',
        max_tokens=8192,
        messages=[{'role': 'user', 'content': critique_prompt}],
    )

    critique_text = critique_msg.content[0].text
    critique_data = extract_json(critique_text, critique_msg)

    fixes = critique_data.get('fixes', [])
    print(f"Critique: {critique_data.get('critique_summary', '')}")

    if not fixes:
        print("No defects found — stopping critique loop.")
        break

    applied_fixes = 0
    for fix in fixes:
        try:
            apply_fix_replacement(fix['file'], fix['old_string'], fix['new_string'])
            applied_fixes += 1
        except (ValueError, FileNotFoundError) as e:
            print(f"WARNING: Skipped critique fix — {e}")
    print(f"Applied {applied_fixes}/{len(fixes)} fix(es) from critique round {round_num}.")

# ── run tests + fix loop ──────────────────────────────────────────────────────
# Run Jest and Playwright. If either fails, ask Claude whether the failure is a
# test authoring mistake or an app bug. Fix only authoring mistakes; flag app bugs.
# Never weaken an assertion to make a test pass.

MAX_TEST_FIX_ROUNDS = 2

FIX_RULES = """STRICT RULES — read carefully before proposing any fix:
- Fix ONLY test authoring mistakes: wrong element IDs or selectors, missing await,
  wrong mock pattern, incorrect value format (e.g. browser returns 'rgb(168, 213, 162)'
  but test expects '#a8d5a2'), missing page.goto(), timeout too short, syntax error.
- NEVER change what a test is asserting to match broken app behavior.
- NEVER weaken an assertion (e.g. loosening a regex, removing an expect call).
- NEVER change an expected value just because the app currently returns something different.
- If a failure shows the APP is not meeting a requirement, record it in "app_bugs" and
  leave "fixes" empty for that failure. The app must be fixed in Session 2, not here."""

def run_fix_loop(suite_label, test_file, run_cmd, rc, output):
    passed = rc == 0
    print(f"\n{'✅' if passed else '❌'} {suite_label}: {'PASSED' if passed else 'FAILED'}")
    if passed:
        return True, output

    app_bugs_seen = []

    for fix_round in range(1, MAX_TEST_FIX_ROUNDS + 1):
        print(f"\n{suite_label} fix round {fix_round}...")
        test_content = read_file(test_file, max_chars=30000)

        fix_prompt = f"""You are a test engineer debugging a failing test suite for the \
"Find the Moon" web application.

{FIX_RULES}

--- Test failure output ---
{output[-4000:]}

--- {test_file} ---
{test_content}

Return ONLY valid JSON — no markdown fences, no preamble:
{{
  "fixes": [
    {{
      "file": "{test_file}",
      "old_string": "exact verbatim text to replace",
      "new_string": "corrected replacement"
    }}
  ],
  "app_bugs": ["describe each failure that is an app bug, not a test bug"],
  "summary": "brief description of changes"
}}
If there are no test authoring errors to fix, return:
{{"fixes": [], "app_bugs": ["..."], "summary": "No test authoring errors found."}}
"""
        fix_msg = client.messages.create(
            model='claude-sonnet-4-6',
            max_tokens=8192,
            messages=[{'role': 'user', 'content': fix_prompt}],
        )
        fix_data = extract_json(fix_msg.content[0].text, fix_msg)

        app_bugs = [b for b in fix_data.get('app_bugs', []) if b]
        if app_bugs:
            app_bugs_seen.extend(app_bugs)
            print(f"App bugs flagged: {app_bugs}")

        fixes = fix_data.get('fixes', [])
        if not fixes:
            print(f"No test authoring errors found — leaving {suite_label} failures as-is.")
            break

        applied = 0
        for fix in fixes:
            try:
                apply_fix_replacement(fix['file'], fix['old_string'], fix['new_string'])
                applied += 1
            except (ValueError, FileNotFoundError) as e:
                print(f"WARNING: Skipped fix — {e}")
        print(f"Applied {applied}/{len(fixes)} {suite_label} fix(es).")

        rc, output = run_command(run_cmd)
        passed = rc == 0
        print(f"{suite_label} after fix round {fix_round}: {'PASSED' if passed else 'FAILED'}")
        if passed:
            break

    return passed, output


print("\nRunning Jest tests...")
jest_rc, jest_output = run_command(
    'npx jest --config jest.verify.config.js --forceExit 2>&1')
jest_passed, jest_output = run_fix_loop(
    'Jest', '__tests_verify__/verification.test.js',
    'npx jest --config jest.verify.config.js --forceExit 2>&1',
    jest_rc, jest_output)

print("\nRunning Playwright tests...")
pw_rc, pw_output = run_command(
    'npx playwright test --config playwright.verify.config.js'
    ' __tests_verify__/verification.spec.js 2>&1')
pw_passed, pw_output = run_fix_loop(
    'Playwright', '__tests_verify__/verification.spec.js',
    'npx playwright test --config playwright.verify.config.js'
    ' __tests_verify__/verification.spec.js 2>&1',
    pw_rc, pw_output)

# ── duplicate test-ID check ───────────────────────────────────────────────────
# Scan both test files for describe blocks that reference the same requirement
# ID more than once. Fail the session if duplicates are found.

def find_duplicate_test_ids(*paths):
    from collections import Counter
    id_re = re.compile(r'\[FTM-[A-Z]+-\d+\]')
    counts = Counter()
    for path in paths:
        for line in read_file(path).splitlines():
            if 'test.describe(' in line or 'describe(' in line:
                for req_id in id_re.findall(line):
                    counts[req_id] += 1
    return sorted(req_id for req_id, n in counts.items() if n > 1)

duplicate_ids = find_duplicate_test_ids(
    '__tests_verify__/verification.test.js',
    '__tests_verify__/verification.spec.js',
)
if duplicate_ids:
    dup_list = ', '.join(duplicate_ids)
    print(f"\n❌ DUPLICATE TEST IDs DETECTED: {dup_list}")
    print("Each requirement ID must have exactly one test.describe block.")
    print("Consolidate duplicates before proceeding to Session 4.")

# ── missing test coverage check ───────────────────────────────────────────────
# Every requirement marked Test in the SRS must have at least one describe block
# in the test files.

def get_test_req_ids(srs_path):
    """Return set of requirement IDs whose Verification method is Test."""
    id_re = re.compile(r'\|\s*(FTM-[A-Z]+-\d+)\s*\|.*\|\s*Test\s*\|')
    return {m.group(1) for line in read_file(srs_path).splitlines()
            for m in [id_re.search(line)] if m}

missing_coverage = sorted(
    get_test_req_ids('FTM-SRS-001.md') -
    get_covered_req_ids('__tests_verify__/verification.test.js',
                        '__tests_verify__/verification.spec.js')
)
if missing_coverage:
    missing_list = ', '.join(missing_coverage)
    print(f"\n❌ MISSING TEST COVERAGE: {missing_list}")
    print("Every Test-method requirement must have at least one describe block.")
    print("Add tests for these requirements before proceeding to Session 4.")

# ── write summary for workflow PR comment ─────────────────────────────────────

all_passed = jest_passed and pw_passed and not duplicate_ids and not missing_coverage

summary_lines = [
    f"{'✅' if all_passed else '❌'} **SDLC Session 3 — Test Results**",
    "",
    f"- Jest (unit/logic):      {'✅ PASSED' if jest_passed else '❌ FAILED'}",
    f"- Playwright (browser/UI): {'✅ PASSED' if pw_passed else '❌ FAILED'}",
]

if duplicate_ids:
    dup_list = ', '.join(duplicate_ids)
    summary_lines += [
        f"- Duplicate test IDs:     ❌ FOUND ({dup_list})",
    ]

if missing_coverage:
    missing_list = ', '.join(missing_coverage)
    summary_lines += [
        f"- Missing test coverage:  ❌ FOUND ({missing_list})",
    ]

if not all_passed:
    summary_lines += [
        "",
        "⚠️ One or more suites failed. Failures that are **app bugs** must be fixed in "
        "Session 2 before proceeding.",
        "Failures that are **test authoring errors** were attempted above; see workflow "
        "logs for details.",
    ]
    if duplicate_ids:
        summary_lines += [
            f"⚠️ **Duplicate test blocks** for {dup_list} must be consolidated into one "
            "describe block per requirement ID.",
        ]
    if missing_coverage:
        summary_lines += [
            f"⚠️ **Missing test coverage** for {missing_list} — add tests for "
            "these Test-method requirements.",
        ]
else:
    summary_lines += [
        "",
        "**Next step:** Apply label `4-security-ready` to trigger security review.",
    ]

summary_md = '\n'.join(summary_lines)
with open('session3-summary.md', 'w') as f:
    f.write(summary_md)

with open('session3-status.json', 'w') as f:
    json.dump({'all_passed': all_passed}, f)

print('\n' + summary_md)
