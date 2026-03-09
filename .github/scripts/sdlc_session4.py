"""
SDLC Session 4 — Security Review
Triggered by the 'security-ready' label on a GitHub issue.

Reads the branch diff + SRS + existing security review doc, calls Claude
to perform a security review, appends findings to docs/security-review.md,
and posts a summary comment on the draft PR.
"""

import os
import re
import json
import urllib.request
import urllib.error
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

def append_to_file(path, text):
    if not text.strip():
        return
    with open(path, 'a', encoding='utf-8') as f:
        f.write('\n\n' + text.strip() + '\n')

def write_file(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True) if os.path.dirname(path) else None
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def post_pr_comment(repo, issue_number, token, body):
    """Post a comment on the PR associated with this branch."""
    # Find the PR number for this branch
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

    # Post the comment
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
            print(f"Posted security review comment to PR #{pr_number}")
    except urllib.error.URLError as e:
        print(f"Could not post PR comment: {e}")

# ── context ───────────────────────────────────────────────────────────────────

issue_number = os.environ['ISSUE_NUMBER']
issue_title  = os.environ['ISSUE_TITLE']
issue_body   = os.environ.get('ISSUE_BODY', '') or '(no description provided)'
token        = os.environ.get('GH_TOKEN', '')
repo         = os.environ.get('REPO', '')

diff_content          = read_file('/tmp/branch.diff', max_chars=20000)
srs_content           = read_file('FTM-SRS-001.md', max_chars=6000)
existing_security_doc = read_file('docs/security-review.md', max_chars=4000)

# ── prompt ────────────────────────────────────────────────────────────────────

prompt = f"""You are a security engineer performing a code security review for the "Find the Moon" \
web application — a browser-based app intended for general public use including children. \
It must comply with COPPA (no personal data collection).

Issue #{issue_number}: {issue_title}
{issue_body}

--- Git diff of all changes on this branch vs main ---
{diff_content}

--- SRS privacy and security requirements (FTM-PS-*, FTM-SC-*) ---
{srs_content}

--- Existing security review findings (for context, do not repeat resolved issues) ---
{existing_security_doc}

Perform a thorough security review of the diff above. Check for:
- OWASP Top 10 (XSS, injection, broken access control, security misconfiguration, etc.)
- Privacy violations (PII collection, location data leakage, tracking)
- Cryptographic issues (weak algorithms, fabricated hashes, missing integrity checks)
- Supply chain risks (new CDN dependencies, missing SRI)
- Child safety issues (COPPA compliance)
- Any security requirements from the SRS that are not satisfied

For each finding provide:
- Severity: CRITICAL / HIGH / MEDIUM / LOW / INFO
- Description of the issue
- Specific file and line if applicable
- Recommended fix

End with an overall verdict: PASS (safe to proceed) or FAIL (must fix before merge).

Return ONLY a valid JSON object — no markdown fences, no preamble — with exactly these keys:
{{
  "verdict": "PASS or FAIL",
  "findings": [
    {{
      "severity": "CRITICAL/HIGH/MEDIUM/LOW/INFO",
      "title": "short title",
      "description": "detailed description",
      "location": "file:line or empty string",
      "recommendation": "how to fix"
    }}
  ],
  "security_doc_entry": "markdown section to append to docs/security-review.md",
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
data = extract_json(response_text, message)

# ── write security doc entry ──────────────────────────────────────────────────

if data.get('security_doc_entry', '').strip():
    append_to_file('docs/security-review.md', data['security_doc_entry'])
    print("Updated docs/security-review.md")

# ── post PR comment ───────────────────────────────────────────────────────────

verdict = data.get('verdict', 'UNKNOWN')
pr_comment = data.get('pr_comment', '')

if pr_comment and token and repo:
    badge = '✅ PASS' if verdict == 'PASS' else '❌ FAIL'
    full_comment = f"## 🔒 SDLC Session 4 — Security Review: {badge}\n\n{pr_comment}"
    post_pr_comment(repo, issue_number, token, full_comment)

print(f"Security review verdict: {verdict}")
print("Done.")
