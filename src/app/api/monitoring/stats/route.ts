/**
 * Server monitoring API — CPU, memory, disk, uptime, network stats.
 * GET /api/monitoring/stats
 * Requires authenticated session.
 *
 * Uses Node.js native APIs + /proc filesystem reads instead of execSync
 * for better performance and zero injection risk.
 */
import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "node:util";
import { requireApiSession, isSessionPayload } from "@/lib/auth/api-session";
import { createLogger } from "@/lib/logging";

const execFileAsync = promisify(execFile);
const logger = createLogger("api:monitoring:stats");

/** Safely read a /proc file, returning empty string on failure */
function readProc(path: string): string {
	try { return readFileSync(path, "utf-8"); } catch { return ""; }
}

export async function GET() {
	const session = await requireApiSession();
	if (!isSessionPayload(session)) return session; // 401 response
	try {
		const cpus = os.cpus();
		const totalMem = os.totalmem();
		const freeMem = os.freemem();
		const uptime = os.uptime();

		// CPU usage — parse /proc/stat (no subprocess needed)
		const cpuUsage = getCpuUsagePercent();

		// Load averages
		const loadAvg = os.loadavg();

		// Disk usage — still needs df, but use execFile (array args, safe)
		let diskInfo = "N/A";
		try {
			const { stdout } = await execFileAsync("df", ["-h", "/"], { timeout: 5000, encoding: "utf-8" });
			const lines = stdout.trim().split("\n");
			if (lines.length >= 2) {
				const parts = lines[1].trim().split(/\s+/);
				if (parts.length >= 5) {
					diskInfo = `${parts[1]}/${parts[2]} (${parts[4]} used)`;
				}
			}
		} catch { /* ok */ }

		// Network stats — read /proc/net/dev directly
		let netInfo: { iface: string; rx: string; tx: string }[] = [];
		const netDev = readProc("/proc/net/dev");
		if (netDev) {
			for (const line of netDev.split("\n").slice(2)) {
				const parts = line.trim().split(/\s+/);
				if (parts.length >= 10 && !parts[0].startsWith("lo:")) {
					netInfo.push({
						iface: parts[0].replace(":", ""),
						rx: formatBytes(Number(parts[1])),
						tx: formatBytes(Number(parts[9])),
					});
				}
			}
		}

		// Top processes — still needs ps, but use execFile (array args, safe)
		let topProcs: { pid: string; cpu: string; mem: string; cmd: string }[] = [];
		try {
			const { stdout } = await execFileAsync("ps", ["aux", "--sort=-%mem"], { timeout: 5000, encoding: "utf-8" });
			const lines = stdout.trim().split("\n").slice(1, 6); // skip header, take top 5
			for (const line of lines) {
				const parts = line.trim().split(/\s+/);
				if (parts.length >= 11) {
					topProcs.push({ pid: parts[1], cpu: parts[2], mem: parts[3], cmd: parts.slice(10).join(" ").slice(0, 40) });
				}
			}
		} catch { /* ok */ }

		// Active TCP connections — read /proc/net/tcp directly
		const tcpConns = getTcpConnectionCount();

		return NextResponse.json({
			hostname: os.hostname(),
			platform: os.platform(),
			arch: os.arch(),
			uptime: formatUptime(uptime),
			cpu: {
				model: cpus[0]?.model || "Unknown",
				cores: cpus.length,
				usage: `${cpuUsage}%`,
				loadAvg: loadAvg.map((v) => v.toFixed(2)),
			},
			memory: {
				total: formatBytes(totalMem),
				used: formatBytes(totalMem - freeMem),
				free: formatBytes(freeMem),
				usagePercent: (((totalMem - freeMem) / totalMem) * 100).toFixed(1),
			},
			disk: diskInfo,
			network: netInfo,
			topProcesses: topProcs,
			tcpConnections: String(tcpConns),
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		logger.error("获取监控数据失败", error);
		return NextResponse.json({ error: "获取监控数据失败" }, { status: 500 });
	}
}

/** Parse /proc/stat to get CPU usage percentage */
function getCpuUsagePercent(): string {
	const stat = readProc("/proc/stat");
	const line = stat.split("\n")[0];
	if (!line?.startsWith("cpu ")) return "N/A";
	const parts = line.trim().split(/\s+/).map(Number);
	// user + nice + system + idle + iowait + irq + softirq + steal
	const idle = parts[4] + (parts[5] || 0);
	const total = parts.slice(1).reduce((a, b) => a + b, 0);
	if (total === 0) return "N/A";
	const used = total - idle;
	return ((used / total) * 100).toFixed(1);
}

/** Count established TCP connections from /proc/net/tcp */
function getTcpConnectionCount(): number {
	const tcp = readProc("/proc/net/tcp");
	if (!tcp) return 0;
	// State "01" = ESTABLISHED
	let count = 0;
	for (const line of tcp.split("\n").slice(1)) {
		const parts = line.trim().split(/\s+/);
		if (parts.length >= 4 && parts[3] === "01") count++;
	}
	return count;
}

function formatBytes(bytes: number): string {
	const units = ["B", "KB", "MB", "GB", "TB"];
	let i = 0;
	let size = bytes;
	while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
	return `${size.toFixed(1)} ${units[i]}`;
}

function formatUptime(seconds: number): string {
	const d = Math.floor(seconds / 86400);
	const h = Math.floor((seconds % 86400) / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	return `${d}天 ${h}时 ${m}分`;
}
