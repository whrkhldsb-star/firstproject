import { NextResponse } from "next/server";
import { requireSession } from "./require-session";
import type { SessionPayload } from "./session";

/**
 * API route helper: require an authenticated session (login only, no permission check).
 * Returns the session on success, or a 401 NextResponse on failure.
 */
export async function requireApiSession(): Promise<{ session: SessionPayload } | NextResponse> {
  try {
    const session = await requireSession();
    return { session };
  } catch {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }
}
