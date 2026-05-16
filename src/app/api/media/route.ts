import { NextResponse } from "next/server";
import { sessionHasPermission } from "@/lib/auth/authorization";
import { requireSession } from "@/lib/auth/require-session";
import { listMediaItems, scanMediaFromFileEntries } from "@/lib/media/service";
import { withRateLimit, rateLimitResponse, GENERAL_WRITE_LIMIT } from "@/lib/http/rate-limit-presets";
export const dynamic = "force-dynamic";
export async function GET(request:Request){ const session=await requireSession(); if(!sessionHasPermission(session,"storage:read")) return NextResponse.json({error:"缺少权限"},{status:403}); const sp=new URL(request.url).searchParams; const type=sp.get("type"); return NextResponse.json({ media: await listMediaItems({ mediaType: type === "image" || type === "video" ? type : undefined, q: sp.get("q") ?? undefined }) }); }
export async function POST(request: Request) {
	const rl = withRateLimit(request, GENERAL_WRITE_LIMIT);
	if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);
	try {
		const session = await requireSession();
		if (!sessionHasPermission(session, "media:manage")) return NextResponse.json({ error: "缺少权限" }, { status: 403 });
		return NextResponse.json(await scanMediaFromFileEntries(session.userId));
	} catch (error) {
		const message = error instanceof Error ? error.message : "操作失败";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
