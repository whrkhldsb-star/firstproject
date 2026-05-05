"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/authorization";
import { reviewCommandRequest } from "@/lib/command/service";

export type ReviewActionState = {
  error?: string;
  success?: string;
};

export async function reviewCommandAction(_prevState: ReviewActionState | null, formData: FormData) {
  const session = await requirePermission("command:approve");

  try {
    const approved = String(formData.get("decision") ?? "approve") === "approve";
    const commandRequestId = String(formData.get("commandRequestId") ?? "");
    const comment = String(formData.get("comment") ?? "");

    await reviewCommandRequest({
      commandRequestId,
      approverId: session.userId,
      approved,
      comment,
    });

    revalidatePath("/");
    revalidatePath("/servers");
    revalidatePath("/requests");

    return {
      success: approved ? "命令请求已批准并进入执行流。" : "命令请求已拒绝。",
    } satisfies ReviewActionState;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "审批命令请求失败" } satisfies ReviewActionState;
  }
}
