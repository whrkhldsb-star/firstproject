import { stat, createReadStream } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "image-bed");

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params;

		const image = await prisma.imageUpload.findUnique({
			where: { id },
			select: { id: true, storageKey: true, mimeType: true, filename: true, isPublic: true },
		});

		if (!image || !image.isPublic) {
			return NextResponse.json({ error: "图片不存在或不可公开访问" }, { status: 404 });
		}

		const filePath = path.join(UPLOAD_DIR, image.storageKey);

		const fileStat = await new Promise<import("node:fs").Stats | null>((resolve) => {
			stat(filePath, (err, stats) => (err ? resolve(null) : resolve(stats)));
		});

		if (!fileStat) {
			return NextResponse.json({ error: "文件已丢失" }, { status: 404 });
		}

		const stream = createReadStream(filePath);
		const webStream = new ReadableStream({
			start(controller) {
				stream.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk as Buffer)));
				stream.on("end", () => controller.close());
				stream.on("error", (err) => controller.error(err));
			},
		});

		return new NextResponse(webStream, {
			status: 200,
			headers: {
				"Content-Type": image.mimeType,
				"Content-Length": String(fileStat.size),
				"Cache-Control": "public, max-age=31536000, immutable",
				"Content-Disposition": `inline; filename="${image.filename}"`,
			},
		});
	} catch (error) {
		return NextResponse.json({ error: "获取图片失败" }, { status: 500 });
	}
}
