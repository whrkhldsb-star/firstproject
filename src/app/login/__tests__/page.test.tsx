import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import LoginPage from "@/app/login/page";

describe("LoginPage", () => {
	it("renders sign-in page for the private console", async () => {
		vi.stubEnv("NEXT_PUBLIC_APP_PUBLIC_LABEL", "VPS 管理与分布式云盘");
		vi.stubEnv("SITE_NAME", "VPS 统一管控平台");

		render(await LoginPage({ searchParams: Promise.resolve({}) }));

		expect(screen.getByText("VPS 统一管控平台")).toBeInTheDocument();
		expect(screen.getByText("VPS 管理与分布式云盘，一站掌控。")).toBeInTheDocument();
		expect(screen.getByText("欢迎回来")).toBeInTheDocument();
		expect(screen.getByText("VPS 管理")).toBeInTheDocument();
		expect(screen.getByText("安全审批")).toBeInTheDocument();
		expect(screen.getByText("分布式云盘")).toBeInTheDocument();

		vi.unstubAllEnvs();
	});
});
