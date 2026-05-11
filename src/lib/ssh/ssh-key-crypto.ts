/**
 * Encryption helpers for SSH private keys stored in the database.
 *
 * Strategy:
 * - On write (createSshKey / update): encrypt(privateKey) → store ciphertext
 * - On read (any SSH connection): decryptIfEncrypted(privateKey) → get plaintext for ssh2
 *
 * Encrypted values look like "iv:authTag:ciphertext" (base64 segments separated by colons).
 * Plain-text keys (legacy) lack the two-colon pattern and pass through unchanged,
 * enabling a zero-downtime migration.
 */

import { encrypt, decrypt, isEncrypted } from "@/lib/crypto/service";

/** Encrypt a private key before database storage. */
export function encryptSshPrivateKey(plainKey: string): string {
	return encrypt(plainKey);
}

/**
 * Decrypt a private key retrieved from the database.
 * If the value is not encrypted (legacy data), it passes through unchanged.
 */
export function decryptSshPrivateKey(storedKey: string): string {
	if (isEncrypted(storedKey)) {
		return decrypt(storedKey);
	}
	return storedKey;
}

/**
 * Type-safe wrapper: decrypt the privateKey field of an SSH key object
 * if present and encrypted.
 */
export function decryptSshKeyField<T extends { privateKey?: string | null }>(
	key: T | null | undefined,
): (T & { privateKey: string | null }) | null {
	if (!key) return null;
	return {
		...key,
		privateKey: key.privateKey ? decryptSshPrivateKey(key.privateKey) : null,
	};
}
