"use server";

import { createTask } from "@/app/_lib/tasks-api";
import type { Task } from "@/app/_lib/tasks-api";

export type CreateTaskActionResult =
  | { ok: true; task: Task }
  | { ok: false; error: "title_required" | "save_failed" };

export async function createTaskAction(input: {
  title: string;
  due_date: string | null;
}): Promise<CreateTaskActionResult> {
  if (typeof input?.title !== "string" || input.title.trim() === "") {
    return { ok: false, error: "title_required" };
  }
  const due_date = typeof input.due_date === "string" && input.due_date !== "" ? input.due_date : null;
  const result = await createTask({ title: input.title, due_date });
  return result.ok ? { ok: true, task: result.task } : { ok: false, error: "save_failed" };
}
