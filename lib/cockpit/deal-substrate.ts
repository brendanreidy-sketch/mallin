/**
 * Per-deal substrate map — the raw call/email units behind each artifact's
 * evidence ids. Heavy, and only the cockpit drill-down ([dealId]) needs it (to
 * resolve evidence quotes). Kept out of deal-registry.ts so the book index
 * never imports it.
 *
 * Synthetic demo substrate only (Hooli Holdings, Beneba Industries).
 */

import acme from '@/scripts/_fixtures/acme-beneba-full-pipeline-output.json';
import { HOOLI_HOLDINGS } from '@/lib/demo/substrate/hooli-holdings';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SUBSTRATE: Record<string, any> = {
  'hooli-holdings': HOOLI_HOLDINGS,
  'acme-beneba': acme,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSubstrate(id: string): any | undefined {
  return SUBSTRATE[id];
}
