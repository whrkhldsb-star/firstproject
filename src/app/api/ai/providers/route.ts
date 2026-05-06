import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { sessionHasPermission } from "@/lib/auth/authorization";
import {
  createProvider,
  listProviders,
  serializeProvider,
} from "@/lib/ai/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    if (!sessionHasPermission(session, "ai:manage"))
      return NextResponse.json({ error: "缺少权限" }, { status: 403 });
    const providers = await listProviders(session.userId);
    return NextResponse.json({ providers: providers.map(serializeProvider) });
  } catch {
    return NextResponse.json({ error: "未认证" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    if (!sessionHasPermission(session, "ai:manage"))
      return NextResponse.json({ error: "缺少权限" }, { status: 403 });
    const body = await request.json();
    const provider = await createProvider({ ...body, createdBy: session.userId });
    return NextResponse.json({ provider: serializeProvider(provider) }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "创建失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
