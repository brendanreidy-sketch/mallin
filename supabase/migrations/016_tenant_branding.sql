-- 016_tenant_branding.sql
--
-- Adds seller-side brand identity to tenants so customer-facing artifacts
-- (the deck generator at /api/generate-deck, and any future branded export)
-- can render the rep's COMPANY brand — logo + palette — not a generic theme.
--
-- Why on tenants (vs. a code registry): branding is per-customer-org and must
-- resolve from the opportunity's tenant for the PUBLIC, token-gated deck export
-- (the requester may be unauthenticated). A DB column resolves by the
-- opportunity's tenant_id with no session, and scales to every new tenant
-- without a code change.
--
-- All columns nullable: a tenant with no brand set falls back to Mallin-neutral
-- styling in the deck renderer. Set per tenant via SQL when provisioning.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS display_name        text,   -- "Acme"
  ADD COLUMN IF NOT EXISTS brand_logo_url       text,   -- public https URL to a PNG/SVG logo
  ADD COLUMN IF NOT EXISTS brand_color_primary  text,   -- hex, e.g. "#0A2540" (slide backdrop / bars)
  ADD COLUMN IF NOT EXISTS brand_color_accent   text;   -- hex, e.g. "#00A4BD" (rules / emphasis)

COMMENT ON COLUMN tenants.display_name IS
  'Human-facing company name for the rep''s org (the SELLER), shown on branded exports like the deck. Falls back to Clerk org name when null.';
COMMENT ON COLUMN tenants.brand_logo_url IS
  'Public URL to the seller company logo (PNG or SVG). Fetched + embedded at deck-generation time; null → text wordmark fallback.';
COMMENT ON COLUMN tenants.brand_color_primary IS
  'Seller brand primary color (hex incl. #). Used as the deck title/closing backdrop and header bar.';
COMMENT ON COLUMN tenants.brand_color_accent IS
  'Seller brand accent color (hex incl. #). Used for rules, eyebrows, and emphasis on the deck.';

-- Seed the Acme demo tenant's brand. No-op if the row isn't present in this
-- environment. Replace the slug if the Acme tenant uses a different Clerk org.
-- Colors are Acme's brand-adjacent palette (navy + teal); logo is the public
-- Acme mark. Adjust to the exact brand assets when available.
UPDATE tenants SET
  display_name        = COALESCE(display_name, 'Acme'),
  brand_color_primary = COALESCE(brand_color_primary, '#0A2540'),
  brand_color_accent  = COALESCE(brand_color_accent,  '#00A4BD'),
  brand_logo_url      = COALESCE(brand_logo_url, 'https://logo.clearbit.com/acme.com')
WHERE slug ILIKE '%acme%' OR display_name = 'Acme';
