import { describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from "@/lib/auth/rbac";
import { sessionHasPermission } from "@/lib/auth/authorization";

describe("SSH terminal RBAC", () => {
  it("defines server:ssh separately from server:write", () => {
    expect(PERMISSIONS).toContain("server:ssh");
    expect(DEFAULT_ROLE_PERMISSIONS.admin).toContain("server:ssh");
    expect(DEFAULT_ROLE_PERMISSIONS.operator).toContain("server:ssh");
    expect(DEFAULT_ROLE_PERMISSIONS.viewer).not.toContain("server:ssh");
    expect(DEFAULT_ROLE_PERMISSIONS.storage_manager).not.toContain("server:ssh");
  });

  it("does not allow SSH terminal access with server:read or server:write alone", () => {
    expect(sessionHasPermission({ roles: ["viewer"] }, "server:ssh")).toBe(false);
    expect(sessionHasPermission({ roles: ["storage_manager"] }, "server:ssh")).toBe(false);
    expect(sessionHasPermission({ roles: ["operator"] }, "server:ssh")).toBe(true);
  });
});
