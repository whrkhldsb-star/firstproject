/**
 * One-time migration: encrypt plaintext SSH private keys already stored in the database.
 *
 * Run with: npx tsx prisma/migrate-encrypt-ssh-keys.ts
 *
 * The decryptSshPrivateKey helper is backward-compatible (passes plaintext
 * through unchanged), so this migration is safe to run multiple times —
 * already-encrypted values are detected by isEncrypted() and skipped.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encrypt, isEncrypted } from "../src/lib/crypto/service";

if (!process.env.DATABASE_URL) {
	console.error("ERROR: DATABASE_URL environment variable is not set.");
	process.exit(1);
}

const adapter = new PrismaPg(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

async function main() {
	const keys = await prisma.sshKey.findMany({
		where: { privateKey: { not: null } },
		select: { id: true, privateKey: true },
	});

	let migrated = 0;
	let skipped = 0;

	for (const key of keys) {
		const pv = key.privateKey;
		if (!pv) continue;

		if (isEncrypted(pv)) {
			skipped++;
			continue;
		}

		const encrypted = encrypt(pv);
		await prisma.sshKey.update({
			where: { id: key.id },
			data: { privateKey: encrypted },
		});
		migrated++;
		console.log(`✅ Encrypted privateKey for SSH key ${key.id}`);
	}

	console.log(`\nMigration complete: ${migrated} encrypted, ${skipped} already encrypted (skipped), ${keys.length} total.`);
	await prisma.$disconnect();
}

main().catch((e) => {
	console.error("Migration failed:", e);
	process.exit(1);
});
