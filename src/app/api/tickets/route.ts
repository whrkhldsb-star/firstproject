import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionHasPermission } from "@/lib/auth/authorization";
import { requireSession } from "@/lib/auth/require-session";
import { addTicketComment, createTicket, listTickets, updateTicketStatus } from "@/lib/ticket/service";
import { withRateLimit, rateLimitResponse, GENERAL_WRITE_LIMIT } from "@/lib/http/rate-limit-presets";

const ticketPostSchema = z.object({
  subject: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  category: z.string().optional(),
  serverId: z.string().optional(),
  ticketId: z.string().optional(),
  body: z.string().optional(),
  title: z.string().optional(),
});

const ticketPatchSchema = z.object({
 id: z.string().min(1),
 status: z.enum(["open", "in_progress", "resolved", "closed"]),
 assigneeId: z.string().optional(),
 priority: z.enum(["low", "medium", "high", "critical"]).optional(),
});

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
	try {
		const session = await requireSession();
		if (!sessionHasPermission(session, "ticket:manage")) return NextResponse.json({ error: "缺少权限" }, { status: 403 });
		return NextResponse.json({ tickets: await listTickets(session.userId) });
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
		if (!sessionHasPermission(session, "ticket:manage")) return NextResponse.json({ error: "缺少权限" }, { status: 403 });
		const body = await request.json();
		const parsed = ticketPostSchema.safeParse(body);
		if (!parsed.success) return NextResponse.json({ error: "输入校验失败", details: parsed.error.flatten().fieldErrors }, { status: 400 });
		const data = parsed.data;
		if (data.ticketId && data.body) return NextResponse.json({ comment: await addTicketComment({ ticketId: data.ticketId, authorId: session.userId, body: data.body }) }, { status: 201 });
		return NextResponse.json({ ticket: await createTicket({ title: data.subject ?? data.title, description: data.description, priority: data.priority, createdBy: session.userId }) }, { status: 201 });
	} catch (error) {
		const message = error instanceof Error ? error.message : "操作失败";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
export async function PATCH(request: Request) {
	const rl = withRateLimit(request, GENERAL_WRITE_LIMIT);
	if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);
	try {
		const session = await requireSession();
		if (!sessionHasPermission(session, "ticket:manage")) return NextResponse.json({ error: "缺少权限" }, { status: 403 });
		const body = await request.json();
		const parsed = ticketPatchSchema.safeParse(body);
		if (!parsed.success) return NextResponse.json({ error: "输入校验失败", details: parsed.error.flatten().fieldErrors }, { status: 400 });
		const data = parsed.data;
		return NextResponse.json({ ticket: await updateTicketStatus({ id: data.id, status: data.status, assigneeId: data.assigneeId }) });
	} catch (error) {
		const message = error instanceof Error ? error.message : "操作失败";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
