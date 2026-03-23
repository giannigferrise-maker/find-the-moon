"""
SDLC Orchestrator — Phase 1 (Pass-through)

Triggered by any of the five SDLC label events. Determines the entry session,
runs the appropriate session script as a subprocess, parses the verdict, commits
results, and posts a structured handoff report on the issue.

Phase 1 has no retry logic — it is a pure pass-through that validates all
infrastructure (subprocess execution, verdict parsing, state management, GitHub
API comments) before Phase 2 adds the retry/classification loop.
"""

import os
import re
import json
import subprocess
import datetime
import urllib.request
import urllib.error

# ── helpers ───────────────────────────────────────────────────────────────────

def run_command(cmd, capture_output=True):
    """Run a shell command. Return (returncode, combined stdout+stderr)."""
    result = subprocess.run(
        cmd, shell=True, capture_output=capture_output, text=True,
        env=os.environ.copy()
    )
    output = (result.stdout or '') + (result.stderr or '')
    if output.strip():
        print(output.strip())
    return result.returncode, output

def write_diff(output_path, *path_args):
    """Run git diff and write stdout to a file. Returns char count."""
    paths = ' '.join(f"'{p}'" if ' ' in p else p for p in path_args)
    result = subprocess.run(
        f'git diff origin/main..HEAD -- {paths}',
        shell=True, capture_output=True, text=True
    )
    with open(output_path, 'w') as f:
        f.write(result.stdout)
    print(f"  {output_path}: {len(result.stdout)} chars")
    return len(result.stdout)

def post_issue_comment(repo, issue_number, token, body):
    url = f"https://api.github.com/repos/{repo}/issues/{issue_number}/comments"
    payload = json.dumps({'body': body}).encode('utf-8')
    req = urllib.request.Request(url, data=payload, method='POST', headers={
        'Authorization': f'Bearer {token}',
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'find-the-moon-sdlc-orchestrator',
        'X-GitHub-Api-Version': '2022-11-28',
    })
    try:
        with urllib.request.urlopen(req, timeout=15):
            print(f"Posted orchestrator comment to issue #{issue_number}")
    except urllib.error.URLError as e:
        print(f"Could not post issue comment: {e}")

# ── context ───────────────────────────────────────────────────────────────────

issue_number  = os.environ['ISSUE_NUMBER']
issue_title   = os.environ['ISSUE_TITLE']
issue_body    = os.environ.get('ISSUE_BODY', '') or '(no description provided)'
trigger_label = os.environ['TRIGGER_LABEL']
token         = os.environ.get('GH_TOKEN', '')
repo          = os.environ.get('REPO', '')
branch        = f"sdlc/issue-{issue_number}"

LABEL_TO_SESSION = {
    '1-reqs-ready':     1,
    '2-code-ready':     2,
    '3-tests-ready':    3,
    '4-security-ready': 4,
    '5-quality-ready':  5,
}

SESSION_NAMES = {
    1: 'Session 1 — Requirements Engineering',
    2: 'Session 2 — Code Implementation',
    3: 'Session 3 — Verification Engineering',
    4: 'Session 4 — Security Review',
    5: 'Session 5 — Quality Review',
}

NEXT_LABEL = {
    1: '`2-code-ready`',
    2: '`3-tests-ready`',
    3: '`4-security-ready`',
    4: '`5-quality-ready`',
    5: None,
}

# Files committed by each session (mirrors existing session workflows)
COMMIT_FILES = {
    1: ['FTM-SRS-001.md', '.github/sdlc_session1_delta.md'],
    2: ['index.html', 'src/moonLogic.js', '__tests__/', '.github/sdlc_pr_body.md'],
    3: ['__tests_verify__/verification.test.js',
        '__tests_verify__/verification.spec.js',
        'traceability-matrix.txt'],
    4: ['docs/security-review.md'],
    5: ['docs/quality-review.md'],
}

entry_session = LABEL_TO_SESSION.get(trigger_label)
if not entry_session:
    print(f"ERROR: Unknown label '{trigger_label}'. Exiting.")
    exit(1)

print(f"=== SDLC Orchestrator — Phase 1 ===")
print(f"Issue #{issue_number}: {issue_title}")
print(f"Label: {trigger_label}  |  Entry session: {entry_session}")
print()

# ── session 1: create feature branch ─────────────────────────────────────────

if entry_session == 1:
    rc, out = run_command(f'git checkout -b {branch}')
    if rc != 0:
        print(f"ERROR: Failed to create branch {branch}.")
        exit(1)
    print(f"Created branch: {branch}")

# ── pre-session: compute diffs (sessions 4 and 5) ────────────────────────────

if entry_session == 4:
    print("Computing diff for Session 4...")
    run_command('git fetch origin main')
    write_diff('/tmp/branch.diff')

if entry_session == 5:
    print("Computing diffs for Session 5...")
    run_command('git fetch origin main')
    write_diff('/tmp/core.diff',
               'FTM-SRS-001.md', 'traceability-matrix.txt',
               'index.html', 'src/', 'docs/')
    write_diff('/tmp/tests_jest.diff',
               '__tests_verify__/verification.test.js')
    write_diff('/tmp/tests_spec.diff',
               '__tests_verify__/verification.spec.js')

# ── run session ───────────────────────────────────────────────────────────────

print(f"\n--- Running {SESSION_NAMES[entry_session]} ---\n")
session_start = datetime.datetime.utcnow()
rc, session_output = run_command(
    f'python3 .github/scripts/sdlc_session{entry_session}.py'
)
session_elapsed = (datetime.datetime.utcnow() - session_start).seconds

print(f"\n--- Session {entry_session} subprocess complete (exit code {rc}, {session_elapsed}s) ---\n")

# ── parse verdict ─────────────────────────────────────────────────────────────

def parse_verdict(session, rc, output):
    if session == 1:
        delta_exists = os.path.exists('.github/sdlc_session1_delta.md')
        return 'PASS' if rc == 0 and delta_exists else 'FAIL'
    if session == 2:
        return 'PASS' if rc == 0 else 'FAIL'
    if session == 3:
        try:
            with open('session3-status.json') as f:
                status = json.load(f)
            return 'PASS' if status.get('all_passed') else 'FAIL'
        except (FileNotFoundError, json.JSONDecodeError):
            return 'FAIL'
    if session in (4, 5):
        # Session scripts print "Security/Quality review verdict: PASS/FAIL"
        match = re.search(r'review verdict: (PASS|FAIL)', output)
        if match:
            return match.group(1)
        return 'FAIL' if rc != 0 else 'UNKNOWN'
    return 'FAIL'

verdict = parse_verdict(entry_session, rc, session_output)
print(f"Orchestrator parsed verdict: {verdict}")

# ── commit and push session results ──────────────────────────────────────────

files_to_add = ' '.join(COMMIT_FILES[entry_session])
run_command(f'git add {files_to_add}')
rc_diff, _ = run_command('git diff --cached --quiet')
if rc_diff != 0:
    commit_msg = f"SDLC Session {entry_session} (orchestrator): issue #{issue_number}"
    run_command(f'git commit -m "{commit_msg}"')
    run_command(f'git push origin {branch}')
    print(f"Committed and pushed Session {entry_session} results.")
else:
    print("No file changes to commit for this session.")

# ── session 1: open draft PR ──────────────────────────────────────────────────

if entry_session == 1 and verdict == 'PASS':
    pr_body_path = '.github/sdlc_pr_body.md'
    if not os.path.exists(pr_body_path):
        with open(pr_body_path, 'w') as f:
            f.write(f"SDLC automated PR for issue #{issue_number}: {issue_title}")
    rc_pr, pr_out = run_command(
        f'gh pr create '
        f'--title "SDLC issue #{issue_number}: {issue_title}" '
        f'--body-file {pr_body_path} '
        f'--base main '
        f'--head {branch} '
        f'--draft'
    )
    if rc_pr != 0:
        print(f"WARNING: Could not create draft PR: {pr_out}")

# ── write orchestrator state file ────────────────────────────────────────────

state = {
    'issue_number': issue_number,
    'trigger_label': trigger_label,
    'entry_session': entry_session,
    'phase': 1,
    'start_time': session_start.isoformat() + 'Z',
    'sessions_run': [
        {
            'session': entry_session,
            'attempt': 1,
            'verdict': verdict,
            'elapsed_seconds': session_elapsed,
            'timestamp': datetime.datetime.utcnow().isoformat() + 'Z',
        }
    ],
    'retry_counts': {},
    'fixes_applied': [],
    'final_verdict': verdict,
}

with open('orchestrator-state.json', 'w') as f:
    json.dump(state, f, indent=2)

run_command('git add orchestrator-state.json')
rc_diff, _ = run_command('git diff --cached --quiet')
if rc_diff != 0:
    run_command(
        f'git commit -m "Orchestrator state: S{entry_session} {verdict} for issue #{issue_number}"'
    )
    run_command(f'git push origin {branch}')

# ── post handoff report or failure report ────────────────────────────────────

if verdict == 'PASS':
    next_label = NEXT_LABEL[entry_session]
    next_step = (
        f"Apply label {next_label} to proceed."
        if next_label
        else "All sessions complete. Review the draft PR and merge when ready."
    )
    report = (
        f"**SDLC Orchestrator — {SESSION_NAMES[entry_session]} complete**\n\n"
        f"Triggered by: `{trigger_label}`\n"
        f"Sessions run: Session {entry_session}, attempt 1 — PASS ({session_elapsed}s)\n"
        f"Fixes applied: none (Phase 1 pass-through)\n\n"
        f"**Next step:** {next_step}"
    )
else:
    report = (
        f"**SDLC Orchestrator — {SESSION_NAMES[entry_session]} FAILED**\n\n"
        f"Triggered by: `{trigger_label}`\n"
        f"Session {entry_session} verdict: FAIL\n\n"
        f"Phase 1 does not retry automatically. Review the Actions log, fix the "
        f"underlying issue, and re-apply `{trigger_label}` to retry.\n\n"
        f"*(Phase 2 will add automatic retry and failure classification.)*"
    )

post_issue_comment(repo, issue_number, token, report)

if verdict != 'PASS':
    print("Orchestrator exiting non-zero — session failed.")
    exit(1)

print("\nOrchestrator complete.")
