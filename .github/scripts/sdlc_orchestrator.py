"""
SDLC Orchestrator — Phase 2 (Retry + Failure Classification)

Triggered by any of the five SDLC label events. Runs sessions in sequence,
classifies failures, applies targeted fixes, and retries automatically.
Escalates to the human when max retries are exhausted.

Failure classification:
  Session 3: deterministic — parses session3-status.json (app_bugs field)
  Session 4: Opus call — reads security findings, determines re-entry
  Session 5: Opus call — reads quality findings, determines re-entry

Re-entry after failure:
  App bug (S3)         → enrich delta with bug report → re-run S2, S3, ...
  Test authoring (S3)  → re-run S3 (session handles its own fix loop)
  Security bug (S4)    → enrich delta with fix note → re-run S2, S3, S4
  Quality: stale docs  → direct patch SRS/VTM → re-run S5
  Quality: coverage    → re-run S3, S4, S5
  Quality: code/req    → enrich delta → re-run S2 (or S1), ..., S5
"""

import os
import re
import json
import subprocess
import datetime
import urllib.request
import urllib.error
import anthropic

# ── constants ─────────────────────────────────────────────────────────────────

MAX_RETRIES    = 3   # max attempts per session before escalating
DELTA_PATH     = '.github/sdlc_session1_delta.md'
SECURITY_DOC   = 'docs/security-review.md'
QUALITY_DOC    = 'docs/quality-review.md'
STATE_FILE     = 'orchestrator-state.json'

# ── helpers ───────────────────────────────────────────────────────────────────

def run_command(cmd):
    """Run a shell command. Return (returncode, combined stdout+stderr)."""
    result = subprocess.run(
        cmd, shell=True, capture_output=True, text=True,
        env=os.environ.copy()
    )
    output = (result.stdout or '') + (result.stderr or '')
    if output.strip():
        print(output.strip())
    return result.returncode, output

def write_diff(output_path, *path_args):
    """Run git diff and write stdout to a file."""
    paths = ' '.join(f"'{p}'" if ' ' in p else p for p in path_args)
    result = subprocess.run(
        f'git diff origin/main..HEAD -- {paths}',
        shell=True, capture_output=True, text=True
    )
    with open(output_path, 'w') as f:
        f.write(result.stdout)
    print(f"  {output_path}: {len(result.stdout)} chars")

def read_file(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        return ''

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

print(f"=== SDLC Orchestrator — Phase 2 ===")
print(f"Issue #{issue_number}: {issue_title}")
print(f"Label: {trigger_label}  |  Entry session: {entry_session}")
print()

# ── state ─────────────────────────────────────────────────────────────────────

state = {
    'issue_number': issue_number,
    'trigger_label': trigger_label,
    'entry_session': entry_session,
    'phase': 2,
    'start_time': datetime.datetime.utcnow().isoformat() + 'Z',
    'sessions_run': [],
    'retry_counts': {},
    'fixes_applied': [],
    'final_verdict': None,
}

def save_state():
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)
    run_command(f'git add {STATE_FILE}')
    rc, _ = run_command('git diff --cached --quiet')
    if rc != 0:
        run_command(f'git commit -m "Orchestrator state update for issue #{issue_number}"')
        run_command(f'git push origin {branch}')

# ── pre-session setup ─────────────────────────────────────────────────────────

def prepare_for_session(session):
    """Compute diffs or other pre-session setup."""
    if session == 4:
        run_command('git fetch origin main')
        write_diff('/tmp/branch.diff')
    if session == 5:
        run_command('git fetch origin main')
        write_diff('/tmp/core.diff',
                   'FTM-SRS-001.md', 'traceability-matrix.txt',
                   'index.html', 'src/', 'docs/')
        write_diff('/tmp/tests_jest.diff',
                   '__tests_verify__/verification.test.js')
        write_diff('/tmp/tests_spec.diff',
                   '__tests_verify__/verification.spec.js')

# ── run session ───────────────────────────────────────────────────────────────

def run_session(session):
    """Run a session script. Return (verdict, output, elapsed_seconds)."""
    prepare_for_session(session)
    print(f"\n--- Running {SESSION_NAMES[session]} ---\n")
    start = datetime.datetime.utcnow()
    rc, output = run_command(f'python3 .github/scripts/sdlc_session{session}.py')
    elapsed = (datetime.datetime.utcnow() - start).seconds
    verdict = parse_verdict(session, rc, output)
    print(f"\n--- {SESSION_NAMES[session]} complete: {verdict} ({elapsed}s) ---\n")
    return verdict, output, elapsed

def parse_verdict(session, rc, output):
    if session == 1:
        return 'PASS' if rc == 0 and os.path.exists(DELTA_PATH) else 'FAIL'
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
        match = re.search(r'review verdict: (PASS|FAIL)', output)
        if match:
            return match.group(1)
        return 'FAIL' if rc != 0 else 'UNKNOWN'
    return 'FAIL'

# ── commit session results ────────────────────────────────────────────────────

def commit_session_results(session):
    files = ' '.join(COMMIT_FILES[session])
    run_command(f'git add {files}')
    rc, _ = run_command('git diff --cached --quiet')
    if rc != 0:
        run_command(f'git commit -m "SDLC Session {session} (orchestrator): issue #{issue_number}"')
        run_command(f'git push origin {branch}')
        print(f"Committed Session {session} results.")
    else:
        print(f"No file changes from Session {session}.")

# ── failure classification ────────────────────────────────────────────────────

def classify_failure_s3():
    """
    Deterministic classification of Session 3 failures.
    Reads session3-status.json which now includes app_bugs field.
    Returns dict: {category, re_entry_session, details}
    """
    try:
        with open('session3-status.json') as f:
            status = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {'category': 'unknown', 're_entry_session': 3, 'details': 'Could not read session3-status.json'}

    app_bugs = status.get('app_bugs', [])
    if app_bugs:
        return {
            'category': 'app_bug',
            're_entry_session': 2,
            'details': app_bugs,
        }
    # No app bugs — test authoring errors or coverage/duplicate issues
    return {
        'category': 'test_authoring',
        're_entry_session': 3,
        'details': 'Test authoring errors or coverage gaps — Session 3 retry.',
    }

def classify_failure_s4_s5(session, session_output):
    """
    Opus-based classification of Session 4/5 failures.
    Returns dict: {category, re_entry_session, fix_description, reasoning}
    """
    if session == 4:
        findings_context = read_file(SECURITY_DOC)[-3000:]
        session_label = "Security Review (Session 4)"
    else:
        findings_context = read_file(QUALITY_DOC)[-3000:]
        session_label = "Quality Review (Session 5)"

    prompt = f"""You are the orchestrator for the "Find the Moon" SDLC pipeline.
{session_label} has failed for issue #{issue_number}: {issue_title}

--- Session output (last 2000 chars) ---
{session_output[-2000:]}

--- Latest findings from review document ---
{findings_context}

Classify this failure and determine where the pipeline should re-enter to fix it.

Re-entry options:
- session 1: Requirements gap — SRS needs a new or corrected requirement
- session 2: Code bug or security issue — implementation needs to change
- session 3: Test/VTM gap — tests or traceability matrix need updating
- session 5: Stale documentation only — SRS or VTM can be patched directly, no code change needed

Also provide a specific fix_description that will be appended to the delta file's
implementation guidance to tell the re-entry session exactly what to fix.

Return ONLY valid JSON:
{{
  "category": "short category name",
  "re_entry_session": <1, 2, 3, or 5>,
  "fix_description": "specific instruction for the re-entry session",
  "reasoning": "brief explanation"
}}"""

    client = anthropic.Anthropic()
    message = client.messages.create(
        model='claude-opus-4-6',
        max_tokens=1024,
        messages=[{'role': 'user', 'content': prompt}],
    )
    text = message.content[0].text
    try:
        match = re.search(r'\{[\s\n]*"', text)
        if match:
            start = match.start()
            end = text.rfind('}') + 1
            return json.loads(text[start:end])
    except (json.JSONDecodeError, ValueError):
        pass
    # Fallback: conservative re-entry
    return {
        'category': 'unknown',
        're_entry_session': 2 if session == 4 else 3,
        'fix_description': f'Session {session} failed — review findings and fix.',
        'reasoning': 'Could not parse Opus classification response.',
    }

def classify_failure(session, session_output):
    if session == 3:
        return classify_failure_s3()
    return classify_failure_s4_s5(session, session_output)

# ── apply fix ─────────────────────────────────────────────────────────────────

def enrich_delta(section_title, content):
    """Append a new section to the delta file for the re-entry session to read."""
    delta = read_file(DELTA_PATH)
    if not delta:
        print(f"WARNING: Delta file not found at {DELTA_PATH} — cannot enrich.")
        return
    addition = f"\n\n## {section_title}\n{content}\n"
    with open(DELTA_PATH, 'a', encoding='utf-8') as f:
        f.write(addition)
    run_command(f'git add {DELTA_PATH}')
    rc, _ = run_command('git diff --cached --quiet')
    if rc != 0:
        run_command(f'git commit -m "Orchestrator: enrich delta for issue #{issue_number}"')
        run_command(f'git push origin {branch}')
    print(f"Delta enriched with: {section_title}")

def apply_fix(failed_session, classification):
    """Apply a targeted fix before re-running the re-entry session."""
    category = classification.get('category', 'unknown')
    details  = classification.get('details', '')
    fix_desc = classification.get('fix_description', '')

    if category == 'app_bug':
        bug_list = '\n'.join(f"- {b}" for b in details) if isinstance(details, list) else details
        enrich_delta(
            'Orchestrator — App Bug Report (Session 3 Failure)',
            f"Session 3 tests identified the following app bugs that must be fixed "
            f"in the implementation. The tests are correct — the code is wrong.\n\n"
            f"{bug_list}\n\n"
            f"Fix these issues in index.html or src/moonLogic.js. "
            f"Do not modify the test files."
        )
        state['fixes_applied'].append({
            'before_session': 2,
            'category': 'app_bug',
            'description': f"Enriched delta with app bug report: {bug_list[:200]}",
        })

    elif category in ('security_bug', 'code_quality', 'requirements_gap') or fix_desc:
        enrich_delta(
            f'Orchestrator — Fix Guidance ({category})',
            fix_desc or f"Session {failed_session} failed with category '{category}'. "
                        f"Apply targeted fix before proceeding."
        )
        state['fixes_applied'].append({
            'before_session': classification.get('re_entry_session'),
            'category': category,
            'description': fix_desc[:200] if fix_desc else category,
        })

    elif category == 'stale_docs':
        # For stale docs, Opus should have provided specific patch instructions
        # in fix_description. Log it — actual patching is manual for now.
        print(f"Stale docs fix needed: {fix_desc}")
        state['fixes_applied'].append({
            'before_session': 5,
            'category': 'stale_docs',
            'description': fix_desc[:200] if fix_desc else 'Stale documentation',
        })

    else:
        # test_authoring, duplicate_ids, missing_coverage — no pre-fix needed
        # Session 3 will handle these in its own fix loop on retry
        print(f"No pre-fix needed for category '{category}' — Session 3 retry will handle it.")

# ── session 1 branch + PR setup ───────────────────────────────────────────────

if entry_session == 1:
    rc, out = run_command(f'git checkout -b {branch}')
    if rc != 0:
        print(f"ERROR: Failed to create branch {branch}.")
        exit(1)
    print(f"Created branch: {branch}")

# ── main orchestration loop ───────────────────────────────────────────────────

sessions_to_run = list(range(entry_session, 6))
final_verdict   = 'FAIL'

while sessions_to_run:
    current_session = sessions_to_run[0]
    attempt = state['retry_counts'].get(str(current_session), 0) + 1

    print(f"\n{'='*60}")
    print(f"Running {SESSION_NAMES[current_session]} (attempt {attempt})")
    print(f"{'='*60}")

    verdict, session_output, elapsed = run_session(current_session)

    state['sessions_run'].append({
        'session': current_session,
        'attempt': attempt,
        'verdict': verdict,
        'elapsed_seconds': elapsed,
        'timestamp': datetime.datetime.utcnow().isoformat() + 'Z',
    })

    commit_session_results(current_session)

    # Session 1: open draft PR on first pass
    if current_session == 1 and verdict == 'PASS' and attempt == 1:
        pr_body_path = '.github/sdlc_pr_body.md'
        if not os.path.exists(pr_body_path):
            with open(pr_body_path, 'w') as f:
                f.write(f"SDLC automated PR for issue #{issue_number}: {issue_title}")
        rc_pr, _ = run_command(
            f'gh pr create '
            f'--title "SDLC issue #{issue_number}: {issue_title}" '
            f'--body-file {pr_body_path} '
            f'--base main --head {branch} --draft'
        )

    if verdict == 'PASS':
        sessions_to_run.pop(0)
        if not sessions_to_run:
            final_verdict = 'PASS'
        continue

    # ── FAIL path ──────────────────────────────────────────────────────────────

    classification = classify_failure(current_session, session_output)
    re_entry       = classification.get('re_entry_session', current_session)
    category       = classification.get('category', 'unknown')

    print(f"\nFailure classification: {category} | Re-entry: Session {re_entry}")

    state['retry_counts'][str(re_entry)] = attempt

    if attempt >= MAX_RETRIES:
        print(f"ERROR: Session {re_entry} has hit max retries ({MAX_RETRIES}). Escalating.")
        state['final_verdict'] = 'ESCALATED'
        save_state()

        # Build escalation report
        runs_summary = '\n'.join(
            f"  Session {r['session']}, attempt {r['attempt']}: {r['verdict']} ({r['elapsed_seconds']}s)"
            for r in state['sessions_run']
        )
        fixes_summary = '\n'.join(
            f"  - {f['description']}" for f in state['fixes_applied']
        ) or '  None'
        last_output_snippet = session_output[-1500:].strip()

        escalation = (
            f"**SDLC Orchestrator — ESCALATION**\n\n"
            f"Session {re_entry} exceeded {MAX_RETRIES} retry attempts without passing.\n\n"
            f"**Triggered by:** `{trigger_label}`\n\n"
            f"**Sessions run:**\n{runs_summary}\n\n"
            f"**Fixes applied by orchestrator:**\n{fixes_summary}\n\n"
            f"**Last failure output (truncated):**\n```\n{last_output_snippet}\n```\n\n"
            f"Human action required. Review the above, fix the underlying issue, "
            f"and re-apply `{trigger_label}` to retry."
        )
        post_issue_comment(repo, issue_number, token, escalation)
        exit(1)

    apply_fix(current_session, classification)

    # Rebuild the run queue from re-entry session forward
    sessions_to_run = list(range(re_entry, 6))
    print(f"Re-entering at Session {re_entry}. Queue: {sessions_to_run}")

# ── final state and handoff report ───────────────────────────────────────────

state['final_verdict'] = final_verdict
save_state()

runs_summary = '\n'.join(
    f"  Session {r['session']}, attempt {r['attempt']}: {r['verdict']} ({r['elapsed_seconds']}s)"
    for r in state['sessions_run']
)
fixes_summary = '\n'.join(
    f"  - {f['description']}" for f in state['fixes_applied']
) or '  None'

if final_verdict == 'PASS':
    next_label = NEXT_LABEL[max(r['session'] for r in state['sessions_run'])]
    next_step = (
        f"Apply label {next_label} to proceed."
        if next_label
        else "All sessions complete. Review the draft PR and merge when ready."
    )
    report = (
        f"**SDLC Orchestrator — Stage complete**\n\n"
        f"Triggered by: `{trigger_label}`\n\n"
        f"**Sessions run:**\n{runs_summary}\n\n"
        f"**Fixes applied by orchestrator:**\n{fixes_summary}\n\n"
        f"**Next step:** {next_step}"
    )
else:
    report = (
        f"**SDLC Orchestrator — FAILED**\n\n"
        f"Triggered by: `{trigger_label}`\n\n"
        f"**Sessions run:**\n{runs_summary}\n\n"
        f"**Fixes applied:**\n{fixes_summary}\n\n"
        f"Review the Actions log, fix the underlying issue, and re-apply `{trigger_label}`."
    )

post_issue_comment(repo, issue_number, token, report)

if final_verdict != 'PASS':
    exit(1)

print("\nOrchestrator complete.")
