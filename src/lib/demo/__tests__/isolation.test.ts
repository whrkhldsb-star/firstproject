import { describe, expect, it } from "vitest";

import { getForbiddenProductionDemoFlags, validateProductionDemoIsolation } from "@/lib/demo/isolation";

describe("production demo isolation", () => {
  it("rejects every demo fallback flag when NODE_ENV is production", () => {
    for (const flag of getForbiddenProductionDemoFlags()) {
      expect(
        validateProductionDemoIsolation({ NODE_ENV: "production", [flag]: "true" }),
      ).toEqual({ ok: false, flag });
    }
  });

  it("allows explicit demo fallback only outside production", () => {
    expect(validateProductionDemoIsolation({ NODE_ENV: "development", ENABLE_DEMO_FALLBACK: "true" })).toEqual({ ok: true });
    expect(validateProductionDemoIsolation({ NODE_ENV: "test", SEED_DEMO_DATA: "true" })).toEqual({ ok: true });
  });

  it("ignores false-like values in production", () => {
    expect(validateProductionDemoIsolation({ NODE_ENV: "production", ENABLE_DEMO_FALLBACK: "false" })).toEqual({ ok: true });
  });
});
