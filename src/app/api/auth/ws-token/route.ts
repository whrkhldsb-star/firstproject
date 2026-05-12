import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/require-api-permission";

/**
 * GET /api/auth/ws-token
 * Returns the SSH_WS_SECRET for the authenticated user.
 * The frontend passes this as the `secret` query param when connecting
 * to the SSH WebSocket proxy at /ssh.
 */
export async function GET() {
	const result = await requireApiPermission("server:ssh");
	if (result instanceof NextResponse) return result;

	const secret = process.env.SSH_WS_SECRET;
	if (!secret) {
		return NextResponse.json({ error: "SSH_WS_SECRET not configured" }, { status: 503 });
	}

	return NextResponse.json({ secret });
}
