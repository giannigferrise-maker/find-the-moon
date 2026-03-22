"""
SDLC Session 1 — Requirements Engineering
Triggered by the '1-reqs-ready' label on a GitHub issue.

Reads the issue + existing SRS, calls Claude to propose new or updated requirements,
then writes the changes back to disk for the workflow to commit and PR.

Verification (tests, VTM) is owned entirely by Session 3 — this session writes
ONLY requirements and the Session 1 delta file.
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

srs_content = read_file('FTM-SRS-001.md', max_chars=20000)

# ── prompt ────────────────────────────────────────────────────────────────────

prompt = f"""You are a software requirements engineer for the "Find the Moon" web \
application — a browser-based tool showing users where the moon is, intended for general \
public use including children.

A GitHub issue has been approved for implementation:

Issue #{issue_number}: {issue_title}
{issue_body}

--- Current SRS (FTM-SRS-001.md) ---
{srs_content}

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
   - If this issue requires no SRS changes at all (e.g. it is a pure code or test cleanup), \
return an empty string for srs_additions.
2. Write a 2–3 sentence PR summary.

SCOPE CONSTRAINT — strictly enforced:
Only add or modify content that is directly necessitated by this issue. Do NOT touch \
pre-existing requirements from prior amendments even if you notice defects in them. \
Pre-existing issues belong in separate tickets.

Return ONLY a valid JSON object — no markdown fences, no preamble — with exactly these keys:
{{
  "srs_additions": "markdown to append to FTM-SRS-001.md, or empty string if no SRS changes",
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

# ── write changes ──────────────────────────────────────────────────────────────

if data.get('srs_additions', '').strip():
    append_to_file('FTM-SRS-001.md', data['srs_additions'])
    print("Updated FTM-SRS-001.md")

# ── write Session 1 delta for Sessions 2 and 3 ────────────────────────────────
# Session 2 uses this as its primary implementation target.
# Session 3 uses this as its primary verification target — it independently
# decides what tests are needed for these requirements.

srs_delta = data.get('srs_additions', '').strip()
delta_content = srs_delta if srs_delta else '(no SRS changes — this issue requires no new or updated requirements)'
write_file('.github/sdlc_session1_delta.md', f"""# Session 1 Requirements Delta — Issue #{issue_number}

The following requirements were added or updated by the requirements engineer
for this issue. Session 2 must implement exactly these requirements.
Session 3 must write verification tests for these requirements.

{delta_content}
""")
print("Wrote .github/sdlc_session1_delta.md")

# ── write PR body ──────────────────────────────────────────────────────────────

pr_summary = data.get('pr_summary', f'SDLC Session 1 output for issue #{issue_number}.')

changes = []
if data.get('srs_additions', '').strip():
    changes.append('- Updated `FTM-SRS-001.md` with new or updated requirements')
if not changes:
    changes.append('- No SRS changes required for this issue')

pr_body = f"""## SDLC Session 1: Requirements Engineering

## Summary
{pr_summary}

## Changes
{chr(10).join(changes)}

## Review checklist
- [ ] New requirements are correctly numbered and follow INCOSE format
- [ ] Changed requirements update the existing row in-place (no duplicate IDs)
- [ ] No existing requirements were accidentally modified
- [ ] Scope is limited to what this issue requires

🤖 Generated by SDLC Session 1 GitHub Action
"""

write_file('.github/sdlc_pr_body.md', pr_body)

# ── self-critique loop ────────────────────────────────────────────────────────
# After writing requirements, ask Claude to review them for common mistakes and
# apply fixes. Runs up to MAX_CRITIQUE_ROUNDS rounds.

MAX_CRITIQUE_ROUNDS = 2

for round_num in range(1, MAX_CRITIQUE_ROUNDS + 1):
    print(f"\nSelf-critique round {round_num}...")

    srs_new = data.get('srs_additions', '').strip()

    if not srs_new:
        print("Nothing was added this session — skipping self-critique.")
        break

    critique_prompt = f"""You are a senior requirements engineer reviewing freshly generated \
requirements for the "Find the Moon" web application.

You are seeing ONLY the content added by this session. Pre-existing content is not shown. \
Review only what is below — do not speculate about or reference anything outside this content.

Review the requirements below for the following defects ONLY:

REQUIREMENTS (FTM-SRS-001.md) defects to look for:
- Amendment letter collision: check the existing amendment letters (A, B, C, ...) in the full \
  SRS above and verify any new amendment uses the next sequential letter. If Amendment C already \
  exists, a new one must be Amendment D, not Amendment C again.
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
  removing the newly added conflicting requirement.

--- Full SRS for context (do not suggest changes to pre-existing content) ---
{srs_content}

--- FTM-SRS-001.md (newly added/changed content only — review this) ---
{srs_new}

If you find NO defects, return:
{{"fixes": [], "critique_summary": "No defects found."}}

If you find defects, return a JSON object with exact string replacements:
{{
  "fixes": [
    {{
      "file": "FTM-SRS-001.md",
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
