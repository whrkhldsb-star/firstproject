import { requireSession } from "@/lib/auth/require-session";
import { sessionHasPermission } from "@/lib/auth/authorization";
import { prisma } from "@/lib/db";

import { DownloadsClient } from "./downloads-client";

export const dynamic = "force-dynamic";

export default async function DownloadsPage() {
	const session = await requireSession("/downloads");
	const canManage = sessionHasPermission(session, "storage:write");
	const canRead = sessionHasPermission(session, "storage:read");

	if (!canRead) {
		return (
			<main className="min-h-screen bg-[radial-gradient(circle_at_top,#1e293b,transparent_40%),linear-gradient(180deg,#0f172a_0%,#020617_100%)] text-slate-100">
				<div className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
					<EmptyState text="你没有下载管理的权限。" />
				</div>
			</main>
		);
	}

	const servers = await prisma.server.findMany({
		where: { enabled: true },
		select: {
			id: true,
			name: true,
			host: true,
			storageNode: { select: { id: true, basePath: true, driver: true } },
		},
		orderBy: { name: "asc" },
	});

	const serverList = servers.map((s) => ({
		id: s.id,
		name: s.name,
		host: s.host,
		storagePath: s.storageNode?.basePath ?? "/root/downloads",
		storageDriver: s.storageNode?.driver ?? "LOCAL",
	}));

	return (
		<main className="min-h-screen bg-[radial-gradient(circle_at_top,#1e293b,transparent_40%),linear-gradient(180deg,#0f172a_0%,#020617_100%)] text-slate-100">
			<div className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
				<header className="mb-8">
					<h1 className="text-3xl font-semibold tracking-tight text-white">远程下载</h1>
					<p className="mt-1.5 text-sm text-slate-500">
						输入 URL 或磁力链接，下载到指定 VPS 的存储路径
					</p>
				</header>

				<DownloadsClient servers={serverList} canManage={canManage} />
			</div>
		</main>
	);
}

function EmptyState({ text }: { text: string }) {
	return <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] p-6 text-sm text-slate-500 text-center">{text}</div>;
}
