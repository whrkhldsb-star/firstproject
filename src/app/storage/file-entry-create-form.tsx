"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/submit-button";

import { createFileEntryAction, type StorageActionState } from "./actions";

const initialState: StorageActionState = {};

export function FileEntryCreateForm({
  nodes,
}: {
  nodes: Array<{ id: string; name: string; driver: string }>;
}) {
  const [state, formAction] = useActionState(createFileEntryAction, initialState);

  return (
    <form action={formAction} className="grid gap-4 rounded-3xl border border-white/10 bg-slate-900/60 p-6">
      <div>
        <h2 className="text-xl font-semibold text-white">登记文件/目录</h2>
        <p className="mt-2 text-sm text-slate-400">先登记元数据，后续即可继续接上传、预览与下载链路。</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
          <span>存储节点</span>
          <select name="storageNodeId" required className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white">
            <option value="">请选择存储节点</option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>{node.name} · {node.driver}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm text-slate-300">
          <span>名称</span>
          <input name="name" required className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white" placeholder="demo.mp4" />
        </label>
        <label className="grid gap-2 text-sm text-slate-300">
          <span>类型</span>
          <select name="entryType" defaultValue="FILE" className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white">
            <option value="FILE">FILE</option>
            <option value="DIRECTORY">DIRECTORY</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
          <span>相对路径</span>
          <input name="relativePath" required className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white" placeholder="videos/demo.mp4" />
        </label>
        <label className="grid gap-2 text-sm text-slate-300">
          <span>MIME</span>
          <input name="mimeType" className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white" placeholder="video/mp4" />
        </label>
        <label className="grid gap-2 text-sm text-slate-300">
          <span>大小（字节）</span>
          <input name="size" type="number" min={0} className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white" placeholder="1024" />
        </label>
        <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
          <span>SHA256（可选）</span>
          <input name="checksumSha256" className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white" />
        </label>
      </div>

      {state.error ? <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{state.error}</div> : null}
      {state.success ? <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{state.success}</div> : null}

      <div className="flex justify-end"><SubmitButton pendingLabel="登记中...">登记条目</SubmitButton></div>
    </form>
  );
}
