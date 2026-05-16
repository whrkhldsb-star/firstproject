import { NextResponse } from "next/server";
import { z } from "zod";
import { createLogger } from "@/lib/logging";
import { sessionHasPermission } from "@/lib/auth/authorization";
import { requireSession } from "@/lib/auth/require-session";
import { startService, stopService, uninstallService, syncServiceStatus, getQuickService } from "@/lib/quick-service/service";
import { withRateLimit, rateLimitResponse, GENERAL_WRITE_LIMIT } from "@/lib/http/rate-limit-presets";

const logger = createLogger("api:quick-services:slug");

const serviceActionSchema = z.object({ action: z.enum(["start", "stop", "sync"]) });

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
	const rl = withRateLimit(request, GENERAL_WRITE_LIMIT);
	if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);
	try {
		const session = await requireSession();
		if (!sessionHasPermission(session, "user:manage"))
			return NextResponse.json({ error: "权限不足" }, { status: 403 });

		const { slug } = await params;
		const parsed = serviceActionSchema.safeParse(await request.json());
		if (!parsed.success) return NextResponse.json({ error: "输入参数无效，支持: start/stop/sync" }, { status: 400 });
		const { action } = parsed.data;

		if (action === "start") {
			await startService(slug);
			return NextResponse.json({ success: true, status: "running" });
		}
		if (action === "stop") {
			await stopService(slug);
			return NextResponse.json({ success: true, status: "stopped" });
		}
		if (action === "sync") {
			const status = await syncServiceStatus(slug);
			return NextResponse.json({ success: true, status });
		}

		return NextResponse.json({ error: "未知操作，支持: start/stop/sync" }, { status: 400 });
	} catch (err) {
		logger.error("快捷服务操作失败", err);
		const msg = err instanceof Error ? err.message : "操作失败";
		return NextResponse.json({ error: msg }, { status: 500 });
	}
}

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string }> }) {
	const rl = withRateLimit(request, GENERAL_WRITE_LIMIT);
	if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);
	try {
		const session = await requireSession();
		if (!sessionHasPermission(session, "user:manage"))
			return NextResponse.json({ error: "权限不足" }, { status: 403 });

		const { slug } = await params;
		await uninstallService(slug);
		return NextResponse.json({ success: true });
	} catch (err) {
		logger.error("卸载快捷服务失败", err);
		const msg = err instanceof Error ? err.message : "卸载失败";
		return NextResponse.json({ error: msg }, { status: 500 });
	}
}
