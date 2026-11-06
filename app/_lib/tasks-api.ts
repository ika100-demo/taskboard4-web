export type Task = { id: string; title: string; due_date: string | null };

export type FailureKind = "http_status" | "connection_error" | "timeout" | "malformed_body" | "config";

export type ListTasksResult = { ok: true; tasks: Task[] } | { ok: false };
export type CreateTaskResult = { ok: true; task: Task } | { ok: false };

export const API_TIMEOUT_MS = 5000;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isTask(value: unknown): value is Task {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id !== "" &&
    typeof v.title === "string" &&
    (v.due_date === null || (typeof v.due_date === "string" && DATE_PATTERN.test(v.due_date)))
  );
}

function toTask(value: Task): Task {
  return { id: value.id, title: value.title, due_date: value.due_date };
}

function logFailure(op: "list_tasks" | "create_task", kind: FailureKind, status?: number): void {
  const entry: Record<string, unknown> = { level: "error", msg: "task api call failed", op, kind };
  if (status !== undefined) entry.status = status;
  console.error(JSON.stringify(entry));
}

type CallOutcome = { ok: true; body: unknown } | { ok: false };

async function call(
  op: "list_tasks" | "create_task",
  init: RequestInit,
  expectedStatus: number,
): Promise<CallOutcome> {
  const base = (process.env.TASKBOARD4_API_URL ?? "").trim();
  if (base === "") {
    logFailure(op, "config");
    return { ok: false };
  }
  const url = `${base.endsWith("/") ? base.slice(0, -1) : base}/tasks`;
  const isTimeout = (e: unknown) => e instanceof Error && e.name === "TimeoutError";
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(API_TIMEOUT_MS) });
  } catch (e) {
    logFailure(op, isTimeout(e) ? "timeout" : "connection_error");
    return { ok: false };
  }
  if (response.status !== expectedStatus) {
    logFailure(op, "http_status", response.status);
    return { ok: false };
  }
  try {
    return { ok: true, body: JSON.parse(await response.text()) };
  } catch (e) {
    if (isTimeout(e)) logFailure(op, "timeout");
    else logFailure(op, "malformed_body", response.status);
    return { ok: false };
  }
}

export async function listTasks(): Promise<ListTasksResult> {
  const outcome = await call("list_tasks", { method: "GET" }, 200);
  if (!outcome.ok) return { ok: false };
  const body = outcome.body;
  if (!Array.isArray(body) || !body.every(isTask)) {
    logFailure("list_tasks", "malformed_body", 200);
    return { ok: false };
  }
  return { ok: true, tasks: body.map(toTask) };
}

export async function createTask(input: { title: string; due_date: string | null }): Promise<CreateTaskResult> {
  const outcome = await call(
    "create_task",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: input.title, due_date: input.due_date }),
    },
    201,
  );
  if (!outcome.ok) return { ok: false };
  if (!isTask(outcome.body)) {
    logFailure("create_task", "malformed_body", 201);
    return { ok: false };
  }
  return { ok: true, task: toTask(outcome.body) };
}
