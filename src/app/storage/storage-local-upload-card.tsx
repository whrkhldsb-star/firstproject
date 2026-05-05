"use client";

import { FileUploadDropzone } from "@/components/storage/file-upload-dropzone";

export function StorageLocalUploadCard({
  nodes,
}: {
  nodes: Array<{ id: string; name: string; driver: string }>;
}) {
  return (
    <FileUploadDropzone
      nodes={nodes}
      title="本机上传"
      description="仅支持 LOCAL 节点；重复上传同路径文件会覆盖并更新条目。"
      submitLabel="拖拽文件到这里，或点击选择本地文件"
      pathLabel="目标目录（可选）"
      allowNodeSelection
    />
  );
}
