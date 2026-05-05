import { requireSession } from "@/lib/auth/require-session";
import { sessionHasPermission } from "@/lib/auth/authorization";

import { UserManagementClient } from "./users-client";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
	const session = await requireSession("/users");
	const canRead = sessionHasPermission(session, "user:read");

	if (!canRead) {
		return (
			<main className="min-h-screen bg-[radial-gradient(circle_at_top,#1e293b,transparent_40%),linear-gradient(180deg,#0f172a_0%,#020617_100%)] text-slate-100">
				<div className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
					<EmptyState text="你没有查看用户的权限。" />
				</div>
			</main>
		);
	}

	return (
		<main className="min-h-screen bg-[radial-gradient(circle_at_top,#1e293b,transparent_40%),linear-gradient(180deg,#0f172a_0%,#020617_100%)] text-slate-100">
			<div className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
				<header className="mb-8">
					<h1 className="text-3xl font-semibold tracking-tight text-white">用户管理</h1>
					<p className="mt-1.5 text-sm text-slate-500">创建用户、分配角色与权限管理</p>
				</header>

				<UserManagementClient />
			</div>
		</main>
	);
}

function EmptyState({ text }: { text: string }) {
	return <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] p-6 text-sm text-slate-500 text-center">{text}</div>;
}
