/**
 * Higher-order function for API route handlers with auth + permission checks.
 * Reduces boilerplate across API routes that all follow the same pattern:
 * requireSession → checkPermission → handler logic
 */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { sessionHasPermission } from "@/lib/auth/authorization";
import type { SessionPayload } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/rbac";

export type ApiContext = {
	session: SessionPayload;
	request: Request;
};

export type ApiHandler = (
	ctx: ApiContext,
) => Promise<Response> | Response;

export type ApiHandlerWithParams<T> = (
	ctx: ApiContext,
	params: T,
) => Promise<Response> | Response;

/**
 * Wrap an API handler with session requirement.
 * Returns 401 if not authenticated.
 */
export function withAuth(handler: ApiHandler): (request: Request) => Promise<Response> {
	return async (request: Request) => {
		try {
			const session = await requireSession();
			return handler({ session, request });
		} catch {
			return NextResponse.json({ error: "未登录或会话已过期" }, { status: 401 });
		}
	};
}

/**
 * Wrap an API handler with session + permission requirement.
 * Returns 401 if not authenticated, 403 if lacking permission.
 */
export function withPermission(
	permission: Permission,
	handler: ApiHandler,
): (request: Request) => Promise<Response> {
	return async (request: Request) => {
		try {
			const session = await requireSession();
			if (!sessionHasPermission(session, permission)) {
				return NextResponse.json({ error: "缺少权限" }, { status: 403 });
			}
			return handler({ session, request });
		} catch {
			return NextResponse.json({ error: "未登录或会话已过期" }, { status: 401 });
		}
	};
}

/**
 * Wrap an API handler with optional permission (use for endpoints where
 * admin gets more data but regular user still gets their own data).
 */
export function withOptionalPermission(
	permission: Permission,
	handler: (ctx: ApiContext & { hasPermission: boolean }) => Promise<Response>,
): (request: Request) => Promise<Response> {
	return async (request: Request) => {
		try {
			const session = await requireSession();
			const hasPerm = sessionHasPermission(session, permission);
			return handler({ session, request, hasPermission: hasPerm });
		} catch {
			return NextResponse.json({ error: "未登录或会话已过期" }, { status: 401 });
		}
	};
}

/**
 * Error handling wrapper — catches errors and returns 500 with message.
 */
export function withErrorHandler(
	handler: ApiHandler,
	errorMsg: string = "操作失败",
): (request: Request) => Promise<Response> {
	return async (request: Request) => {
		try {
			return await handler({ session: null as unknown as SessionPayload, request });
		} catch (error) {
			console.error(`[API Error] ${errorMsg}:`, error);
			return NextResponse.json({ error: errorMsg }, { status: 500 });
		}
	};
}
