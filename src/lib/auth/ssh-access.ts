import { DEFAULT_ROLE_PERMISSIONS } from "./rbac";

export type SshAccessSession = {
  roles: string[];
};

export function canUseSshTerminal(session: SshAccessSession) {
  return session.roles.some((role) => {
    const knownRole = role as keyof typeof DEFAULT_ROLE_PERMISSIONS;
    return DEFAULT_ROLE_PERMISSIONS[knownRole]?.includes("server:ssh") ?? false;
  });
}


