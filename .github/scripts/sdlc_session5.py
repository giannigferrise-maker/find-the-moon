"""
SDLC Session 5 — Quality Review
Triggered by the 'quality-ready' label on a GitHub issue.

Reads the branch diff + SRS + traceability matrix, calls Claude to perform
a quality review mapped to ISO 62304 lifecycle activities, appends findings
to docs/quality-review.md, and posts a PASS/FAIL comment on the draft PR.
"""

import os
import re
import json
import urllib.request
import urllib.error
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

def append_to_file(path, text):
    if not text.strip():
        return
    os.makedirs(os.path.dirname(path), exist_ok=True) if os.path.dirname(path) else None
    with open(path, 'a', encoding='utf-8') as f:
        f.write('\n\n' + text.strip() + '\n')

def add_closes_to_pr(repo, issue_number, token, pr_number):
    """Append 'Closes #N' to the PR body so the issue auto-closes on merge."""
    url = f"https://api.github.com/repos/{repo}/pulls/{pr_number}"
    req = urllib.request.Request(url, headers={
        'Authorization': f'Bearer {token}',
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'find-the-moon-sdlc',
        'X-GitHub-Api-Version': '2022-11-28',
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            pr = json.loads(resp.read())
        current_body = pr.get('body', '') or ''
        closes_line = f"\nCloses #{issue_number}"
        if closes_line.strip() in current_body:
            print(f"PR #{pr_number} body already contains 'Closes #{issue_number}'.")
            return
        updated_body = current_body + closes_line
        payload = json.dumps({'body': updated_body}).encode('utf-8')
        patch_req = urllib.request.Request(url, data=payload, method='PATCH', headers={
            'Authorization': f'Bearer {token}',
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'User-Agent': 'find-the-moon-sdlc',
            'X-GitHub-Api-Version': '2022-11-28',
        })
        with urllib.request.urlopen(patch_req, timeout=15) as resp:
            print(f"Added 'Closes #{issue_number}' to PR #{pr_number} body.")
    except urllib.error.URLError as e:
        print(f"Could not update PR body: {e}")


def post_pr_comment(repo, issue_number, token, body):
    url = f"https://api.github.com/repos/{repo}/pulls?head={repo.split('/')[0]}:sdlc/issue-{issue_number}&state=open"
    req = urllib.request.Request(url, headers={
        'Authorization': f'Bearer {token}',
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'find-the-moon-sdlc',
        'X-GitHub-Api-Version': '2022-11-28',
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            prs = json.loads(resp.read())
        if not prs:
            print("No open PR found for this branch — skipping comment.")
            return None
        pr_number = prs[0]['number']
    except urllib.error.URLError as e:
        print(f"Could not find PR: {e}")
        return None

    comment_url = f"https://api.github.com/repos/{repo}/issues/{pr_number}/comments"
    payload = json.dumps({'body': body}).encode('utf-8')
    req = urllib.request.Request(comment_url, data=payload, method='POST', headers={
        'Authorization': f'Bearer {token}',
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'find-the-moon-sdlc',
        'X-GitHub-Api-Version': '2022-11-28',
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(f"Posted quality review comment to PR #{pr_number}")
            return pr_number
    except urllib.error.URLError as e:
        print(f"Could not post PR comment: {e}")
        return None

# ── context ───────────────────────────────────────────────────────────────────

issue_number = os.environ['ISSUE_NUMBER']
issue_title  = os.environ['ISSUE_TITLE']
issue_body   = os.environ.get('ISSUE_BODY', '') or '(no description provided)'
token        = os.environ.get('GH_TOKEN', '')
repo         = os.environ.get('REPO', '')

core_diff_content     = read_file('/tmp/core.diff', max_chars=30000)
tests_jest_diff       = read_file('/tmp/tests_jest.diff', max_chars=10000)
tests_spec_diff       = read_file('/tmp/tests_spec.diff', max_chars=40000)
srs_content           = read_file('FTM-SRS-001.md', max_chars=10000)
traceability_content  = read_file('traceability-matrix.txt', max_chars=12000)

# ── prompt ────────────────────────────────────────────────────────────────────

prompt = f"""You are a quality engineer performing a quality review for the "Find the Moon" \
web application — a browser-based app for general public use including children.

This review maps the development process to ISO 62304 software lifecycle activities \
(adapted for a non-medical context as a best-practice quality framework).

Issue #{issue_number}: {issue_title}
{issue_body}

--- Git diff: requirements, VTM, implementation, and docs (FTM-SRS-001.md, traceability-matrix.txt, index.html, src/, docs/) ---
{core_diff_content}

--- Git diff: Jest unit tests (verification.test.js) ---
{tests_jest_diff}

--- Git diff: Playwright browser tests (verification.spec.js) ---
{tests_spec_diff}


--- Software Requirements Specification (FTM-SRS-001) ---
{srs_content}

--- Verification Traceability Matrix ---
{traceability_content}

Perform a quality review covering the following ISO 62304-inspired activities:

1. REQUIREMENTS QUALITY (ISO 62304 §5.2)
   - Are new requirements unambiguous, testable, and uniquely identified?
   - Are all requirements traceable to the traceability matrix?

2. CODE QUALITY (ISO 62304 §5.5)
   - Does the code change follow consistent style and conventions?
   - Are there any orphaned code changes with no corresponding requirement?
   - Is the change minimal and focused (no unrelated modifications)?

3. TEST COVERAGE (ISO 62304 §5.6)
   - Does every new requirement have at least one test in the traceability matrix?
   - Are there any requirements marked "Test" in the SRS with no test entry?
   - Are there any test entries with no corresponding SRS requirement (orphaned tests)?

4. TRACEABILITY (ISO 62304 §5.7)
   - Is the traceability matrix up to date with the new requirements?
   - Is the chain complete: requirement → test → traceability entry?

5. PROCESS COMPLIANCE
   - Were all SDLC sessions completed (requirements, code, tests, security)?
   - Is the change ready to merge based on the above?

For each finding provide severity: PASS / WARNING / FAIL

End with an overall verdict: PASS (ready to merge) or FAIL (issues must be resolved).

Return ONLY a valid JSON object — no markdown fences, no preamble — with exactly these keys:
{{
  "verdict": "PASS or FAIL",
  "findings": [
    {{
      "activity": "ISO 62304 activity name",
      "severity": "PASS/WARNING/FAIL",
      "title": "short title",
      "description": "detailed description"
    }}
  ],
  "quality_doc_entry": "markdown section to append to docs/quality-review.md",
  "pr_comment": "markdown summary suitable for a PR comment"
}}
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

# ── deterministic duplicate test-ID check ────────────────────────────────────
# Count how many test.describe blocks reference each requirement ID across both
# test files. If any ID appears more than once, inject a WARNING finding.
# This is code-level enforcement — not model-dependent.

def find_duplicate_test_ids(*paths):
    from collections import Counter
    id_re = re.compile(r'\[FTM-[A-Z]+-\d+\]')
    counts = Counter()
    for path in paths:
        for line in read_file(path).splitlines():
            if 'test.describe(' in line or ('describe(' in line and 'test.describe(' not in line):
                for req_id in id_re.findall(line):
                    counts[req_id] += 1
    return sorted(req_id for req_id, n in counts.items() if n > 1)

duplicate_ids = find_duplicate_test_ids(
    '__tests_verify__/verification.test.js',
    '__tests_verify__/verification.spec.js',
)
if duplicate_ids:
    dup_list = ', '.join(duplicate_ids)
    print(f"WARNING: Duplicate test describe blocks detected: {dup_list}")
    data.setdefault('findings', []).insert(0, {
        'activity': 'Test Coverage',
        'severity': 'WARNING',
        'title': f'Duplicate test describe blocks: {dup_list}',
        'description': (
            f'The following requirement IDs have more than one test.describe block: {dup_list}. '
            'Consolidate into a single canonical block to reduce maintenance overhead and '
            'avoid misleading duplicate entries in test output.'
        ),
    })
    data['pr_comment'] = (
        f'⚠️ **W-DUP**: Duplicate test blocks for {dup_list} — consolidate into one describe block.\n\n'
        + data.get('pr_comment', '')
    )

# ── write quality doc entry ───────────────────────────────────────────────────

if data.get('quality_doc_entry', '').strip():
    append_to_file('docs/quality-review.md', data['quality_doc_entry'])
    print("Updated docs/quality-review.md")

# ── post PR comment ───────────────────────────────────────────────────────────

verdict = data.get('verdict', 'UNKNOWN')
# Guard against model self-contradiction: if any finding is FAIL, verdict must be FAIL
if verdict == 'PASS' and any(f.get('severity') == 'FAIL' for f in data.get('findings', [])):
    print("WARNING: Verdict overridden to FAIL — findings contain FAIL severity items.")
    verdict = 'FAIL'
pr_comment = data.get('pr_comment', '')

if pr_comment and token and repo:
    badge = '✅ PASS' if verdict == 'PASS' else '❌ FAIL'
    full_comment = f"## 📋 SDLC Session 5 — Quality Review: {badge}\n\n{pr_comment}"
    pr_number = post_pr_comment(repo, issue_number, token, full_comment)
    if verdict == 'PASS' and pr_number:
        add_closes_to_pr(repo, issue_number, token, pr_number)

print(f"Quality review verdict: {verdict}")
print("Done.")
