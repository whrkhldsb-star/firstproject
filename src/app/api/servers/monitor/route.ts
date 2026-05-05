import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { collectServerMetrics } from "@/lib/server/monitor";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	try {
		await requireSession();
	} catch {
		return NextResponse.json({ error: "未认证" }, { status: 401 });
	}

	const { searchParams } = new URL(request.url);
	const serverId = searchParams.get("serverId");
	if (!serverId) {
		return NextResponse.json({ error: "缺少 serverId" }, { status: 400 });
	}

	const result = await collectServerMetrics(serverId);
	return NextResponse.json(result);
}
