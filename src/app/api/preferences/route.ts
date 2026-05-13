/**
 * User preferences API — per-user settings stored in localStorage on client,
 * with optional server-side persistence via the User model.
 * GET  /api/preferences  — get current user preferences
 * PUT  /api/preferences  — update preferences
 */
import { NextResponse } from "next/server";
import { requireApiSession, isSessionPayload } from "@/lib/auth/api-session";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logging";

const logger = createLogger("api:preferences");

export async function GET() {
	const session = await requireApiSession();
	if (!isSessionPayload(session)) return session; // 401 response

	try {
		const user = await prisma.user.findUnique({
			where: { id: session.userId },
			select: { preferences: true },
		});

		const defaults = {
			sidebarCollapsed: false,
			defaultPage: "/",
			dashboardWidgets: ["quick-links", "analytics", "audit-log"],
			notificationsEnabled: true,
			notificationSound: true,
			autoRefreshInterval: 0,
			compactMode: false,
		};

		const prefs = user?.preferences
			? { ...defaults, ...(typeof user.preferences === "object" ? user.preferences : {}) }
			: defaults;

		return NextResponse.json(prefs);
	} catch (error) {
		logger.error("[preferences GET]", error);
		return NextResponse.json({ error: "获取偏好设置失败" }, { status: 500 });
	}
}

export async function PUT(request: Request) {
	const session = await requireApiSession();
	if (!isSessionPayload(session)) return session; // 401 response

	try {

		const body = await request.json();

		await prisma.user.update({
			where: { id: session.userId },
			data: { preferences: body },
		});

		return NextResponse.json({ ok: true });
	} catch (error) {
		logger.error("[preferences PUT]", error);
		return NextResponse.json({ error: "保存偏好设置失败" }, { status: 500 });
	}
}
