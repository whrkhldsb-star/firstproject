"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/authorization";
import { prisma } from "@/lib/db";

export type MoveFileActionState = { error?: string; success?: string };

export async function moveFileAction(_prev: MoveFileActionState | null, formData: FormData) {
  await requirePermission("storage:write");

  try {
    const fileEntryId = String(formData.get("fileEntryId") ?? "").trim();
    const targetDir = String(formData.get("targetDir") ?? "").trim();
    
    if (!fileEntryId) return { error: "缺少文件参数" } satisfies MoveFileActionState;
    if (!targetDir) return { error: "目标路径不能为空" } satisfies MoveFileActionState;

    // 路径规范化：去掉首尾斜杠和反斜杠
    const normalizedTargetDir = targetDir
      .replace(/\\/g, "/")
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean)
      .join("/");

    if (/[\\:*?"<>|]/.test(normalizedTargetDir)) {
      return { error: "目标路径包含非法字符" } satisfies MoveFileActionState;
    }

    const entry = await prisma.fileEntry.findUnique({
      where: { id: fileEntryId },
      select: {
        id: true,
        name: true,
        entryType: true,
        relativePath: true,
        storageNodeId: true,
        storageNode: { select: { driver: true, basePath: true } },
      },
    });

    if (!entry) return { error: "文件条目不存在" } satisfies MoveFileActionState;

    // 构造新路径
    const newRelativePath = normalizedTargetDir ? `${normalizedTargetDir}/${entry.name}` : entry.name;

    if (newRelativePath === entry.relativePath) {
      return { error: "目标路径与当前路径相同" } satisfies MoveFileActionState;
    }

    // 检查目标路径是否已存在
    const existing = await prisma.fileEntry.findFirst({
      where: {
        storageNodeId: entry.storageNodeId,
        relativePath: newRelativePath,
        isDeleted: false,
        id: { not: fileEntryId },
      },
      select: { id: true },
    });

    if (existing) {
      return { error: `目标路径 /${newRelativePath} 已存在同名文件` } satisfies MoveFileActionState;
    }

    // 如果是目录，还需要更新所有子条目的路径
    if (entry.entryType === "DIRECTORY") {
      const oldPrefix = entry.relativePath + "/";
      const newPrefix = newRelativePath + "/";

      const children = await prisma.fileEntry.findMany({
        where: {
          storageNodeId: entry.storageNodeId,
          relativePath: { startsWith: oldPrefix },
        },
        select: { id: true, relativePath: true },
      });

      for (const child of children) {
        await prisma.fileEntry.update({
          where: { id: child.id },
          data: { relativePath: child.relativePath.replace(oldPrefix, newPrefix) },
        });
      }
    }

    // 更新文件条目路径
    await prisma.fileEntry.update({
      where: { id: fileEntryId },
      data: { relativePath: newRelativePath },
    });

    // LOCAL 节点：在磁盘上实际移动文件
    if (entry.storageNode.driver === "LOCAL") {
      try {
        const { rename, mkdir } = await import("node:fs/promises");
        const path = await import("node:path");

        const normalizedOldRelativePath = entry.relativePath.replace(/^\/+/, "");
        const normalizedNewRelativePath = newRelativePath.replace(/^\/+/, "");

        const oldAbsolutePath = path.resolve(entry.storageNode.basePath, normalizedOldRelativePath);
        const newAbsolutePath = path.resolve(entry.storageNode.basePath, normalizedNewRelativePath);

        const allowedRoot = path.resolve(entry.storageNode.basePath);
        const oldRelativeToRoot = path.relative(allowedRoot, oldAbsolutePath);
        const newRelativeToRoot = path.relative(allowedRoot, newAbsolutePath);

        if (
          !oldRelativeToRoot.startsWith("..") &&
          !path.isAbsolute(oldRelativeToRoot) &&
          !newRelativeToRoot.startsWith("..") &&
          !path.isAbsolute(newRelativeToRoot)
        ) {
          // 确保目标目录存在
          const targetAbsDir = path.dirname(newAbsolutePath);
          await mkdir(targetAbsDir, { recursive: true });
          await rename(oldAbsolutePath, newAbsolutePath);
        }
      } catch {
        // 磁盘操作失败不阻塞 DB 更新
      }
    }

    revalidatePath("/");
    revalidatePath("/storage");
    revalidatePath("/files");

    return { success: `已移动到 /${newRelativePath}` } satisfies MoveFileActionState;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "移动文件失败" } satisfies MoveFileActionState;
  }
}
