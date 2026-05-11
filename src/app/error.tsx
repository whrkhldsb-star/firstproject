"use client";

import NextLink from "next/link";

/**
 * Root-level error boundary for route segments.
 * Catches errors thrown in Server Components and Client Components
 * within the shared layout. Falls back gracefully with a retry button.
 *
 * Note: This does NOT catch errors in root layout.tsx —
 * for that, global-error.tsx is used instead.
 */
export default function RootError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<div style={{ maxWidth: 600, margin: "80px auto", padding: "0 24px", textAlign: "center" }}>
			<h2 style={{ fontSize: 24, fontWeight: 600, color: "#fff", marginBottom: 12 }}>
				页面加载出错
			</h2>
			<p style={{ fontSize: 15, color: "#a3a3a3", lineHeight: 1.6, marginBottom: 8 }}>
				{error.message || "发生了未知错误"}
			</p>
			{error.digest && (
				<p style={{ fontSize: 13, color: "#737373", marginBottom: 16 }}>
					错误标识: {error.digest}
				</p>
			)}
			<div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 20 }}>
				<button
					onClick={reset}
					style={{
						padding: "8px 24px",
						fontSize: 14,
						background: "#2563eb",
						color: "#fff",
						border: "none",
						borderRadius: 8,
						cursor: "pointer",
					}}
				>
					重试
				</button>
				<NextLink
					href="/"
					style={{
						padding: "8px 24px",
						fontSize: 14,
						background: "#262626",
						color: "#e5e5e5",
						borderRadius: 8,
						textDecoration: "none",
						display: "inline-flex",
						alignItems: "center",
					}}
				>
					返回首页
				</NextLink>
			</div>
		</div>
	);
}
