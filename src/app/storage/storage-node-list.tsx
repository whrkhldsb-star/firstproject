"use client";

import { useState } from "react";

import { StorageNodeEditForm } from "./storage-node-edit-form";
import { StorageNodeDeleteButton } from "./storage-node-delete-button";

type StorageNodeItem = {
	id: string;
	name: string;
	driver: string;
	basePath: string;
	isDefault: boolean;
	host?: string | null;
	port?: number | null;
	username?: string | null;
	serverId?: string | null;
	connectionSummary: string;
	directAccess: { mode: string; description: string; href: string | null };
	fileCount: number;
};

export function StorageNodeList({
	nodes,
	servers,
	canManageNodes,
}: {
	nodes: StorageNodeItem[];
	servers: Array<{ id: string; name: string; host: string }>;
	canManageNodes: boolean;
}) {
	if (nodes.length === 0) {
		return <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-5 text-sm text-slate-400">暂无存储节点。</div>;
	}

	return (
		<div className="space-y-4">
			{nodes.map((node) => (
				<StorageNodeCard key={node.id} node={node} servers={servers} canManageNodes={canManageNodes} />
			))}
		</div>
	);
}

function StorageNodeCard({
	node,
	servers,
	canManageNodes,
}: {
	node: StorageNodeItem;
	servers: Array<{ id: string; name: string; host: string }>;
	canManageNodes: boolean;
}) {
	const [editing, setEditing] = useState(false);

	return (
		<article className="rounded-2xl border border-white/10 bg-white/5 p-5">
			<div className="flex items-start justify-between gap-3">
				<div>
					<h3 className="text-lg font-medium text-white">{node.name}</h3>
					<p className="mt-2 text-sm leading-7 text-slate-300">{node.connectionSummary}</p>
				</div>
				<div className="flex items-center gap-2">
					<span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100">
						{node.isDefault ? "默认节点" : node.driver}
					</span>
					{canManageNodes ? (
						<>
							<button
								type="button"
								onClick={() => setEditing((prev) => !prev)}
								className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100 transition hover:bg-cyan-400/20"
							>
								{editing ? "收起" : "编辑"}
							</button>
							{!editing ? (
								<StorageNodeDeleteButton storageNodeId={node.id} nodeName={node.name} />
							) : null}
						</>
					) : null}
				</div>
			</div>
			<p className="mt-3 text-sm text-cyan-100">{node.directAccess.description}</p>
			<p className="mt-2 text-xs text-slate-400">已登记文件：{node.fileCount}</p>

		{editing ? (
			<div className="mt-4">
				<StorageNodeEditForm node={node} servers={servers} />
			</div>
		) : null}
		</article>
	);
}
