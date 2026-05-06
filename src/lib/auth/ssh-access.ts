import { prisma } from "@/lib/db";

import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "./rbac";

export type SshAccessSession = {
  roles: string[];
};

export function canUseSshTerminal(session: SshAccessSession) {
  if (!PERMISSIONS.includes("server:ssh")) return false;

  return session.roles.some((role) => {
    const knownRole = role as keyof typeof DEFAULT_ROLE_PERMISSIONS;
    return DEFAULT_ROLE_PERMISSIONS[knownRole]?.includes("server:ssh") ?? false;
  });
}

export async function assertSshServerAccess(input: { session: SshAccessSession; serverId: string }) {
  if (!canUseSshTerminal(input.session)) {
    return { allowed: false as const, reason: "缺少 SSH 终端权限" };
  }

  const server = await prisma.server.findUnique({
    where: { id: input.serverId },
    select: { id: true, enabled: true },
  });

  if (!server || !server.enabled) {
    return { allowed: false as const, reason: "VPS 不存在或已停用" };
  }

  return { allowed: true as const };
}
