import type { DemoIndustry } from "../pipeline";

/**
 * Real Estate industry book.
 *
 * STUB — no deals authored yet. The full 7-deal book lands in Slice 4, per
 * docs/demo-industry-instances.md §3. Registered now so the picker + seeder
 * see all four industries from Slice 1.
 */
export const REALESTATE: DemoIndustry = {
  key: "realestate",
  label: "Real Estate",
  sellerContext:
    "The rep sells Meridian, a planning platform, into commercial real-estate firms.",
  deals: [],
};
