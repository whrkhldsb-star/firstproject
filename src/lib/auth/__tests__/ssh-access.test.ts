import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    server: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

const { assertSshServerAccess, canUseSshTerminal } = await import("../ssh-access");

describe("SSH server access control", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires server:ssh permission for terminal use", () => {
    expect(canUseSshTerminal({ roles: ["viewer"] })).toBe(false);
    expect(canUseSshTerminal({ roles: ["storage_manager"] })).toBe(false);
    expect(canUseSshTerminal({ roles: ["operator"] })).toBe(true);
    expect(canUseSshTerminal({ roles: ["admin"] })).toBe(true);
  });

  it("denies an otherwise valid server when the session lacks server:ssh", async () => {
    mockPrisma.server.findUnique.mockResolvedValue({ id: "srv_1", enabled: true });

    await expect(
      assertSshServerAccess({ session: { roles: ["viewer"] }, serverId: "srv_1" }),
    ).resolves.toEqual({ allowed: false, reason: "缺少 SSH 终端权限" });
  });

  it("allows an enabled server for a session with server:ssh", async () => {
    mockPrisma.server.findUnique.mockResolvedValue({ id: "srv_1", enabled: true });

    await expect(
      assertSshServerAccess({ session: { roles: ["operator"] }, serverId: "srv_1" }),
    ).resolves.toEqual({ allowed: true });
  });

  it("denies disabled or missing servers even with server:ssh", async () => {
    mockPrisma.server.findUnique.mockResolvedValueOnce({ id: "srv_1", enabled: false });
    await expect(
      assertSshServerAccess({ session: { roles: ["operator"] }, serverId: "srv_1" }),
    ).resolves.toEqual({ allowed: false, reason: "VPS 不存在或已停用" });

    mockPrisma.server.findUnique.mockResolvedValueOnce(null);
    await expect(
      assertSshServerAccess({ session: { roles: ["operator"] }, serverId: "missing" }),
    ).resolves.toEqual({ allowed: false, reason: "VPS 不存在或已停用" });
  });
});
