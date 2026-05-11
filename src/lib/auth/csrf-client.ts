"use client";

import { useEffect, useState } from "react";

/**
 * Hook to get the CSRF token from the csrf_token cookie.
 * Used to include X-CSRF-Token header in all state-changing API requests.
 */
export function useCsrfToken(): string | null {
	const [token, setToken] = useState<string | null>(null);

	useEffect(() => {
		const cookie = document.cookie
			.split(";")
			.map((c) => c.trim())
			.find((c) => c.startsWith("csrf_token="));
		if (cookie) {
			setToken(decodeURIComponent(cookie.split("=").slice(1).join("=")));
		}
	}, []);

	return token;
}

/**
 * Enhanced fetch that automatically includes CSRF token header
 * for state-changing requests (POST, PUT, DELETE, PATCH).
 */
export function csrfFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const method = (init?.method ?? "GET").toUpperCase();
	const needsCsrf = !["GET", "HEAD", "OPTIONS"].includes(method);

	if (needsCsrf) {
		const cookie = document.cookie
			.split(";")
			.map((c) => c.trim())
			.find((c) => c.startsWith("csrf_token="));
		const csrfToken = cookie
			? decodeURIComponent(cookie.split("=").slice(1).join("="))
			: null;

		if (csrfToken) {
			const headers = new Headers(init?.headers);
			headers.set("X-CSRF-Token", csrfToken);
			return fetch(input, { ...init, headers });
		}
	}

	return fetch(input, init);
}
