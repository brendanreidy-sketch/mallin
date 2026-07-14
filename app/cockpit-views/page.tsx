import { auth } from '@clerk/nextjs/server';
import { DEALS, BOOK_REP } from '@/lib/cockpit/deal-registry';
import { deriveBookRow } from '@/lib/cockpit/derive-book';
import { reviewBook } from '@/lib/cockpit/book-agent';
import { getSubstrate } from '@/lib/cockpit/deal-substrate';
import { buildEvidenceIndex, resolveEvidence } from '@/lib/cockpit/evidence-index';
import { getGmailConnectionStatus } from '@/lib/auth/gmail-oauth';
import { BookView } from './BookView';

/**
 * The book — Altitude 1. Two layers on one surface:
 *   1. The Book Agent review (top) — a daily-generated portfolio brief: the
 *      few decisions that deserve attention today, reasoned ACROSS all deals.
 *   2. The full book (below) — every deal, one row each, three lenses.
 * Click any deal to drill into its cockpit (Altitude 2) and evidence (3).
 * No new data plane — both layers read the same Pass-4 artifacts.
 */
export default async function CockpitViewsBookPage() {
  // Stable "today" so the brief + synthetic next-call ordering are deterministic.
  const now = new Date('2026-06-01T12:00:00Z');
  const rows = DEALS.map((d) => deriveBookRow(d, now));

  // Is the signed-in rep's Gmail connected? Governs whether the action cards
  // can fire a real one-click send (through the rep's OWN account, via the
  // existing /api/gmail/send route) or fall back to compose-handoff. No Clerk
  // session in local dev → stays false and the surface degrades gracefully.
  let gmailConnected = false;
  try {
    const { userId } = await auth();
    if (userId) {
      const status = await getGmailConnectionStatus(userId);
      gmailConnected = status.connected;
    }
  } catch {
    // No auth context or Supabase unreachable — keep false, degrade gracefully.
  }

  const review = reviewBook(DEALS, now);
  // Resolve evidence quotes for the SURFACED decisions only — the agent already
  // ranked the book, so we pay to open substrates for just the top few.
  for (const dec of review.decisions) {
    const substrate = getSubstrate(dec.dealId);
    if (substrate && dec.evidenceIds.length) {
      dec.evidence = resolveEvidence(dec.evidenceIds, buildEvidenceIndex(substrate));
    }
  }

  return <BookView rows={rows} rep={BOOK_REP} review={review} gmailConnected={gmailConnected} />;
}
