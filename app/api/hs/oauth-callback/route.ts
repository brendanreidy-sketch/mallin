import { NextResponse, type NextRequest } from "next/server";
import { exchangeCodeForTokens } from "@/lib/adapters/hubspot";

/**
 * HubSpot OAuth callback. HubSpot redirects here after the customer
 * installs the Mallin app, with ?code=...&state=...
 *
 * Flow:
 *   1. Validate `state` (CSRF token) — done inside exchangeCodeForTokens
 *   2. Exchange `code` for access + refresh tokens
 *   3. Persist tokens in hubspot_oauth_tokens (per-tenant)
 *   4. Redirect to /settings/integrations?hubspot=connected
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/settings/integrations?hubspot=denied&reason=${encodeURIComponent(error)}`,
        req.url,
      ),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(
        `/settings/integrations?hubspot=error&reason=missing_code_or_state`,
        req.url,
      ),
    );
  }

  try {
    const { hubDomain } = await exchangeCodeForTokens(code, state);
    return NextResponse.redirect(
      new URL(
        `/settings/integrations?hubspot=connected${hubDomain ? `&domain=${encodeURIComponent(hubDomain)}` : ""}`,
        req.url,
      ),
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.redirect(
      new URL(
        `/settings/integrations?hubspot=error&reason=${encodeURIComponent(message)}`,
        req.url,
      ),
    );
  }
}
