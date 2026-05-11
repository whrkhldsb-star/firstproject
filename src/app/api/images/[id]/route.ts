import { unlink } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { sessionHasPermission } from "@/lib/auth/authorization";
import { prisma } from "@/lib/db";
import { logError } from "@/lib/logging";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "image-bed");

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await requireSession();
		const { id } = await params;

		const image = await prisma.imageUpload.findUnique({
			where: { id },
			select: { id: true, userId: true, storageKey: true, storageNodeId: true, relativePath: true },
		});

		if (!image) {
			return NextResponse.json({ error: "图片不存在" }, { status: 404 });
		}

		// Only owner or admin can delete
		if (image.userId !== session.userId && !sessionHasPermission(session, "user:read")) {
			return NextResponse.json({ error: "无权删除" }, { status: 403 });
		}

		// Delete local file
		try {
			await unlink(path.join(UPLOAD_DIR, image.storageKey));
		} catch {
			// File may already be gone
		}

		// If linked to storage node, also delete from storage path
		if (image.storageNodeId && image.relativePath) {
			try {
				const storageNode = await prisma.storageNode.findUnique({
					where: { id: image.storageNodeId },
					select: { basePath: true, driver: true },
				});
				if (storageNode?.driver === "LOCAL" && image.relativePath) {
					await unlink(path.join(storageNode.basePath, image.relativePath, image.storageKey)).catch(() => {});
				}
			} catch (e) {
				logError("image-bed:delete-storage-copy", e);
			}
		}

		await prisma.imageUpload.delete({ where: { id } });

		return NextResponse.json({ success: true });
	} catch (error) {
		logError("image-bed:delete", error);
		return NextResponse.json({ error: "删除失败" }, { status: 500 });
	}
}
