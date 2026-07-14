import { notFound } from 'next/navigation';
import { getDeal } from '@/lib/cockpit/deal-registry';
import { getSubstrate } from '@/lib/cockpit/deal-substrate';
import { buildEvidenceIndex } from '@/lib/cockpit/evidence-index';
import { matchReference } from '@/lib/cockpit/match-reference';
import { ViewsHarness } from '../ViewsHarness';

/**
 * The cockpit — Altitude 2. A single deal drilled in from the book. Same
 * harness as before (template swap × rep view × evidence popovers); the deal is
 * now resolved from the registry by URL slug, and evidence is resolved from
 * that deal's own substrate.
 *
 * No generateStaticParams: the cockpit is owner-gated (see ../layout.tsx), so it
 * renders per request rather than being prerendered at build time.
 */
export default async function DealCockpitPage({
  params,
}: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await params;
  const deal = getDeal(dealId);
  if (!deal) notFound();

  // Resolve evidence ids -> quoted units on the server from this deal's
  // substrate; pass only the small resolved index to the client.
  const substrate = getSubstrate(dealId);
  const evidenceIndex = substrate ? buildEvidenceIndex(substrate) : undefined;

  // Altitude-2 ammo: the single closest closed-won comparable in the book,
  // matched to THIS open deal by industry + module footprint (+ competitor
  // overlap). Resolved on the server; null when there's no usable comparable.
  const referenceMatch = matchReference(dealId);

  return (
    <ViewsHarness
      artifact={deal.artifact}
      dealName={deal.name}
      evidenceIndex={evidenceIndex}
      referenceMatch={referenceMatch}
      backHref="/cockpit-views"
    />
  );
}
