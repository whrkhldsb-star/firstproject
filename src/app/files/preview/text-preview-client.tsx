"use client";

import { useState, useEffect } from "react";

type PreviewState = { loading: true } | { loading: false; content: string | null; error: string | null };

export function TextPreviewClient({ href }: { href: string }) {
	const [state, setState] = useState<PreviewState>({ loading: true });

	useEffect(() => {
		let cancelled = false;

		fetch(href)
			.then(async (res) => {
				if (!res.ok) throw new Error(`加载失败: ${res.status}`);
				const text = await res.text();
				if (!cancelled) {
					setState({ loading: false, content: text, error: null });
				}
			})
			.catch((err) => {
				if (!cancelled) {
					setState({ loading: false, content: null, error: err instanceof Error ? err.message : "加载失败" });
				}
			});

		return () => {
			cancelled = true;
		};
	}, [href]);

	if (state.loading) {
		return (
			<div className="flex items-center justify-center py-16 text-slate-400">
				<span className="animate-pulse text-sm">正在加载文件内容…</span>
			</div>
		);
	}

	if (state.error) {
		return (
			<div className="flex flex-col items-center gap-3 py-16 text-red-300">
				<span className="text-3xl">⚠️</span>
				<p className="text-sm">{state.error}</p>
			</div>
		);
	}

	const lines = (state.content ?? "").split("\n");

	return (
		<div className="overflow-auto rounded-2xl bg-slate-950 p-4 text-sm leading-relaxed">
			<pre className="font-mono text-slate-300">
				<code>
					{lines.map((line, i) => (
						<div key={i} className="flex">
							<span className="mr-4 inline-block w-8 select-none text-right text-slate-600">
								{i + 1}
							</span>
							<span className="whitespace-pre-wrap break-all">{line}</span>
						</div>
					))}
				</code>
			</pre>
		</div>
	);
}
