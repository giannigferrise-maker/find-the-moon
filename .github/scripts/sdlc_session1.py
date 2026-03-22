"""
SDLC Session 1 — Requirements Engineering
Triggered by the '1-reqs-ready' label on a GitHub issue.

Reads the issue + existing SRS, calls Claude to diagnose the issue and produce
a structured requirements delta, then writes the SRS changes and delta file.

Verification (tests, VTM) is owned entirely by Session 3 — this session writes
ONLY requirements and the delta file.

Delta design — four signals Sessions 2 and 3 act on:
  New requirements       → Session 2: implement | Session 3: write new test block
  Updated requirements   → Session 2: update code value | Session 3: update existing test expected value
  Violated requirements  → Session 2: fix code toward req | Session 3: existing test should now pass
  Implementation note    → Session 2: fix code | Session 3: no test change needed
"""

import os
import re
import json
import anthropic

# ── helpers ──────────────────────────────────────────────────────────────────

def extract_json(text, message=None):
    """Extract and parse JSON from Claude's response, repairing common issues."""
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

Your job is to diagnose this issue and produce a complete requirements delta. \
The delta is the authoritative specification that Sessions 2 (coding) and 3 (verification) \
will act on — they do NOT use the issue body as their implementation target. \
Your delta must be complete and unambiguous.

STEP 1 — Classify the issue:

If this is a DEFECT (unintended behavior, crash, missing feature that should exist):
- Defect-A1: A clear requirement already exists and the code is not meeting it. \
  Identify which requirement(s) are being violated.
- Defect-A2: The bug is an implementation detail too low-level to have a formal requirement \
  (null guard, edge case, crash). Describe the fix needed; no SRS change.
- Defect-A3: The defect exposes a gap — behavior that matters but was never specified. \
  Add a new requirement or clarify an existing one.

If this is an ENHANCEMENT (intentional change to existing or new behavior):
- Enhancement-A1: Entirely new behavior not currently in the SRS. Add new requirements.
- Enhancement-A2: Changing an existing specified behavior (color, threshold, label, value). \
  Update the existing requirement in-place; do NOT add a duplicate.
- Enhancement-A3: Both — some new behavior AND changes to existing requirements.

STEP 2 — Produce the delta fields:

srs_additions:
  New requirement text to APPEND to FTM-SRS-001.md (for Defect-A3, Enhancement-A1, A3).
  Use INCOSE format (shall/should), next available amendment letter, IDs continuing from last used.
  Empty string if no new requirements.

srs_in_place_updates:
  List of in-place edits to EXISTING requirements in FTM-SRS-001.md (for Enhancement-A2, A3).
  Each entry: req_id, old_string (exact verbatim text in the SRS to replace), \
  new_string (replacement), what_changed, old_value, new_value.
  Empty list if no existing requirements are changing.

violated_requirements:
  List of existing requirements the code is currently NOT meeting (for Defect-A1, A3).
  Each entry: req_id, requirement_text (copy from SRS), violation_description.
  Empty list if not a defect.

implementation_note:
  Plain-language description of the low-level code fix needed (for Defect-A2 only).
  Empty string if not applicable.

SCOPE CONSTRAINT — strictly enforced:
Only add or modify content directly necessitated by this issue. Do NOT touch pre-existing \
requirements even if you notice defects in them — those belong in separate tickets.

Return ONLY a valid JSON object — no markdown fences, no preamble:
{{
  "classification": "Defect-A1 | Defect-A2 | Defect-A3 | Enhancement-A1 | Enhancement-A2 | Enhancement-A3",
  "diagnosis": "plain-language explanation of the issue and your requirements decision",
  "srs_additions": "markdown to append to FTM-SRS-001.md, or empty string",
  "srs_in_place_updates": [
    {{
      "req_id": "FTM-XX-NNN",
      "old_string": "exact verbatim text currently in FTM-SRS-001.md",
      "new_string": "replacement text",
      "what_changed": "brief label e.g. cloud fill color",
      "old_value": "old value",
      "new_value": "new value"
    }}
  ],
  "violated_requirements": [
    {{
      "req_id": "FTM-XX-NNN",
      "requirement_text": "exact requirement text from SRS",
      "violation_description": "how the code is currently failing this requirement"
    }}
  ],
  "implementation_note": "low-level fix description for Defect-A2, or empty string",
  "pr_summary": "2-3 sentence summary of what changed and why"
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

classification         = data.get('classification', 'Unknown')
diagnosis              = data.get('diagnosis', '')
srs_additions          = data.get('srs_additions', '').strip()
srs_in_place_updates   = data.get('srs_in_place_updates', [])
violated_requirements  = data.get('violated_requirements', [])
implementation_note    = data.get('implementation_note', '').strip()

print(f"Classification: {classification}")
print(f"Diagnosis: {diagnosis}")

# ── apply SRS changes ─────────────────────────────────────────────────────────

if srs_additions:
    append_to_file('FTM-SRS-001.md', srs_additions)
    print("Updated FTM-SRS-001.md (appended new requirements)")

applied_updates = []
for update in srs_in_place_updates:
    req_id     = update.get('req_id', '')
    old_string = update.get('old_string', '')
    new_string = update.get('new_string', '')
    if not old_string or not new_string:
        print(f"WARNING: Skipped in-place update for {req_id} — missing old_string or new_string")
        continue
    content = read_file('FTM-SRS-001.md')
    if old_string not in content:
        print(f"WARNING: Skipped in-place update for {req_id} — old_string not found in SRS")
        continue
    updated = content.replace(old_string, new_string, 1)
    write_file('FTM-SRS-001.md', updated)
    applied_updates.append(update)
    print(f"Updated FTM-SRS-001.md in-place: {req_id} — {update.get('what_changed', '')}")

# ── write structured delta file ───────────────────────────────────────────────
# This is the authoritative handoff to Sessions 2 and 3.
# Sessions 2 and 3 treat this as their specification — not the issue body.

def fmt_updated_reqs_table(updates):
    if not updates:
        return '(none)'
    rows = ['| Req ID | What changed | Old value | New value |', '|---|---|---|---|']
    for u in updates:
        rows.append(
            f"| {u.get('req_id','')} "
            f"| {u.get('what_changed','')} "
            f"| {u.get('old_value','')} "
            f"| {u.get('new_value','')} |"
        )
    return '\n'.join(rows)

def fmt_violated_reqs(violated):
    if not violated:
        return '(none)'
    lines = []
    for v in violated:
        lines.append(
            f"- **{v.get('req_id','')}**: {v.get('requirement_text','')}\n"
            f"  Violation: {v.get('violation_description','')}"
        )
    return '\n'.join(lines)

new_reqs_section = srs_additions if srs_additions else '(none)'
updated_reqs_section = fmt_updated_reqs_table(applied_updates)
violated_reqs_section = fmt_violated_reqs(violated_requirements)
impl_note_section = implementation_note if implementation_note else '(none)'

delta_content = f"""# Session 1 Requirements Delta — Issue #{issue_number}

**This delta is the authoritative specification for Sessions 2 and 3.**
Sessions 2 and 3 implement and verify against this delta — not the original issue body.

## Classification
{classification}

## Diagnosis
{diagnosis}

## New requirements
*(Session 2: implement | Session 3: write new test block)*
{new_reqs_section}

## Updated requirements in-place
*(Session 2: update code to new values | Session 3: update expected values in existing tests — do not write new test blocks)*
{updated_reqs_section}

## Violated requirements — defect fix
*(Session 2: fix code to comply with these requirements | Session 3: existing tests should now pass — do not modify them)*
{violated_reqs_section}

## Implementation note — no formal requirement
*(Session 2: apply this fix | Session 3: no test change needed)*
{impl_note_section}
"""

write_file('.github/sdlc_session1_delta.md', delta_content)
print("Wrote .github/sdlc_session1_delta.md")

# ── write PR body ──────────────────────────────────────────────────────────────

pr_summary = data.get('pr_summary', f'SDLC Session 1 output for issue #{issue_number}.')

changes = []
if srs_additions:
    changes.append('- Appended new requirements to `FTM-SRS-001.md`')
if applied_updates:
    ids = ', '.join(u.get('req_id','') for u in applied_updates)
    changes.append(f'- Updated existing requirements in-place: {ids}')
if violated_requirements:
    ids = ', '.join(v.get('req_id','') for v in violated_requirements)
    changes.append(f'- Identified violated requirements (defect fix): {ids}')
if implementation_note:
    changes.append('- Implementation note added (no formal requirement change)')
if not changes:
    changes.append('- No SRS changes required for this issue')

pr_body = f"""## SDLC Session 1: Requirements Engineering

## Summary
{pr_summary}

## Classification
{classification}

## Changes
{chr(10).join(changes)}

## Review checklist
- [ ] Classification is correct (Defect vs Enhancement, A1/A2/A3)
- [ ] Diagnosis accurately describes the issue
- [ ] New requirements follow INCOSE format with correct amendment letter and IDs
- [ ] Updated requirements change the existing row in-place (no duplicate IDs)
- [ ] Violated requirements correctly identify what the code must fix toward
- [ ] Delta is complete enough for Session 2 to implement without reading the issue body

🤖 Generated by SDLC Session 1 GitHub Action
"""

write_file('.github/sdlc_pr_body.md', pr_body)

# ── self-critique loop ────────────────────────────────────────────────────────

has_content = bool(srs_additions or applied_updates or violated_requirements or implementation_note)
MAX_CRITIQUE_ROUNDS = 2

for round_num in range(1, MAX_CRITIQUE_ROUNDS + 1):
    print(f"\nSelf-critique round {round_num}...")

    if not has_content:
        print("No requirements changes this session — skipping self-critique.")
        break

    srs_new      = srs_additions
    updates_new  = applied_updates
    violated_new = violated_requirements

    critique_prompt = f"""You are a senior requirements engineer reviewing the output of a \
requirements engineering session for the "Find the Moon" web application.

Review ONLY the content produced this session. Do not suggest changes to pre-existing content.

--- Full SRS for context (do not suggest changes to pre-existing content) ---
{srs_content}

--- Newly appended requirements ---
{srs_new if srs_new else '(none)'}

--- In-place updates applied ---
{json.dumps(updates_new, indent=2) if updates_new else '(none)'}

--- Violated requirements identified ---
{json.dumps(violated_new, indent=2) if violated_new else '(none)'}

Check for these defects ONLY:

CLASSIFICATION defects:
- Wrong classification: e.g. Enhancement-A2 used when no existing requirement covers the \
  behavior (should be Enhancement-A1), or Defect-A1 used when the requirement text doesn't \
  actually mandate the behavior in question.

NEW REQUIREMENTS defects (if any were appended):
- Amendment letter collision: new amendment must use the next sequential letter.
- Duplicate requirement IDs: no new ID may match an existing one.
- Wrong verification method: behavior checkable by code should be Test not Inspection.
- Non-testable: vague "shall" with no observable pass/fail criterion.
- Missing "shall" or "should" language.
- Semantic conflict: new requirement duplicates an existing one (should have updated in-place).

IN-PLACE UPDATES defects (if any were made):
- old_string that is too short or ambiguous — could match the wrong location in the SRS.
- new_string that introduces a duplicate requirement (same behavior now specified twice).
- Value change that conflicts with another existing requirement.

VIOLATED REQUIREMENTS defects (if any were identified):
- Identified requirement that does not actually mandate the behavior in question.
- Missing violated requirement: an obvious existing requirement is being broken but wasn't listed.

If you find NO defects, return:
{{"fixes": [], "critique_summary": "No defects found."}}

If you find defects, return fixes as JSON string replacements against the files:
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

    critique_data = extract_json(critique_msg.content[0].text, critique_msg)
    fixes = critique_data.get('fixes', [])
    print(f"Critique: {critique_data.get('critique_summary', '')}")

    if not fixes:
        print("No defects found — stopping critique loop.")
        break

    applied_fixes = 0
    for fix in fixes:
        file_path  = fix.get('file', '')
        old_string = fix.get('old_string', '')
        new_string = fix.get('new_string', '')
        if not file_path or not old_string:
            print(f"WARNING: Skipped fix — missing file or old_string.")
            continue
        content = read_file(file_path)
        if old_string not in content:
            print(f"WARNING: Skipped fix for {file_path} — old_string not found.")
            continue
        write_file(file_path, content.replace(old_string, new_string, 1))
        print(f"Patched {file_path}")
        applied_fixes += 1
    print(f"Applied {applied_fixes}/{len(fixes)} fix(es) from critique round {round_num}.")

print("Done.")
