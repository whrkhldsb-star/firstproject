"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { FileListClient, type FolderProp, type FileProp } from "./file-list-client";
import { createFolderAction } from "../storage/actions";

/* ── Types ──────────────────────────────────────────────────────── */

type TreeNode = {
  name: string;
  path: string;
  entryId?: string;
  fileCount: number;
  folderCount: number;
  sourceKeys: string[];
  sourceValues: string[];
  children: TreeNode[];
};

export type FilesBrowserProps = {
  /** Pre-serialized tree for the sidebar directory tree */
  tree: TreeNode;
  /** Folders in current directory */
  folders: FolderProp[];
  /** Files in current directory */
  files: FileProp[];
  /** Current path */
  currentPath: string;
  /** Search query */
  searchQuery: string;
  /** Search scope */
  searchScope: "current" | "all";
  /** Total items (folders + files) after search filter */
  totalItems: number;
  /** Source summary */
  sourceSummaryToolbar: string;
  /** Permissions */
  canEditLocalFiles: boolean;
  canDelete: boolean;
  /** All storage nodes (for create-folder form) */
  storageNodes: { id: string; name: string; driver: string }[];
  /** Current path label */
  currentPathLabel: string;
  /** Total entries count */
  totalEntries: number;
};

/* ── Helpers ────────────────────────────────────────────────────── */

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

function splitPath(path: string) {
  return path ? path.split("/").filter(Boolean) : [];
}

function getFolderLabel(path: string) {
  const segments = splitPath(path);
  return segments.length ? segments[segments.length - 1] : "全部文件";
}

/* ── Navigation hook ────────────────────────────────────────────── */

function useFolderNavigation() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const navigateToFolder = useCallback(
    (path: string) => {
      const params = new URLSearchParams();
      if (path) params.set("path", path);
      // Preserve search query and scope when navigating folders
const scope = searchParams.get("scope");
      // When navigating to a different folder, clear search query
      // (user expects to see the new folder's contents, not search results)
      if (scope && scope !== "current") {
        // Keep scope but clear q when switching directories
      }
      const qs = params.toString();
      const url = qs ? `/files?${qs}` : "/files";
      router.push(url, { scroll: false });
    },
    [router, searchParams],
  );

  return { navigateToFolder };
}

/* ── FolderTree (client-side) ───────────────────────────────────── */

function FolderTreeClient({
  node,
  currentPath,
  onNavigate,
}: {
  node: TreeNode;
  currentPath: string;
  onNavigate: (path: string) => void;
}) {
  const children = node.children;
  if (children.length === 0) return null;

  return (
    <ul className="mt-3 space-y-1 border-l border-white/10 pl-3">
      {children.map((child) => {
        const isCurrent = child.path === currentPath;
        return (
          <li key={child.path || child.name}>
            <button
              type="button"
              onClick={() => onNavigate(child.path)}
              aria-current={isCurrent ? "page" : undefined}
              aria-label={child.name}
              className={`flex w-full items-center justify-between rounded-2xl px-3 py-2 text-sm transition text-left ${
                isCurrent
                  ? "bg-cyan-400/10 text-cyan-100"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="truncate">{child.name}</span>
              <span aria-hidden="true" className="ml-3 text-xs text-slate-500">
                {child.fileCount + child.folderCount}
              </span>
            </button>
            <FolderTreeClient node={child} currentPath={currentPath} onNavigate={onNavigate} />
          </li>
        );
      })}
    </ul>
  );
}

/* ── Breadcrumbs (client-side) ──────────────────────────────────── */

function BreadcrumbsClient({
  path,
  onNavigate,
}: {
  path: string;
  onNavigate: (path: string) => void;
}) {
  const segments = splitPath(path);

  return (
    <nav aria-label="面包屑" className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
      <button
        type="button"
        onClick={() => onNavigate("")}
        className="rounded-full border border-white/10 px-3 py-1.5 text-slate-200 hover:bg-white/5"
      >
        全部文件
      </button>
      {segments.map((segment, index) => {
        const nextPath = segments.slice(0, index + 1).join("/");
        const isLast = index === segments.length - 1;
        return (
          <span key={nextPath} className="flex items-center gap-2">
            <span>/</span>
            {isLast ? (
              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-cyan-100">
                {segment}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(nextPath)}
                className="rounded-full border border-white/10 px-3 py-1.5 text-slate-200 hover:bg-white/5"
              >
                {segment}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/* ── Main Component ─────────────────────────────────────────────── */

export function FilesBrowserClient({
  tree,
  folders,
  files,
  currentPath,
  searchQuery,
  searchScope,
  totalItems,
  sourceSummaryToolbar,
  canEditLocalFiles,
  canDelete,
	storageNodes,
	totalEntries,
}: FilesBrowserProps) {
  const { navigateToFolder } = useFolderNavigation();

  const handleFolderClick = useCallback(
    (path: string) => {
      navigateToFolder(path);
    },
    [navigateToFolder],
  );

  return (
    <section className="mt-8 grid gap-8 xl:grid-cols-[280px_minmax(0,1fr)]">
      {/* Sidebar: Directory tree */}
      <aside className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-white">目录树</h2>
            <p className="mt-2 text-sm leading-7 text-slate-300">
              按层级展开所有已登记目录，便于快速跳转。
            </p>
          </div>
        </div>
        <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
          <button
            type="button"
            onClick={() => handleFolderClick("")}
            className={`flex w-full items-center justify-between rounded-2xl px-3 py-2 text-sm text-left ${
              currentPath === ""
                ? "bg-cyan-400/10 text-cyan-100"
                : "text-cyan-100 hover:bg-white/5"
            }`}
          >
            <span>全部文件</span>
            <span className="text-xs text-cyan-200/70">{totalEntries}</span>
          </button>
          <FolderTreeClient node={tree} currentPath={currentPath} onNavigate={handleFolderClick} />
        </div>
      </aside>

      {/* Main content area */}
      <section className="space-y-8">
        {/* Search + Toolbar */}
        <article className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">{getFolderLabel(currentPath)}</h2>
              <p className="mt-2 text-sm leading-7 text-slate-300">
                {currentPath ? `当前路径：/${currentPath}` : "当前路径：根目录"}
              </p>
            </div>
            <BreadcrumbsClient path={currentPath} onNavigate={handleFolderClick} />
          </div>

          {/* Search bar */}
          <form action="/files" method="get" className="mt-4">
            {currentPath ? (
              <input type="hidden" name="path" value={currentPath} />
            ) : null}
            <input type="hidden" name="scope" value={searchScope} />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <SearchScopeToggleClient currentScope={searchScope} currentPath={currentPath} />
              <div className="flex flex-1 gap-3">
                <input
                  type="text"
                  name="q"
                  defaultValue={searchQuery}
                  placeholder={
                    searchScope === "all" ? "搜索全部文件名…" : "搜索当前目录文件名…"
                  }
                  className="flex-1 rounded-2xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-5 py-2.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20"
                >
                  搜索
                </button>
                {searchQuery ? (
                  <Link
                    href={buildSearchHref(currentPath)}
                    scroll={false}
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10"
                  >
                    清除
                  </Link>
                ) : null}
              </div>
            </div>
            {searchQuery ? (
              <p className="mt-2 text-xs text-slate-400">
                搜索 &quot;{searchQuery}&quot; —{" "}
                {searchScope === "all" ? "在全部文件中" : "在当前目录"}找到 {totalItems} 个结果
              </p>
            ) : null}
          </form>

          <div className="mt-6 rounded-3xl border border-cyan-400/20 bg-cyan-400/5 p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-white">当前目录操作</h3>
                <p className="mt-2 text-sm text-slate-300">
                  {currentPath ? `当前路径：/${currentPath}` : "当前路径：/"}
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  项目数 {totalItems} · {sourceSummaryToolbar}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {canEditLocalFiles ? (
                  <a
                    href="#upload-section"
                    className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20"
                  >
                    ⬆ 上传文件
                  </a>
                ) : null}
                {canEditLocalFiles && storageNodes.length > 0 ? (
                  <CreateFolderFormClient
                    storageNodes={storageNodes}
                    currentPath={currentPath}
                  />
                ) : (
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    className="cursor-not-allowed rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-400"
                  >
                    新建文件夹
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* File list with batch operations */}
          <FileListClient
            folders={folders}
            files={files}
            canEditLocalFiles={canEditLocalFiles}
            canDelete={canDelete}
            currentPath={currentPath}
            searchQuery={searchQuery}
            onFolderClick={handleFolderClick}
          />
        </article>
      </section>
    </section>
  );
}

/* ── SearchScopeToggle (client-side, submits form with scroll:false) ── */

function SearchScopeToggleClient({
  currentScope,
  currentPath,
}: {
  currentScope: "current" | "all";
  currentPath: string;
}) {
  const router = useRouter();

  const handleChange = useCallback(
    (newScope: string) => {
      const params = new URLSearchParams();
      if (currentPath) params.set("path", currentPath);
      if (newScope !== "current") params.set("scope", newScope);
      const qs = params.toString();
      const url = qs ? `/files?${qs}` : "/files";
      router.push(url, { scroll: false });
    },
    [router, currentPath],
  );

  return (
    <div className="flex gap-1 rounded-full border border-white/10 bg-slate-950/50 p-1">
      <button
        type="button"
        onClick={() => handleChange("current")}
        className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
          currentScope === "current"
            ? "border border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
            : "text-slate-400 hover:text-slate-200"
        }`}
      >
        当前目录
      </button>
      <button
        type="button"
        onClick={() => handleChange("all")}
        className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
          currentScope === "all"
            ? "border border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
            : "text-slate-400 hover:text-slate-200"
        }`}
      >
        全部文件
      </button>
    </div>
  );
}

/* ── CreateFolderForm (client-side) ─────────────────────────────── */

function CreateFolderFormClient({
  storageNodes,
  currentPath,
}: {
  storageNodes: { id: string; name: string; driver: string }[];
  currentPath: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState(
    storageNodes.length > 0 ? storageNodes[0].id : "",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleToggle() {
    setExpanded((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => inputRef.current?.focus(), 0);
      } else {
        setFolderName("");
      }
      return next;
    });
  }

  function handleCancel() {
    setExpanded(false);
    setFolderName("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!folderName.trim()) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.set("storageNodeId", selectedNodeId);
      formData.set("currentPath", currentPath);
      formData.set("folderName", folderName.trim());

      const result = await createFolderAction(null, formData);
      if (result?.error) {
        setError(result.error);
      } else if (result?.success) {
        setSuccess(result.success);
        setFolderName("");
        setExpanded(false);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setLoading(false);
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={handleToggle}
        className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20"
      >
        新建文件夹
      </button>
    );
  }

  const fullPath = currentPath ? `${currentPath}/${folderName}` : folderName;

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="storageNodeId" value={selectedNodeId} />
      <input type="hidden" name="currentPath" value={currentPath} />
      {storageNodes.length > 1 ? (
        <label className="grid gap-1 text-sm text-slate-300">
          <span className="sr-only">目标节点</span>
          <select
            value={selectedNodeId}
            onChange={(event) => setSelectedNodeId(event.currentTarget.value)}
            className="rounded-2xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:border-cyan-400/50 focus:outline-none"
          >
            {storageNodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name}（{node.driver}）
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="grid gap-1 text-sm text-slate-300">
        <span className="sr-only">文件夹名称</span>
        <input
          ref={inputRef}
          value={folderName}
          onChange={(event) => setFolderName(event.currentTarget.value)}
          required
          minLength={1}
          maxLength={255}
          pattern={String.raw`^[^\s/\\:*?"<>|]+$`}
          placeholder="输入文件夹名"
          className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white placeholder:text-slate-500"
        />
      </label>
      {folderName.trim() ? (
        <span className="text-xs text-slate-400">路径：/{fullPath}</span>
      ) : null}
      <button
        type="submit"
        disabled={!folderName.trim() || loading}
        className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "创建中..." : "创建"}
      </button>
      <button
        type="button"
        onClick={handleCancel}
        disabled={loading}
        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
      >
        取消
      </button>
      {error ? <span className="text-xs text-rose-300">{error}</span> : null}
      {success ? <span className="text-xs text-emerald-300">{success}</span> : null}
    </form>
  );
}
