/**
 * ============================================================================
 *  Salesforce connector — seed candidates for the outbound engine (SCAFFOLD)
 * ============================================================================
 *
 * The connector's job: pull the customer's OWN closed-won opportunities out of
 * their Salesforce and hand them to the outbound engine as SEED CANDIDATES —
 * the accounts they'd want more of. Each seed feeds `deriveLookalikeConfig`
 * (lookalike-agent.ts): one real won account → a judgment-led ICP → sourced
 * prospects. This is the "look at what you actually close and find more like
 * it" onramp, grounded in the customer's own history instead of a hand-typed
 * seed company.
 *
 * STATUS: SCAFFOLD. This file is code-complete and typechecks, but the LIVE
 * path is INERT until a real Salesforce OAuth app + credentials exist. The
 * `MockSalesforceConnector` (driven by an injected fixture) is what runs today;
 * `LiveSalesforceConnector` throws until wired, with TODO markers where the
 * real SOQL goes. The PURE mapping (`wonOppsToSeeds`) is fully implemented and
 * unit-tested independent of any SF client.
 *
 * Reuse note: the existing SF adapter (lib/adapters/salesforce.ts) already
 * authenticates via OAuth 2.0 Client Credentials and exposes typed reads
 * (SfOpportunity, SfAccount, getConnection, listOpenOpportunities). The live
 * connector is intended to sit ON TOP of that adapter — this scaffold mirrors
 * its RawWonOpp shape on SfOpportunity so wiring it is a mechanical step, not a
 * rewrite. We deliberately do NOT import it here so the scaffold stays inert
 * and free of any accidental auth side-effects.
 * ============================================================================
 */

/**
 * A closed-won opportunity as it comes off Salesforce (or a fixture). Field
 * shape intentionally mirrors the subset of `SfOpportunity`
 * (lib/adapters/salesforce.ts) plus the joined Account name/website that the
 * live SOQL will pull, so `wonOppsToSeeds` maps 1:1 whether the rows come from
 * a fixture or the real API.
 */
export interface RawWonOpp {
  /** SF Opportunity Id (or a fixture id). Used only for provenance/logging. */
  id: string;
  /** Opportunity name — NOT the account name; used only as a fallback. */
  name?: string;
  /** The account this opp closed against — the actual seed we care about. */
  accountName?: string;
  /** Account Id, if joined — used for dedupe when two opps share an account. */
  accountId?: string;
  /** Account website, if joined — disambiguates same-named companies downstream. */
  accountWebsite?: string | null;
  /** Won amount (SF `Amount`), used to rank seeds by size. */
  amount?: number | null;
  /** Close date, ISO `YYYY-MM-DD` (SF `CloseDate`), used to rank by recency. */
  closeDate?: string | null;
  /** SF `IsWon` — belt-and-suspenders; a non-won row should never reach here. */
  isWon?: boolean;
}

/**
 * A seed candidate the outbound engine can hand straight to
 * `deriveLookalikeConfig({ seedCompany, seedWebsite, ... })`. One per distinct
 * account, ranked so the best seeds surface first.
 */
export interface SeedCandidate {
  /** The account name — this is the `seedCompany` for the lookalike agent. */
  company: string;
  /** Account website if known — the lookalike agent's `seedWebsite`. */
  website?: string;
  /** The largest won amount seen for this account (drives ranking). */
  wonAmount?: number;
  /** The most recent close date seen for this account, ISO `YYYY-MM-DD`. */
  closedAt?: string;
  /** Number of won opps this account is aggregated from — a repeat-buyer signal. */
  wonDealCount: number;
}

/**
 * A contact returned by company enrichment — the fields the outbound engine can
 * actually use to reach a persona. Deliberately small; this is not a full CRM
 * Contact. The live path will map SF `Contact` rows to this shape.
 */
export interface ConnectorContact {
  /** Full name, if known. */
  name?: string;
  /** Job title — the outbound engine matches this against persona duties. */
  title?: string;
  /** Work email, if present on the CRM record. */
  email?: string;
  /** The company this contact belongs to (echoed back for grouping). */
  company: string;
}

/** Options for {@link SalesforceConnector.listClosedWonSeeds}. */
export interface ListSeedsOptions {
  /** Max seed candidates to return after dedupe + ranking. Defaults to 25. */
  limit?: number;
  /**
   * Optional lower bound on won amount — drop trivial/test deals before they
   * become seeds. Applied on the RAW rows, before dedupe.
   */
  minWonAmount?: number;
}

/**
 * The stable contract the outbound engine codes against — implemented by the
 * mock today and the live SF connector once credentials exist. Same discipline
 * as the CrmProvider interface (lib/crm): the engine has no opinion about WHERE
 * seeds come from; it consumes this interface.
 */
export interface SalesforceConnector {
  /**
   * Pull the customer's closed-won opportunities and return them as ranked,
   * de-duplicated seed candidates (best-fit first). Each result is ready to
   * pass to `deriveLookalikeConfig`.
   */
  listClosedWonSeeds(opts?: ListSeedsOptions): Promise<SeedCandidate[]>;
  /**
   * Enrich a named company into usable contacts (name/title/email) for the
   * personas the engine wants to reach.
   */
  enrichCompany(name: string): Promise<ConnectorContact[]>;
}

// ────────────────────────────────────────────────────────────────────────────
// Pure mapping — the load-bearing, unit-testable core
// ────────────────────────────────────────────────────────────────────────────

/** Normalize an account name for dedupe: trim, collapse spaces, casefold. */
function seedKey(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

/** A numeric amount, or 0 when null/undefined/non-finite. */
function amountOrZero(a: number | null | undefined): number {
  return typeof a === "number" && Number.isFinite(a) ? a : 0;
}

/**
 * Turn raw closed-won opps into ranked seed candidates. PURE — no SF client, no
 * I/O — so it's unit-testable on its own. Behavior:
 *   - keeps only rows that name an account (accountName; falls back to name);
 *   - dedupes by normalized account name, aggregating: max wonAmount, latest
 *     closedAt, wonDealCount, and first non-empty website;
 *   - ranks by total won amount desc, then most-recent close desc, then name;
 *   - `isWon === false` rows are dropped defensively.
 */
export function wonOppsToSeeds(rawOpps: RawWonOpp[]): SeedCandidate[] {
  const byAccount = new Map<
    string,
    {
      company: string;
      website?: string;
      maxAmount: number;
      totalAmount: number;
      latestClose?: string;
      wonDealCount: number;
    }
  >();

  for (const opp of rawOpps) {
    if (opp.isWon === false) continue;
    const display = (opp.accountName ?? opp.name ?? "").trim();
    if (!display) continue; // no identifiable account → cannot be a seed

    const key = seedKey(display);
    const amount = amountOrZero(opp.amount);
    const website =
      opp.accountWebsite && opp.accountWebsite.trim()
        ? opp.accountWebsite.trim()
        : undefined;
    const close =
      opp.closeDate && opp.closeDate.trim() ? opp.closeDate.trim() : undefined;

    const existing = byAccount.get(key);
    if (!existing) {
      byAccount.set(key, {
        company: display,
        website,
        maxAmount: amount,
        totalAmount: amount,
        latestClose: close,
        wonDealCount: 1,
      });
      continue;
    }

    existing.maxAmount = Math.max(existing.maxAmount, amount);
    existing.totalAmount += amount;
    existing.wonDealCount += 1;
    if (!existing.website && website) existing.website = website;
    if (close && (!existing.latestClose || close > existing.latestClose)) {
      existing.latestClose = close;
    }
  }

  const seeds: Array<SeedCandidate & { _total: number }> = [];
  for (const agg of byAccount.values()) {
    seeds.push({
      company: agg.company,
      website: agg.website,
      wonAmount: agg.maxAmount > 0 ? agg.maxAmount : undefined,
      closedAt: agg.latestClose,
      wonDealCount: agg.wonDealCount,
      _total: agg.totalAmount,
    });
  }

  seeds.sort((a, b) => {
    if (b._total !== a._total) return b._total - a._total; // bigger buyer first
    const ac = a.closedAt ?? "";
    const bc = b.closedAt ?? "";
    if (bc !== ac) return bc < ac ? -1 : 1; // more recent close first
    return a.company.localeCompare(b.company); // stable tiebreak
  });

  return seeds.map(({ _total, ...seed }) => seed);
}

// ────────────────────────────────────────────────────────────────────────────
// Mock connector — deterministic, fixture-driven; what runs today
// ────────────────────────────────────────────────────────────────────────────

/**
 * A deterministic, in-memory connector driven by injected fixtures. This is
 * what makes the outbound engine testable end-to-end without any Salesforce
 * credentials. It runs the SAME pure mapping (`wonOppsToSeeds`) the live path
 * will, so behavior is identical once creds are wired.
 */
export class MockSalesforceConnector implements SalesforceConnector {
  constructor(
    private readonly wonOpps: RawWonOpp[],
    private readonly contactsByCompany: Record<string, ConnectorContact[]> = {},
  ) {}

  async listClosedWonSeeds(opts: ListSeedsOptions = {}): Promise<SeedCandidate[]> {
    const min = opts.minWonAmount;
    const filtered =
      typeof min === "number"
        ? this.wonOpps.filter((o) => amountOrZero(o.amount) >= min)
        : this.wonOpps;
    const seeds = wonOppsToSeeds(filtered);
    const limit = opts.limit ?? 25;
    return seeds.slice(0, Math.max(0, limit));
  }

  async enrichCompany(name: string): Promise<ConnectorContact[]> {
    // Case-insensitive lookup against the injected fixture map.
    const key = seedKey(name);
    for (const [company, contacts] of Object.entries(this.contactsByCompany)) {
      if (seedKey(company) === key) return contacts;
    }
    return [];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Live connector — SHELL. Inert until a Salesforce OAuth app + creds exist.
// ────────────────────────────────────────────────────────────────────────────

/** Thrown by the live connector until Salesforce credentials are provided. */
export class SalesforceNotConnectedError extends Error {
  constructor(detail?: string) {
    super(
      "Salesforce not connected — provide OAuth credentials" +
        (detail ? ` (${detail})` : ""),
    );
    this.name = "SalesforceNotConnectedError";
  }
}

/** Auth material the live connector will hold once the OAuth flow exists. */
export interface LiveConnectorCredentials {
  /** OAuth access token for the customer's SF org. */
  accessToken: string;
  /** The org's instance URL (e.g. https://acme.my.salesforce.com). */
  instanceUrl: string;
}

/**
 * The live Salesforce connector — SHELL ONLY. It takes an access token +
 * instance URL and has the full method surface, but every method throws
 * {@link SalesforceNotConnectedError} until:
 *   1. a Salesforce OAuth app exists (scopes below), and
 *   2. the real SOQL queries + `Contact` mapping are wired at the TODO markers.
 *
 * This is intentionally NOT hooked to lib/adapters/salesforce.ts yet — keeping
 * it inert guarantees no accidental live API calls or auth side-effects from a
 * scaffold. When credentials land, replace the TODO bodies with jsforce
 * queries against `this.creds` (or delegate to the existing SF adapter's
 * `getConnection()` once it accepts per-connector tokens).
 */
export class LiveSalesforceConnector implements SalesforceConnector {
  constructor(private readonly creds?: LiveConnectorCredentials) {}

  async listClosedWonSeeds(_opts: ListSeedsOptions = {}): Promise<SeedCandidate[]> {
    throw new SalesforceNotConnectedError("listClosedWonSeeds");
    // TODO(salesforce-oauth): once creds exist, run SOQL against this.creds:
    //   SELECT Id, Name, Amount, CloseDate, IsWon,
    //          Account.Name, Account.Website
    //   FROM Opportunity
    //   WHERE IsWon = true
    //   ORDER BY CloseDate DESC
    //   LIMIT <bounded>
    // Map each record → RawWonOpp (accountName = Account.Name,
    // accountWebsite = Account.Website), then return
    // wonOppsToSeeds(raws).slice(0, opts.limit ?? 25). Apply opts.minWonAmount
    // in the WHERE clause (Amount >= :min) for server-side filtering.
  }

  async enrichCompany(_name: string): Promise<ConnectorContact[]> {
    throw new SalesforceNotConnectedError("enrichCompany");
    // TODO(salesforce-oauth): SOQL against this.creds:
    //   SELECT Name, Title, Email, Account.Name
    //   FROM Contact
    //   WHERE Account.Name = :name
    //   ORDER BY LastActivityDate DESC NULLS LAST
    //   LIMIT <bounded>
    // Map each record → ConnectorContact { name: Name, title: Title,
    // email: Email, company: Account.Name }. Sanitize :name against SOQL
    // injection the same way lib/adapters/salesforce.ts does for Ids.
  }
}

/**
 * Factory: build the appropriate connector. With credentials you get the live
 * shell (which still throws until the SOQL TODOs are wired); without, callers
 * should use {@link MockSalesforceConnector} directly with a fixture. Kept
 * explicit so the wiring point is one obvious place.
 */
export function makeSalesforceConnector(
  creds?: LiveConnectorCredentials,
): SalesforceConnector {
  return new LiveSalesforceConnector(creds);
}
