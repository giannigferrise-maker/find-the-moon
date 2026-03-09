// Temporary test function to verify Cloudflare Pages Functions are working
export async function onRequest(context) {
  return new Response(JSON.stringify({
    status: 'ok',
    github_token_present: !!context.env.GITHUB_TOKEN,
    github_repo: context.env.GITHUB_REPO || 'NOT SET',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
