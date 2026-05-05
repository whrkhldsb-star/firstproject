import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-session", () => ({
  requireSession: vi.fn().mockResolvedValue({
    userId: "u_1",
    username: "admin",
    roles: ["admin"],
    mustChangePassword: false,
  }),
}));

vi.mock("@/lib/auth/authorization", () => ({
  sessionHasPermission: vi.fn().mockReturnValue(true),
}));

vi.mock("../review-command-form", () => ({
  ReviewCommandForm: ({ commandRequestId }: { commandRequestId: string }) => (
    <div data-testid="review-command-form">审批表单：{commandRequestId}</div>
  ),
}));

vi.mock("@/lib/command/service", () => ({
  listCommandRequests: vi.fn().mockResolvedValue([
    {
      id: "cmd_1",
      title: "Restart nginx",
      command: "systemctl restart nginx",
      reason: "Routine maintenance",
      status: "PENDING_APPROVAL",
      approvalStateLabel: "待审批",
      isAssistantInitiated: true,
      requester: { id: "u_1", username: "admin", displayName: "管理员" },
      targets: [
        {
          id: "target_1",
          status: "PENDING_APPROVAL",
          server: { id: "srv_1", name: "hk-prod-1", host: "203.0.113.10", port: 22 },
        },
      ],
      latestApproval: null,
      latestLog: { id: "log_1", summary: "命令审批已通过，任务正在进入执行器队列。" },
    },
  ]),
}));

import RequestsPage from "../page";

describe("RequestsPage", () => {
  it("renders command requests and approval form", async () => {
    render(await RequestsPage());

    expect(screen.getByText("命令请求与审批链路")).toBeInTheDocument();
    expect(screen.getByText("Restart nginx")).toBeInTheDocument();
    expect(screen.getAllByText("待审批")).toHaveLength(2);
    expect(screen.getByText("hk-prod-1")).toBeInTheDocument();
    expect(screen.getByText("命令审批已通过，任务正在进入执行器队列。")).toBeInTheDocument();
    expect(screen.getByTestId("review-command-form")).toHaveTextContent("审批表单：cmd_1");
  });
});
