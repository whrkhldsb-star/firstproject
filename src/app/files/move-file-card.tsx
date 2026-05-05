"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { SubmitButton } from "@/components/submit-button";

import { type MoveFileActionState, moveFileAction } from "./move-file-action";

const initialState: MoveFileActionState = {};

export function MoveFileCard({
  fileEntryId,
  name,
  relativePath,
  storageNodeId,
  storageNodeName,
}: {
  fileEntryId: string;
  name: string;
  relativePath: string;
  storageNodeId: string;
  storageNodeName: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(moveFileAction, initialState);

  if (state.success) {
    router.refresh();
  }

  return (
    <form action={formAction} className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-5">
      <input type="hidden" name="fileEntryId" value={fileEntryId} />
      <input type="hidden" name="currentRelativePath" value={relativePath} />
      <input type="hidden" name="storageNodeId" value={storageNodeId} />

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-medium text-white">文件移动</h3>
          <p className="mt-1 text-sm text-slate-300">{name}</p>
          <p className="mt-1 text-xs text-slate-400">
            当前路径：{relativePath} · 节点：{storageNodeName}
          </p>
        </div>
      </div>

      <label className="mt-4 grid gap-2 text-sm text-slate-300">
        <span>目标路径</span>
        <input
          type="text"
          name="targetDir"
          placeholder="docs/2024 或 media/videos"
          className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
        <span>文件将移动到目标路径下，保持文件名不变</span>
        <span>仅限同节点内移动</span>
      </div>

      {state.error ? (
        <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {state.error}
        </div>
      ) : null}
      {state.success ? (
        <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          {state.success}
        </div>
      ) : null}

      <div className="mt-4 flex justify-end">
        <SubmitButton pendingLabel="移动中...">移动文件</SubmitButton>
      </div>
    </form>
  );
}
