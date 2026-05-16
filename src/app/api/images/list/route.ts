import { NextResponse } from "next/server";
import { getApiSession } from "@/lib/auth/api-session";
import { sessionHasPermission } from "@/lib/auth/authorization";
import { verifyBearerToken } from "@/lib/auth/bearer-token";
import { prisma } from "@/lib/db";
import { withCacheHeaders, CachePresets } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	try {
		// Support Bearer Token auth OR session cookie
		const tokenAuth = await verifyBearerToken(request, "image:read");
		let userId: string;
		let isAdmin = false;

		if (tokenAuth) {
			userId = tokenAuth.userId;
			isAdmin = tokenAuth.scopes.includes("admin");
		} else {
			const session = await getApiSession();
			if (!session) {
				return NextResponse.json({ error: "未登录或会话已过期" }, { status: 401 });
			}
			userId = session.userId;
			isAdmin = sessionHasPermission(session, "user:read");
		}

		const { searchParams } = new URL(request.url);

		const album = searchParams.get("album")?.trim() || undefined;
		const page = Math.max(1, Number(searchParams.get("page")) || 1);
		const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 30));
		const showAll = searchParams.get("all") === "true";

		const where: Record<string, unknown> = {};
		if (album) where.album = album;

		// Non-admin users only see their own images
		if (!showAll || !isAdmin) {
			where.userId = userId;
		}

		const [images, total] = await Promise.all([
			prisma.imageUpload.findMany({
				where,
				orderBy: { createdAt: "desc" },
				skip: (page - 1) * limit,
				take: limit,
				include: {
					user: { select: { id: true, username: true, displayName: true } },
				},
			}),
			prisma.imageUpload.count({ where }),
		]);

		const imagesWithUrl = images.map((img) => ({
			...img,
			publicUrl: `/api/images/${img.id}/file`,
		}));

		return withCacheHeaders(
			NextResponse.json({
				images: imagesWithUrl,
				total,
				page,
				limit,
				totalPages: Math.ceil(total / limit),
			}),
			CachePresets.shortLived,
		);
	} catch (_error) {
		return NextResponse.json({ error: "获取图片列表失败" }, { status: 500 });
	}
}
