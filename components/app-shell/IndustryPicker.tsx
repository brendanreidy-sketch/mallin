"use client";

/**
 * IndustryPicker — the demo-only industry switcher.
 *
 * Each demo industry (SaaS / Med Devices / Logistics / Real Estate) is its own
 * Clerk org + tenant. This reads the signed-in user's org memberships, keeps
 * only the "Mallin Demo · …" ones, and renders a pill per industry. Tapping one
 * calls setActive({ organization, redirectUrl }) to flip the active org — the
 * whole cockpit re-renders as that industry.
 *
 * Renders nothing unless the user belongs to 2+ demo industry orgs, so it never
 * shows for real (non-demo) users. See docs/demo-industry-instances.md.
 */

import { useOrganizationList, useOrganization } from "@clerk/nextjs";
import { useState } from "react";
import s from "./appShell.module.css";

const PREFIX = "Mallin Demo · ";
const ORDER = ["SaaS", "Med Devices", "Logistics", "Real Estate"];

export default function IndustryPicker() {
  const { isLoaded, userMemberships, setActive } = useOrganizationList({
    userMemberships: true,
  });
  const { organization } = useOrganization();
  const [switching, setSwitching] = useState<string | null>(null);

  if (!isLoaded || !setActive) return null;

  const industries = (userMemberships?.data ?? [])
    .map((m) => ({ id: m.organization.id, name: m.organization.name }))
    .filter((o) => o.name.startsWith(PREFIX))
    .map((o) => ({ id: o.id, label: o.name.slice(PREFIX.length) }))
    .sort((a, b) => {
      const ia = ORDER.indexOf(a.label);
      const ib = ORDER.indexOf(b.label);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

  if (industries.length < 2) return null;
  const activeId = organization?.id ?? null;

  return (
    <div className={s.industryPicker}>
      <div className={s.industryLabel}>Industry</div>
      {industries.map((ind) => {
        const active = ind.id === activeId;
        return (
          <button
            key={ind.id}
            type="button"
            className={`${s.industryPill} ${active ? s.industryPillOn : ""}`}
            aria-current={active ? "true" : undefined}
            disabled={active || switching !== null}
            onClick={() => {
              setSwitching(ind.id);
              void setActive({ organization: ind.id, redirectUrl: "/cockpit" });
            }}
          >
            {ind.label}
            {switching === ind.id ? " …" : ""}
          </button>
        );
      })}
    </div>
  );
}
