"""
SDLC Session 5 — Quality Review
Triggered by the 'quality-ready' label on a GitHub issue.

Reads the branch diff + SRS + traceability matrix, calls Claude to perform
a quality review mapped to ISO 62304 lifecycle activities, appends findings
to docs/quality-review.md, and posts a PASS/FAIL comment on the draft PR.
"""

import os
import json
import urllib.request
import urllib.error
import anthropic

# ── helpers ───────────────────────────────────────────────────────────────────

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
            return
        pr_number = prs[0]['number']
    except urllib.error.URLError as e:
        print(f"Could not find PR: {e}")
        return

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
    except urllib.error.URLError as e:
        print(f"Could not post PR comment: {e}")

# ── context ───────────────────────────────────────────────────────────────────

issue_number = os.environ['ISSUE_NUMBER']
issue_title  = os.environ['ISSUE_TITLE']
issue_body   = os.environ.get('ISSUE_BODY', '') or '(no description provided)'
token        = os.environ.get('GH_TOKEN', '')
repo         = os.environ.get('REPO', '')

diff_content          = read_file('/tmp/branch.diff', max_chars=20000)
srs_content           = read_file('FTM-SRS-001.md', max_chars=8000)
traceability_content  = read_file('traceability-matrix.txt', max_chars=8000)

# ── prompt ────────────────────────────────────────────────────────────────────

prompt = f"""You are a quality engineer performing a quality review for the "Find the Moon" \
web application — a browser-based app for general public use including children.

This review maps the development process to ISO 62304 software lifecycle activities \
(adapted for a non-medical context as a best-practice quality framework).

Issue #{issue_number}: {issue_title}
{issue_body}

--- Git diff of all changes on this branch vs main ---
{diff_content}

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

# ── write quality doc entry ───────────────────────────────────────────────────

if data.get('quality_doc_entry', '').strip():
    append_to_file('docs/quality-review.md', data['quality_doc_entry'])
    print("Updated docs/quality-review.md")

# ── post PR comment ───────────────────────────────────────────────────────────

verdict = data.get('verdict', 'UNKNOWN')
pr_comment = data.get('pr_comment', '')

if pr_comment and token and repo:
    badge = '✅ PASS' if verdict == 'PASS' else '❌ FAIL'
    full_comment = f"## 📋 SDLC Session 5 — Quality Review: {badge}\n\n{pr_comment}"
    post_pr_comment(repo, issue_number, token, full_comment)

print(f"Quality review verdict: {verdict}")
print("Done.")
