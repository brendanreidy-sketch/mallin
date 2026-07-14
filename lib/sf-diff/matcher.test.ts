/**
 * sf-match tests — pure scoring logic against synthetic fixtures.
 *
 * Coverage:
 *   - exact name + account match → high confidence
 *   - name match, account differs → medium confidence
 *   - close-but-not-equal name → meaningful but lower confidence
 *   - no signal in any dimension → filtered out (below MIN threshold)
 *   - requires_human_confirmation always true
 *   - sort order: best_match has highest confidence
 *   - amount tolerance: within 10% scores as match
 *   - closed-won opps: still surfaced but flagged in evidence
 */

import { describe, it, expect } from "vitest";
import {
  matchSubstrateToSf,
  matchStrength,
  type SfOppCandidateInput,
  type SubstrateDealForMatch,
} from "./matcher";

const SUBSTRATE: SubstrateDealForMatch = {
  name: "Northwind Platform Evaluation",
  account_name: "Summit Manufacturing",
  amount: 71000,
  close_date: "2026-09-30",
};

function candidate(over: Partial<SfOppCandidateInput>): SfOppCandidateInput {
  return {
    Id: "006xxx" + Math.random().toString(36).slice(2, 8),
    Name: "Default Name",
    AccountName: null,
    Amount: null,
    CloseDate: null,
    StageName: null,
    IsClosed: false,
    ...over,
  };
}

describe("matchSubstrateToSf — high signal cases", () => {
  it("exact-ish name + account match → strong confidence", () => {
    const cands = [
      candidate({
        Id: "006A",
        Name: "Northwind Platform Evaluation",
        AccountName: "Summit Manufacturing",
        Amount: 71000,
        CloseDate: "2026-09-30",
      }),
    ];
    const r = matchSubstrateToSf(SUBSTRATE, cands);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].confidence).toBeGreaterThan(0.9);
    expect(matchStrength(r.candidates[0].confidence)).toBe("strong");
  });

  it("name match but different account → medium-strong (still surfaces)", () => {
    const cands = [
      candidate({
        Id: "006B",
        Name: "Northwind Platform Evaluation",
        AccountName: "Different Account Inc",
        Amount: 71000,
        CloseDate: "2026-09-30",
      }),
    ];
    const r = matchSubstrateToSf(SUBSTRATE, cands);
    expect(r.candidates[0].confidence).toBeGreaterThan(0.4);
    expect(r.candidates[0].confidence).toBeLessThan(0.9);
    // Evidence should call out the account mismatch
    expect(r.candidates[0].evidence.some((e) => /account/i.test(e))).toBe(true);
  });
});

describe("matchSubstrateToSf — low / no signal cases", () => {
  it("no shared tokens with anything → filtered below MIN threshold", () => {
    const cands = [
      candidate({
        Id: "006C",
        Name: "Acme Widget Spring Order",
        AccountName: "Acme Co",
        Amount: 999,
        CloseDate: "2024-01-01",
      }),
    ];
    const r = matchSubstrateToSf(SUBSTRATE, cands);
    // Below MIN_CONFIDENCE_RETURNED (0.15) — should be dropped
    expect(r.candidates).toHaveLength(0);
    expect(r.best_match).toBeNull();
  });

  it("returns at most maxResults candidates, sorted by confidence desc", () => {
    const cands: SfOppCandidateInput[] = [];
    for (let i = 0; i < 10; i++) {
      cands.push(
        candidate({
          Id: `006_${i}`,
          Name: i % 2 === 0 ? "Northwind Platform Evaluation" : "Other Deal",
          AccountName: i < 5 ? "Summit Manufacturing" : "Other Co",
          Amount: 70000 + i * 1000,
          CloseDate: "2026-09-30",
        }),
      );
    }
    const r = matchSubstrateToSf(SUBSTRATE, cands, { maxResults: 3 });
    expect(r.candidates.length).toBeLessThanOrEqual(3);
    // Must be sorted descending
    for (let i = 1; i < r.candidates.length; i++) {
      expect(r.candidates[i].confidence).toBeLessThanOrEqual(
        r.candidates[i - 1].confidence,
      );
    }
    expect(r.best_match).toBe(r.candidates[0]);
  });
});

describe("matchSubstrateToSf — invariants", () => {
  it("requires_human_confirmation is always true, even on a 1.0 match", () => {
    const cands = [
      candidate({
        Id: "006D",
        Name: SUBSTRATE.name!,
        AccountName: SUBSTRATE.account_name,
        Amount: SUBSTRATE.amount,
        CloseDate: SUBSTRATE.close_date,
      }),
    ];
    const r = matchSubstrateToSf(SUBSTRATE, cands);
    expect(r.requires_human_confirmation).toBe(true);
  });

  it("returns no candidates and null best_match when input list is empty", () => {
    const r = matchSubstrateToSf(SUBSTRATE, []);
    expect(r.candidates).toHaveLength(0);
    expect(r.best_match).toBeNull();
    expect(r.requires_human_confirmation).toBe(true);
  });

  it("score_breakdown values are all in [0,1]", () => {
    const cands = [
      candidate({
        Id: "006E",
        Name: "Northwind Platform",
        AccountName: "Summit",
        Amount: 100000,
        CloseDate: "2027-01-01",
      }),
    ];
    const r = matchSubstrateToSf(SUBSTRATE, cands);
    const c = r.candidates[0];
    for (const v of Object.values(c.score_breakdown)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(c.confidence).toBeGreaterThanOrEqual(0);
    expect(c.confidence).toBeLessThanOrEqual(1);
  });
});

describe("matchSubstrateToSf — amount + date proximity", () => {
  it("amount within 10% scores as full match in that dimension", () => {
    const cands = [
      candidate({
        Id: "006F",
        Name: "Northwind Platform Evaluation",
        AccountName: "Summit Manufacturing",
        Amount: 75000, // ~5.6% off from 71000
        CloseDate: "2026-09-30",
      }),
    ];
    const r = matchSubstrateToSf(SUBSTRATE, cands);
    expect(r.candidates[0].score_breakdown.amount).toBe(1);
  });

  it("amount > 100% off scores 0", () => {
    const cands = [
      candidate({
        Id: "006G",
        Name: "Northwind Platform Evaluation",
        AccountName: "Summit Manufacturing",
        Amount: 1_000_000, // way off
        CloseDate: "2026-09-30",
      }),
    ];
    const r = matchSubstrateToSf(SUBSTRATE, cands);
    expect(r.candidates[0].score_breakdown.amount).toBe(0);
  });

  it("close date within 30 days scores 1.0", () => {
    const cands = [
      candidate({
        Id: "006H",
        Name: "Northwind Platform Evaluation",
        AccountName: "Summit Manufacturing",
        Amount: 71000,
        CloseDate: "2026-10-15", // 15 days off
      }),
    ];
    const r = matchSubstrateToSf(SUBSTRATE, cands);
    expect(r.candidates[0].score_breakdown.close_date).toBe(1);
  });

  it("close date >365 days off scores 0", () => {
    const cands = [
      candidate({
        Id: "006I",
        Name: "Northwind Platform Evaluation",
        AccountName: "Summit Manufacturing",
        Amount: 71000,
        CloseDate: "2024-01-01", // way far
      }),
    ];
    const r = matchSubstrateToSf(SUBSTRATE, cands);
    expect(r.candidates[0].score_breakdown.close_date).toBe(0);
  });

  it("null amount or close date in either side scores 0 in that dim", () => {
    const cands = [
      candidate({
        Id: "006J",
        Name: "Northwind Platform Evaluation",
        AccountName: "Summit Manufacturing",
        Amount: null,
        CloseDate: null,
      }),
    ];
    const r = matchSubstrateToSf(SUBSTRATE, cands);
    expect(r.candidates[0].score_breakdown.amount).toBe(0);
    expect(r.candidates[0].score_breakdown.close_date).toBe(0);
  });
});

describe("matchSubstrateToSf — closed opp flagging", () => {
  it("closed SF opps still surface but are flagged in evidence", () => {
    const cands = [
      candidate({
        Id: "006K",
        Name: SUBSTRATE.name!,
        AccountName: SUBSTRATE.account_name,
        Amount: SUBSTRATE.amount,
        CloseDate: SUBSTRATE.close_date,
        IsClosed: true,
      }),
    ];
    const r = matchSubstrateToSf(SUBSTRATE, cands);
    expect(r.candidates[0].sf_is_closed).toBe(true);
    expect(r.candidates[0].evidence.some((e) => /closed/i.test(e))).toBe(true);
  });
});

describe("matchStrength labels", () => {
  it("0.95 → strong", () => {
    expect(matchStrength(0.95)).toBe("strong");
  });
  it("0.5 → weak", () => {
    expect(matchStrength(0.5)).toBe("weak");
  });
  it("0.2 → uncertain", () => {
    expect(matchStrength(0.2)).toBe("uncertain");
  });
});

describe("token-set similarity quirks", () => {
  it("ignores stop words ('Evaluation', 'Inc', 'the') so name signal is meaningful", () => {
    // 'Northwind Platform Evaluation' tokenizes to {northwind, platform} after stop-word filter
    // 'Northwind Platform Renewal' tokenizes to {northwind, platform} after stop-word filter
    // → high overlap because 'Evaluation' and 'Renewal' both filtered
    const cands = [
      candidate({
        Id: "006L",
        Name: "Northwind Platform Renewal",
        AccountName: SUBSTRATE.account_name,
        Amount: SUBSTRATE.amount,
        CloseDate: SUBSTRATE.close_date,
      }),
    ];
    const r = matchSubstrateToSf(SUBSTRATE, cands);
    expect(r.candidates[0].score_breakdown.name).toBeGreaterThan(0.5);
  });
});
