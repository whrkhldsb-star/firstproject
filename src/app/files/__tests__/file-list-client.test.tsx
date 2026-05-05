import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FileListClient, type FileProp, type FolderProp } from "../file-list-client";

const pushMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}));

vi.mock("../delete-confirm-button", () => ({
  DeleteConfirmButton: (props: { fileEntryId: string; entryName: string }) =>
    React.createElement("button", { type: "button", "data-testid": "delete-btn", "data-file-entry-id": props.fileEntryId }, `删除 ${props.entryName}`),
}));

vi.mock("../rename-inline-form", () => ({
  RenameInlineForm: (props: { fileEntryId: string; currentName: string; entryType: string }) =>
    React.createElement(
      "button",
      { type: "button", "data-testid": "rename-btn", "data-entry-type": props.entryType, "data-file-entry-id": props.fileEntryId },
      `重命名 ${props.currentName}`,
    ),
}));

vi.mock("../move-inline-form", () => ({
  MoveInlineForm: (props: { fileEntryId: string; name: string }) =>
    React.createElement("button", { type: "button", "data-testid": "move-btn", "data-file-entry-id": props.fileEntryId }, `移动 ${props.name}`),
}));

const folder: FolderProp = {
  name: "photos",
  displayName: "photos",
  path: "photos",
  entryId: "dir_1",
  fileCount: 2,
  folderCount: 1,
  sourceKeys: ["node_1"],
  sourceValues: ["本机存储"],
};

const imageFile: FileProp = {
  id: "file_1",
  name: "cover.jpg",
  entryType: "FILE",
  mimeType: "image/jpeg",
  relativePath: "photos/cover.jpg",
  sizeLabel: "10 KB",
  previewable: true,
  directAccessMode: "managed-download",
  directAccessHref: "/api/storage/local?path=photos%2Fcover.jpg",
  directAccessDescription: "受控下载",
  storageNodeId: "node_1",
  storageNodeName: "本机存储",
  storageNodeDriver: "LOCAL",
  updatedAt: "2026-05-04T00:00:00.000Z",
};

function renderFileList() {
  return render(
    <FileListClient
      folders={[folder]}
      files={[imageFile]}
      canEditLocalFiles={true}
      canDelete={true}
      currentPath=""
      searchQuery=""
      onFolderClick={vi.fn()}
      onRefresh={vi.fn()}
    />,
  );
}

describe("FileListClient", () => {
  beforeEach(() => {
    window.localStorage.clear();
    pushMock.mockClear();
    refreshMock.mockClear();
  });

  it("renders thumbnail background only for files and never as a folder overlay", () => {
    window.localStorage.setItem("whrkhldsb-file-view-mode", "grid");

    const { container } = renderFileList();

    expect(screen.getByRole("button", { name: /photos/ })).toBeInTheDocument();
    expect(container.querySelector('[data-testid="folder-thumbnail-overlay"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="file-thumbnail-overlay"] img')).toHaveAttribute(
      "src",
      "/api/storage/local?path=photos%2Fcover.jpg",
    );
  });

  it("persists the selected file view mode and restores it on next render", () => {
    renderFileList();

    const gridButton = screen.getByRole("button", { name: "图标视图" });
    fireEvent.click(gridButton);

    expect(window.localStorage.getItem("whrkhldsb-file-view-mode")).toBe("grid");
    expect(gridButton).toHaveAttribute("aria-pressed", "true");

    renderFileList();
    expect(screen.getAllByRole("button", { name: "图标视图" })[1]).toHaveAttribute("aria-pressed", "true");
  });

  it("supports selecting files across grid view and exposes the batch toolbar", () => {
    window.localStorage.setItem("whrkhldsb-file-view-mode", "grid");
    renderFileList();

    fireEvent.click(screen.getByLabelText("选择 cover.jpg"));

    expect(screen.getByText("已选 1 个文件")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "批量删除" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "批量移动" })).toBeInTheDocument();
  });

});
