/**
 * Publish a file from storage node to image bed.
 * POST /api/images/publish-from-storage
 * Body: { storageNodeId, relativePath, filename?, album? }
 */
import { NextResponse } from "next/server";
import { getApiSession } from "@/lib/auth/api-session";
import { sessionHasPermission } from "@/lib/auth/authorization";
import { prisma } from "@/lib/db";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "image-bed");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".bmp", ".ico", ".tiff"]);

function mimeTypeFromExt(ext: string): string {
	const map: Record<string, string> = {
		".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
		".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif",
		".svg": "image/svg+xml", ".bmp": "image/bmp", ".ico": "image/x-icon",
		".tiff": "image/tiff",
	};
	return map[ext.toLowerCase()] || "application/octet-stream";
}

export async function POST(request: Request) {
	try {
		const session = await getApiSession();
		if (!session) {
			return NextResponse.json({ error: "未登录或会话已过期" }, { status: 401 });
		}
		if (!sessionHasPermission(session, "storage:read")) {
			return NextResponse.json({ error: "缺少云盘读取权限" }, { status: 403 });
		}

		const body = await request.json();
		const { storageNodeId, relativePath, filename, album } = body;

		if (!storageNodeId || !relativePath) {
			return NextResponse.json({ error: "storageNodeId 和 relativePath 必填" }, { status: 400 });
		}

		// Verify the storage node exists and is accessible
		const storageNode = await prisma.storageNode.findUnique({
			where: { id: storageNodeId },
			select: { id: true, driver: true, basePath: true },
		});
		if (!storageNode || storageNode.driver !== "LOCAL") {
			return NextResponse.json({ error: "仅支持本地存储节点" }, { status: 400 });
		}

		const sourcePath = path.join(storageNode.basePath, relativePath);
		const ext = path.extname(relativePath).toLowerCase();
		if (!IMAGE_EXTENSIONS.has(ext)) {
			return NextResponse.json({ error: "不支持该文件类型" }, { status: 400 });
		}

		// Read file from storage
		const buffer = await readFile(sourcePath);
		const originalName = filename || path.basename(relativePath);
		const storageKey = `${crypto.randomUUID()}${ext}`;
		const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

		// Check for duplicate
		const existing = await prisma.imageUpload.findFirst({ where: { checksum } });
		if (existing) {
			return NextResponse.json({
				image: existing,
				publicUrl: `/api/images/${existing.id}/file`,
				message: "文件已存在（checksum 匹配），跳过上传",
			});
		}

		// Save to image-bed directory
		await mkdir(UPLOAD_DIR, { recursive: true });
		await writeFile(path.join(UPLOAD_DIR, storageKey), buffer);

		// Create DB record
		const image = await prisma.imageUpload.create({
			data: {
				filename: originalName,
				storageKey,
				mimeType: mimeTypeFromExt(ext),
				sizeBytes: buffer.byteLength,
				checksum,
				album: album?.trim() || undefined,
				isPublic: true,
				storageNodeId,
				relativePath,
				userId: session.userId,
			},
		});

		return NextResponse.json({
			image,
			publicUrl: `/api/images/${image.id}/file`,
		}, { status: 201 });
	} catch (error) {
		console.error("[images/publish-from-storage]", error);
		return NextResponse.json({ error: "从云盘发布失败" }, { status: 500 });
	}
}
