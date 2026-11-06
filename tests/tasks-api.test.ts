import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { API_TIMEOUT_MS, createTask, isTask, listTasks } from "@/app/_lib/tasks-api";

const BASE = "http://task-api.test";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function timeoutError(): Error {
  const error = new Error("The operation was aborted due to timeout");
  error.name = "TimeoutError";
  return error;
}

let fetchMock: ReturnType<typeof vi.fn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("TASKBOARD4_API_URL", BASE);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function loggedEntries(): Record<string, unknown>[] {
  return errorSpy.mock.calls.map((call: unknown[]) => {
    const first = call[0];
    return (typeof first === "string" ? JSON.parse(first) : first) as Record<string, unknown>;
  });
}

describe("isTask", () => {
  it("AC-001.1 accepts a task with or without a due date and ignores unknown fields", () => {
    expect(isTask({ id: "1", title: "A", due_date: null })).toBe(true);
    expect(isTask({ id: "2", title: "B", due_date: "2026-12-31", extra: 1 })).toBe(true);
  });

  it("AC-001.10 rejects values that are not valid task objects", () => {
    expect(isTask(null)).toBe(false);
    expect(isTask("task")).toBe(false);
    expect(isTask({ id: "", title: "A", due_date: null })).toBe(false);
    expect(isTask({ id: 1, title: "A", due_date: null })).toBe(false);
    expect(isTask({ id: "1", title: 5, due_date: null })).toBe(false);
    expect(isTask({ id: "1", title: "A" })).toBe(false);
    expect(isTask({ id: "1", title: "A", due_date: "31.12.2026" })).toBe(false);
    expect(isTask({ id: "1", title: "A", due_date: "2026-12-31T00:00:00Z" })).toBe(false);
  });
});

describe("listTasks", () => {
  it("AC-001.1 returns the tasks in order, mapped to exactly id, title and due_date", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        { id: "1", title: "A", due_date: null },
        { id: "2", title: "B", due_date: "2026-12-31", created_at: "x", flag: true },
        { id: "3", title: "C", due_date: null },
      ]),
    );
    const result = await listTasks();
    expect(result).toEqual({
      ok: true,
      tasks: [
        { id: "1", title: "A", due_date: null },
        { id: "2", title: "B", due_date: "2026-12-31" },
        { id: "3", title: "C", due_date: null },
      ],
    });
    expect(Object.keys((result as { tasks: object[] }).tasks[1]).sort()).toEqual(["due_date", "id", "title"]);
  });

  it("AC-001.3 returns an empty list for an empty array", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    expect(await listTasks()).toEqual({ ok: true, tasks: [] });
  });

  it("AC-001.10 calls GET {base}/tasks uncached with a 5 second timeout, stripping a trailing slash", async () => {
    vi.stubEnv("TASKBOARD4_API_URL", `${BASE}/`);
    fetchMock.mockResolvedValue(jsonResponse([]));
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    await listTasks();
    expect(API_TIMEOUT_MS).toBe(5000);
    expect(timeoutSpy).toHaveBeenCalledWith(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string | URL, RequestInit | undefined];
    expect(String(url)).toBe(`${BASE}/tasks`);
    expect(init?.cache).toBe("no-store");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.method === undefined || init.method === "GET").toBe(true);
  });

  it.each([503, 500, 404])("AC-001.10 fails without throwing when the API answers %i", async (status) => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "database unavailable" }, status));
    expect(await listTasks()).toEqual({ ok: false });
  });

  it("AC-001.10 fails when the body is not a JSON array of task objects", async () => {
    for (const body of [{ tasks: [] }, "text", null, [{ id: "1" }], [{ id: "1", title: "A", due_date: null }, 5]]) {
      fetchMock.mockResolvedValueOnce(jsonResponse(body));
      expect(await listTasks()).toEqual({ ok: false });
    }
    fetchMock.mockResolvedValueOnce(new Response("<html>not json</html>", { status: 200 }));
    expect(await listTasks()).toEqual({ ok: false });
  });

  it("AC-001.10 fails when the connection is refused or times out", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await listTasks()).toEqual({ ok: false });
    fetchMock.mockRejectedValueOnce(timeoutError());
    expect(await listTasks()).toEqual({ ok: false });
  });

  it("AC-001.10 fails when TASKBOARD4_API_URL is unset or empty", async () => {
    vi.stubEnv("TASKBOARD4_API_URL", "");
    expect(await listTasks()).toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("createTask", () => {
  it("AC-001.4 sends exactly one POST /tasks with the JSON body and returns the created task", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "9", title: "Buy milk", due_date: null, extra: 1 }, 201));
    const result = await createTask({ title: "Buy milk", due_date: null });
    expect(result).toEqual({ ok: true, task: { id: "9", title: "Buy milk", due_date: null } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string | URL, RequestInit];
    expect(String(url)).toBe(`${BASE}/tasks`);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({ title: "Buy milk", due_date: null });
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("AC-001.6 sends the due date as given", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "9", title: "File taxes", due_date: "2026-12-31" }, 201));
    await createTask({ title: "File taxes", due_date: "2026-12-31" });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ title: "File taxes", due_date: "2026-12-31" });
  });

  it.each([503, 500, 422])("AC-001.12 fails without throwing and without retry when the API answers %i", async (status) => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "database unavailable" }, status));
    expect(await createTask({ title: "Buy milk", due_date: "2026-12-31" })).toEqual({ ok: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("AC-001.12 fails when the API answers 200 instead of 201", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "9", title: "Buy milk", due_date: null }, 200));
    expect(await createTask({ title: "Buy milk", due_date: null })).toEqual({ ok: false });
  });

  it("AC-001.12 fails when 201 carries a body that is not a task object", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }, 201));
    expect(await createTask({ title: "Buy milk", due_date: null })).toEqual({ ok: false });
    fetchMock.mockResolvedValueOnce(new Response("created", { status: 201 }));
    expect(await createTask({ title: "Buy milk", due_date: null })).toEqual({ ok: false });
  });

  it("AC-001.12 fails when the connection is refused or times out", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await createTask({ title: "Buy milk", due_date: null })).toEqual({ ok: false });
    fetchMock.mockRejectedValueOnce(timeoutError());
    expect(await createTask({ title: "Buy milk", due_date: null })).toEqual({ ok: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("failure log", () => {
  it("AC-001.15 logs one JSON line with op, kind and status for an HTTP failure", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "database unavailable" }, 503));
    await listTasks();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(loggedEntries()[0]).toEqual({
      level: "error",
      msg: "task api call failed",
      op: "list_tasks",
      kind: "http_status",
      status: 503,
    });
  });

  it("AC-001.15 names the error kind for connection errors, timeouts and malformed bodies", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await listTasks();
    fetchMock.mockRejectedValueOnce(timeoutError());
    await listTasks();
    fetchMock.mockResolvedValueOnce(jsonResponse({ nope: 1 }));
    await listTasks();
    const entries = loggedEntries();
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ op: "list_tasks", kind: "connection_error" });
    expect(entries[0]).not.toHaveProperty("status");
    expect(entries[1]).toMatchObject({ op: "list_tasks", kind: "timeout" });
    expect(entries[2]).toMatchObject({ op: "list_tasks", kind: "malformed_body", status: 200 });
  });

  it("AC-001.15 classifies a timeout while reading the body as timeout", async () => {
    const response = new Response("[]", { status: 200 });
    vi.spyOn(response, "json").mockRejectedValue(timeoutError());
    vi.spyOn(response, "text").mockRejectedValue(timeoutError());
    fetchMock.mockResolvedValue(response);
    expect(await listTasks()).toEqual({ ok: false });
    expect(loggedEntries()[0]).toMatchObject({ kind: "timeout" });
  });

  it("AC-001.15 logs the create failure without title, due date or API detail", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "database unavailable" }, 500));
    await createTask({ title: "Secret plan", due_date: "2026-12-31" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(loggedEntries()[0]).toEqual({
      level: "error",
      msg: "task api call failed",
      op: "create_task",
      kind: "http_status",
      status: 500,
    });
    const text = JSON.stringify(errorSpy.mock.calls);
    expect(text).not.toContain("Secret plan");
    expect(text).not.toContain("2026-12-31");
    expect(text).not.toContain("database unavailable");
  });

  it("AC-001.15 logs a config failure when the API address is missing", async () => {
    vi.stubEnv("TASKBOARD4_API_URL", "");
    await listTasks();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(loggedEntries()[0]).toMatchObject({ op: "list_tasks", kind: "config" });
  });

  it("AC-001.15 logs nothing for successful calls", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    await listTasks();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "1", title: "A", due_date: null }, 201));
    await createTask({ title: "A", due_date: null });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
