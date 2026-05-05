import { requireSession } from "@/lib/auth/require-session";
import { MediaPreviewClient } from "./media-preview-client";
import { TextPreviewClient } from "./text-preview-client";

export const dynamic = "force-dynamic";

type PreviewPageProps = {
	searchParams?: Promise<{
		href?: string;
		name?: string;
		type?: string;
		driver?: string;
		size?: string;
		nodeId?: string;
		relativePath?: string;
	}>;
};

export default async function FilePreviewPage({ searchParams }: PreviewPageProps) {
	await requireSession();

	const params = await searchParams;
	const href = params?.href ?? "";
	const name = params?.name ?? "未知文件";
	const mimeType = params?.type ?? "";
	const driver = params?.driver ?? "LOCAL";
	const size = params?.size ? Number(params.size) : 0;
	const nodeId = params?.nodeId ?? "";
	const relativePath = params?.relativePath ?? "";

	const downloadUrl = href ? `${href}${href.includes("?") ? "&" : "?"}download=1` : "";

	const isImage = mimeType.startsWith("image/");
	const isVideo = mimeType.startsWith("video/");
	const isAudio = mimeType.startsWith("audio/");
	const isPdf = mimeType === "application/pdf";
	const isText =
		mimeType.startsWith("text/") ||
		[
			"application/json",
			"application/xml",
			"application/javascript",
			"application/x-javascript",
			"application/x-sh",
		].includes(mimeType);
	const largeTextWarning = isText && size > 512 * 1024;

	return (
		<main className="min-h-screen bg-slate-950 text-white">
			<div className="mx-auto max-w-6xl px-4 py-6">
				{/* Header */}
				<div className="mb-6 flex flex-wrap items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						<a
							href="/files"
							className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 hover:border-cyan-400/50 hover:bg-white/5"
						>
							← 返回文件
						</a>
						<h1 className="truncate text-xl font-semibold text-white">{name}</h1>
						<span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-400">
							{driver}
						</span>
					</div>
					{downloadUrl ? (
						<a
							href={downloadUrl}
							className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-400/20"
						>
							⬇ 下载
						</a>
					) : null}
				</div>

				{/* Large file warning */}
				{largeTextWarning ? (
					<div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-sm text-amber-200">
						⚠ 文件较大（{(size / 1024 / 1024).toFixed(1)} MB），预览可能较慢。建议直接下载后查看。
					</div>
				) : null}

				{/* Preview content */}
				<div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
					{isImage && href ? (
						<div className="flex items-center justify-center">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={href}
								alt={name}
								className="max-h-[80vh] max-w-full rounded-2xl object-contain"
							/>
						</div>
					) : isVideo || isAudio ? (
						<MediaPreviewClient
							href={href}
							name={name}
							mimeType={mimeType}
							driver={driver}
							nodeId={nodeId}
							relativePath={relativePath}
						/>
					) : isPdf && href ? (
						<iframe
							src={href}
							title={name}
							className="h-[85vh] w-full rounded-2xl border-0"
						/>
					) : isText && href ? (
						<TextPreviewClient href={href} />
					) : (
						<div className="flex flex-col items-center gap-4 py-16 text-slate-400">
							<span className="text-6xl">📄</span>
							<p>此文件类型暂不支持在线预览</p>
							{downloadUrl ? (
								<a
									href={downloadUrl}
									className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-400/20"
								>
									⬇ 下载后查看
								</a>
							) : null}
						</div>
					)}
				</div>
			</div>
		</main>
	);
}
