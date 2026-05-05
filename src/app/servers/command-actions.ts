"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/authorization";
import { createCommandRequest } from "@/lib/command/service";

export type CommandActionState = {
  error?: string;
  success?: string;
};

export async function createCommandRequestAction(_prev: CommandActionState | null, formData: FormData) {
  const session = await requirePermission("command:create");

  try {
    const serverIds = formData.getAll("serverIds").map((value) => String(value)).filter(Boolean);
    const submissionMode = String(formData.get("submissionMode") ?? "user");

    await createCommandRequest({
      title: String(formData.get("title") ?? ""),
      command: String(formData.get("command") ?? ""),
      reason: String(formData.get("reason") ?? ""),
      submissionMode: submissionMode === "assistant" ? "assistant" : "user",
      requesterId: session.userId,
      serverIds,
    });

    revalidatePath("/");
    revalidatePath("/servers");
    revalidatePath("/requests");

    return {
      success:
        submissionMode === "assistant"
          ? "命令请求已提交，因属于助手代执行，已进入审批流。"
          : "命令请求已创建并直接进入执行流。",
    } satisfies CommandActionState;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "创建命令请求失败" } satisfies CommandActionState;
  }
}
