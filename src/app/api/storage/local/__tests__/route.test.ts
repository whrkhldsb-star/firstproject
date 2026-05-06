import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireSessionMock,
  sessionHasPermissionMock,
  assertStorageAccessMock,
  prismaMock,
  mkdirMock,
  writeFileMock,
  accessMock,
  statMock,
} = vi.hoisted(() => ({
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
  mkdirMock: vi.fn(),
  writeFileMock: vi.fn(),
  accessMock: vi.fn(),
  statMock: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    createReadStream: vi.fn(() => new ReadableStream()),
  },
  createReadStream: vi.fn(() => new ReadableStream()),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    access: accessMock,
    mkdir: mkdirMock,
    stat: statMock,
    writeFile: writeFileMock,
  },
  access: accessMock,
  mkdir: mkdirMock,
  stat: statMock,
  writeFile: writeFileMock,
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

const session = { userId: "u_1", username: "admin", roles: ["admin"], mustChangePassword: false };

function uploadForm(relativePath: string) {
  const formData = new FormData();
  formData.set("storageNodeId", "node_1");
  formData.set("relativePath", relativePath);
  formData.set("file", new File(["hello world"], "notes.txt", { type: "text/plain" }));
  return formData;
}

describe("/api/storage/local", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionHasPermissionMock.mockReturnValue(true);
    assertStorageAccessMock.mockResolvedValue({ allowed: true });
    requireSessionMock.mockResolvedValue(session);
    statMock.mockResolvedValue({ isFile: () => true, size: 11 });
  });

  it("returns 400 when path is missing", async () => {
    const response = await GET(new Request("https://example.com/api/storage/local"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "缺少 path 参数" });
  });

  it("rejects unsafe download paths before DB lookup", async () => {
    const response = await GET(new Request("https://example.com/api/storage/local?path=..%2Fsecret.txt"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/路径/) });
    expect(prismaMock.fileEntry.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when local file entry is not registered", async () => {
    prismaMock.fileEntry.findFirst.mockResolvedValueOnce(null);

    const response = await GET(new Request("https://example.com/api/storage/local?path=docs%2Fnotes.txt"));

    expect(prismaMock.fileEntry.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ relativePath: "docs/notes.txt" }),
    }));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "文件条目不存在，或未登记为本机存储文件" });
  });

  it("normalizes safe Windows-style upload paths and creates a file entry", async () => {
    prismaMock.storageNode.findUnique.mockResolvedValueOnce({
      id: "node_1",
      name: "主控本机",
      driver: "LOCAL",
      basePath: "/tmp/storage",
    });
    prismaMock.fileEntry.findFirst.mockResolvedValueOnce(null);
    prismaMock.fileEntry.create.mockResolvedValueOnce({ id: "file_1" });

    const response = await POST(new Request("https://example.com/api/storage/local", {
      method: "POST",
      body: uploadForm("docs\\notes.txt"),
    }));

    expect(response.status).toBe(200);
    expect(assertStorageAccessMock).toHaveBeenCalledWith(expect.objectContaining({
      relativePath: "docs/notes.txt",
      operation: "write",
    }));
    expect(prismaMock.fileEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: "notes.txt",
        relativePath: "docs/notes.txt",
      }),
    }));
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: true,
      storageNodeId: "node_1",
      relativePath: "docs/notes.txt",
    });
    expect(payload.size).toEqual(expect.any(Number));
    expect(payload.size).toBeGreaterThan(0);
  });

 it("rejects unsafe upload relativePath before storage node lookup or writes", async () => {
 const response = await POST(new Request("https://example.com/api/storage/local", {
 method: "POST",
 body: uploadForm("/etc/passwd"),
 }));

 expect(response.status).toBe(400);
 await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/路径/) });
 expect(prismaMock.storageNode.findUnique).not.toHaveBeenCalled();
 expect(assertStorageAccessMock).not.toHaveBeenCalled();
 expect(mkdirMock).not.toHaveBeenCalled();
 expect(writeFileMock).not.toHaveBeenCalled();
 expect(prismaMock.fileEntry.create).not.toHaveBeenCalled();
 });

 it("returns 200 with RFC 5987 content-disposition for Chinese filename downloads", async () => {
 prismaMock.fileEntry.findFirst.mockResolvedValueOnce({
 id: "file_cn",
 name: "新建文档.docx",
 relativePath: "新建文档.docx",
 entryType: "FILE",
 mimeType: null,
 storageNode: {
 id: "node_1",
 name: "本机存储",
 basePath: "/tmp/storage",
 driver: "LOCAL",
 },
 });

 const response = await GET(new Request("https://example.com/api/storage/local?path=%E6%96%B0%E5%BB%BA%E6%96%87%E6%A1%A3.docx"));

 expect(response.status).toBe(200);
 const cd = response.headers.get("content-disposition");
 expect(cd).toContain("filename*=UTF-8''");
 expect(cd).toContain(encodeURIComponent("新建文档.docx"));
 });
});
