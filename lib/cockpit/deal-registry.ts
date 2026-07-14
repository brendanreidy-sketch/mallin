/**
 * Deal registry — the book's roster.
 *
 * Altitude 1 (the book) and Altitude 2 (the cockpit) read the SAME artifacts;
 * the book just renders each at lower resolution via deriveBookRow. This module
 * holds only the light per-deal metadata + the Pass-4 artifact (the small
 * governance output). Heavy substrate (raw calls/emails for evidence quotes)
 * lives in deal-substrate.ts and is imported only by the cockpit drill-down, so
 * the book index never pays to parse it.
 *
 * These are synthetic demo deal artifacts (Hooli Holdings, Beneba Industries) —
 * fully fictional accounts used to exercise the cockpit surfaces.
 */

import type { PrepArtifact } from '@/lib/contracts/execution-agent-output';

import hooli from '@/scripts/_fixtures/hooli-holdings.pass4-output.json';
import acme from '@/scripts/_fixtures/acme-beneba-full-pipeline-output.pass4-output.json';

export interface DealEntry {
  /** URL slug + stable key. */
  id: string;
  /** Display name for the deal/account. */
  name: string;
  /** The rep who owns it (harness: one book, one rep). */
  rep: string;
  /** Pass-4 governance artifact. */
  artifact: PrepArtifact;
}

/** The book's owner. Harness convenience — one book, one rep. */
export const BOOK_REP = 'Jordan';

export const DEALS: DealEntry[] = [
  { id: 'hooli-holdings', name: 'Hooli Holdings', rep: BOOK_REP, artifact: hooli as unknown as PrepArtifact },
  { id: 'acme-beneba', name: 'Beneba Industries', rep: BOOK_REP, artifact: acme as unknown as PrepArtifact },
];

export function getDeal(id: string): DealEntry | undefined {
  return DEALS.find((d) => d.id === id);
}
