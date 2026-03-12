"""
SDLC Session 1 — Requirements & Tests
Triggered by the 'approved' label on a GitHub issue.

Reads the issue + existing SRS and traceability matrix, calls Claude to
propose new requirements, traceability entries, and test stubs, then writes
the changes back to disk for the workflow to commit and PR.
"""

import os
import re
import json
import anthropic

# ── helpers ──────────────────────────────────────────────────────────────────

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
    # Strip JS-style // comments and trailing commas before } or ]
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
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

# ── context ───────────────────────────────────────────────────────────────────

issue_number = os.environ['ISSUE_NUMBER']
issue_title  = os.environ['ISSUE_TITLE']
issue_body   = os.environ.get('ISSUE_BODY', '') or '(no description provided)'

srs_content           = read_file('FTM-SRS-001.md', max_chars=20000)
traceability_content  = read_file('traceability-matrix.txt', max_chars=40000)
jest_example          = read_file('__tests_verify__/verification.test.js', max_chars=5000)
playwright_example    = read_file('__tests_verify__/verification.spec.js', max_chars=5000)

def extract_covered_req_ids(path):
    """Return sorted list of req IDs that already have a describe block."""
    import re
    content = read_file(path)
    return set(re.findall(r'\[FTM-[A-Z]+-\d+\]', content))

already_covered = sorted(
    extract_covered_req_ids('__tests_verify__/verification.test.js') |
    extract_covered_req_ids('__tests_verify__/verification.spec.js')
)

# ── prompt ────────────────────────────────────────────────────────────────────

prompt = f"""You are a software requirements and test engineer for the "Find the Moon" web \
application — a browser-based tool showing users where the moon is, intended for general \
public use including children.

A GitHub issue has been approved for implementation:

Issue #{issue_number}: {issue_title}
{issue_body}

--- Current SRS (FTM-SRS-001.md, first 10 000 chars) ---
{srs_content}

--- Current Traceability Matrix (first 6 000 chars) ---
{traceability_content}

--- Example Jest test format (verification.test.js excerpt) ---
{jest_example}

--- Example Playwright test format (verification.spec.js excerpt) ---
{playwright_example}

Your tasks:
1. Decide whether this issue requires NEW requirements or UPDATES to existing ones:
   - NEW feature / behavior not covered anywhere in the SRS → add new requirements in the \
next available amendment letter, using INCOSE format (shall/should, unique IDs continuing \
from the last used ID, same table style as the existing SRS).
   - CHANGE to an existing feature (e.g. a color value, threshold, label, or numeric \
parameter that is already captured by an existing requirement) → UPDATE the existing \
requirement in place. Change the value inside the existing row; keep the same requirement \
ID. Do NOT add a new requirement alongside the old one — that creates conflicting \
requirements and will break existing tests that reference the old value.
2. Draft traceability matrix entries only for requirements newly added to the SRS in this \
session. Do not add entries for requirements that already exist in the matrix — those are \
already tracked. If you only updated an existing requirement in place, do not append a new \
traceability entry; the existing one is still valid.
3. Write test stubs only for requirements newly added to the SRS in this session AND that \
do not already have test coverage in the list below. If a requirement already has a test, \
Session 3 will update it — do not add a duplicate stub:
   - Logic tests (pure JS functions, no browser) → Jest style matching verification.test.js
   - UI/browser tests → Playwright style matching verification.spec.js
   - Use TODO comments for the test body so an engineer knows what to implement.
   - Already-covered requirement IDs (do NOT add stubs for these):
     {', '.join(already_covered)}
   - If no new requirements were added, leave jest_additions and playwright_additions empty.
4. Write a 2–3 sentence PR summary.

SCOPE CONSTRAINT — strictly enforced:
Only add or modify content that is directly necessitated by this issue. Do NOT touch \
pre-existing requirements, traceability entries, or test stubs from prior amendments \
even if you notice defects in them. Pre-existing issues belong in separate tickets. \
If this issue requires no SRS changes at all (e.g. it is a pure code or test cleanup), \
return empty strings for srs_additions and traceability_additions.

Return ONLY a valid JSON object — no markdown fences, no preamble — with exactly these keys:
{{
  "srs_additions": "markdown to append to FTM-SRS-001.md, or empty string",
  "traceability_additions": "plain-text entries to append to traceability-matrix.txt, or empty string",
  "jest_additions": "Jest test code to append to verification.test.js, or empty string",
  "playwright_additions": "Playwright test code to append to verification.spec.js, or empty string",
  "pr_summary": "2–3 sentence summary of the changes"
}}"""

# ── call Claude ───────────────────────────────────────────────────────────────

client = anthropic.Anthropic()

message = client.messages.create(
    model='claude-sonnet-4-6',
    max_tokens=8192,
    messages=[{'role': 'user', 'content': prompt}],
)

response_text = message.content[0].text
data = extract_json(response_text, message)

# ── strip already-covered stubs from test additions (hard guardrail) ───────────
# Remove any describe blocks for requirement IDs that already have coverage.
# This is enforced in code — not just in the prompt — to prevent the model
# from adding duplicate stubs regardless of prompt instructions.

def strip_covered_stubs(code, covered_ids):
    """Remove test.describe / describe blocks whose ID is in covered_ids."""
    if not code or not covered_ids:
        return code
    lines = code.splitlines(keepends=True)
    result = []
    skip_depth = 0
    for line in lines:
        if skip_depth == 0:
            # Check if this line opens a describe block for a covered ID
            if any(cid in line for cid in covered_ids) and (
                'test.describe(' in line or 'describe(' in line
            ):
                skip_depth = 1
                continue  # drop this line
        if skip_depth > 0:
            skip_depth += line.count('{') - line.count('}')
            if skip_depth <= 0:
                skip_depth = 0
            continue  # drop lines inside the block
        result.append(line)
    stripped = ''.join(result)
    if stripped != code:
        removed = [cid for cid in covered_ids if cid in code]
        print(f"Stripped already-covered stubs: {removed}")
    return stripped

def strip_covered_traceability(text, covered_ids):
    """Remove traceability blocks for requirement IDs that already exist in the matrix."""
    if not text or not covered_ids:
        return text
    # Split on Req ID lines and filter out blocks whose ID is already covered
    bare_ids = [cid.strip('[]') for cid in covered_ids]
    blocks = re.split(r'(?=Req ID\s+\|)', text)
    filtered = [b for b in blocks if not any(bid in b for bid in bare_ids)]
    stripped = ''.join(filtered)
    if stripped != text:
        removed = [bid for bid in bare_ids if bid in text]
        print(f"Stripped already-covered traceability entries: {removed}")
    return stripped

# ── write changes ──────────────────────────────────────────────────────────────

if data.get('srs_additions', '').strip():
    append_to_file('FTM-SRS-001.md', data['srs_additions'])
    print("Updated FTM-SRS-001.md")

traceability_text = strip_covered_traceability(
    data.get('traceability_additions', ''), already_covered)
if traceability_text.strip():
    append_to_file('traceability-matrix.txt', traceability_text)
    print("Updated traceability-matrix.txt")

jest_code = strip_covered_stubs(data.get('jest_additions', ''), already_covered)
if jest_code.strip():
    append_to_file('__tests_verify__/verification.test.js', jest_code)
    print("Updated verification.test.js")

pw_code = strip_covered_stubs(data.get('playwright_additions', ''), already_covered)
if pw_code.strip():
    append_to_file('__tests_verify__/verification.spec.js', pw_code)
    print("Updated verification.spec.js")

# ── write PR body ──────────────────────────────────────────────────────────────

pr_summary = data.get('pr_summary', f'SDLC Session 1 output for issue #{issue_number}.')

changes = []
if data.get('srs_additions', '').strip():
    changes.append('- Updated `FTM-SRS-001.md` with new requirements')
if data.get('traceability_additions', '').strip():
    changes.append('- Updated `traceability-matrix.txt` with new traceability entries')
if data.get('jest_additions', '').strip():
    changes.append('- Added Jest test stubs to `__tests_verify__/verification.test.js`')
if data.get('playwright_additions', '').strip():
    changes.append('- Added Playwright test stubs to `__tests_verify__/verification.spec.js`')
if not changes:
    changes.append('- No document changes required for this issue')

pr_body = f"""## SDLC Session 1: Requirements & Tests

## Summary
{pr_summary}

## Changes
{chr(10).join(changes)}

## Review checklist
- [ ] New requirements are correctly numbered and follow INCOSE format
- [ ] Traceability entries map to the correct test files
- [ ] Test stubs cover all new/affected requirements
- [ ] No existing requirements or tests were accidentally modified

🤖 Generated by SDLC Session 1 GitHub Action
"""

write_file('.github/sdlc_pr_body.md', pr_body)

# ── self-critique loop ────────────────────────────────────────────────────────
# After writing requirements, VTM entries, and test stubs, ask Claude to review
# them for common mistakes and apply fixes. Runs up to MAX_CRITIQUE_ROUNDS rounds.

MAX_CRITIQUE_ROUNDS = 2

for round_num in range(1, MAX_CRITIQUE_ROUNDS + 1):
    print(f"\nSelf-critique round {round_num}...")

    # Pass only what this session generated — not the full files.
    # This ensures the self-critique literally cannot see or touch pre-existing content.
    srs_new          = data.get('srs_additions', '').strip()
    traceability_new = traceability_text.strip()  # already guardrailed
    jest_new         = jest_code.strip()           # already guardrailed
    pw_new           = pw_code.strip()             # already guardrailed

    if not any([srs_new, traceability_new, jest_new, pw_new]):
        print("Nothing was added this session — skipping self-critique.")
        break

    critique_prompt = f"""You are a senior requirements engineer reviewing freshly generated \
requirements, traceability entries, and test stubs for the "Find the Moon" web application.

You are seeing ONLY the content added by this session. Pre-existing content is not shown. \
Review only what is below — do not speculate about or reference anything outside this content.

Review the documents below for the following defects ONLY:

REQUIREMENTS (FTM-SRS-001.md) defects to look for (in newly added/changed content only):
- Amendment letter collision: check the existing amendment letters (A, B, C, ...) and verify \
  any new amendment uses the next sequential letter. If Amendment C already exists, a new one \
  must be Amendment D, not Amendment C again.
- Duplicate requirement IDs: no new ID may match an existing one anywhere in the document.
- Wrong verification method: if a requirement describes something that can be checked \
  programmatically (e.g. a specific color value, a DOM element presence, a CSS property, \
  a file content check), it should be marked Test not Inspection. Reserve Inspection for \
  things that genuinely require human visual/manual review (e.g. subjective aesthetics, \
  physical hardware behavior).
- Non-testable requirements: vague "shall" statements with no observable pass/fail criterion.
- Missing "shall" or "should" language in requirement text.
- Semantic conflict / duplication: if a newly added requirement describes the same attribute \
  or behavior as an existing requirement (e.g. two requirements both define the cloud fill \
  color, or two requirements both define the same threshold), flag it. The new session should \
  have updated the existing requirement in place rather than adding a duplicate. Fix by \
  removing the newly added conflicting requirement and updating the original one with the \
  new value instead.

TRACEABILITY MATRIX defects to look for:
- Amendment section name doesn't match the SRS amendment letter (e.g. says "Amendment C" \
  but SRS now says "Amendment D").
- Any requirement with Method = Test that has Test File = N/A or Test Suite = N/A. \
  Every Test-method requirement must reference a real test file and suite name.
- Any requirement with Method = Inspection that has a test stub — remove the stub reference \
  or correct the method.
- VTM suite name doesn't match the describe block name in the test stubs.

TEST STUBS defects to look for:
- Any Test-method requirement with no corresponding TODO stub in the test files.
- Stubs using wrong test framework (e.g. Playwright-style in verification.test.js, \
  or Jest-style in verification.spec.js).

--- FTM-SRS-001.md (newly added content only) ---
{srs_new if srs_new else '(nothing added)'}

--- traceability-matrix.txt (newly added content only) ---
{traceability_new if traceability_new else '(nothing added)'}

--- verification.test.js (newly added content only) ---
{jest_new if jest_new else '(nothing added)'}

--- verification.spec.js (newly added content only) ---
{pw_new if pw_new else '(nothing added)'}

If you find NO defects, return:
{{"fixes": [], "critique_summary": "No defects found."}}

If you find defects, return a JSON object with exact string replacements:
{{
  "fixes": [
    {{
      "file": "FTM-SRS-001.md or traceability-matrix.txt or __tests_verify__/verification.test.js or __tests_verify__/verification.spec.js",
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
        file_path = fix.get('file', '')
        old_string = fix.get('old_string', '')
        new_string = fix.get('new_string', '')
        if not file_path or not old_string:
            print(f"WARNING: Skipped fix — missing file or old_string.")
            continue
        content = read_file(file_path)
        if old_string not in content:
            print(f"WARNING: Skipped fix for {file_path} — old_string not found.")
            continue
        updated = content.replace(old_string, new_string, 1)
        write_file(file_path, updated)
        print(f"Patched {file_path}")
        applied_fixes += 1
    print(f"Applied {applied_fixes}/{len(fixes)} fix(es) from critique round {round_num}.")

print("Done.")
