/**
 * Production guard tests — verifies the default-deny policy in prod.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { checkSfDebugAccess } from "./production-guard";

// NODE_ENV is typed as a readonly literal union in newer @types/node. We
// mutate via the indexed-access form which type-checks under the looser
// process.env getindex signature.
type EnvBag = Record<string, string | undefined>;

describe("checkSfDebugAccess", () => {
  const originalEnv = { ...process.env };
  const env = process.env as unknown as EnvBag;

  beforeEach(() => {
    delete env.NODE_ENV;
    delete env.SF_DEBUG_ENABLED;
  });

  afterEach(() => {
    Object.keys(env).forEach((k) => delete env[k]);
    Object.assign(env, originalEnv);
  });

  it("allows when NODE_ENV is undefined (local dev)", () => {
    expect(checkSfDebugAccess().allowed).toBe(true);
  });

  it("allows when NODE_ENV=development", () => {
    env.NODE_ENV = "development";
    expect(checkSfDebugAccess().allowed).toBe(true);
  });

  it("allows when NODE_ENV=test", () => {
    env.NODE_ENV = "test";
    expect(checkSfDebugAccess().allowed).toBe(true);
  });

  it("denies when NODE_ENV=production by default", () => {
    env.NODE_ENV = "production";
    const r = checkSfDebugAccess();
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/production/);
  });

  it("allows in production only when SF_DEBUG_ENABLED=true", () => {
    env.NODE_ENV = "production";
    env.SF_DEBUG_ENABLED = "true";
    expect(checkSfDebugAccess().allowed).toBe(true);
  });

  it("denies in production when SF_DEBUG_ENABLED is anything other than 'true'", () => {
    env.NODE_ENV = "production";
    env.SF_DEBUG_ENABLED = "1";
    expect(checkSfDebugAccess().allowed).toBe(false);

    env.SF_DEBUG_ENABLED = "yes";
    expect(checkSfDebugAccess().allowed).toBe(false);

    env.SF_DEBUG_ENABLED = "TRUE";
    expect(checkSfDebugAccess().allowed).toBe(false); // case-sensitive
  });
});
