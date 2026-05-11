import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export function isDatabaseUnavailableError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message;
  return /P1001|Can't reach database server|PrismaClientInitializationError|database server|driver adapter|accelerateUrl|engine type\s+["']?client["']?\s+requires|ECONNREFUSED|connect ECONNREFUSED|Connection terminated unexpectedly|connection error/i.test(
    message,
  );
}

declare global {
	var __appPrisma__: PrismaClient | undefined;
	var __appPrismaAdapter__: PrismaPg | undefined;
}

function getPrismaAdapter() {
	if (!process.env.DATABASE_URL) {
		throw new Error("DATABASE_URL is required to initialize Prisma.");
	}

	if (!global.__appPrismaAdapter__) {
		// Connection pool tuning: parse pool params from DATABASE_URL or use defaults
		const poolSize = parseInt(process.env.DB_POOL_SIZE ?? "10", 10);
		const poolIdleTimeout = parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS ?? "30000", 10);
		const url = new URL(process.env.DATABASE_URL);
		// Ensure pool params are in the connection string for the pg adapter
		if (!url.searchParams.has("pool_max")) url.searchParams.set("pool_max", String(poolSize));
		if (!url.searchParams.has("pool_idle_timeout")) url.searchParams.set("pool_idle_timeout", String(poolIdleTimeout));
		global.__appPrismaAdapter__ = new PrismaPg(url.toString());
	}

	return global.__appPrismaAdapter__;
}

function createPrismaClient() {
	return new PrismaClient({
		adapter: getPrismaAdapter(),
		log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
	});
}

function getPrismaClient() {
	if (!global.__appPrisma__) {
		global.__appPrisma__ = createPrismaClient();
	}

	return global.__appPrisma__;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getPrismaClient();
    return Reflect.get(client, property, receiver);
  },
});
