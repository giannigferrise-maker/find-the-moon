"""
SDLC Session 3 — Automated Tests
Triggered by the 'tests-ready' label on a GitHub issue.

Reads the issue + SRS requirements + existing test stubs, calls Claude to
replace TODO stubs with real working assertions, then writes the changes
back to disk for the workflow to commit to the shared sdlc/issue-N branch.

Intentionally does NOT read implementation code — tests are written against
requirements, not against what the code happens to do today.
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
        return content[:max_chars] if max_chars else content
    except FileNotFoundError:
        return ''

def extract_todo_blocks(path, max_chars=25000):
    """Return the file header + only the describe blocks that contain TODO stubs.

    This keeps the prompt small regardless of file size while ensuring Claude
    sees every stub that needs filling — even those near the end of a large file.
    """
    content = read_file(path)
    if not content:
        return ''

    lines = content.splitlines(keepends=True)

    # Collect the file header (imports, helpers, constants) up to the first test.describe
    header_lines = []
    first_describe = 0
    for i, line in enumerate(lines):
        if 'test.describe(' in line or 'describe(' in line:
            first_describe = i
            break
        header_lines.append(line)

    # Walk describe blocks and keep ones that contain TODO
    blocks = []
    i = first_describe
    while i < len(lines):
        if 'test.describe(' in lines[i] or (i == first_describe and 'describe(' in lines[i]):
            # Collect this block until brace depth returns to 0
            depth = 0
            block = []
            for j in range(i, len(lines)):
                block.append(lines[j])
                depth += lines[j].count('{') - lines[j].count('}')
                if depth <= 0 and j > i:
                    i = j + 1
                    break
            else:
                i = len(lines)
            block_text = ''.join(block)
            if 'TODO' in block_text:
                blocks.append(block_text)
        else:
            i += 1

    if not blocks:
        return ''.join(header_lines) + '\n// (no TODO stubs found in this file)\n'

    result = ''.join(header_lines) + '\n// ... (non-TODO tests omitted for brevity) ...\n\n'
    result += '\n'.join(blocks)
    return result[:max_chars]

def write_file(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True) if os.path.dirname(path) else None
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def apply_fix_replacement(file_path, old_string, new_string):
    """Apply a fix replacement in the test-failure repair loop.

    No TODO guard — we are fixing test code that may already be passing-but-wrong,
    not replacing stubs. The caller is responsible for ensuring only test authoring
    mistakes are fixed, never weakened assertions.
    """
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

def apply_replacement(file_path, old_string, new_string):
    content = read_file(file_path)
    if not content:
        raise FileNotFoundError(f"File not found: {file_path}")
    if old_string not in content:
        raise ValueError(f"old_string not found in {file_path}:\n{old_string[:200]}")
    # Guard 1: only replace TODO stubs — never touch passing tests.
    if 'TODO' not in old_string:
        raise ValueError(
            f"Rejected replacement for {file_path}: old_string does not contain 'TODO'. "
            f"Session 3 must only replace stub placeholders, not existing passing tests.\n"
            f"First 200 chars of old_string: {old_string[:200]}"
        )
    # Guard 2: reject new_string values that contain known corruption patterns
    # (e.g. `});pyOn(` which is a corrupted `jest.spyOn` fragment, or
    # `', () => {` appended mid-line from a malformed describe block).
    if 'pyOn(' in new_string or ('), () => {' in new_string and 'test.describe' not in new_string):
        raise ValueError(
            f"Rejected replacement for {file_path}: new_string contains a known corruption pattern "
            f"(pyOn or describe-fragment on closing brace). Skipping to avoid breaking the file.\n"
            f"First 200 chars of new_string: {new_string[:200]}"
        )
    updated = content.replace(old_string, new_string, 1)
    write_file(file_path, updated)
    print(f"Patched {file_path}")

# ── context ───────────────────────────────────────────────────────────────────

issue_number = os.environ['ISSUE_NUMBER']
issue_title  = os.environ['ISSUE_TITLE']
issue_body   = os.environ.get('ISSUE_BODY', '') or '(no description provided)'

srs_content       = read_file('FTM-SRS-001.md', max_chars=10000)
test_guide        = read_file('FTM-TEST-GUIDE.md', max_chars=8000)
jest_tests        = read_file('__tests_verify__/verification.test.js', max_chars=30000)
# For the Playwright spec (103KB+) send only header + TODO-containing describe blocks
# so Claude sees every stub regardless of where it falls in the file.
playwright_tests  = extract_todo_blocks('__tests_verify__/verification.spec.js', max_chars=25000)

# ── prompt ────────────────────────────────────────────────────────────────────

prompt = f"""You are a test engineer writing automated verification tests for the "Find the Moon" \
web application — a single-page browser app that shows users where the moon is.

A GitHub issue has been through requirements (Session 1) and code implementation (Session 2). \
Your job is to replace any TODO test stubs with real, working test assertions.

Issue #{issue_number}: {issue_title}
{issue_body}

--- SRS requirements (write tests against these, not against the implementation) ---
{srs_content}

--- Verification Engineer's Test Guide (element IDs, DOM facts, mock patterns, known pitfalls) ---
{test_guide}

--- Current verification.test.js (Jest — logic layer, no browser) ---
{jest_tests}

--- Current verification.spec.js (Playwright — browser/UI layer) ---
{playwright_tests}

Your tasks:
1. Find any TODO stubs related to this issue in either test file.
2. Replace each stub with real, working test assertions that verify the requirement is met.
3. Follow these rules:

   MINDSET — think like an adversary, not a confirmer:
   - Your goal is NOT to write tests that pass against the current implementation. Your goal is
     to write tests that would FAIL if the requirement was violated or the feature was removed.
   - For every test you write, ask yourself: "If a developer deleted the code implementing this
     requirement tomorrow, would my test catch it?" If the answer is no, the test provides no value.
   - You have intentionally not seen the implementation — write tests from the requirement alone.
     Do not assume anything about how the feature is built; test the observable behavior.
   - Prefer specific, targeted assertions over broad ones. A test that could pass due to unrelated
     code elsewhere is a false positive waiting to happen.

   CORRECTNESS:
   - Write tests against the SRS requirements — do not test implementation details
   - Use the Test Guide (above) for correct element IDs, selectors, color formats, and known pitfalls
   - Match the existing test style exactly (indentation, describe/it structure, mock patterns)
   - Jest tests: use pure JS logic, no browser, mock external dependencies
   - Playwright tests: use page mocks for SunCalc and network calls (follow existing mock patterns)
   - Tests must be deterministic — no real network calls, no real GPS, no real time
   - Do not modify any existing passing tests
   - Do not add new imports or dependencies not already in the file

Return ONLY a valid JSON object — no markdown fences, no preamble — with exactly these keys:
{{
  "replacements": [
    {{
      "file": "__tests_verify__/verification.test.js or __tests_verify__/verification.spec.js",
      "old_string": "exact verbatim stub to replace",
      "new_string": "complete replacement with real assertions"
    }}
  ],
  "summary": "1-2 sentence description of what tests were written"
}}

If there are no TODO stubs to replace, return an empty replacements array.
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

# ── apply replacements ────────────────────────────────────────────────────────

replacements = data.get('replacements', [])
if not replacements:
    print("No test stubs to replace for this issue.")
else:
    applied = 0
    for r in replacements:
        try:
            apply_replacement(r['file'], r['old_string'], r['new_string'])
            applied += 1
        except ValueError as e:
            print(f"WARNING: Skipped replacement — {e}")
    print(f"Applied {applied}/{len(replacements)} replacements.")

print(data.get('summary', 'Done.'))

# ── Post-replacement: strip any residual corruption patterns ──────────────────
# Occasionally the LLM embeds `});pyOn(` (corrupted jest.spyOn) or `});)', () => {`
# (corrupted test.describe opener) in its output. Strip them deterministically.

import re as _re

_CORRUPTION_RE = _re.compile(
    r'(\}\);|\}\)\s*;)pyOn\([^\n]*\n(?:[ \t][^\n]*\n)*?[ \t]*\}\);?\n',
    _re.MULTILINE
)
_DESCRIBE_FRAGMENT_RE = _re.compile(r"(\}\);)(?:'\s*,\s*\(\)\s*=>\s*\{)+", _re.MULTILINE)

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

    jest_after     = read_file('__tests_verify__/verification.test.js', max_chars=30000)
    playwright_after = read_file('__tests_verify__/verification.spec.js', max_chars=20000)

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
            apply_replacement(fix['file'], fix['old_string'], fix['new_string'])
            applied_fixes += 1
        except ValueError as e:
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

# ── write summary for workflow PR comment ─────────────────────────────────────

all_passed = jest_passed and pw_passed

summary_lines = [
    f"{'✅' if all_passed else '❌'} **SDLC Session 3 — Test Results**",
    "",
    f"- Jest (unit/logic):      {'✅ PASSED' if jest_passed else '❌ FAILED'}",
    f"- Playwright (browser/UI): {'✅ PASSED' if pw_passed else '❌ FAILED'}",
]

if not all_passed:
    summary_lines += [
        "",
        "⚠️ One or more suites failed. Failures that are **app bugs** must be fixed in "
        "Session 2 before proceeding.",
        "Failures that are **test authoring errors** were attempted above; see workflow "
        "logs for details.",
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
