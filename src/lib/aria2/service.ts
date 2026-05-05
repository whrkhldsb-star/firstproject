import { writeFile, readFile, mkdir } from "fs/promises";
import path from "path";

/* ── Aria2 RPC Configuration ──────────────────────────────── */

const RPC_PORT = 6800;
const RPC_SECRET = process.env.ARIA2_RPC_SECRET || "whrkhldsb_default_token";
const RPC_DIR = "/tmp/whrkhldsb-aria2";
const RPC_SESSION = path.join(RPC_DIR, "aria2.session");
const RPC_CONF = path.join(RPC_DIR, "aria2.conf");

/* ── Aria2 RPC Types ──────────────────────────────────────── */

export type Aria2Status = {
	gid: string;
	status: "active" | "waiting" | "paused" | "error" | "complete" | "removed";
	totalLength: string;
	completedLength: string;
	uploadLength: string;
	downloadSpeed: string;
	uploadSpeed: string;
	connections: string;
	numSeeders: string;
	files: Array<{
		index: string;
		path: string;
		length: string;
		completedLength: string;
		selected: string;
		uris: Array<{ uri: string; status: string }>;
	}>;
	bittorrent?: {
		announceList: string[][];
		comment: string;
		info: { name: string };
	};
};

export type Aria2GlobalStat = {
	downloadSpeed: string;
	uploadSpeed: string;
	numActive: string;
	numWaiting: string;
	numStopped: string;
};

/* ── RPC Call ─────────────────────────────────────────────── */

async function rpcCall(method: string, params: unknown[] = []): Promise<unknown> {
	const response = await fetch(`http://127.0.0.1:${RPC_PORT}/jsonrpc`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: Date.now().toString(),
			method,
			params: [`token:${RPC_SECRET}`, ...params],
		}),
	});

	const data = await response.json();
	if (data.error) {
		throw new Error(`Aria2 RPC error: ${data.error.message || JSON.stringify(data.error)}`);
	}
	return data.result;
}

/* ── Daemon Management ────────────────────────────────────── */

let daemonStarted = false;

export async function ensureAria2Daemon(): Promise<void> {
	if (daemonStarted) return;

	try {
		// Check if already running
		await rpcCall("aria2.getVersion");
		daemonStarted = true;
		return;
	} catch {
		// Not running, start it
	}

	// Prepare session dir and conf
	await mkdir(RPC_DIR, { recursive: true });

	// Create empty session file if not exists
	try { await readFile(RPC_SESSION); } catch { await writeFile(RPC_SESSION, ""); }

	const conf = `
# Aria2 RPC daemon for whrkhldsb
enable-rpc=true
rpc-listen-port=${RPC_PORT}
rpc-secret=${RPC_SECRET}
dir=${RPC_DIR}
session=${RPC_SESSION}
input-file=${RPC_SESSION}
save-session=${RPC_SESSION}
save-session-interval=60
max-concurrent-downloads=10
max-connection-per-server=16
min-split-size=1M
split=16
file-allocation=none
continue=true
seed-time=0
disk-cache=32M
`.trim();

	await writeFile(RPC_CONF, conf);

	// Launch aria2c daemon
	const { spawn } = await import("child_process");
	const proc = spawn("aria2c", [`--conf-path=${RPC_CONF}`], {
		detached: true,
		stdio: "ignore",
	});
	proc.unref();

	// Wait for RPC to become available
	for (let i = 0; i < 30; i++) {
		await new Promise((r) => setTimeout(r, 500));
		try {
			await rpcCall("aria2.getVersion");
			daemonStarted = true;
			return;
		} catch {
			continue;
		}
	}
	throw new Error("Aria2 RPC daemon failed to start within 15 seconds");
}

/* ── Download Operations ──────────────────────────────────── */

export async function addUri(
	uris: string[],
	options: Record<string, string> = {},
): Promise<string> {
	await ensureAria2Daemon();
	const gid = await rpcCall("aria2.addUri", [uris, options]);
	return gid as string;
}

export async function addTorrent(
	torrent: string,	// base64 encoded
	ouris: string[] = [],
	options: Record<string, string> = {},
): Promise<string> {
	await ensureAria2Daemon();
	const gid = await rpcCall("aria2.addTorrent", [torrent, ouris, options]);
	return gid as string;
}

export async function removeDownload(gid: string, force = false): Promise<string> {
	const method = force ? "aria2.forceRemove" : "aria2.remove";
	const result = await rpcCall(method, [gid]);
	return result as string;
}

export async function pauseDownload(gid: string): Promise<string> {
	const result = await rpcCall("aria2.pause", [gid]);
	return result as string;
}

export async function unpauseDownload(gid: string): Promise<string> {
	const result = await rpcCall("aria2.unpause", [gid]);
	return result as string;
}

export async function tellStatus(gid: string, keys?: string[]): Promise<Aria2Status> {
	const result = await rpcCall("aria2.tellStatus", [gid, keys ?? []]);
	return result as Aria2Status;
}

export async function tellActive(keys?: string[]): Promise<Aria2Status[]> {
	const result = await rpcCall("aria2.tellActive", [keys ?? []]);
	return result as Aria2Status[];
}

export async function tellWaiting(offset = 0, num = 100, keys?: string[]): Promise<Aria2Status[]> {
	const result = await rpcCall("aria2.tellWaiting", [offset, num, keys ?? []]);
	return result as Aria2Status[];
}

export async function tellStopped(offset = 0, num = 100, keys?: string[]): Promise<Aria2Status[]> {
	const result = await rpcCall("aria2.tellStopped", [offset, num, keys ?? []]);
	return result as Aria2Status[];
}

export async function getGlobalStat(): Promise<Aria2GlobalStat> {
	const result = await rpcCall("aria2.getGlobalStat");
	return result as Aria2GlobalStat;
}

export async function purgeDownloadResult(): Promise<string> {
	const result = await rpcCall("aria2.purgeDownloadResult");
	return result as string;
}

export async function changeOption(gid: string, options: Record<string, string>): Promise<string> {
	const result = await rpcCall("aria2.changeOption", [gid, options]);
	return result as string;
}

export async function changeGlobalOption(options: Record<string, string>): Promise<string> {
	const result = await rpcCall("aria2.changeGlobalOption", [options]);
	return result as string;
}

/* ── Progress Formatting Helpers ──────────────────────────── */

export function formatBytes(bytes: string | number): string {
	const n = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
	if (isNaN(n) || n === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(n) / Math.log(1024));
	return `${(n / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatSpeed(bytesPerSec: string | number): string {
	const n = typeof bytesPerSec === "string" ? parseInt(bytesPerSec, 10) : bytesPerSec;
	if (isNaN(n) || n === 0) return "0 B/s";
	const units = ["B/s", "KB/s", "MB/s", "GB/s"];
	const i = Math.floor(Math.log(n) / Math.log(1024));
	return `${(n / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export function computeProgress(completed: string, total: string): number {
	const c = parseInt(completed, 10);
	const t = parseInt(total, 10);
	if (isNaN(c) || isNaN(t) || t === 0) return 0;
	return Math.min(100, Math.round((c / t) * 1000) / 10);
}
