import { describe, expect, it, vi } from "vitest";

const { requireSessionMock, sessionHasPermissionMock, collectServerMetricsMock } = vi.hoisted(() => ({
  requireSessionMock: vi.fn(),
  sessionHasPermissionMock: vi.fn(),
  collectServerMetricsMock: vi.fn(),
}));

vi.mock("@/lib/auth/require-session", () => ({
  requireSession: requireSessionMock,
}));

vi.mock("@/lib/auth/authorization", () => ({
  sessionHasPermission: sessionHasPermissionMock,
}));

vi.mock("@/lib/server/monitor", () => ({
  collectServerMetrics: collectServerMetricsMock,
}));

import { GET } from "../route";

describe("/api/servers/monitor", () => {
  it("returns 403 when the session lacks server read permission", async () => {
    vi.clearAllMocks();
    requireSessionMock.mockResolvedValueOnce({ userId: "u_1", username: "viewer" });
    sessionHasPermissionMock.mockReturnValueOnce(false);

    const response = await GET(new Request("https://example.com/api/servers/monitor?serverId=srv_1"));

    expect(response.status).toBe(403);
    expect(sessionHasPermissionMock).toHaveBeenCalledWith(
      { userId: "u_1", username: "viewer" },
      "server:read",
    );
    expect(collectServerMetricsMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ error: "权限不足" });
  });

  it("collects metrics when the session has server read permission", async () => {
    vi.clearAllMocks();
    requireSessionMock.mockResolvedValueOnce({ userId: "u_1", username: "admin" });
    sessionHasPermissionMock.mockReturnValueOnce(true);
    collectServerMetricsMock.mockResolvedValueOnce({ ok: true, cpu: { usagePercent: 12 } });

    const response = await GET(new Request("https://example.com/api/servers/monitor?serverId=srv_1"));

    expect(response.status).toBe(200);
    expect(collectServerMetricsMock).toHaveBeenCalledWith("srv_1");
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });
});
