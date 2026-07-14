import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';

/**
 * Routes that don't require authentication.
 * Everything else is protected by default.
 */
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  // Self-serve B2C signup entry. /welcome (post-signup provisioning) is NOT
  // public — it requires an authenticated session.
  '/start(.*)',
  // No-auth "try one call" — public landing + its costed pipeline. The route
  // enforces its OWN abuse guard (per-IP + global daily caps); it must be
  // public to Clerk so unauth visitors aren't 404'd before the guard runs.
  '/try(.*)',
  '/api/try-brief',
  '/api/health',
  '/api/log-touch',
  '/api/transcribe-voice',
  '/api/coach',
  '/api/search',
  '/api/regenerate',
  '/api/intelligence',
  // B2C intake, billing, and the Stripe webhook all enforce their OWN auth
  // inside the handler (intake/billing call auth() and 401; the webhook
  // verifies a Stripe signature). They MUST be public to Clerk: auth.protect()
  // returns a 404 for unauthenticated requests, Vercel edge-caches that 404,
  // and then serves it to EVERYONE — signed-in users and Stripe alike. That
  // cached 404 is what broke /new ("Something went wrong") and blocked the
  // Stripe webhook. Same trap as /api/theme/* and /api/live-coach below.
  '/api/intake/(.*)',
  // On-access intelligence refresh — self-auths inside (auth() + tenant check).
  '/api/intel/refresh',
  // On-demand stakeholder web research — self-auths inside (auth() + tenant).
  '/api/intel/stakeholder',
  '/api/billing/(.*)',
  '/api/webhooks/(.*)',
  '/api/deal-outcome',
  '/api/brief-feedback',
  '/api/sdr/(.*)',
  '/sdr/widget/(.*)',
  // Cron endpoints are unauthenticated to Clerk but enforce their own
  // CRON_SECRET bearer auth inside the route handler. Without this
  // bypass, Vercel's cron pings get 404'd by Clerk's middleware.
  '/api/cron/(.*)',
  // Theme endpoint runs its own auth check inside the handler
  // (`auth().userId`). Clerk middleware's auth.protect() returns 404
  // when a session can't be matched against the route, so leave the
  // routing public and let the handler enforce.
  '/api/theme/(.*)',
  // Live coach endpoint: handler treats auth as optional (signed-in
  // users get turn persistence + Slack manager notification;
  // anonymous demo users just get the chat reply). Without the
  // public match here, middleware 404's anonymous requests before
  // the handler can decide. Same pattern as /api/cron/* and
  // /api/theme/*.
  '/api/live-coach(.*)',
  '/api/sf/(.*)',
  '/api/calls/(.*)',
  '/api/slack/(.*)',
  '/prep(.*)',
  // Public read-only share route — substrate render gated by per-opp
  // share_token (not by Clerk session). The page handler 404s if the
  // token doesn't resolve to an opp with a current artifact.
  '/share(.*)',
  // Public read-only slide deck — SAME gate as /share (per-opp share_token,
  // no Clerk session). Without this, auth.protect() bounces the unauthenticated
  // recipient to sign-in, so a deck link is unopenable by anyone who isn't
  // logged into the seller's account. The page + the .pptx download both live
  // under /deck / /api/generate-deck and enforce the token themselves.
  '/deck(.*)',
  '/api/generate-deck(.*)',
  '/sf/diff(.*)',
  '/sf/preview(.*)',
  '/sf/replay(.*)',
  '/run(.*)',
  '/cockpit-mock(.*)',
  '/walkthrough(.*)',
  '/how-it-works(.*)',
  // Public founder / about marketing page.
  '/about(.*)',
  // Public team page.
  '/team(.*)',
  '/pilot(.*)',
  '/api/pilot-signup',
  '/contact(.*)',
  '/api/contact',
  '/trust(.*)',
  '/privacy(.*)',
  '/terms(.*)',
  '/security(.*)',
  '/ai-governance(.*)',
  '/subprocessors(.*)',
  '/blog(.*)',
  // Admin compliance endpoints (tenant export / delete) self-authenticate
  // inside the handler — Clerk session + owner allowlist — returning 401/403
  // JSON. They MUST be public to Clerk so auth.protect() doesn't 404 an
  // unauthenticated request and let Vercel edge-cache that 404 for everyone.
  // Same trap documented on /api/intake/*, /api/theme/*, etc. above.
  '/api/admin/(.*)',
]);

const clerkHandler = clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

/**
 * Fail-open when Clerk env vars are missing (e.g. Vercel Preview deployments
 * without secrets configured). The landing page at `/` and other public routes
 * render fine without auth context; protected routes are gated server-side so
 * skipping the middleware here doesn't expose them — the underlying page
 * components still call `auth()` and will redirect on their own.
 *
 * Same defensive pattern as `lib/db/client.ts`: don't blow up the whole edge
 * runtime just because env wasn't wired up for this environment.
 */
export default async function middleware(req: NextRequest, ev: NextFetchEvent) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    return NextResponse.next();
  }
  return clerkHandler(req, ev);
}

export const config = {
  matcher: [
    // Exclude static assets and Next.js internals
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
