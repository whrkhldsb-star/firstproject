import { prisma } from "@/lib/db";
import { execRemoteCommand, buildSshParamsFromServer, type SshConnectionParams } from "@/lib/ssh/client";
import { logError } from "@/lib/logging";

/* ── Types ────────────────────────────────────────────────── */

export type SyncJobInput = {
	name: string;
	sourceServerId: string;
	sourcePath: string;
	targetServerId: string;
	targetPath: string;
	syncType?: "MIRROR" | "BACKUP" | "INCREMENTAL";
	schedule?: string;
	deleteOrphans?: boolean;
	compress?: boolean;
	createdBy?: string;
};

/* ── CRUD ─────────────────────────────────────────────────── */

export async function createSyncJob(input: SyncJobInput) {
	return prisma.syncJob.create({
		data: {
			name: input.name,
			sourceServerId: input.sourceServerId,
			sourcePath: input.sourcePath,
			targetServerId: input.targetServerId,
			targetPath: input.targetPath,
			syncType: input.syncType ?? "MIRROR",
			schedule: input.schedule ?? null,
			deleteOrphans: input.deleteOrphans ?? false,
			compress: input.compress ?? false,
			createdBy: input.createdBy ?? null,
		},
		include: {
			sourceServer: { select: { id: true, name: true, host: true } },
			targetServer: { select: { id: true, name: true, host: true } },
		},
	});
}

export async function listSyncJobs() {
	return prisma.syncJob.findMany({
		include: {
			sourceServer: { select: { id: true, name: true, host: true } },
			targetServer: { select: { id: true, name: true, host: true } },
			creator: { select: { id: true, username: true, displayName: true } },
			_count: { select: { syncLogs: true } },
		},
		orderBy: { createdAt: "desc" },
	});
}

export async function getSyncJob(id: string) {
	return prisma.syncJob.findUnique({
		where: { id },
		include: {
			sourceServer: { include: { sshKey: true } },
			targetServer: { include: { sshKey: true } },
			syncLogs: { orderBy: { startedAt: "desc" }, take: 20 },
		},
	});
}

export async function deleteSyncJob(id: string) {
	return prisma.syncJob.delete({ where: { id } });
}

export async function updateSyncJob(id: string, data: Partial<Pick<SyncJobInput, "name" | "sourcePath" | "targetPath" | "syncType" | "schedule" | "deleteOrphans" | "compress">>) {
	return prisma.syncJob.update({ where: { id }, data });
}

/* ── Execute Sync ─────────────────────────────────────────── */

export async function executeSyncJob(jobId: string): Promise<void> {
	const job = await getSyncJob(jobId);
	if (!job) throw new Error("同步任务不存在");

	await prisma.syncJob.update({ where: { id: jobId }, data: { status: "RUNNING" } });

	const logEntry = await prisma.syncLog.create({
		data: { syncJobId: jobId, status: "RUNNING" },
	});

	const startTime = Date.now();

	try {
		// Build rsync command executed on the source server, pushing to target
		const sourceSsh = await buildSshParamsFromServer(job.sourceServer, job.sourceServer.sshKey);
		const targetSsh = await buildSshParamsFromServer(job.targetServer, job.targetServer.sshKey);

		// Determine rsync flags
		const flags: string[] = ["-avz", "--stats"];
		if (job.deleteOrphans) flags.push("--delete");
		if (job.compress) flags.push("--compress");

		// Build the remote-to-remote rsync command
		// We run rsync from the source server, pushing to target via SSH
		const targetHost = job.targetServer.host;
		const targetPort = job.targetServer.port || 22;
		const targetUser = job.targetServer.username || "root";

		// Build SSH options for the target connection (from source's perspective)
		const targetSshOpts = `-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${targetPort}`;

		let rsyncCmd: string;

		if (job.targetServer.sshKey?.privateKey) {
			// Write target key to source server temp file, then use it
			const keyTempPath = `/tmp/whrkhldsb-sync-key-${jobId}`;

			// First, transfer the key to the source server
			await execRemoteCommand({
				...sourceSsh,
				command: `cat >${keyTempPath} << 'KEYEOF'\n${job.targetServer.sshKey.privateKey}\nKEYEOF\nchmod 600 ${keyTempPath}`,
				timeout: 15000,
			});

			rsyncCmd = `rsync ${flags.join(" ")} -e "ssh ${targetSshOpts} -i ${keyTempPath}" "${job.sourcePath}/" "${targetUser}@${targetHost}:${job.targetPath}/" 2>&1; rm -f ${keyTempPath}`;
		} else if (job.targetServer.password) {
			// Use sshpass on the source server
			const escapedPwd = job.targetServer.password.replace(/'/g, "'\\''");
			rsyncCmd = `rsync ${flags.join(" ")} -e "sshpass -p '${escapedPwd}' ssh ${targetSshOpts}" "${job.sourcePath}/" "${targetUser}@${targetHost}:${job.targetPath}/" 2>&1`;
		} else {
			throw new Error("目标服务器未配置 SSH 密钥或密码");
		}

		// Ensure target directory exists
		await execRemoteCommand({
			...targetSsh,
			command: `mkdir -p "${job.targetPath}"`,
			timeout: 15000,
		});

		// Ensure source directory exists
		await execRemoteCommand({
			...sourceSsh,
			command: `mkdir -p "${job.sourcePath}"`,
			timeout: 15000,
		});

		// Check if rsync is available on source
		const { stdout: whichRsync } = await execRemoteCommand({
			...sourceSsh,
			command: "which rsync 2>/dev/null || echo MISSING",
			timeout: 8000,
		});

		let output: string;

		if (whichRsync.trim() === "MISSING") {
			// Fallback: use tar + ssh for incremental sync
			const targetSshKey = job.targetServer.sshKey?.privateKey ? { privateKey: job.targetServer.sshKey.privateKey } : null;
			output = await executeTarSync(sourceSsh, job.sourcePath, targetSsh, targetHost, targetPort, targetUser, targetSshKey, job.targetServer.password ?? null, job.targetPath, job.deleteOrphans);
		} else {
			const result = await execRemoteCommand({
				...sourceSsh,
				command: rsyncCmd,
				timeout: 600_000, // 10 min max
			});
			output = result.stdout;
		}

		// Parse rsync output for stats
		const stats = parseRsyncOutput(output);
		const duration = Date.now() - startTime;

		await prisma.syncLog.update({
			where: { id: logEntry.id },
			data: {
				status: "COMPLETED",
				filesScanned: stats.totalFiles,
				filesTransferred: stats.transferredFiles,
				bytesTransferred: String(stats.totalSize),
				durationMs: duration,
				completedAt: new Date(),
			},
		});

		await prisma.syncJob.update({
			where: { id: jobId },
			data: {
				status: "IDLE",
				lastSyncAt: new Date(),
				lastSyncResult: `成功: ${stats.transferredFiles} 文件, ${formatBytes(stats.totalSize)}, ${Math.round(duration / 1000)}s`,
			},
		});

	} catch (error) {
		const duration = Date.now() - startTime;
		const errMsg = error instanceof Error ? error.message : String(error);

		await prisma.syncLog.update({
			where: { id: logEntry.id },
			data: {
				status: "FAILED",
				errorMessage: errMsg.slice(0, 2000),
				durationMs: duration,
				completedAt: new Date(),
			},
		});

		await prisma.syncJob.update({
			where: { id: jobId },
			data: { status: "ERROR", lastSyncResult: `失败: ${errMsg.slice(0, 200)}` },
		});

		logError(`[SyncService] Job ${jobId} failed:`, error);
	}
}

/** Fallback tar-based sync when rsync is not available */
async function executeTarSync(
	sourceSsh: SshConnectionParams,
	sourcePath: string,
	_targetSsh: SshConnectionParams,
	targetHost: string,
	targetPort: number,
	targetUser: string,
	targetKey: { privateKey: string } | null,
	targetPassword: string | null,
	targetPath: string,
	_deleteOrphans: boolean,
): Promise<string> {
	void _deleteOrphans;
	// Use tar over SSH pipe — simpler but not incremental
	const sshOpts = `-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${targetPort}`;

	let sshPrefix: string;
	if (targetKey) {
		const keyPath = `/tmp/whrkhldsb-tarkey`;
		await execRemoteCommand({ ...sourceSsh, command: `echo 'KEY_WRITTEN' > /dev/null`, timeout: 5000 }); // placeholder
		sshPrefix = `ssh ${sshOpts} -i ${keyPath}`;
	} else if (targetPassword) {
		sshPrefix = `sshpass -p '${targetPassword.replace(/'/g, "'\\''")}' ssh ${sshOpts}`;
	} else {
		throw new Error("No SSH credentials for target");
	}

	const cmd = `tar cf - -C "${sourcePath}" . | ${sshPrefix} ${targetUser}@${targetHost} "tar xf - -C '${targetPath}'" 2>&1`;
	const result = await execRemoteCommand({ ...sourceSsh, command: cmd, timeout: 600_000 });
	return result.stdout;
}

/* ── Parse rsync output ───────────────────────────────────── */

function parseRsyncOutput(output: string) {
	let totalFiles = 0;
	let transferredFiles = 0;
	let totalSize = 0;

	const totalFileMatch = output.match(/Number of files:\s*(\d+)/);
	if (totalFileMatch) totalFiles = parseInt(totalFileMatch[1], 10);

	const transferredMatch = output.match(/Number of regular files transferred:\s*(\d+)/);
	if (transferredMatch) transferredFiles = parseInt(transferredMatch[1], 10);

	const totalSizeMatch = output.match(/Total file size:\s*([\d,]+)/);
	if (totalSizeMatch) totalSize = parseInt(totalSizeMatch[1].replace(/,/g, ""), 10);

	// Fallback: count lines that look like file transfers
	if (transferredFiles === 0) {
		const lines = output.split("\n").filter((l) => l && !l.startsWith("sent ") && !l.startsWith("total ") && !l.startsWith("Number") && !l.startsWith("Total") && !l.startsWith("speedup"));
		transferredFiles = lines.length;
	}

	return { totalFiles, transferredFiles, totalSize };
}

function formatBytes(n: number): string {
	if (n === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(n) / Math.log(1024));
	return `${(n / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
