import { NextResponse } from "next/server";
import { z } from "zod";
import { createLogger } from "@/lib/logging";

const logger = createLogger("api:ai:providers");

import { requireApiSession } from "@/lib/auth/require-api-session";
import { requireApiPermission } from "@/lib/auth/require-api-permission";
import {
 createProvider,
 listProviders,
 serializeProvider,
} from "@/lib/ai/service";

export const dynamic = "force-dynamic";

const createProviderSchema = z.object({
  name: z.string().min(1),
  apiKey: z.string().min(1),
  baseUrl: z.string().url(),
  models: z.string(),
  defaultModel: z.string().optional(),
});

export async function GET() {
 try {
 const authed = await requireApiSession();
	if (authed instanceof NextResponse) return authed;
	const { session } = authed;
 const providers = await listProviders(session.userId);
 return NextResponse.json({ providers: providers.map(serializeProvider) });
} catch (error) {
	logger.error("获取AI提供商列表失败", error);
	return NextResponse.json({ error: "服务器错误" }, { status: 500 });
 }
}

export async function POST(request: Request) {
 try {
 const authed = await requireApiPermission("ai:manage");
	if (authed instanceof NextResponse) return authed;
	const { session } = authed;
 const body = await request.json();
 const parsed = createProviderSchema.safeParse(body);
 if (!parsed.success) {
	return NextResponse.json({ error: "输入参数无效" }, { status: 400 });
 }
 const provider = await createProvider({ ...body, createdBy: session.userId });
 return NextResponse.json({ provider: serializeProvider(provider) }, { status: 201 });
 } catch (e: unknown) {
 const msg = e instanceof Error ? e.message : "创建失败";
 return NextResponse.json({ error: msg }, { status: 400 });
 }
}
