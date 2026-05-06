import { afterEach, describe, expect, it, vi } from "vitest";

import { shouldBypassAuth, verifySessionToken, createSessionToken } from "@/lib/auth/session";

describe("session auth helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses a portable cookie name derived from APP_SLUG when not explicitly configured", async () => {
    vi.stubEnv("APP_SLUG", "my-console");
    vi.stubEnv("AUTH_SESSION_COOKIE_NAME", "");
    vi.resetModules();

    const session = await import("@/lib/auth/session");

    expect(session.getSessionCookieName()).toBe("my-console_session");
  });

  it("allows the session cookie name to be explicitly configured", async () => {
    vi.stubEnv("APP_SLUG", "my-console");
    vi.stubEnv("AUTH_SESSION_COOKIE_NAME", "custom_session");
    vi.resetModules();

    const session = await import("@/lib/auth/session");

    expect(session.getSessionCookieName()).toBe("custom_session");
  });

  it("allows anonymous access only for login and static asset paths", () => {
    expect(shouldBypassAuth("/login")).toBe(true);
    expect(shouldBypassAuth("/_next/static/chunk.js")).toBe(true);
    expect(shouldBypassAuth("/favicon.ico")).toBe(true);
    expect(shouldBypassAuth("/status")).toBe(true);
    expect(shouldBypassAuth("/api/status")).toBe(true);
    expect(shouldBypassAuth("/servers")).toBe(false);
  });

  it("round-trips a signed session token", async () => {
    const token = await createSessionToken({
      userId: "u_1",
      username: "admin",
      roles: ["admin"],
      mustChangePassword: true,
    });

    await expect(verifySessionToken(token)).resolves.toMatchObject({
      userId: "u_1",
      username: "admin",
      roles: ["admin"],
      mustChangePassword: true,
    });
  });
});
