import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionHasPermission } from "@/lib/auth/authorization";
import { requireSession } from "@/lib/auth/require-session";
import { createSnippet, listSnippets } from "@/lib/snippet/service";
import { withRateLimit, rateLimitResponse, GENERAL_WRITE_LIMIT } from "@/lib/http/rate-limit-presets";

const snippetPostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  language: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
});


export const dynamic= "force-dynamic";
export async function GET(request: Request) {
	try {
		const session = await requireSession();
		if (!sessionHasPermission(session, "snippet:manage")) return NextResponse.json({ error: "缺少权限" }, { status: 403 });
		const sp = new URL(request.url).searchParams;
		return NextResponse.json({ snippets: await listSnippets({ userId: session.userId, q: sp.get("q") ?? undefined, language: sp.get("language") ?? undefined }) });
	} catch (error) {
		const message = error instanceof Error ? error.message : "操作失败";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
export async function POST(request: Request) {
	const rl = withRateLimit(request, GENERAL_WRITE_LIMIT);
	if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);
	try {
		const session = await requireSession();
		if (!sessionHasPermission(session, "snippet:manage")) return NextResponse.json({ error: "缺少权限" }, { status: 403 });
		const body = await request.json();
		const parsed = snippetPostSchema.safeParse(body);
		if (!parsed.success) return NextResponse.json({ error: "输入校验失败", details: parsed.error.flatten().fieldErrors }, { status: 400 });
		const data = parsed.data;
		return NextResponse.json({ snippet: await createSnippet({ ...data, createdBy: session.userId }) }, { status: 201 });
	} catch (error) {
		const message = error instanceof Error ? error.message : "操作失败";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
