// Cloudflare Pages Function — receives a feature/bug submission from the
// web app and creates a GitHub Issue using a token stored in env vars.
// The token never touches the browser.

const ALLOWED_TYPES = ['feature', 'bug'];
const MAX_TITLE_LEN = 100;
const MAX_DESC_LEN  = 2000;

// Strip HTML tags and control characters, then trim whitespace
function sanitize(str) {
  return str
    .replace(/<[^>]*>/g, '')        // strip HTML tags
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') // strip control chars
    .trim();
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Parse JSON body
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { type, title, description } = body;

  // Validate type
  if (!type || !ALLOWED_TYPES.includes(type)) {
    return new Response(JSON.stringify({ error: 'Invalid type' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate and sanitize title
  if (!title || typeof title !== 'string') {
    return new Response(JSON.stringify({ error: 'Title is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const cleanTitle = sanitize(title).slice(0, MAX_TITLE_LEN);
  if (cleanTitle.length === 0) {
    return new Response(JSON.stringify({ error: 'Title cannot be empty' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate and sanitize description
  if (!description || typeof description !== 'string') {
    return new Response(JSON.stringify({ error: 'Description is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const cleanDesc = sanitize(description).slice(0, MAX_DESC_LEN);
  if (cleanDesc.length === 0) {
    return new Response(JSON.stringify({ error: 'Description cannot be empty' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Confirm env vars are present (fail fast, no token leakage)
  const token = env.GITHUB_TOKEN;
  const repo  = env.GITHUB_REPO; // format: "owner/repo"
  if (!token || !repo) {
    console.error('Missing GITHUB_TOKEN or GITHUB_REPO env vars');
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const label  = type === 'feature' ? 'enhancement' : 'bug';
  const prefix = type === 'feature' ? '[Feature Request] ' : '[Bug Report] ';

  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        title: prefix + cleanTitle,
        body:  cleanDesc,
        labels: [label],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('GitHub API error:', response.status, errText);
      return new Response(JSON.stringify({ error: 'Failed to create issue', debug_status: response.status, debug_body: errText }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
