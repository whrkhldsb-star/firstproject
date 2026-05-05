import { beforeEach, describe, expect, it, vi } from "vitest";

import { moveFileAction } from "../move-file-action";

vi.mock("@/lib/auth/authorization", () => ({
  requirePermission: vi.fn().mockResolvedValue({
    userId: "user-1",
    username: "alice",
    roles: ["operator"],
    mustChangePassword: false,
  }),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    fileEntry: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/storage/access-control", () => ({
  assertStorageAccess: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  rename: vi.fn(),
}));

const { prisma } = await import("@/lib/db");
const { assertStorageAccess } = await import("@/lib/storage/access-control");
const { mkdir, rename } = await import("node:fs/promises");

const baseEntry = {
  id: "file-1",
  name: "a.txt",
  relativePath: "team-a/a.txt",
  entryType: "FILE",
  storageNodeId: "node-1",
  storageNode: {
    id: "node-1",
    driver: "SFTP" as const,
    basePath: "/srv/storage",
  },
};

describe("moveFileAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertStorageAccess).mockResolvedValue({ allowed: true });
    vi.mocked(prisma.fileEntry.findFirst).mockResolvedValue(null);
  });

  it("validates target directory with storage ACL before updating DB", async () => {
    vi.mocked(prisma.fileEntry.findUnique).mockResolvedValue({ ...baseEntry, storageNode: { ...baseEntry.storageNode, driver: "SFTP" as const } } as unknown as Awaited<ReturnType<typeof prisma.fileEntry.findUnique>>);
    vi.mocked(assertStorageAccess).mockResolvedValueOnce({ allowed: false, reason: "没有该存储节点或路径的访问授权" });

    const formData = new FormData();
    formData.set("fileEntryId", "file-1");
    formData.set("targetDir", "team-b");

    const result = await moveFileAction(null, formData);

    expect(result).toEqual({ error: "没有该存储节点或路径的访问授权" });
    expect(assertStorageAccess).toHaveBeenCalledWith(expect.objectContaining({
      storageNodeId: "node-1",
      relativePath: "team-b/a.txt",
      operation: "write",
      session: expect.objectContaining({ userId: "user-1" }),
    }));
    expect(prisma.fileEntry.update).not.toHaveBeenCalled();
  });

  it("rejects unsafe target directories before ACL and DB writes", async () => {
    vi.mocked(prisma.fileEntry.findUnique).mockResolvedValue(baseEntry as unknown as Awaited<ReturnType<typeof prisma.fileEntry.findUnique>>);

    const formData = new FormData();
    formData.set("fileEntryId", "file-1");
    formData.set("targetDir", "../escape");

    const result = await moveFileAction(null, formData);

    expect(result.error).toMatch(/路径/);
    expect(assertStorageAccess).not.toHaveBeenCalled();
    expect(prisma.fileEntry.update).not.toHaveBeenCalled();
  });

  it("returns an error and skips DB updates when LOCAL disk move fails", async () => {
    const localEntry = {
      ...baseEntry,
      storageNode: { driver: "LOCAL" as const, basePath: "/srv/storage" },
    };
    vi.mocked(prisma.fileEntry.findUnique).mockResolvedValue(localEntry as unknown as Awaited<ReturnType<typeof prisma.fileEntry.findUnique>>);
    vi.mocked(assertStorageAccess).mockResolvedValueOnce({ allowed: true });
    vi.mocked(prisma.fileEntry.findFirst).mockResolvedValueOnce(null);
    vi.mocked(mkdir).mockResolvedValueOnce(undefined);
    vi.mocked(rename).mockRejectedValueOnce(new Error("EXDEV"));
    expect(localEntry.storageNode.driver).toBe("LOCAL");
    expect(localEntry.entryType).toBe("FILE");

    const formData = new FormData();
    formData.set("fileEntryId", "file-1");
    formData.set("targetDir", "team-b");

    const result = await moveFileAction(null, formData);

    expect(rename).toHaveBeenCalled();
    expect(result).toEqual({ error: "本地文件移动失败：EXDEV" });
    expect(prisma.fileEntry.update).not.toHaveBeenCalled();
  });
});
