/**
 * resolveDeckRecipients — pick who a deck-send should go TO.
 *
 * The bug this exists to prevent: the deck-send action ("Deck send to
 * meeting attendee") once resolved to the logged-in REP's own address
 * (builtalone@gmail.com) instead of a buyer-side attendee. A deck must
 * never auto-address the rep who is sending it.
 *
 * Rule: recipients are buyer-side people with a known email. Anyone on
 * the SELLER side — the rep, their internal participants, or a
 * stakeholder that lives on the seller's own domain — is excluded, even
 * if they happen to be first in the list. If no buyer-side email is
 * known, we return NOTHING: the rep picks a recipient by hand. We never
 * fall back to the rep's own address.
 */

export interface RecipientStakeholder {
  name?: string;
  email?: string;
  /** MEDDPICC-style committee role, buyer-side only when populated. */
  committee_role?: string | null;
  /** Employer, when known — used to tell seller-side stakeholders apart. */
  company?: string | null;
}

export interface DeckRecipient {
  name: string;
  email: string;
}

export interface ResolveDeckRecipientsInput {
  /** Buyer-side stakeholders on the deal (may include emails). */
  stakeholders?: RecipientStakeholder[];
  /** The rep's own internal participants — emails to always exclude. */
  internalParticipantEmails?: (string | undefined | null)[];
  /** The logged-in rep's own email — always excluded, defensively. */
  repEmail?: string | null;
}

function normalizeEmail(raw: string | undefined | null): string {
  return (raw ?? "").trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /.+@.+\..+/.test(email);
}

/**
 * Resolve the buyer-side attendees a deck should be sent to. Returns an
 * empty array when no buyer-side email is known — the caller then leaves
 * the recipient blank for the rep to fill in. NEVER returns a rep-side
 * or seller-side address.
 */
export function resolveDeckRecipients(
  input: ResolveDeckRecipientsInput,
): DeckRecipient[] {
  const excluded = new Set<string>();
  for (const e of input.internalParticipantEmails ?? []) {
    const norm = normalizeEmail(e);
    if (norm) excluded.add(norm);
  }
  const repEmail = normalizeEmail(input.repEmail);
  if (repEmail) excluded.add(repEmail);

  // Seller-side domains we can infer from the rep's own addresses. A
  // stakeholder sharing one of these domains is on the seller's side and
  // must not receive the deck as a "prospect."
  const sellerDomains = new Set<string>();
  for (const addr of excluded) {
    const domain = addr.split("@")[1];
    if (domain) sellerDomains.add(domain);
  }

  const out: DeckRecipient[] = [];
  const seen = new Set<string>();

  for (const sh of input.stakeholders ?? []) {
    const email = normalizeEmail(sh.email);
    if (!email || !isValidEmail(email)) continue;
    if (excluded.has(email)) continue;
    const domain = email.split("@")[1];
    if (domain && sellerDomains.has(domain)) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ name: (sh.name ?? "").trim(), email: sh.email!.trim() });
  }

  return out;
}
