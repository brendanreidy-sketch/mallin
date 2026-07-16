/**
 * Shared chrome helper for the app-shell surfaces — resolves the signed-in
 * rep's display name + initials for the sidebar. Server-only.
 */

import { currentUser } from "@clerk/nextjs/server";

export function initialsOf(name: string | null): string {
  if (!name) return "YOU";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "YOU";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export async function shellUser(): Promise<{ name: string | null; initials: string }> {
  const user = await currentUser().catch(() => null);
  const first =
    user?.firstName ??
    (user?.username ? user.username.split(/[._-]/)[0] : null);
  const full =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.username ||
    null;
  return { name: first ?? full, initials: initialsOf(full) };
}
