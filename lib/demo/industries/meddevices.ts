import type { DemoIndustry } from "../pipeline";

/**
 * Med Devices industry book.
 *
 * STUB — no deals authored yet. The full 7-deal book lands in Slice 4, per
 * docs/demo-industry-instances.md §3. Registered now so the picker + seeder
 * see all four industries from Slice 1.
 */
export const MEDDEVICES: DemoIndustry = {
  key: "meddevices",
  label: "Med Devices",
  sellerContext:
    "The rep sells Meridian, a planning platform, into medical-device manufacturers.",
  deals: [],
};
