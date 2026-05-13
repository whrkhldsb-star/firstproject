/**
 * Batch operations for image-bed: bulk delete, bulk move album, bulk toggle public.
 * POST /api/images/batch  { action: "delete"|"moveAlbum"|"togglePublic", ids: string[], album?: string }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/api-session";
import { sessionHasPermission } from "@/lib/auth/authorization";
import { prisma } from "@/lib/db";
import { unlink } from "node:fs/promises";
import * as path from "node:path";
import { createLogger } from "@/lib/logging";
import { UPLOAD_DIR } from "@/lib/image-bed/constants";

const logger = createLogger("api:images:batch");

const batchSchema = z.object({ action: z.enum(["delete", "moveAlbum", "togglePublic"]), ids: z.array(z.string()).min(1).max(100), album: z.string().optional() });

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
	try {
		const session = await getApiSession();
		if (!session) {
			return NextResponse.json({ error: "未登录或会话已过期" }, { status: 401 });
		}
		const parsed = batchSchema.safeParse(await request.json());
		if (!parsed.success) return NextResponse.json({ error: "输入参数无效" }, { status: 400 });
		const { action, ids, album } = parsed.data;

		const isAdmin = sessionHasPermission(session, "user:read");
		const whereClause = isAdmin
			? { id: { in: ids } }
			: { id: { in: ids }, userId: session.userId };

		switch (action) {
			case "delete": {
				const images = await prisma.imageUpload.findMany({
					where: whereClause,
					select: { id: true, storageKey: true },
				});
				// Delete DB records
				const result = await prisma.imageUpload.deleteMany({ where: whereClause });
				// Delete files (best-effort)
				for (const img of images) {
					try {
						const ext = path.extname(img.storageKey);
						const base = path.basename(img.storageKey, ext);
						await Promise.allSettled([
							unlink(path.join(UPLOAD_DIR, img.storageKey)),
							unlink(path.join(UPLOAD_DIR, `${base}_thumb.webp`)),
							unlink(path.join(UPLOAD_DIR, `${base}.webp`)),
							unlink(path.join(UPLOAD_DIR, `${base}.avif`)),
						]);
					} catch { /* best-effort */ }
				}
				return NextResponse.json({ deleted: result.count });
			}

			case "moveAlbum": {
				if (!album || typeof album !== "string") {
					return NextResponse.json({ error: "album 参数必填" }, { status: 400 });
				}
				const result = await prisma.imageUpload.updateMany({
					where: whereClause,
					data: { album: album.trim() || null },
				});
				return NextResponse.json({ updated: result.count });
			}

			case "togglePublic": {
				// Get current isPublic states and flip them
				const images = await prisma.imageUpload.findMany({
					where: whereClause,
					select: { id: true, isPublic: true },
				});
				const updates = images.map((img) =>
					prisma.imageUpload.update({
						where: { id: img.id },
						data: { isPublic: !img.isPublic },
					})
				);
				await Promise.all(updates);
				return NextResponse.json({ updated: images.length });
			}

			default:
				return NextResponse.json({ error: "不支持的操作，可选: delete / moveAlbum / togglePublic" }, { status: 400 });
		}
	} catch (error) {
		logger.error("[images/batch]", error);
		return NextResponse.json({ error: "批量操作失败" }, { status: 500 });
	}
}
