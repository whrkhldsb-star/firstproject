/**
 * 2FA Enable — after verifying the TOTP code, saves the secret to DB.
 * POST /api/auth/2fa/enable  { code, secret }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/api-session";
import { prisma } from "@/lib/db";
import { verify as verifyTOTP } from "otplib";
import { createLogger } from "@/lib/logging";
import { withRateLimit, rateLimitResponse, GENERAL_WRITE_LIMIT } from "@/lib/http/rate-limit-presets";

const logger = createLogger("api:2fa:enable");

const enableSchema = z.object({ code: z.string().min(1), secret: z.string().min(1) });

export async function POST(request: Request) {
	const rl = withRateLimit(request, GENERAL_WRITE_LIMIT);
	if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);
	try {
		const session = await getApiSession();
		if (!session) {
			return NextResponse.json({ error: "未登录或会话已过期" }, { status: 401 });
		}

		const parsed = enableSchema.safeParse(await request.json());
		if (!parsed.success) return NextResponse.json({ error: "输入参数无效" }, { status: 400 });
		const { code, secret } = parsed.data;

		const valid = verifyTOTP({ token: code, secret });
		if (!valid) {
			return NextResponse.json({ error: "验证码错误" }, { status: 400 });
		}

		await prisma.user.update({
			where: { id: session.userId },
			data: { twoFactorEnabled: true, twoFactorSecret: secret },
		});

		return NextResponse.json({ success: true });
	} catch (error) {
		logger.error("[2fa/enable]", error);
		return NextResponse.json({ error: "启用两步验证失败" }, { status: 500 });
	}
}
