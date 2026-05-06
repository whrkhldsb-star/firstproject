import { requireSession } from "@/lib/auth/require-session";
import { listProviders, listConversations, serializeConversationListItem } from "@/lib/ai/service";
import { AiClient } from "./ai-client";

export const dynamic = "force-dynamic";

export default async function AiPage() {
  const session = await requireSession();
  const providers = await listProviders(session.userId);
  const conversations = await listConversations(session.userId);

  return (
    <AiClient
      userId={session.userId}
      initialProviders={providers.map((p) => ({
        ...p,
        settings: String(p.settings ?? "{}"),
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }))}
      initialConversations={conversations.map(serializeConversationListItem)}
    />
  );
}
