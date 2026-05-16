import { NextResponse } from "next/server";

import { getSessionCookieName } from "@/lib/auth/session";
import { withRateLimit, rateLimitResponse, GENERAL_WRITE_LIMIT } from "@/lib/http/rate-limit-presets";

export async function POST(request: Request) {
	const rl = withRateLimit(request, GENERAL_WRITE_LIMIT);
	if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);
	try {
		const requestUrl = new URL(request.url);
		const response = NextResponse.redirect(new URL("/login", requestUrl), 303);
		response.headers.set("location", "/login");
		response.cookies.set(getSessionCookieName(), "", {
			httpOnly: true,
			sameSite: "lax",
			secure: requestUrl.protocol === "https:",
			path: "/",
			maxAge: 0,
		});
		return response;
	} catch (error) {
		const message = error instanceof Error ? error.message : "操作失败";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
