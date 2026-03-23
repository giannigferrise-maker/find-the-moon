"""
SDLC Session 1 — Requirements Engineering
Triggered by the '1-reqs-ready' label on a GitHub issue.

Reads the issue + existing SRS, calls Claude to diagnose the issue and produce
a structured requirements delta, then writes the SRS changes and delta file.

Verification (tests, VTM) is owned entirely by Session 3 — this session writes
ONLY requirements and the delta file.

Delta design — five signals Sessions 2 and 3 act on:
  New requirements        → S2: implement  | S3: write new test block
  Updated requirements    → S2: update code values | S3: update existing test expected values
  Deleted requirements    → S2: remove code | S3: remove corresponding test block
  Violated requirements   → S2: fix code toward req | S3: existing tests should now pass
  Implementation guidance → S2: apply described fix | S3: no test change (A0/A2 types)
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
        if max_chars:
            pct = len(content) / max_chars
            if len(content) > max_chars:
                print(f"WARNING: {path} is {len(content)} chars but limit is {max_chars} — content truncated. Raise the limit.")
            elif pct >= 0.9:
                print(f"WARNING: {path} is {len(content)} chars — {int(pct*100)}% of the {max_chars} char limit. Consider raising the limit soon.")
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

_srs_truncated = len(srs_content) == 20000
srs_truncation_note = (
    "\n⚠️ NOTE: The SRS has been truncated to 20,000 chars — later requirements and "
    "amendments may not be visible. Account for this when scanning for existing "
    "requirements, IDs, and amendment letters.\n"
) if _srs_truncated else ''

# ── prompt ────────────────────────────────────────────────────────────────────

prompt = f"""You are a software requirements engineer for the "Find the Moon" web \
application — a browser-based tool showing users where the moon is, intended for general \
public use including children.

A GitHub issue has been approved for implementation:

Issue #{issue_number}: {issue_title}
{issue_body}

--- Current SRS (FTM-SRS-001.md) ---
{srs_content}
{srs_truncation_note}
Your job is to diagnose this issue and produce a complete requirements delta. \
The delta is the authoritative specification that Sessions 2 (coding) and 3 (verification) \
will act on — they do NOT use the issue body as their implementation target. \
Your delta must be complete and unambiguous.

════════════════════════════════════════════════════════════
STEP 1 — CLASSIFY THE ISSUE
════════════════════════════════════════════════════════════

CHECK THESE SPECIAL CASES FIRST before choosing a classification:

AMBIGUITY: If the issue description is unclear about whether it is a defect or an \
enhancement, or what the intended correct behavior should be, make the most reasonable \
assumption, state it explicitly in `assumptions`, and set `confidence` to "low" so the \
human reviewer can verify before applying label 2-code-ready.

INSUFFICIENT INFORMATION: If the issue lacks enough technical detail to produce a \
reliable delta (e.g. a vague "the app feels wrong" with no specifics), set `confidence` \
to "low" and describe exactly what information is missing in `assumptions`. Produce the \
best delta you can; do not block.

MULTI-TYPE ISSUE: If the issue requires BOTH fixing broken behavior (defect) AND adding \
new capability (enhancement), use classification "Defect+Enhancement". Populate \
`violated_requirements` for the defect component AND `srs_additions` for the enhancement \
component simultaneously. Do not force-fit into a single classification and drop half \
the issue.

─────────────────────────────────────────────────
DEFECT classifications (the app is not doing what it should):

DEFECT PRE-CHECK: Before applying any Defect classification, ask: "Was the reported \
behavior ever explicitly required — either by the SRS or by the intent of a prior issue?" \
If the behavior was never required and the app simply never did it, classify as \
Enhancement (A0, A1, or A3) rather than Defect.

IMPORTANT: Before classifying any defect as A2, check whether any existing requirement \
in the SRS — especially reliability (FTM-RR-*), functional (FTM-FR-*), security \
(FTM-SC-*), or privacy (FTM-PS-*) requirements — already covers this scenario. \
If a requirement exists that mandates the correct behavior, the classification is A1, \
not A2, even if the fix itself feels low-level.

Defect-A1: A clear requirement exists and the code is not meeting it.
  → violated_requirements populated. srs_additions empty.

Defect-A2: A true implementation detail — no existing requirement covers this scenario \
  AND the behavior is too low-level to formally specify (null guard, unhandled exception, \
  race condition, async timing bug). Verify no existing requirement covers it first.
  → implementation_guidance populated. All SRS fields empty.

Defect-A3: The defect exposes a specification gap — the behavior matters and should be \
  formally specified going forward. Add a new requirement or clarify an existing one.
  → srs_additions populated. violated_requirements is EMPTY (there was no requirement \
  to violate — that is what makes it A3, not A1).

A1 vs A3 TIEBREAKER: If an existing requirement partially covers the scenario but does \
not explicitly mandate the correct behavior for this specific case (e.g. the req says \
"shall display moon position" but says nothing about what happens when location is \
unavailable), classify as A3 — the gap needs to be specified. Only use A1 when the \
existing requirement unambiguously mandates the correct behavior and the code is simply \
not meeting it.

─────────────────────────────────────────────────
ENHANCEMENT classifications (the app should work differently going forward):

Enhancement-A0: The change is intentional but below SRS specification level — a pure \
  style, layout, copy, or implementation detail that does not merit a formal requirement. \
  Examples: border-radius, spacing, CSS animation timing, a label string not behaviorally \
  specified in the SRS, minor layout repositioning. Do NOT add a requirement to the SRS \
  for these — that over-specifies. Describe what to change in implementation_guidance.
  DECISION TEST — A0 vs A1: Ask "would a developer reasonably implement this change \
  differently (e.g. choosing a different color or layout) without violating user intent?" \
  If yes → A0 (implementation detail, guidance only). If the issue implies a specific \
  observable behavior that must be preserved exactly and could be regressed → A1 (formal \
  requirement).
  → implementation_guidance populated. All SRS fields empty.

Enhancement-A1: Entirely new behavior not currently in the SRS.
  → srs_additions populated.

Enhancement-A2: Changing an existing specified behavior (a value, threshold, color, or \
  label that IS already in the SRS). Update the existing requirement in-place — do NOT \
  add a duplicate requirement alongside the old one.
  IMPORTANT: scan the FULL SRS for ALL occurrences of the value being changed. A value \
  may appear in multiple requirements (e.g. a refresh interval in both FTM-FR-016 and \
  FTM-PR-004). Every occurrence must be updated — a partial update leaves the SRS \
  internally inconsistent.
  → srs_in_place_updates populated with ALL affected requirements.

Enhancement-A3: Both new behavior AND changes to existing requirements.
  IMPORTANT: both srs_additions AND srs_in_place_updates are REQUIRED for A3. \
  Populating only one leaves the SRS contradictory (e.g. the existing requirement still \
  says "shall always show X" while the new requirement says "X is now user-configurable").
  → srs_additions AND srs_in_place_updates both populated.

Feature removal: If this issue removes an existing feature entirely, use Enhancement-A2 \
  (if the feature is optional/being replaced) or Enhancement-A3 (if replacement requires \
  new requirements). Use srs_deletions to identify requirements that are now obsolete and \
  must be removed from the SRS entirely.

Defect+Enhancement: Use when the issue both fixes broken behavior AND adds new capability. \
  → violated_requirements AND srs_additions both populated.

─────────────────────────────────────────────────
DOMAIN-SPECIFIC GUIDANCE:

Security issues (XSS, injection, data exposure, SRI, key exposure):
  Check existing security requirements first (FTM-SC-001 through FTM-SC-004, Amendment B) \
  and privacy requirements (FTM-PS-001 through FTM-PS-004).
  — Broken SRI hash, exposed data → likely Defect-A1 if a security requirement covers it.
  — New attack surface not covered → Defect-A3. New security requirements must be specific \
    and testable: "the system shall reject zip code input containing non-numeric characters" \
    not "the system shall be secure."
  Mark the `diagnosis` field with the prefix SECURITY: so Session 4 (security review) \
  is aware this issue has security implications.

Accessibility issues (ARIA, keyboard navigation, contrast, screen readers):
  Check FTM-UR-001 ("operable by a child aged 8+") — some a11y issues fall under this.
  — Missing ARIA, broken keyboard nav, contrast failure with no existing a11y requirement \
    → typically Defect-A3 (gap that should be specified).
  — New a11y capability → Enhancement-A1.
  Where applicable, reference the specific WCAG 2.1 criterion (e.g. "WCAG 2.1 SC 1.4.3 \
  contrast ratio") in the new requirement text so it is verifiable.
  Mark the `diagnosis` field with the prefix ACCESSIBILITY: so reviewers are aware.

Performance issues (slow load, janky animation, calculation timeout):
  Check existing performance requirements (FTM-PR-001 through FTM-PR-004).
  — Violating an existing threshold → Defect-A1.
  — Performance degradation below a threshold not in the SRS → Defect-A3.
  — Intentional optimization with no requirement impact → Enhancement-A0.
  Use implementation_guidance to describe the specific optimization needed, even for A1.

════════════════════════════════════════════════════════════
STEP 2 — PRODUCE THE DELTA FIELDS
════════════════════════════════════════════════════════════

srs_additions:
  New requirement text to APPEND to FTM-SRS-001.md.
  For: Defect-A3, Enhancement-A1, Enhancement-A3, Defect+Enhancement (enhancement component).
  Use INCOSE format (shall/should), next available amendment letter, IDs continuing from \
  the last used ID in the SRS. Match the table style of existing amendments exactly.
  AMENDMENT LETTER RULE: Scan ALL amendment letters already used anywhere in the SRS \
  (including letters that appear only as in-place edits with no separate section heading) \
  before choosing the next letter. In-place updates from prior issues may have consumed \
  letters — do not reuse them.
  VERIFICATION METHOD: For each new requirement, choose the correct method:
    - Test: behavior can be verified by running code (DOM state, computed value, network call)
    - Inspection: verified by reading source code or configuration (e.g. SRI hash present)
    - Analysis: verified by calculation or reasoning (e.g. math formula correctness)
  Default to Test unless the behavior cannot be observed at runtime.
  Empty string if not applicable.

srs_in_place_updates:
  List of targeted edits to EXISTING requirements in FTM-SRS-001.md.
  For: Enhancement-A2, Enhancement-A3.
  Each entry: req_id, old_string (exact verbatim text in SRS — long enough to be unique), \
  new_string (replacement), what_changed, old_value, new_value.
  Scan the full SRS for ALL occurrences of the changing value before producing this list.
  Empty list if not applicable.

srs_deletions:
  List of requirements that must be REMOVED ENTIRELY from the SRS (not just changed).
  For: feature removal, obsolete requirements.
  Each entry: req_id, old_string (exact verbatim markdown table row to remove, \
  including the leading pipe and trailing newline), reason.
  Example old_string: "| FTM-FR-016 | The system shall refresh moon data every 60 seconds. | Test |\n"
  The string must be long enough to be unique — include surrounding rows if the row alone \
  is ambiguous.
  Empty list if not applicable.

violated_requirements:
  Existing requirements the code is currently NOT meeting.
  For: Defect-A1, Defect+Enhancement (defect component).
  Each entry: req_id, requirement_text (copy from SRS), violation_description.
  NOTE — Defect-A3 ONLY: this field is EMPTY even for A3. A3 means no requirement existed \
  to be violated — the gap IS the problem. Do not fabricate a violated requirement.
  Empty list if not applicable.

implementation_guidance:
  Specific coding direction for Session 2 — file, location, what to change.
  REQUIRED for: Defect-A2 (the only substantive field for A2) and Enhancement-A0 \
  (the only substantive field for A0).
  OPTIONAL for: any other classification where the SRS changes alone may not give \
  Session 2 enough coding direction (e.g. a complex Defect-A1 fix, a version update \
  with an SRI hash implication, a performance optimization accompanying an Enhancement-A2).
  Empty string if not needed.

SCOPE CONSTRAINT — strictly enforced:
Only add or modify content directly necessitated by this issue. Do NOT touch pre-existing \
requirements even if you notice defects — those belong in separate tickets.

════════════════════════════════════════════════════════════
SELF-VERIFICATION — complete this before responding
════════════════════════════════════════════════════════════

Before producing the JSON, verify:
1. Classification matches the diagnosis evidence (correct type and subtype).
2. SRS fields are populated correctly for the chosen classification:
   - A0/A2: SRS fields empty, implementation_guidance non-empty.
   - A1: violated_requirements non-empty, srs_additions empty.
   - A3: srs_additions non-empty, violated_requirements EMPTY.
   - A2/A3: srs_in_place_updates covers ALL occurrences of the changed value.
   - Defect+Enhancement: both violated_requirements and srs_additions non-empty.
3. srs_additions uses the next unused amendment letter (scanned from the full SRS).
4. No new requirement ID duplicates an existing ID in the SRS.
5. Each new requirement has an observable pass/fail criterion and the correct \
   verification method (Test / Inspection / Analysis).
6. All srs_in_place_updates old_strings are verbatim and unique in the SRS.

════════════════════════════════════════════════════════════
RESPONSE FORMAT
════════════════════════════════════════════════════════════

Return ONLY a valid JSON object — no markdown fences, no preamble:
{{
  "classification": "Defect-A1 | Defect-A2 | Defect-A3 | Enhancement-A0 | Enhancement-A1 | Enhancement-A2 | Enhancement-A3 | Defect+Enhancement",
  "confidence": "high | medium | low",
  "assumptions": "any assumptions made about ambiguous aspects, or what information is missing if confidence is low; empty string if unambiguous",
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
  "srs_deletions": [
    {{
      "req_id": "FTM-XX-NNN",
      "old_string": "exact verbatim markdown table row to remove",
      "reason": "why this requirement is being removed"
    }}
  ],
  "violated_requirements": [
    {{
      "req_id": "FTM-XX-NNN",
      "requirement_text": "exact requirement text from SRS",
      "violation_description": "how the code is currently failing this requirement"
    }}
  ],
  "implementation_guidance": "specific coding direction for Session 2, or empty string",
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

classification        = data.get('classification', 'Unknown')
confidence            = data.get('confidence', 'high')
assumptions           = data.get('assumptions', '').strip()
diagnosis             = data.get('diagnosis', '')
srs_additions         = data.get('srs_additions', '').strip()
srs_in_place_updates  = data.get('srs_in_place_updates', [])
srs_deletions         = data.get('srs_deletions', [])
violated_requirements = data.get('violated_requirements', [])
implementation_guidance = data.get('implementation_guidance', '').strip()

print(f"Classification: {classification}")
print(f"Confidence: {confidence}")
if assumptions:
    print(f"Assumptions: {assumptions}")
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
    if content.count(old_string) > 1:
        print(f"WARNING: Skipped in-place update for {req_id} — old_string matches {content.count(old_string)} locations; provide a longer unique string")
        continue
    write_file('FTM-SRS-001.md', content.replace(old_string, new_string, 1))
    applied_updates.append(update)
    print(f"Updated FTM-SRS-001.md in-place: {req_id} — {update.get('what_changed', '')}")

applied_deletions = []
for deletion in srs_deletions:
    req_id     = deletion.get('req_id', '')
    old_string = deletion.get('old_string', '')
    if not old_string:
        print(f"WARNING: Skipped deletion for {req_id} — missing old_string")
        continue
    content = read_file('FTM-SRS-001.md')
    if old_string not in content:
        print(f"WARNING: Skipped deletion for {req_id} — old_string not found in SRS")
        continue
    if content.count(old_string) > 1:
        print(f"WARNING: Skipped deletion for {req_id} — old_string matches {content.count(old_string)} locations; provide a longer unique string")
        continue
    write_file('FTM-SRS-001.md', content.replace(old_string, '', 1))
    applied_deletions.append(deletion)
    print(f"Deleted requirement from FTM-SRS-001.md: {req_id}")

# ── write structured delta file ───────────────────────────────────────────────

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

def fmt_deleted_reqs(deletions):
    if not deletions:
        return '(none)'
    lines = []
    for d in deletions:
        lines.append(f"- **{d.get('req_id','')}**: {d.get('reason','')}")
    return '\n'.join(lines)

confidence_note = ''
if confidence != 'high' or assumptions:
    confidence_note = f"""
## Confidence & Assumptions
**Confidence:** {confidence}
**Assumptions / information gaps:** {assumptions if assumptions else '(none)'}

⚠️ Confidence is not HIGH — human reviewer should verify the classification and \
assumptions above before applying label `2-code-ready`.
"""

delta_content = f"""# Session 1 Requirements Delta — Issue #{issue_number}

**This delta is the authoritative specification for Sessions 2 and 3.**
Sessions 2 and 3 implement and verify against this delta — not the original issue body.

## Classification
{classification}

## Diagnosis
{diagnosis}
{confidence_note}
## New requirements
*(Session 2: implement | Session 3: write new test block)*
{srs_additions if srs_additions else '(none)'}

## Updated requirements in-place
*(Session 2: update code to new values | Session 3: update expected values in existing tests — do not write new test blocks)*
{fmt_updated_reqs_table(applied_updates)}

## Deleted requirements
*(Session 2: remove code implementing this | Session 3: remove the corresponding test block)*
{fmt_deleted_reqs(applied_deletions)}

## Violated requirements — defect fix
*(Session 2: fix code to comply with these requirements | Session 3: existing tests should now pass — do not modify them)*
{fmt_violated_reqs(violated_requirements)}

## Implementation guidance
*(Session 2: apply this | Session 3: no test change needed)*
{implementation_guidance if implementation_guidance else '(none)'}
"""

write_file('.github/sdlc_session1_delta.md', delta_content)
print("Wrote .github/sdlc_session1_delta.md")

# ── write PR body ──────────────────────────────────────────────────────────────

pr_summary = data.get('pr_summary', f'SDLC Session 1 output for issue #{issue_number}.')

changes = []
if srs_additions:
    changes.append('- Appended new requirements to `FTM-SRS-001.md`')
if applied_updates:
    ids = ', '.join(u.get('req_id', '') for u in applied_updates)
    changes.append(f'- Updated existing requirements in-place: {ids}')
if applied_deletions:
    ids = ', '.join(d.get('req_id', '') for d in applied_deletions)
    changes.append(f'- Deleted obsolete requirements: {ids}')
if violated_requirements:
    ids = ', '.join(v.get('req_id', '') for v in violated_requirements)
    changes.append(f'- Identified violated requirements (defect): {ids}')
if implementation_guidance:
    changes.append('- Implementation guidance provided (no SRS change)')
if not changes:
    changes.append('- No SRS changes required for this issue')

confidence_warning = ''
if confidence != 'high':
    confidence_warning = f'\n## ⚠️ Low Confidence — Human Review Required\n{assumptions}\n'

pr_body = f"""## SDLC Session 1: Requirements Engineering

## Summary
{pr_summary}

## Classification
{classification} (confidence: {confidence})

## Changes
{chr(10).join(changes)}
{confidence_warning}
## Review checklist
- [ ] Classification is correct (Defect vs Enhancement, subtype)
- [ ] Confidence and assumptions look reasonable
- [ ] New requirements follow INCOSE format with correct amendment letter and IDs
- [ ] Updated requirements change the existing row in-place (no duplicate IDs)
- [ ] All occurrences of changed values were updated across the SRS
- [ ] Deleted requirements are truly obsolete (not just changed)
- [ ] Violated requirements correctly identify what the code must fix toward
- [ ] Delta is complete enough for Session 2 to implement without reading the issue body

🤖 Generated by SDLC Session 1 GitHub Action
"""

write_file('.github/sdlc_pr_body.md', pr_body)

# ── self-critique loop ────────────────────────────────────────────────────────

has_content = bool(
    srs_additions or applied_updates or applied_deletions or
    violated_requirements or implementation_guidance
)
MAX_CRITIQUE_ROUNDS = 2

for round_num in range(1, MAX_CRITIQUE_ROUNDS + 1):
    print(f"\nSelf-critique round {round_num}...")

    if not has_content:
        print("No requirements changes this session — skipping self-critique.")
        break

    critique_prompt = f"""You are a senior requirements engineer reviewing the output of a \
requirements engineering session for the "Find the Moon" web application.

Review ONLY the content produced this session. Do not suggest changes to pre-existing content.

--- Full SRS for context ---
{srs_content}

--- Classification chosen ---
{classification} (confidence: {confidence})

--- Assumptions stated ---
{assumptions if assumptions else '(none)'}

--- Newly appended requirements ---
{srs_additions if srs_additions else '(none)'}

--- In-place updates applied ---
{json.dumps(applied_updates, indent=2) if applied_updates else '(none)'}

--- Requirements deleted ---
{json.dumps(applied_deletions, indent=2) if applied_deletions else '(none)'}

--- Violated requirements identified ---
{json.dumps(violated_requirements, indent=2) if violated_requirements else '(none)'}

--- Implementation guidance ---
{implementation_guidance if implementation_guidance else '(none)'}

Check for these defects ONLY:

CLASSIFICATION defects:
- Wrong type: e.g. Enhancement-A2 when no existing SRS requirement covers the behavior \
  (should be A0 or A1). Defect-A2 when an existing requirement already covers the scenario \
  (should be A1). A3 violated_requirements populated when it should be empty for A3.
- Multi-type issue forced into single classification, silently dropping part of the issue.
- Low confidence without assumptions stated.

NEW REQUIREMENTS defects (if any were appended):
- Amendment letter collision: new amendment must use the next sequential letter.
- Duplicate requirement IDs: no new ID may match an existing one.
- Wrong verification method: behavior checkable by code → Test, not Inspection.
- Non-testable requirement: vague "shall" with no observable pass/fail criterion.
- Missing "shall" or "should" language.
- Semantic conflict: new requirement duplicates an existing one (should have updated in-place).

IN-PLACE UPDATES defects:
- Incomplete scan: a value appears in multiple SRS requirements but only one was updated.
- old_string too short or ambiguous — could match the wrong location.
- Update introduces a contradiction with another existing requirement.

DELETIONS defects:
- Requirement deleted that is still needed (wrong req_id, or deletion is premature).
- Deletion leaves an orphaned cross-reference in another requirement.

VIOLATED REQUIREMENTS defects:
- Identified requirement does not actually mandate the behavior in question.
- Defect-A3 case has violated_requirements populated (should always be empty for A3).

IMPLEMENTATION GUIDANCE defects:
- Defect-A2 or Enhancement-A0 with empty implementation_guidance (these are the only \
  substantive output for A0/A2 — empty guidance means Session 2 has nothing to act on).

If you find NO defects, return:
{{"fixes": [], "critique_summary": "No defects found."}}

If you find defects, return fixes as JSON string replacements:
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

    ALLOWED_CRITIQUE_FILES = {'FTM-SRS-001.md'}
    applied_fixes = 0
    for fix in fixes:
        file_path  = fix.get('file', '')
        old_string = fix.get('old_string', '')
        new_string = fix.get('new_string', '')
        if not file_path or not old_string:
            print(f"WARNING: Skipped fix — missing file or old_string.")
            continue
        if file_path not in ALLOWED_CRITIQUE_FILES:
            print(f"WARNING: Skipped fix — {file_path} is outside allowed file set {ALLOWED_CRITIQUE_FILES}.")
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
