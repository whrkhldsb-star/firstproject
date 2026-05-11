"use client";

import { useEffect } from "react";

/**
 * Global Error Boundary — catches unhandled errors in any route segment.
 * Without this, an uncaught exception renders a blank white page.
 * Placed at src/app/global-error.tsx (app router convention).
 */
export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		// Log to console for server-side debugging (client errors also show in browser console)
		console.error("[GlobalError]", error);
	}, [error]);

	return (
		<html lang="zh-CN">
			<body style={{ margin: 0, padding: 0, background: "#0a0a0a", color: "#e5e5e5", fontFamily: "system-ui, sans-serif" }}>
				<div style={{ maxWidth: 600, margin: "80px auto", padding: "0 24px", textAlign: "center" }}>
					<h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 12, color: "#fff" }}>
						出错了
					</h1>
					<p style={{ fontSize: 16, color: "#a3a3a3", lineHeight: 1.6, marginBottom: 24 }}>
						页面遇到了意外错误，请尝试刷新。如果问题持续出现，请联系管理员。
					</p>
					{error.digest && (
						<p style={{ fontSize: 13, color: "#737373", marginBottom: 16 }}>
							错误标识: {error.digest}
						</p>
					)}
					<button
						onClick={reset}
						style={{
							padding: "10px 28px",
							fontSize: 15,
							background: "#2563eb",
							color: "#fff",
							border: "none",
							borderRadius: 8,
							cursor: "pointer",
							transition: "background 0.2s",
						}}
						onMouseOver={(e) => (e.currentTarget.style.background = "#1d4ed8")}
						onMouseOut={(e) => (e.currentTarget.style.background = "#2563eb")}
					>
						重试
					</button>
				</div>
			</body>
		</html>
	);
}
