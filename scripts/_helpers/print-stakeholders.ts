import type { AssembledStakeholder } from '@/orchestration/pass-1.5/input-assembler.types';

export function printStakeholders(stakeholders: AssembledStakeholder[]) {
  console.log('─── Stakeholders ───────────────────────────────────────────────');
  console.log(`Total: ${stakeholders.length}`);
  console.log();

  // Breakdown by source
  const bySource: Record<string, number> = {};
  for (const s of stakeholders) {
    bySource[s.source] = (bySource[s.source] ?? 0) + 1;
  }
  console.log('By source:');
  console.table(bySource);

  // Breakdown by party
  const byParty: Record<string, number> = {};
  for (const s of stakeholders) {
    byParty[s.party] = (byParty[s.party] ?? 0) + 1;
  }
  console.log('By party:');
  console.table(byParty);

  // Detailed table — destructure to avoid chat-mangling on dotted property access
  if (stakeholders.length > 0) {
    console.log('Detail:');
    console.table(
      stakeholders.map((s) => {
        const {
          name,
          party,
          committee_role: role,
          deal_disposition: disposition,
          source,
          is_departed: departed,
        } = s;
        return {
          name,
          party,
          role: role ?? '(unset)',
          disposition: disposition ?? '(none)',
          source,
          departed: departed ? 'YES' : '',
        };
      })
    );
  }

  console.log();
}
