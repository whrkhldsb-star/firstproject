import { describe, expect, it, vi } from "vitest";

const { requireSessionMock, sessionHasPermissionMock, assertStorageAccessMock, prismaMock } = vi.hoisted(() => ({
  requireSessionMock: vi.fn(),
  sessionHasPermissionMock: vi.fn(() => true),
  assertStorageAccessMock: vi.fn(() => Promise.resolve({ allowed: true })),
  prismaMock: {
    storageNode: {
      findUnique: vi.fn(),
    },
    fileEntry: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/require-session", () => ({
  requireSession: requireSessionMock,
}));

vi.mock("@/lib/auth/authorization", () => ({
  sessionHasPermission: sessionHasPermissionMock,
}));

vi.mock("@/lib/storage/access-control", () => ({
  assertStorageAccess: assertStorageAccessMock,
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

import { GET, POST } from "../route";

describe("/api/storage/local", () => {
  it("returns 400 when path is missing", async () => {
    vi.clearAllMocks();
    requireSessionMock.mockResolvedValueOnce({ userId: "u_1", username: "admin" });

    const response = await GET(new Request("https://example.com/api/storage/local"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "缺少 path 参数" });
  });

  it("returns 404 when local file entry is not registered", async () => {
    vi.clearAllMocks();
    requireSessionMock.mockResolvedValueOnce({ userId: "u_1", username: "admin" });
    prismaMock.fileEntry.findFirst.mockResolvedValueOnce(null);

    const response = await GET(new Request("https://example.com/api/storage/local?path=docs%2Fnotes.txt"));

    expect(prismaMock.fileEntry.findFirst).toHaveBeenCalled();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "文件条目不存在，或未登记为本机存储文件" });
  });

  it("uploads a local file and creates a file entry", async () => {
    vi.clearAllMocks();
    requireSessionMock.mockResolvedValueOnce({ userId: "u_1", username: "admin", roles: ["admin"], mustChangePassword: false });
    prismaMock.storageNode.findUnique.mockResolvedValueOnce({
      id: "node_1",
      name: "主控本机",
      driver: "LOCAL",
      basePath: "/tmp/storage",
    });
    prismaMock.fileEntry.findFirst.mockResolvedValueOnce(null);
    prismaMock.fileEntry.create.mockResolvedValueOnce({ id: "file_1" });

    const formData = new FormData();
    formData.set("storageNodeId", "node_1");
    formData.set("relativePath", "docs/notes.txt");
    formData.set("file", new File(["hello world"], "notes.txt", { type: "text/plain" }));

    const response = await POST(new Request("https://example.com/api/storage/local", { method: "POST", body: formData }));

    expect(response.status).toBe(200);
    expect(prismaMock.fileEntry.create).toHaveBeenCalled();
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: true,
      storageNodeId: "node_1",
      relativePath: "docs/notes.txt",
    });
    expect(payload.size).toEqual(expect.any(Number));
    expect(payload.size).toBeGreaterThan(0);
  });
});
