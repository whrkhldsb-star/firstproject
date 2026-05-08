"use client";

export function OfficePreviewClient({
	href,
	name,
	driver,
}: {
	href: string;
	name: string;
	driver: string;
}) {
	// Microsoft Office Online Viewer only works with publicly accessible URLs
	// For LOCAL driver files, we use our proxy endpoint to make them accessible
	const viewerUrl = driver === "LOCAL"
		? null // LOCAL files can't be previewed via MS Online Viewer without a public proxy
		: `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(href)}`;

	if (!viewerUrl) {
		return (
			<div className="flex flex-col items-center gap-4 py-12 text-slate-400">
				<span className="text-6xl">📝</span>
				<p className="text-lg">此 Office 文件存储在本地节点，暂不支持在线渲染预览</p>
				<p className="text-sm text-slate-500">建议下载后使用本地软件打开</p>
				<a
					href={href}
					download
					className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-5 py-2.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20"
				>
					⬇ 下载文件
				</a>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2 text-xs text-slate-500">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
				<span>使用 Microsoft Office Online 预览，文件需可公网访问</span>
			</div>
			<iframe
				src={viewerUrl}
				title={name}
				className="h-[85vh] w-full rounded-2xl border-0"
				allowFullScreen
			/>
		</div>
	);
}
