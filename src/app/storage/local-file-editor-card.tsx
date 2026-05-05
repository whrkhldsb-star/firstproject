"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/submit-button";

import { type StorageActionState, updateLocalFileContentAction } from "./actions";

const initialState: StorageActionState = {};

export function LocalFileEditorCard({
  fileEntryId,
  name,
  relativePath,
  initialContent,
  downloadHref,
}: {
  fileEntryId: string;
  name: string;
  relativePath: string;
  initialContent: string;
  downloadHref: string;
}) {
  const [state, formAction] = useActionState(updateLocalFileContentAction, initialState);

  return (
    <form action={formAction} className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-5">
      <input type="hidden" name="fileEntryId" value={fileEntryId} />
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-medium text-white">在线编辑（admin / 本机文件）</h3>
          <p className="mt-1 text-sm text-slate-300">{name}</p>
          <p className="mt-1 text-xs text-slate-400">{relativePath}</p>
        </div>
        <a
          href={downloadHref}
          className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-slate-100 transition hover:border-cyan-400/50 hover:text-cyan-200"
        >
          下载当前文件
        </a>
      </div>

      <label className="mt-4 grid gap-2 text-sm text-slate-300">
        <span>文件内容</span>
        <textarea
          name="content"
          rows={18}
          defaultValue={initialContent}
          spellCheck={false}
          className="min-h-[360px] rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 font-mono text-sm text-white outline-none ring-0"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
        <span>仅支持文本类文件</span>
        <span>仅限当前服务器本机存储节点</span>
        <span>单文件上限 512 KB</span>
      </div>

      {state.error ? <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{state.error}</div> : null}
      {state.success ? <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{state.success}</div> : null}

      <div className="mt-4 flex justify-end">
        <SubmitButton pendingLabel="保存中...">保存并覆盖文件</SubmitButton>
      </div>
    </form>
  );
}
