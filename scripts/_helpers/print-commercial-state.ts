import type { AssembledCommercialState } from '@/orchestration/pass-1.5/input-assembler.types';

export function printCommercialState(state: AssembledCommercialState | undefined) {
  console.log('─── Commercial state ──────────────────────────────────────────');

  if (!state) {
    console.log('(none — early-stage deal)');
    console.log();
    return;
  }

  const {
    list_price_annual: listPrice,
    currency,
    proposal_price_annual: proposalPrice,
    proposal_term_months: termMonths,
    proposal_payment: payment,
    proposal_discount_pct: discountPct,
    deal_desk_max_discount_pct: floorDiscount,
    deal_desk_min_term_months: floorTerm,
    redline_status: redlineStatus,
    customer_asks: customerAsks,
    concessions,
    open_redlines: openRedlines,
  } = state;

  console.log(`List price:      ${listPrice} ${currency ?? ''}`);
  console.log(`Proposal price:  ${proposalPrice} ${currency ?? ''}`);
  console.log(`Term:            ${termMonths} months`);
  console.log(`Payment:         ${payment ?? '(none)'}`);
  console.log(`Discount:        ${discountPct}%`);
  console.log(`Floor discount:  ${floorDiscount}%`);
  console.log(`Floor term:      ${floorTerm} months`);
  console.log(`Redline status:  ${redlineStatus ?? '(none)'}`);
  console.log();

  console.log(`Customer asks (${customerAsks.length}):`);
  if (customerAsks.length > 0) {
    console.table(customerAsks);
  }

  console.log(`Concessions (${concessions.length}):`);
  if (concessions.length > 0) {
    console.table(concessions);
  }

  console.log(`Open redlines (${openRedlines.length}):`);
  for (const r of openRedlines) {
    console.log(`  - ${r}`);
  }

  console.log();
}
