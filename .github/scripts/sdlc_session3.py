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
import anthropic

# ── helpers ───────────────────────────────────────────────────────────────────

def extract_json(text, message=None):
    """Extract and parse JSON from Claude's response, repairing common issues."""
    start = text.find('{')
    end   = text.rfind('}') + 1
    if start < 0 or end <= start:
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

srs_content       = read_file('FTM-SRS-001.md', max_chars=10000)
jest_tests        = read_file('__tests_verify__/verification.test.js', max_chars=15000)
playwright_tests  = read_file('__tests_verify__/verification.spec.js', max_chars=15000)

# ── prompt ────────────────────────────────────────────────────────────────────

prompt = f"""You are a test engineer writing automated verification tests for the "Find the Moon" \
web application — a single-page browser app that shows users where the moon is.

A GitHub issue has been through requirements (Session 1) and code implementation (Session 2). \
Your job is to replace any TODO test stubs with real, working test assertions.

Issue #{issue_number}: {issue_title}
{issue_body}

--- SRS requirements (write tests against these, not against the implementation) ---
{srs_content}

--- Current verification.test.js (Jest — logic layer, no browser) ---
{jest_tests}

--- Current verification.spec.js (Playwright — browser/UI layer) ---
{playwright_tests}

Your tasks:
1. Find any TODO stubs related to this issue in either test file.
2. Replace each stub with real, working test assertions that verify the requirement is met.
3. Follow these rules:
   - Write tests against the SRS requirements — do not test implementation details
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
    max_tokens=8192,
    messages=[{'role': 'user', 'content': prompt}],
)

response_text = message.content[0].text
data = extract_json(response_text, message)

# ── apply replacements ────────────────────────────────────────────────────────

replacements = data.get('replacements', [])
if not replacements:
    print("No test stubs to replace for this issue.")
else:
    for r in replacements:
        apply_replacement(r['file'], r['old_string'], r['new_string'])

print(data.get('summary', 'Done.'))
