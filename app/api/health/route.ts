import { NextResponse } from 'next/server';

/**
 * GET /api/health
 *
 * Returns 200 if the application is running. Public route (excluded
 * from Clerk auth via middleware.ts). Used by:
 *   - Local development verification (does the app start)
 *   - Production uptime checks (later)
 *
 * Does NOT verify database connectivity — that's verify-db-connection.ts.
 * Health check stays cheap and dependency-free so it succeeds even when
 * the database is unreachable.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}
