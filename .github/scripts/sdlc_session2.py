"""
SDLC Session 2 — Code Implementation
Triggered by the 'code-ready' label on a GitHub issue.

Reads the issue + SRS + current code, calls Claude to produce targeted
file replacements, then applies them to disk for the workflow to commit and PR.
"""

import os
import json
import anthropic

# ── helpers ───────────────────────────────────────────────────────────────────

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

srs_content        = read_file('FTM-SRS-001.md', max_chars=8000)
index_html         = read_file('index.html', max_chars=30000)
moon_logic_js      = read_file('src/moonLogic.js', max_chars=10000)

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

# Extract JSON
start = response_text.find('{')
end   = response_text.rfind('}') + 1
if start < 0 or end <= start:
    raise ValueError(f"No JSON found in response:\n{response_text[:500]}")

try:
    data = json.loads(response_text[start:end])
except json.JSONDecodeError as e:
    print(f"JSON parse error: {e}")
    print(f"Response length: {len(response_text)}, stop_reason: {message.stop_reason}")
    print(f"Response tail: {response_text[-300:]}")
    raise

# ── apply replacements ────────────────────────────────────────────────────────

replacements = data.get('replacements', [])
if not replacements:
    print("No code changes needed for this issue.")
else:
    for r in replacements:
        apply_replacement(r['file'], r['old_string'], r['new_string'])

# ── write PR body ─────────────────────────────────────────────────────────────

pr_summary = data.get('pr_summary', f'Code implementation for issue #{issue_number}.')

files_changed = list({r['file'] for r in replacements})
changes = [f"- Modified `{f}`" for f in sorted(files_changed)] if files_changed else ["- No code changes required"]

pr_body = f"""## SDLC Session 2: Code Implementation

Closes #{issue_number}

## Summary
{pr_summary}

## Changes
{chr(10).join(changes)}

## Review checklist
- [ ] Code matches existing style and conventions
- [ ] Change is minimal — no unrelated refactoring
- [ ] All requirements from the SRS are satisfied
- [ ] No new dependencies introduced

🤖 Generated by SDLC Session 2 GitHub Action
"""

write_file('.github/sdlc_pr_body.md', pr_body)
print("Done.")
