import { NextResponse, type NextRequest } from "next/server";
import { exchangeCodeForTokens } from "@/lib/adapters/gmail";

/**
 * Gmail OAuth callback. Google redirects here after the user grants
 * consent on the OAuth screen with ?code=...&state=...
 *
 * Flow:
 *   1. Validate `state` matches a signed CSRF token we issued in
 *      /api/gmail/connect.
 *   2. Exchange `code` for access + refresh tokens via the adapter,
 *      which persists them in gmail_oauth_tokens.
 *   3. Redirect to /settings/integrations?gmail=connected (success)
 *      or ?gmail=denied (user clicked deny) or ?gmail=error (failure).
 *
 * Auth: this route handles the *callback* phase, so the user has
 * already authenticated with Mallin before initiating the consent
 * flow. The `state` parameter carries userId + tenantId securely.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/settings/integrations?gmail=denied&reason=${encodeURIComponent(error)}`,
        req.url,
      ),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`/settings/integrations?gmail=error&reason=missing_code_or_state`, req.url),
    );
  }

  try {
    const { googleEmail } = await exchangeCodeForTokens(code, state);
    return NextResponse.redirect(
      new URL(
        `/settings/integrations?gmail=connected&email=${encodeURIComponent(googleEmail)}`,
        req.url,
      ),
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.redirect(
      new URL(
        `/settings/integrations?gmail=error&reason=${encodeURIComponent(message)}`,
        req.url,
      ),
    );
  }
}
