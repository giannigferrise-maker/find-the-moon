"""
Sends the PR diff to Claude and posts the response as a PR comment.
Called by .github/workflows/pr-review.yml.
"""
import anthropic
import json
import os
import urllib.request

# Read the diff
with open('pr.diff', 'r') as f:
    diff = f.read()

if not diff.strip():
    print("Empty diff — nothing to review.")
    raise SystemExit(0)

# Truncate very large diffs to stay within token limits
MAX_CHARS = 30000
truncated = len(diff) > MAX_CHARS
if truncated:
    diff = diff[:MAX_CHARS] + "\n\n[diff truncated — too large to show in full]"

# Build the prompt
prompt = """You are reviewing a pull request for "Find the Moon" — a mobile web app that shows users where the moon is. Key facts about the codebase:

- moonLogic.js contains pure JS functions (azimuth, phase, refraction, betaToElevation, etc.) that must stay in sync with the parallel implementations inside index.html
- SunCalc is the astronomy library
- DeviceOrientationEvent is used for compass (alpha) and tilt guide (beta)
- betaToElevation formula is (beta - 90), clamped to [0, 90]
- Verification tests live in __tests_verify__/, unit tests in __tests__/

Review this diff for:
- Bugs or logic errors
- Any drift between moonLogic.js and index.html (they must mirror each other)
- Missing edge cases or fragile assumptions
- Anything that could break on mobile (iOS or Android)
- Test coverage gaps — does the change need new or updated tests?

Be concise and specific. Group findings by severity (if any): Bug, Warning, Suggestion. If the diff looks clean, say so briefly — don't pad the review.

<diff>
{diff}
</diff>""".format(diff=diff)

# Call Claude
client = anthropic.Anthropic()
message = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": prompt}]
)

review = message.content[0].text

# Build the comment body
note = "\n\n> Warning: Diff was truncated — review covers only the first 30,000 characters." if truncated else ""
body = "## Claude Code Review\n\n{review}{note}".format(review=review, note=note)

# Post as a PR comment via GitHub REST API
repo = os.environ['REPO']
pr_number = os.environ['PR_NUMBER']
gh_token = os.environ['GH_TOKEN']

url = "https://api.github.com/repos/{repo}/issues/{pr}/comments".format(
    repo=repo, pr=pr_number
)
data = json.dumps({"body": body}).encode()
req = urllib.request.Request(url, data=data, headers={
    "Authorization": "Bearer {token}".format(token=gh_token),
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json",
})
urllib.request.urlopen(req)
print("Review posted successfully.")
