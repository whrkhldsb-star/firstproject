import { describe, expect, it, vi } from "vitest";

const {
  requireSessionMock,
  listUserNotificationsMock,
  getUnreadCountMock,
  markAsReadMock,
  markAllAsReadMock,
  deleteNotificationMock,
} = vi.hoisted(() => ({
  requireSessionMock: vi.fn(),
  listUserNotificationsMock: vi.fn(),
  getUnreadCountMock: vi.fn(),
  markAsReadMock: vi.fn(),
  markAllAsReadMock: vi.fn(),
  deleteNotificationMock: vi.fn(),
}));

vi.mock("@/lib/auth/require-session", () => ({
  requireSession: requireSessionMock,
}));

vi.mock("@/lib/notification/service", () => ({
  listUserNotifications: listUserNotificationsMock,
  getUnreadCount: getUnreadCountMock,
  markAsRead: markAsReadMock,
  markAllAsRead: markAllAsReadMock,
  deleteNotification: deleteNotificationMock,
}));

import { DELETE, GET, PATCH } from "../route";

describe("/api/notifications", () => {
  it("returns notifications for the authenticated user only", async () => {
    vi.clearAllMocks();
    requireSessionMock.mockResolvedValueOnce({ userId: "u_1", username: "alice" });
    listUserNotificationsMock.mockResolvedValueOnce([{ id: "n_1" }]);
    getUnreadCountMock.mockResolvedValueOnce(1);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(listUserNotificationsMock).toHaveBeenCalledWith("u_1", { limit: 50 });
    expect(getUnreadCountMock).toHaveBeenCalledWith("u_1");
    await expect(response.json()).resolves.toMatchObject({ unreadCount: 1 });
  });

  it("marks only the authenticated user's notifications as read", async () => {
    vi.clearAllMocks();
    requireSessionMock.mockResolvedValueOnce({ userId: "u_1", username: "alice" });

    const response = await PATCH(
      new Request("https://example.com/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ notificationId: "n_1" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(markAsReadMock).toHaveBeenCalledWith("n_1", "u_1");
  });

  it("marks all notifications for the authenticated user as read", async () => {
    vi.clearAllMocks();
    requireSessionMock.mockResolvedValueOnce({ userId: "u_1", username: "alice" });

    const response = await PATCH(
      new Request("https://example.com/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ markAllAsRead: true }),
      }),
    );

    expect(response.status).toBe(200);
    expect(markAllAsReadMock).toHaveBeenCalledWith("u_1");
  });

  it("deletes only the authenticated user's notification", async () => {
    vi.clearAllMocks();
    requireSessionMock.mockResolvedValueOnce({ userId: "u_1", username: "alice" });

    const response = await DELETE(new Request("https://example.com/api/notifications?id=n_1", { method: "DELETE" }));

    expect(response.status).toBe(200);
    expect(deleteNotificationMock).toHaveBeenCalledWith("n_1", "u_1");
  });
});
