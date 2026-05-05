import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FileUploadDropzone } from "../file-upload-dropzone";

const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const localNode = { id: "node_local", name: "本机存储", driver: "LOCAL" };

describe("FileUploadDropzone", () => {
  beforeEach(() => {
    refreshMock.mockClear();
    vi.restoreAllMocks();
  });

  it("calls the client refresh callback after a successful upload", async () => {
    const onUploadComplete = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ relativePath: "docs/report.txt", size: 12 }),
    } as Response);

    render(
      <FileUploadDropzone
        nodes={[localNode]}
        initialNodeId="node_local"
        initialRelativeDir="docs"
        title="上传"
        description="上传文件"
        submitLabel="选择文件"
        pathLabel="上传目录路径"
        onUploadComplete={onUploadComplete}
      />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["hello world!"], "report.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onUploadComplete).toHaveBeenCalledWith({ relativePath: "docs/report.txt", size: 12 }));
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/上传完成：docs\/report\.txt/)).toBeInTheDocument();
  });

  it("uploads multiple selected files and reports per-file queue status", async () => {
    const onUploadComplete = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const formData = init?.body as FormData;
      const relativePath = String(formData.get("relativePath"));
      const file = formData.get("file") as File;
      return {
        ok: true,
        json: async () => ({ relativePath, size: file.size }),
      } as Response;
    });

    render(
      <FileUploadDropzone
        nodes={[localNode]}
        initialNodeId="node_local"
        initialRelativeDir="docs"
        title="上传"
        description="上传文件"
        submitLabel="选择文件"
        pathLabel="上传目录路径"
        onUploadComplete={onUploadComplete}
      />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toHaveAttribute("multiple");

    const first = new File(["alpha"], "a.txt", { type: "text/plain" });
    const second = new File(["beta"], "b.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [first, second] } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(onUploadComplete).toHaveBeenCalledTimes(2);
    expect(onUploadComplete).toHaveBeenNthCalledWith(1, { relativePath: "docs/a.txt", size: first.size });
    expect(onUploadComplete).toHaveBeenNthCalledWith(2, { relativePath: "docs/b.txt", size: second.size });
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("上传完成 2/2 个文件")).toBeInTheDocument();
    expect(screen.getByText(/a\.txt/)).toBeInTheDocument();
    expect(screen.getByText(/b\.txt/)).toBeInTheDocument();
  });

  it("keeps uploading remaining files and summarizes partial failures", async () => {
    const onUploadComplete = vi.fn();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const formData = init?.body as FormData;
      const relativePath = String(formData.get("relativePath"));
      if (relativePath.endsWith("bad.txt")) {
        return { ok: false, json: async () => ({ error: "磁盘空间不足" }) } as Response;
      }
      const file = formData.get("file") as File;
      return { ok: true, json: async () => ({ relativePath, size: file.size }) } as Response;
    });

    render(
      <FileUploadDropzone
        nodes={[localNode]}
        initialNodeId="node_local"
        initialRelativeDir="docs"
        title="上传"
        description="上传文件"
        submitLabel="选择文件"
        pathLabel="上传目录路径"
        onUploadComplete={onUploadComplete}
      />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["ok"], "ok.txt"), new File(["bad"], "bad.txt"), new File(["ok2"], "later.txt")] },
    });

    await waitFor(() => expect(screen.getByText("上传完成 2/3 个文件，1 个失败")).toBeInTheDocument());
    expect(onUploadComplete).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/bad\.txt/)).toHaveTextContent("失败：磁盘空间不足");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

});
