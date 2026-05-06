"use client";

import { useState, useCallback, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { deleteFileEntryAction } from "../storage/actions";
import { moveFileAction } from "./move-file-action";
import { DeleteConfirmButton } from "./delete-confirm-button";
import { RenameInlineForm } from "./rename-inline-form";
import { MoveInlineForm } from "./move-inline-form";

/* ── helper types ─────────────────────────────────────────────────── */

type StorageEntry = {
  id: string;
  name: string;
  entryType: string;
  mimeType?: string | null;
  relativePath: string;
  sizeLabel: string;
  previewable: boolean;
  directAccess: { mode: string; href?: string; description: string };
  storageNode: { id: string; name: string; driver: string };
  updatedAt?: Date | string;
};

/* ── helper functions ─────────────────────────────────────────────── */

function buildSearchHref(path: string, extra?: Record<string, string>) {
  const params = new URLSearchParams();
  if (path) params.set("path", path);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `/files?${qs}` : "/files";
}

function buildDownloadHref(entry: StorageEntry) {
  if (entry.storageNode.driver === "SFTP") {
    const params = new URLSearchParams({ nodeId: entry.storageNode.id, path: entry.relativePath });
    return `/api/storage/sftp-download?${params.toString()}`;
  }
  return `/api/storage/local?path=${encodeURIComponent(entry.relativePath)}`;
}

function getPreviewHref(entry: StorageEntry) {
  const mime = entry.mimeType ?? "";
  if (mime.startsWith("video/") || mime.startsWith("audio/") || mime.startsWith("image/") || mime === "application/pdf" || mime.startsWith("text/")) {
    const downloadHref =
      entry.directAccess.mode === "managed-download" && entry.directAccess.href
        ? entry.directAccess.href
        : buildDownloadHref(entry);
    const params = new URLSearchParams({
      href: downloadHref,
      name: entry.name,
      type: mime,
      driver: entry.storageNode.driver,
      ...(entry.storageNode.id ? { nodeId: entry.storageNode.id } : {}),
      ...(entry.relativePath ? { relativePath: entry.relativePath } : {}),
    });
    return `/files/preview?${params.toString()}`;
  }
  return entry.directAccess.mode === "managed-download" && entry.directAccess.href
    ? entry.directAccess.href
    : buildDownloadHref(entry);
}

function getEntryIcon(entry: { entryType: string; mimeType?: string | null }) {
  if (entry.entryType === "DIRECTORY") return "📁";
  const mime = entry.mimeType ?? "";
  if (mime.startsWith("image/")) return "🖼️";
  if (mime.startsWith("video/")) return "🎬";
  if (mime.startsWith("audio/")) return "🎵";
  if (mime.includes("pdf")) return "📄";
  if (mime.includes("zip") || mime.includes("tar") || mime.includes("gz")) return "📦";
  if (mime.includes("json") || mime.includes("javascript") || mime.includes("xml")) return "🔧";
  if (mime.startsWith("text/")) return "📝";
  return "📄";
}

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Get thumbnail URL for image files */
function getThumbnailUrl(entry: StorageEntry): string | null {
  const mime = entry.mimeType ?? "";
  if (!mime.startsWith("image/")) return null;
  if (entry.directAccess.mode === "managed-download" && entry.directAccess.href) {
    return entry.directAccess.href;
  }
  return buildDownloadHref(entry);
}

/* ── serialisable folder type (no Map) ────────────────────────────── */

export type FolderProp = {
	name: string;
	displayName?: string;
	path: string;
	entryId?: string | null;
	fileCount: number;
	folderCount: number;
	sourceKeys: string[];
	sourceValues: string[];
};

export type FileProp = {
  id: string;
  name: string;
  entryType: string;
  mimeType?: string | null;
  relativePath: string;
  sizeLabel: string;
  previewable: boolean;
  directAccessMode: string;
  directAccessHref?: string | null;
  directAccessDescription: string;
  storageNodeId: string;
  storageNodeName: string;
  storageNodeDriver: string;
  updatedAt?: string | null;
};

/* ── component props ──────────────────────────────────────────────── */

type FileListClientProps = {
  folders: FolderProp[];
  files: FileProp[];
  canEditLocalFiles: boolean;
  canDelete: boolean;
  currentPath: string;
  searchQuery: string;
  onFolderClick?: (path: string) => void;
  onRefresh?: () => void;
};

/* ── view mode type ───────────────────────────────────────────────── */

type ViewMode = "list" | "grid" | "details";
type BatchProgress = { done: number; total: number; errors: string[] };

/* ── SVG icon components ──────────────────────────────────────────── */

function EyeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function DownloadIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

/* ── main component ───────────────────────────────────────────────── */

export function FileListClient({
  folders,
  files,
  canEditLocalFiles,
  canDelete,
  currentPath,
  searchQuery,
  onFolderClick,
  onRefresh,
}: FileListClientProps) {
  const router = useRouter();

  /** Navigate to a folder path */
  const navigateToFolder = useCallback(
    (path: string) => {
      if (onFolderClick) {
        onFolderClick(path);
      } else {
        router.push(buildSearchHref(path), { scroll: false });
      }
    },
    [onFolderClick, router],
  );

/* ── view mode with localStorage persistence ────────────────────── */
	const VIEW_MODE_KEY = "app-file-view-mode";
	const [viewMode, setViewMode] = useState<ViewMode>(() => {
		try {
			const saved = localStorage.getItem(VIEW_MODE_KEY) as ViewMode | null;
			if (saved && ["list", "grid", "details"].includes(saved)) return saved;
		} catch { /* ignore */ }
		return "list";
	});

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch { /* ignore */ }
  }, []);

  // Sort state
  type SortKey = "name" | "type" | "size" | "source" | "updated";
  type SortDir = "asc" | "desc";
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  const sortedFolders = useMemo(() => {
    const arr = [...folders];
    if (sortKey === "name") arr.sort((a, b) => (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name, "zh-CN"));
    if (sortDir === "desc") arr.reverse();
    return arr;
  }, [folders, sortKey, sortDir]);

  const sortedFiles = useMemo(() => {
    const arr = [...files];
    const cmp = (a: FileProp, b: FileProp) => {
      switch (sortKey) {
        case "name": return a.name.localeCompare(b.name, "zh-CN");
        case "type": return (a.mimeType ?? "").localeCompare(b.mimeType ?? "");
        case "size": return (a.sizeLabel ?? "").localeCompare(b.sizeLabel ?? "");
        case "source": return a.storageNodeName.localeCompare(b.storageNodeName, "zh-CN");
        case "updated": return (a.updatedAt ?? "").localeCompare(b.updatedAt ?? "");
        default: return 0;
      }
    };
    arr.sort(cmp);
    if (sortDir === "desc") arr.reverse();
    return arr;
  }, [files, sortKey, sortDir]);

  function SortIcon({ col }: { col: SortKey }) {
    const active = sortKey === col;
    return (
      <button type="button" onClick={() => toggleSort(col)} className="inline-flex items-center gap-1 hover:text-white transition">
        {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
      </button>
    );
  }

  // Selection state (list view only)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchAction, setBatchAction] = useState<"none" | "confirm-delete" | "deleting" | "moving">("none");
  const [progress, setProgress] = useState<BatchProgress>({ done: 0, total: 0, errors: [] });
  const [moveTargetDir, setMoveTargetDir] = useState("");
  const [moveProgress, setMoveProgress] = useState<BatchProgress>({ done: 0, total: 0, errors: [] });
  const [isPending, startTransition] = useTransition();

  const allFileIds = files.map((f) => f.id);
  const allSelected = files.length > 0 && allFileIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleAll = useCallback(() => {
    if (allSelected) { setSelectedIds(new Set()); } else { setSelectedIds(new Set(allFileIds)); }
  }, [allSelected, allFileIds]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setBatchAction("none");
    setProgress({ done: 0, total: 0, errors: [] });
    setMoveProgress({ done: 0, total: 0, errors: [] });
  }, []);

  const handleBatchDelete = useCallback(() => {
    setBatchAction("deleting");
    const ids = [...selectedIds];
    setProgress({ done: 0, total: ids.length, errors: [] });
    let completed = 0;
    const errors: string[] = [];
    startTransition(async () => {
      for (const id of ids) {
        const file = files.find((item) => item.id === id);
        const formData = new FormData();
        formData.set("fileEntryId", id);
        const result = await deleteFileEntryAction(null, formData);
        completed++;
        if (result?.error) {
          errors.push(`${file?.name ?? id}: ${result.error}`);
        }
        setProgress({ done: completed, total: ids.length, errors: [...errors] });
      }
      if (onRefresh) { onRefresh(); } else { router.refresh(); }
      if (errors.length === 0) {
        clearSelection();
        return;
      }
      setBatchAction("none");
      setSelectedIds(new Set(ids));
      setProgress({ done: completed, total: ids.length, errors: [...errors] });
    });
  }, [selectedIds, files, router, clearSelection, onRefresh]);

  const handleBatchMove = useCallback(() => {
    setBatchAction("moving");
    setMoveTargetDir("");
    setMoveProgress({ done: 0, total: 0, errors: [] });
  }, []);

  const submitBatchMove = useCallback(() => {
    const ids = [...selectedIds];
    const targetDir = moveTargetDir.trim();
    if (!targetDir || ids.length === 0) return;
    setMoveProgress({ done: 0, total: ids.length, errors: [] });
    let completed = 0;
    const errors: string[] = [];
    startTransition(async () => {
      for (const id of ids) {
        const file = files.find((f) => f.id === id);
        if (!file) {
          errors.push(`${id}: 文件不存在`);
          completed++;
          setMoveProgress({ done: completed, total: ids.length, errors: [...errors] });
          continue;
        }
        const formData = new FormData();
        formData.set("fileEntryId", id);
        formData.set("targetDir", targetDir);
        formData.set("currentRelativePath", file.relativePath);
        formData.set("storageNodeId", file.storageNodeId);
        const result = await moveFileAction(null, formData);
        completed++;
        if (result?.error) errors.push(`${file.name}: ${result.error}`);
        setMoveProgress({ done: completed, total: ids.length, errors: [...errors] });
      }
      if (onRefresh) { onRefresh(); } else { router.refresh(); }
      if (errors.length === 0) {
        clearSelection();
        return;
      }
      setBatchAction("none");
      setSelectedIds(new Set(ids));
      setMoveProgress({ done: completed, total: ids.length, errors: [...errors] });
    });
  }, [selectedIds, moveTargetDir, files, router, clearSelection, onRefresh]);

  function toStorageEntry(f: FileProp): StorageEntry {
    return {
      id: f.id,
      name: f.name,
      entryType: f.entryType,
      mimeType: f.mimeType,
      relativePath: f.relativePath,
      sizeLabel: f.sizeLabel,
      previewable: f.previewable,
      directAccess: {
        mode: f.directAccessMode,
        href: f.directAccessHref ?? undefined,
        description: f.directAccessDescription,
      },
      storageNode: {
        id: f.storageNodeId,
        name: f.storageNodeName,
        driver: f.storageNodeDriver,
      },
      updatedAt: f.updatedAt ?? undefined,
    };
  }

  const emptyMessage = searchQuery
    ? `未找到匹配 "${searchQuery}" 的文件。`
    : "当前目录暂无内容。";

  /* ══════════════════════════════════════════════════════════════════ */
  /* ── GRID VIEW ──────────────────────────────────────────────────── */
  /* ══════════════════════════════════════════════════════════════════ */

  function renderGridView() {
    return (
      <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {sortedFolders.length === 0 && sortedFiles.length === 0 ? (
          <div className="col-span-full py-10 text-center text-sm text-slate-400">{emptyMessage}</div>
        ) : null}

        {/* Folder cards */}
        {sortedFolders.map((folder) => (
          <button
            key={folder.path}
            type="button"
            onClick={() => navigateToFolder(folder.path)}
            className="group flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-center transition hover:border-cyan-400/30 hover:bg-cyan-400/5"
          >
            <span className="text-3xl">📁</span>
            <span className="w-full truncate text-sm font-medium text-cyan-100 group-hover:text-white">
              {folder.displayName ?? folder.name}
            </span>
            <span className="text-xs text-slate-500">
              {folder.fileCount + folder.folderCount} 项
            </span>
          </button>
        ))}

        {/* File cards */}
	{sortedFiles.map((fileProp) => {
		const entry = toStorageEntry(fileProp);
		const thumbUrl = getThumbnailUrl(entry);
		const downloadHref = buildDownloadHref(entry);
		const downloadUrl = `${downloadHref}${downloadHref.includes("?") ? "&" : "?"}download=1`;
		const previewHref = getPreviewHref(entry);
		const isChecked = selectedIds.has(fileProp.id);

			return (
				<div
					key={entry.id}
					className={`group relative flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-center transition hover:border-cyan-400/30 hover:bg-cyan-400/5 overflow-hidden ${isChecked ? "ring-1 ring-cyan-400/40 bg-cyan-400/5" : ""}`}
				>
					{/* Selection checkbox */}
					<div className="absolute top-2 left-2 z-20">
						<input
							type="checkbox"
							checked={isChecked}
							onChange={() => toggleOne(fileProp.id)}
							aria-label={`选择 ${entry.name}`}
							className="rounded h-4 w-4 accent-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity"
						/>
					</div>
					{/* Thumbnail background for images */}
					{thumbUrl ? (
						<div data-testid="file-thumbnail-overlay" className="absolute inset-0 opacity-20 group-hover:opacity-30 transition pointer-events-none">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img src={thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
						</div>
					) : null}

              <div className="relative z-10 flex flex-col items-center gap-2 w-full flex-1">
                <span className="text-3xl">{getEntryIcon(entry)}</span>
                {entry.previewable ? (
                  <Link
                    href={previewHref}
                    className="w-full truncate text-sm font-medium text-white hover:text-cyan-100 transition"
                  >
                    {entry.name}
                  </Link>
                ) : (
                  <span className="w-full truncate text-sm font-medium text-white">{entry.name}</span>
                )}
                <span className="text-xs text-slate-500">{entry.sizeLabel}</span>
                <span className="text-xs text-slate-500 truncate w-full">{entry.storageNode.name}</span>
              </div>

              {/* Action row */}
              <div className="relative z-10 flex items-center gap-1 mt-auto pt-2 border-t border-white/5 w-full justify-center">
                {entry.previewable ? (
                  <Link
                    href={previewHref}
                    title="预览"
                    className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-cyan-100 hover:bg-cyan-400/10 transition"
                  >
                    <EyeIcon />
                  </Link>
                ) : null}
                <Link
                  href={downloadUrl}
                  title="下载"
                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-cyan-100 hover:bg-cyan-400/10 transition"
                >
                  <DownloadIcon />
                </Link>
                {canEditLocalFiles ? (
                  <RenameInlineForm
                    fileEntryId={entry.id}
                    currentName={entry.name}
                    currentPath={entry.relativePath}
                    entryType={entry.entryType as "FILE" | "DIRECTORY"}
                    onRefresh={onRefresh}
                  />
                ) : null}
                {canEditLocalFiles ? (
                  <MoveInlineForm
                    fileEntryId={entry.id}
                    name={entry.name}
                    relativePath={entry.relativePath}
                    storageNodeId={entry.storageNode.id}
                    storageNodeName={entry.storageNode.name}
                    onRefresh={onRefresh}
                  />
                ) : null}
                {canDelete ? (
                  <DeleteConfirmButton
                    fileEntryId={entry.id}
                    entryName={entry.name}
                    entryType={entry.entryType as "FILE" | "DIRECTORY"}
                    onRefresh={onRefresh}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

/* ══════════════════════════════════════════════════════════════════ */
/* ── DETAILS VIEW (rich file info with thumbnails & metadata) ──── */
/* ══════════════════════════════════════════════════════════════════ */

function renderDetailsView() {
	return (
		<div className="divide-y divide-white/5 bg-slate-950/40">
			{sortedFolders.length === 0 && sortedFiles.length === 0 ? (
				<div className="px-4 py-8 text-sm text-slate-400">{emptyMessage}</div>
			) : null}

			{/* Details folder rows */}
			{sortedFolders.map((folder) => (
				<div key={folder.path} className="flex items-start gap-4 px-4 py-3 hover:bg-white/5 transition">
					<div className="shrink-0 mt-0.5">
						<input type="checkbox" disabled className="rounded h-4 w-4 accent-cyan-400 opacity-30" />
					</div>
					<div className="flex items-center gap-3 min-w-0 flex-1">
						<span className="text-2xl shrink-0">📁</span>
						<div className="min-w-0 flex-1">
							<button
								type="button"
								onClick={() => navigateToFolder(folder.path)}
								className="truncate font-medium text-cyan-100 hover:text-white transition text-left"
							>
								{folder.displayName ?? folder.name}
							</button>
							<div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
								<span>目录</span>
								<span>{folder.fileCount + folder.folderCount} 项</span>
							</div>
						</div>
					</div>
					<div className="shrink-0 flex items-center gap-2">
						<button
							type="button"
							onClick={() => navigateToFolder(folder.path)}
							className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-400/20 transition"
						>
							打开
						</button>
						{canEditLocalFiles ? (
							<RenameInlineForm
								fileEntryId={folder.entryId ?? ""}
								currentName={folder.displayName ?? folder.name}
								currentPath={folder.path}
								entryType="DIRECTORY"
								onRefresh={onRefresh}
							/>
						) : null}
						{canEditLocalFiles && folder.entryId ? (
							<MoveInlineForm
								fileEntryId={folder.entryId}
								name={folder.displayName ?? folder.name}
								relativePath={folder.path}
								storageNodeId={folder.sourceKeys[0] ?? ""}
								storageNodeName={folder.sourceValues[0] ?? ""}
								onRefresh={onRefresh}
							/>
						) : null}
					</div>
				</div>
			))}

			{/* Details file rows with thumbnails and metadata */}
			{sortedFiles.map((fileProp) => {
				const entry = toStorageEntry(fileProp);
				const downloadHref = buildDownloadHref(entry);
				const downloadUrl = `${downloadHref}${downloadHref.includes("?") ? "&" : "?"}download=1`;
				const previewHref = getPreviewHref(entry);
				const thumbUrl = getThumbnailUrl(entry);
				const isChecked = selectedIds.has(fileProp.id);

				return (
					<div key={entry.id} className={`flex items-start gap-4 px-4 py-3 hover:bg-white/5 transition ${isChecked ? "bg-cyan-400/5" : ""}`}>
						<div className="shrink-0 mt-0.5">
							<input
								type="checkbox"
								checked={isChecked}
								onChange={() => toggleOne(fileProp.id)}
								aria-label={`选择 ${entry.name}`}
								className="rounded h-4 w-4 accent-cyan-400"
							/>
						</div>
						{/* Thumbnail or icon */}
						<div className="shrink-0 w-14 h-14 rounded-xl border border-white/10 bg-slate-950/60 overflow-hidden flex items-center justify-center">
							{thumbUrl ? (
								/* eslint-disable-next-line @next/next/no-img-element */
								<img src={thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
							) : (
								<span className="text-2xl">{getEntryIcon(entry)}</span>
							)}
						</div>
						{/* File info */}
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								{entry.previewable ? (
									<Link href={previewHref} className="truncate font-medium text-white hover:text-cyan-100 transition">
										{entry.name}
									</Link>
								) : (
									<span className="truncate font-medium text-white">{entry.name}</span>
								)}
							</div>
							<div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
								<span title="文件类型">{entry.mimeType ?? "未知类型"}</span>
								<span title="文件大小">{entry.sizeLabel}</span>
								<span title="存储节点">{entry.storageNode.name}</span>
								{entry.updatedAt ? <span title="修改时间">{formatDate(entry.updatedAt)}</span> : null}
							</div>
							<div className="mt-0.5 text-xs text-slate-600 truncate" title="完整路径">{entry.relativePath}</div>
						</div>
						{/* Actions */}
						<div className="shrink-0 flex items-center gap-1.5 mt-1">
							{entry.previewable ? (
								<Link
									href={previewHref}
									title="预览"
									className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-cyan-100 hover:bg-cyan-400/10 transition"
								>
									<EyeIcon />
								</Link>
							) : null}
							<Link
								href={downloadUrl}
								title="下载"
								className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-cyan-100 hover:bg-cyan-400/10 transition"
							>
								<DownloadIcon />
							</Link>
							{canEditLocalFiles ? (
								<RenameInlineForm
									fileEntryId={entry.id}
									currentName={entry.name}
									currentPath={entry.relativePath}
									entryType={entry.entryType as "FILE" | "DIRECTORY"}
									onRefresh={onRefresh}
								/>
							) : null}
							{canEditLocalFiles ? (
								<MoveInlineForm
									fileEntryId={entry.id}
									name={entry.name}
									relativePath={entry.relativePath}
									storageNodeId={entry.storageNode.id}
									storageNodeName={entry.storageNode.name}
									onRefresh={onRefresh}
								/>
							) : null}
							{canDelete ? (
								<DeleteConfirmButton
									fileEntryId={entry.id}
									entryName={entry.name}
									entryType={entry.entryType as "FILE" | "DIRECTORY"}
									onRefresh={onRefresh}
								/>
							) : null}
						</div>
					</div>
				);
			})}
		</div>
	);
}

  /* ══════════════════════════════════════════════════════════════════ */
  /* ── LIST VIEW (existing desktop table + mobile cards) ──────────── */
  /* ══════════════════════════════════════════════════════════════════ */

  function renderListView() {
    return (
      <>
        {/* Desktop table view (md+) */}
        <div className="hidden md:block">
          <div className="grid grid-cols-[40px_minmax(0,2fr)_100px_100px_120px_140px_minmax(200px,1fr)] bg-white/5 px-4 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">
            <div>
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                onChange={toggleAll}
                disabled={files.length === 0}
                className="rounded h-4 w-4 accent-cyan-400"
              />
            </div>
            <div>名称 <SortIcon col="name" /></div>
            <div>类型 <SortIcon col="type" /></div>
            <div>大小 <SortIcon col="size" /></div>
            <div>来源 <SortIcon col="source" /></div>
            <div>修改时间 <SortIcon col="updated" /></div>
            <div>操作</div>
          </div>

          <div className="divide-y divide-white/5 bg-slate-950/40">
            {sortedFolders.length === 0 && sortedFiles.length === 0 ? (
              <div className="px-4 py-10 text-sm text-slate-400">{emptyMessage}</div>
            ) : null}

            {sortedFolders.map((folder) => (
              <div
                key={folder.path}
                className="grid grid-cols-[40px_minmax(0,2fr)_100px_100px_120px_140px_minmax(200px,1fr)] items-center gap-4 px-4 py-3 text-sm"
              >
                <div>
                  <input type="checkbox" disabled className="rounded h-4 w-4 accent-cyan-400 opacity-30" />
                </div>
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => navigateToFolder(folder.path)}
                    className="block truncate font-medium text-cyan-100 hover:text-cyan-50 text-left"
                  >
                    📁 {folder.displayName ?? folder.name}
                  </button>
                </div>
                <div className="text-slate-300">目录</div>
                <div className="text-slate-500">{folder.fileCount + folder.folderCount} 项</div>
                <div className="text-slate-300 truncate">-</div>
                <div className="text-slate-500">-</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => navigateToFolder(folder.path)}
                    className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-400/20"
                  >
                    打开
                  </button>
                  {canEditLocalFiles ? (
                    <RenameInlineForm
                      fileEntryId={folder.entryId ?? ""}
                      currentName={folder.displayName ?? folder.name}
                      currentPath={folder.path}
                      entryType="DIRECTORY"
                      onRefresh={onRefresh}
                    />
                  ) : null}
                  {canEditLocalFiles && folder.entryId ? (
                    <MoveInlineForm
                      fileEntryId={folder.entryId}
                      name={folder.displayName ?? folder.name}
                      relativePath={folder.path}
                      storageNodeId={folder.sourceKeys[0] ?? ""}
                      storageNodeName={folder.sourceValues[0] ?? ""}
                      onRefresh={onRefresh}
                    />
                  ) : null}
                </div>
              </div>
            ))}

            {sortedFiles.map((fileProp) => {
              const entry = toStorageEntry(fileProp);
              const downloadHref = buildDownloadHref(entry);
              const downloadUrl = `${downloadHref}${downloadHref.includes("?") ? "&" : "?"}download=1`;
              const previewHref = getPreviewHref(entry);
              const isChecked = selectedIds.has(fileProp.id);

              return (
                <div
                  key={entry.id}
                  className={`grid grid-cols-[40px_minmax(0,2fr)_100px_100px_120px_140px_minmax(200px,1fr)] items-center gap-4 px-4 py-3 text-sm ${isChecked ? "bg-cyan-400/5" : ""}`}
                >
                  <div>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleOne(fileProp.id)}
                      aria-label={`选择 ${entry.name}`}
                      className="rounded h-4 w-4 accent-cyan-400"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-white">
                      {getEntryIcon(entry)} {entry.name}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{entry.relativePath}</p>
                  </div>
                  <div className="text-slate-300">{entry.entryType === "DIRECTORY" ? "目录" : "文件"}</div>
                  <div className="text-slate-300">{entry.sizeLabel}</div>
                  <div className="text-slate-300 truncate">{entry.storageNode.name}</div>
                  <div className="text-slate-400 text-xs">
                    {entry.updatedAt ? formatDate(entry.updatedAt) : "-"}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {entry.previewable ? (
                      <Link
                        href={previewHref}
                        className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-400/20"
                      >
                        预览
                      </Link>
                    ) : null}
                    <Link
                      href={downloadUrl}
                      aria-label={`下载 ${entry.name}`}
                      className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-400/20"
                    >
                      下载
                    </Link>
                    {canEditLocalFiles ? (
                      <RenameInlineForm
                        fileEntryId={entry.id}
                        currentName={entry.name}
                        currentPath={entry.relativePath}
                        entryType={entry.entryType as "FILE" | "DIRECTORY"}
                        onRefresh={onRefresh}
                      />
                    ) : null}
                    {canEditLocalFiles ? (
                      <MoveInlineForm
                        fileEntryId={entry.id}
                        name={entry.name}
                        relativePath={entry.relativePath}
                        storageNodeId={entry.storageNode.id}
                        storageNodeName={entry.storageNode.name}
                        onRefresh={onRefresh}
                      />
                    ) : null}
                    {canDelete ? (
                      <DeleteConfirmButton
                        fileEntryId={entry.id}
                        entryName={entry.name}
                        entryType={entry.entryType as "FILE" | "DIRECTORY"}
                        onRefresh={onRefresh}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mobile card view (below md) */}
        <div className="md:hidden divide-y divide-white/5 bg-slate-950/40">
          {sortedFolders.length === 0 && sortedFiles.length === 0 ? (
            <div className="px-4 py-10 text-sm text-slate-400">{emptyMessage}</div>
          ) : null}

          {sortedFolders.map((folder) => (
            <div key={folder.path} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <input type="checkbox" disabled className="mt-1 rounded h-4 w-4 accent-cyan-400 opacity-30" />
                  <button
                    type="button"
                    onClick={() => navigateToFolder(folder.path)}
                    className="truncate font-medium text-cyan-100 hover:text-cyan-50 text-left"
                  >
                    📁 {folder.displayName ?? folder.name}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => navigateToFolder(folder.path)}
                  className="shrink-0 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100 hover:bg-cyan-400/20"
                >
                  打开
                </button>
              </div>
              <div className="mt-1.5 flex gap-3 text-xs text-slate-400 pl-7">
                <span>目录</span>
                <span>{folder.fileCount + folder.folderCount} 项</span>
              </div>
              {canEditLocalFiles ? (
                <div className="mt-2 flex flex-wrap gap-2 pl-7">
                  <RenameInlineForm
                    fileEntryId={folder.entryId ?? ""}
                    currentName={folder.displayName ?? folder.name}
                    currentPath={folder.path}
                    entryType="DIRECTORY"
                    onRefresh={onRefresh}
                  />
                  {folder.entryId ? (
                    <MoveInlineForm
                      fileEntryId={folder.entryId}
                      name={folder.displayName ?? folder.name}
                      relativePath={folder.path}
                      storageNodeId={folder.sourceKeys[0] ?? ""}
                      storageNodeName={folder.sourceValues[0] ?? ""}
                      onRefresh={onRefresh}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}

          {sortedFiles.map((fileProp) => {
            const entry = toStorageEntry(fileProp);
            const downloadHref = buildDownloadHref(entry);
            const downloadUrl = `${downloadHref}${downloadHref.includes("?") ? "&" : "?"}download=1`;
            const previewHref = getPreviewHref(entry);
            const isChecked = selectedIds.has(fileProp.id);

            return (
              <div key={entry.id} className={`px-4 py-3 ${isChecked ? "bg-cyan-400/5" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleOne(fileProp.id)}
                      className="mt-1 rounded h-4 w-4 accent-cyan-400"
                    />
                    <div className="min-w-0">
                      <div className="truncate font-medium text-white">
                        {getEntryIcon(entry)} {entry.name}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{entry.relativePath}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-1.5 flex gap-3 text-xs text-slate-400 pl-7">
                  <span>{entry.entryType === "DIRECTORY" ? "目录" : "文件"}</span>
                  <span>{entry.sizeLabel}</span>
                  <span>{entry.storageNode.name}</span>
                  {entry.updatedAt ? <span>{formatDate(entry.updatedAt)}</span> : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 pl-7">
                  {entry.previewable ? (
                    <Link
                      href={previewHref}
                      className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-400/20"
                    >
                      预览
                    </Link>
                  ) : null}
                  <Link
                    href={downloadUrl}
                    aria-label={`下载 ${entry.name}`}
                    className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-400/20"
                  >
                    下载
                  </Link>
                  {canEditLocalFiles ? (
                    <RenameInlineForm
                      fileEntryId={entry.id}
                      currentName={entry.name}
                      currentPath={entry.relativePath}
                      entryType={entry.entryType as "FILE" | "DIRECTORY"}
                      onRefresh={onRefresh}
                    />
                  ) : null}
                  {canEditLocalFiles ? (
                    <MoveInlineForm
                      fileEntryId={entry.id}
                      name={entry.name}
                      relativePath={entry.relativePath}
                      storageNodeId={entry.storageNode.id}
                      storageNodeName={entry.storageNode.name}
                      onRefresh={onRefresh}
                    />
                  ) : null}
                  {canDelete ? (
                    <DeleteConfirmButton
                      fileEntryId={entry.id}
                      entryName={entry.name}
                      entryType={entry.entryType as "FILE" | "DIRECTORY"}
                      onRefresh={onRefresh}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  /* ══════════════════════════════════════════════════════════════════ */
  /* ── MAIN RENDER ────────────────────────────────────────────────── */
  /* ══════════════════════════════════════════════════════════════════ */

  return (
    <>
      <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
        {/* View mode toggle header bar */}
        <div className="flex items-center justify-between bg-white/5 px-4 py-2">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>{sortedFolders.length + sortedFiles.length} 项</span>
		{selectedIds.size > 0 ? (
              <span className="text-cyan-200">· 已选 {selectedIds.size} 个</span>
            ) : null}
          </div>
		<div className="flex items-center gap-1 rounded-xl border border-white/10 bg-slate-950 p-0.5">
			<button
				type="button"
				onClick={() => handleViewModeChange("list")}
				title="列表视图"
				aria-label="列表视图"
				aria-pressed={viewMode === "list"}
				className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm transition ${
					viewMode === "list"
						? "bg-cyan-400/20 text-cyan-100 border border-cyan-400/30"
						: "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
				}`}
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
				<span className="text-xs">列表</span>
			</button>
			<button
				type="button"
				onClick={() => handleViewModeChange("grid")}
				title="图标视图"
				aria-label="图标视图"
				aria-pressed={viewMode === "grid"}
				className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm transition ${
					viewMode === "grid"
						? "bg-cyan-400/20 text-cyan-100 border border-cyan-400/30"
						: "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
				}`}
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
				<span className="text-xs">图标</span>
			</button>
			<button
				type="button"
				onClick={() => handleViewModeChange("details")}
				title="详情视图"
				aria-label="详情视图"
				aria-pressed={viewMode === "details"}
				className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm transition ${
					viewMode === "details"
						? "bg-cyan-400/20 text-cyan-100 border border-cyan-400/30"
						: "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
				}`}
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="3" y1="9" x2="9" y2="9"/><line x1="3" y1="15" x2="9" y2="15"/></svg>
				<span className="text-xs">详情</span>
			</button>
		</div>
        </div>

        {/* View content */}
	{viewMode === "list" ? renderListView() : viewMode === "grid" ? renderGridView() : renderDetailsView()}
      </div>

      {progress.errors.length > 0 || moveProgress.errors.length > 0 ? (
        <div className="fixed bottom-20 left-1/2 z-50 max-w-lg -translate-x-1/2 rounded-2xl border border-amber-400/30 bg-amber-950/95 px-4 py-3 text-sm text-amber-100 shadow-2xl">
          <p className="font-medium">
            批量操作完成，{progress.errors.length + moveProgress.errors.length} 个失败
          </p>
          <ul className="mt-1 max-h-28 overflow-y-auto text-xs text-amber-100/80">
            {[...progress.errors, ...moveProgress.errors].map((error) => (
              <li key={error}>• {error}</li>
            ))}
          </ul>
        </div>
      ) : null}

	{/* Batch action toolbar (all view modes) */}
	{selectedIds.size > 0 ? (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900/95 backdrop-blur border border-white/10 rounded-2xl shadow-2xl px-5 py-3">
          {batchAction === "confirm-delete" ? (
            <>
              <span className="text-sm text-rose-200">
                确认删除 {selectedIds.size} 个文件？
              </span>
              <button
                type="button"
                onClick={handleBatchDelete}
                disabled={isPending}
                className="rounded-full border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-400/20 disabled:opacity-50"
              >
                确认删除
              </button>
              <button
                type="button"
                onClick={() => setBatchAction("none")}
                disabled={isPending}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
              >
                取消
              </button>
            </>
          ) : batchAction === "deleting" ? (
            <>
              <span className="text-sm text-rose-200">
                已删除 {progress.done}/{progress.total} 个
              </span>
              {progress.done < progress.total ? (
                <div className="h-2 w-24 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-rose-400 transition-all"
                    style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
                  />
                </div>
              ) : null}
              {progress.errors.length > 0 ? (
                <span className="text-sm text-amber-200">{progress.errors.length} 个失败</span>
              ) : null}
            </>
          ) : batchAction === "moving" ? (
            <>
              <span className="text-sm text-slate-200">目标路径：</span>
              <input
                type="text"
                value={moveTargetDir}
                onChange={(e) => setMoveTargetDir(e.currentTarget.value)}
                placeholder={currentPath || "目标路径"}
                className="w-40 rounded-2xl border border-white/10 bg-slate-950 px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
              />
              {moveProgress.total > 0 ? (
                <span className="text-sm text-cyan-200">
                  已移动 {moveProgress.done}/{moveProgress.total} 个
                  {moveProgress.errors.length > 0 ? `（${moveProgress.errors.length} 个失败）` : ""}
                </span>
              ) : null}
              <button
                type="button"
                onClick={submitBatchMove}
                disabled={!moveTargetDir.trim() || isPending || moveProgress.done > 0}
                className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                确认移动
              </button>
              <button
                type="button"
                onClick={() => {
                  setBatchAction("none");
                  setMoveTargetDir("");
                  setMoveProgress({ done: 0, total: 0, errors: [] });
                }}
                disabled={isPending && moveProgress.done > 0}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
              >
                取消
              </button>
            </>
          ) : (
            <>
              <span className="text-sm text-slate-200">已选 {selectedIds.size} 个文件</span>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10"
              >
                取消选择
              </button>
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => setBatchAction("confirm-delete")}
                  className="rounded-full border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-400/20"
                >
                  批量删除
                </button>
              ) : null}
              {canEditLocalFiles ? (
                <button
                  type="button"
                  onClick={handleBatchMove}
                  className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20"
                >
                  批量移动
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
