export const FORBIDDEN_PRODUCTION_DEMO_FLAGS = [
  "ENABLE_DEMO_FALLBACK",
  "AUTH_DEMO_FALLBACK",
  "SERVER_DEMO_FALLBACK",
  "STORAGE_DEMO_FALLBACK",
  "COMMAND_DEMO_FALLBACK",
  "SEED_DEMO_DATA",
] as const;

export type ForbiddenProductionDemoFlag = (typeof FORBIDDEN_PRODUCTION_DEMO_FLAGS)[number];

export function getForbiddenProductionDemoFlags() {
  return [...FORBIDDEN_PRODUCTION_DEMO_FLAGS];
}

function isTrueFlag(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

export function validateProductionDemoIsolation(
  env: Partial<Record<ForbiddenProductionDemoFlag | "NODE_ENV", string | undefined>> = process.env,
): { ok: true } | { ok: false; flag: ForbiddenProductionDemoFlag } {
  if (env.NODE_ENV !== "production") return { ok: true };

  for (const flag of FORBIDDEN_PRODUCTION_DEMO_FLAGS) {
    if (isTrueFlag(env[flag])) return { ok: false, flag };
  }

  return { ok: true };
}

export function assertProductionDemoIsolation(
  env: Partial<Record<ForbiddenProductionDemoFlag | "NODE_ENV", string | undefined>> = process.env,
) {
  const result = validateProductionDemoIsolation(env);
  if (!result.ok) {
    throw new Error(`${result.flag}=true is forbidden when NODE_ENV=production`);
  }
}

export function isDemoFallbackEnabled(flag: ForbiddenProductionDemoFlag, env: NodeJS.ProcessEnv = process.env) {
  assertProductionDemoIsolation(env);
  return isTrueFlag(env.ENABLE_DEMO_FALLBACK) || isTrueFlag(env[flag]);
}
