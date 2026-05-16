/**
 * 2FA/TOTP Setup — generates a new TOTP secret and otpauth URL.
 * POST /api/auth/2fa/setup — generate secret
 * PUT  /api/auth/2fa/setup — verify a code against a secret
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/api-session";
import { prisma } from "@/lib/db";
import { generateSecret, verify as verifyTOTP } from "otplib";
import { createLogger } from "@/lib/logging";
import { withRateLimit, rateLimitResponse, GENERAL_WRITE_LIMIT } from "@/lib/http/rate-limit-presets";

const logger = createLogger("api:2fa:setup");

const setupSchema = z.object({ code: z.string().min(1), secret: z.string().min(1) });

function buildOtpauthUrl(secret: string, username: string): string {
	const label = encodeURIComponent(`VPS管控平台:${username}`);
	const issuer = encodeURIComponent("VPS管控平台");
	return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

export async function POST(request: Request) {
	const rl = withRateLimit(request, GENERAL_WRITE_LIMIT);
	if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);
	try {
		const session = await getApiSession();
		if (!session) {
			return NextResponse.json({ error: "未登录或会话已过期" }, { status: 401 });
		}

		const user = await prisma.user.findUnique({
			where: { id: session.userId },
			select: { twoFactorEnabled: true },
		});

		if (user?.twoFactorEnabled) {
			return NextResponse.json({ error: "两步验证已启用，请先禁用再重新设置" }, { status: 400 });
		}

		const secret = generateSecret();
		const otpauthUrl = buildOtpauthUrl(secret, session.username || "user");

		return NextResponse.json({ secret, otpauthUrl });
	} catch (error) {
		logger.error("[2fa/setup]", error);
		return NextResponse.json({ error: "设置两步验证失败" }, { status: 500 });
	}
}

export async function PUT(request: Request) {
	const rl = withRateLimit(request, GENERAL_WRITE_LIMIT);
	if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);
	try {
		const session = await getApiSession();
		if (!session) {
			return NextResponse.json({ error: "未登录或会话已过期" }, { status: 401 });
		}

		const parsed = setupSchema.safeParse(await request.json());
		if (!parsed.success) return NextResponse.json({ error: "输入参数无效" }, { status: 400 });
		const { code, secret } = parsed.data;
		const valid = verifyTOTP({ token: code, secret });
		return NextResponse.json({ valid });
	} catch (error) {
		logger.error("[2fa/verify]", error);
		return NextResponse.json({ error: "验证失败" }, { status: 500 });
	}
}
