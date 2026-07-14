# Content-recommendation MVP

**Status:** design doc · not built · gated on first design-partner adoption signal
**Owner:** see git blame
**Last updated:** 2026-05-12

## Problem

Reps spend material time after every meaningful call doing the same loop:

1. Recall what was said on the call
2. Search the sales-enablement library (Highspot, Google Drive, Sharepoint, shared folders) for relevant materials
3. Copy/paste slides from existing decks
4. Customize for the prospect (name, logo, pain points)
5. Present in the next meeting

Mallin already has step 1 captured in the substrate (Pass 1.5 → 2 pipeline). Steps 2 and 3 are mechanical and well-suited to a content-recommendation surface. Step 4 is downstream and out of scope for the MVP. Step 5 stays with the rep.

The wedge sentence remains *alert + manager in thread = unavoidable conversation*. This is a different feature with a complementary value-prop: **"Mallin tells you exactly which company materials match what just happened on the call."**

## Non-goals for the MVP

- Generating new PowerPoint files (deferred — separate scope, ~3 weeks)
- Indexing the full Highspot library via API (deferred — Highspot integration requires customer/partner status)
- Cross-tenant content (every tenant indexes their own corpus only)
- Smart slide-by-slide selection within a deck (we're at deck-/document-level relevance only)
- Voice-conditioning the recommended content to the specific prospect

## In scope

A surface on the existing `/prep` page where, when viewing a deal, a panel renders:

> **Suggested materials for the next call**
>
> 1. **Compliance one-pager.pdf** · 92% match
>    Marcus asked about SOC 2 on call 3; this is the doc.
>
> 2. **TMS ROI calculator (template).xlsx** · 78% match
>    CFO not yet engaged. ROI doc fits the executive-buyer ask.
>
> 3. **Implementation timeline.pptx** · 71% match
>    Decision-process gap from Pass 2. Customer asked about cutover risk on call 4.

Each line links to the document (Google Drive URL) and shows *why* Mallin matched it — a one-line snippet tying back to specific deal substrate.

## Data model

One new table:

```sql
CREATE TABLE content_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_system       TEXT NOT NULL,                -- 'google_drive' | 'manual_upload' | 'highspot' (future)
  source_external_id  TEXT NOT NULL,                -- Drive file ID, etc.
  title               TEXT NOT NULL,
  mime_type           TEXT NOT NULL,                -- application/pdf, application/vnd.google-apps.document, etc.
  url                 TEXT NOT NULL,                -- canonical URL to open the doc
  content_text        TEXT,                         -- extracted text (up to ~50k chars per item)
  summary             TEXT,                         -- LLM-generated 2-3 sentence purpose summary
  embedding           VECTOR(1024),                 -- summary embedded for cosine search
  tags                TEXT[] DEFAULT '{}',          -- e.g. ['compliance', 'roi', 'implementation']
  audience            TEXT,                         -- 'champion' | 'economic_buyer' | 'technical' | 'general'
  stage_hint          TEXT,                         -- 'discovery' | 'qualification' | 'evaluation' | 'commercial'
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, source_system, source_external_id)
);
CREATE INDEX idx_content_items_embedding ON content_items USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_content_items_tenant ON content_items(tenant_id);
```

Requires `pgvector` extension (Supabase supports it). Embedding dimension 1024 matches Voyage AI's `voyage-3-large`.

## Components

### 1. Ingestion

**Phase 1a (manual upload — 3 hour MVP)**:

- New page at `/settings/library` lets the tenant admin upload PDFs / Docs / Slides / Sheets
- Upload to Supabase Storage (`content-items` bucket, tenant-scoped path)
- Background job extracts text (`pdf-parse` for PDF, `mammoth` for .docx, etc.)
- LLM generates summary, tags, audience hint, stage hint via Anthropic Claude (cached on insert)
- Embedding generated via Voyage API
- Row inserted

**Phase 1b (Google Drive integration — 1 day, after 1a validates)**:

- Add Drive OAuth scope (`drive.readonly`) to the existing Google OAuth app
- New "Connect Drive" button on `/settings/integrations` (per-tenant)
- After connect: select a single folder to index ("Sales Collateral")
- Background poller scans new files daily, runs the same extract/summarize/embed flow

**Phase 1c (Highspot — deferred until customer signal)**:

- Highspot has a REST API (`api.highspot.com/v1.0/items`) but access requires being a Highspot customer/partner
- Same content_items table, different source_system
- Same pipeline downstream

### 2. Matcher

A pure function `recommendContent(dealSubstrate, opts) → ContentMatch[]`:

```ts
// lib/content/matcher.ts
export interface ContentMatch {
  contentItem: ContentItem;
  score: number;          // 0-1 cosine similarity
  reason: string;         // 1-line explanation tying back to substrate
}

export async function recommendContent(
  tenantId: string,
  opportunityId: string,
  opts: { limit?: number } = {},
): Promise<ContentMatch[]>
```

Match logic:

1. Pull deal substrate: stakeholders, qualification gaps, recent call summaries, stage, competitive context
2. Construct a query embedding from the deal state (LLM generates a "what would the rep need next" paragraph, embed it)
3. Cosine-search `content_items` filtered by tenant_id, top-k = 10
4. Re-rank with an LLM call that has both the matches and the deal substrate; output top 3 with one-line reasons
5. Return

### 3. UI

Add a `SuggestedMaterials` server component to the existing `/prep/[opportunityId]/page.tsx`:

- Renders the top-3 matches
- Each row: title + score badge + one-line reason + "Open" button (opens the source URL)
- "Why?" affordance per row — expands to show which substrate signals drove the match (stakeholder gap, competitor mention, stage hint, etc.)
- Empty state: "Connect your content library to see suggestions" with a link to `/settings/library` or `/settings/integrations`

### 4. Feedback loop (after MVP signal)

Once reps are using the panel, capture:

- `content_recommendations` table: tenant_id, opportunity_id, content_item_id, shown_at, opened_at, used_in_meeting
- Use this signal to rerank — content that gets opened and reportedly used wins more often

## Sequencing

```
MVP build order:
  1. content_items migration                                       (30 min)
  2. /settings/library upload page                                 (2 hr)
  3. Extract + summarize + embed pipeline                          (3 hr)
  4. Matcher fn (lib/content/matcher.ts)                            (3 hr)
  5. SuggestedMaterials component on /prep                          (2 hr)
  6. Empty-state + onboarding flow                                  (1 hr)
                                                            Total: ~11 hours
```

After MVP, in order of expected value:

```
  Phase 2 — Google Drive integration                                (~1 day)
  Phase 3 — Feedback loop (open / use tracking + reranker)          (~1 day)
  Phase 4 — Highspot integration                                    (depends on access)
  Phase 5 — PowerPoint generation                                   (~2-3 weeks)
```

## What signals "build this now"

The MVP costs roughly 11 hours. Build it when one of:

- A design partner specifically asks "can Mallin tell me which of our materials to use?"
- Two or more reps in a pilot say they spend >30 min/week looking for the right doc to send
- The verification framework starts hitting a ceiling on signal value because the rep's "what do I do next" question is half about *the conversation* (which Mallin helps with) and half about *the content to bring* (which Mallin doesn't)

If none of those signals exist, defer. The verification loop is the wedge — content recommendation is a 10x time-saver but it's downstream of having reps actually use the verification loop in the first place.

## Open questions

- **Embedding model choice.** Voyage `voyage-3-large` is high-quality and supports up to 32k input tokens. OpenAI `text-embedding-3-large` is a fallback. Anthropic doesn't have first-party embeddings yet.
- **Summary model.** Claude Haiku 4.5 is plenty for 2-3 sentence summaries and cheap. Probably the right call.
- **How much substrate to embed in the query.** Probably the last 2-3 calls' summaries + qualification gaps from Pass 2c + the next-call-ask field from the most recent escalation alert. ~2k tokens of input.
- **Tenant-admin vs rep-level uploads.** MVP: tenant-admin uploads only. Later: reps can suggest content that the admin approves.
- **What if a doc is a 200-slide all-things-vendor deck?** Phase 1 indexes as-is. Phase 5 (deck generation) would do slide-level chunking. For now: "open this deck, slide ~30-40 is what you want" is acceptable.

## Why this is a design doc not a build

Two reasons:

1. **No design partner has asked for it.** Content recommendation is a strong feature but it expands surface area beyond the verification wedge. We should validate the core loop with paying users before broadening.
2. **The shape will change once we have a real customer.** Doing 11 hours of work on a feature spec'd in isolation is the kind of overengineering Mallin's whole positioning argues against.

Land the design doc now (so the shape is locked when we need it). Build when there's signal.
