import type { DemoIndustry } from "../pipeline";
import { SAAS } from "./saas";
import { MEDDEVICES } from "./meddevices";
import { LOGISTICS } from "./logistics";
import { REALESTATE } from "./realestate";

/**
 * The industry registry — every toggleable demo book. Order here is the order
 * the picker renders. Each industry seeds into its own demo tenant (slug =
 * Clerk org id); the industry↔org mapping is assigned at provisioning time,
 * not stored here. See docs/demo-industry-instances.md.
 */
export const INDUSTRIES: DemoIndustry[] = [SAAS, MEDDEVICES, LOGISTICS, REALESTATE];

export function industryByKey(key: string): DemoIndustry | undefined {
  return INDUSTRIES.find((i) => i.key === key);
}
