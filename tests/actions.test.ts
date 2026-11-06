import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTaskAction } from "@/app/actions";

const BASE = "http://task-api.test";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("TASKBOARD4_API_URL", BASE);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function sentBody(): unknown {
  return JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
}

describe("createTaskAction", () => {
  it("AC-001.4 posts the title with a null due date and returns the created task", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "7", title: "Buy milk", due_date: null }, 201));
    const result = await createTaskAction({ title: "Buy milk", due_date: null });
    expect(result).toEqual({ ok: true, task: { id: "7", title: "Buy milk", due_date: null } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBody()).toEqual({ title: "Buy milk", due_date: null });
  });

  it("AC-001.4 turns an empty or missing due date into null", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "7", title: "Buy milk", due_date: null }, 201));
    await createTaskAction({ title: "Buy milk", due_date: "" });
    expect(sentBody()).toEqual({ title: "Buy milk", due_date: null });
    fetchMock.mockClear();
    await createTaskAction({ title: "Buy milk" } as { title: string; due_date: string | null });
    expect(sentBody()).toEqual({ title: "Buy milk", due_date: null });
  });

  it("AC-001.6 passes a future and a past due date through unchanged", async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => jsonResponse({ id: "7", ...JSON.parse(String(init.body)) }, 201));
    expect(await createTaskAction({ title: "File taxes", due_date: "2026-12-31" })).toEqual({
      ok: true,
      task: { id: "7", title: "File taxes", due_date: "2026-12-31" },
    });
    expect(await createTaskAction({ title: "Old", due_date: "2020-01-01" })).toEqual({
      ok: true,
      task: { id: "7", title: "Old", due_date: "2020-01-01" },
    });
  });

  it.each(["", "   ", "\t \n"])("AC-001.7 answers title_required without calling the API for %j", async (title) => {
    expect(await createTaskAction({ title, due_date: null })).toEqual({ ok: false, error: "title_required" });
    expect(await createTaskAction({ title, due_date: "2026-12-31" })).toEqual({ ok: false, error: "title_required" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AC-001.9 sends a 200 character title unchanged and does not trim it", async () => {
    const title = "x".repeat(200);
    fetchMock.mockResolvedValue(jsonResponse({ id: "7", title, due_date: null }, 201));
    await createTaskAction({ title, due_date: null });
    expect((sentBody() as { title: string }).title).toBe(title);
    fetchMock.mockClear();
    await createTaskAction({ title: "  padded  ", due_date: null });
    expect((sentBody() as { title: string }).title).toBe("  padded  ");
  });

  it.each([503, 500, 422])("AC-001.12 answers save_failed without API detail when the API answers %i", async (status) => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "database unavailable" }, status));
    const result = await createTaskAction({ title: "Buy milk", due_date: "2026-12-31" });
    expect(result).toEqual({ ok: false, error: "save_failed" });
    expect(JSON.stringify(result)).not.toContain("database unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("AC-001.12 answers save_failed when the connection fails or the body is not a task", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await createTaskAction({ title: "Buy milk", due_date: null })).toEqual({ ok: false, error: "save_failed" });
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "" }, 201));
    expect(await createTaskAction({ title: "Buy milk", due_date: null })).toEqual({ ok: false, error: "save_failed" });
  });

  it("AC-001.13 succeeds again after an earlier failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 503));
    expect(await createTaskAction({ title: "Buy milk", due_date: null })).toEqual({ ok: false, error: "save_failed" });
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "8", title: "Buy milk", due_date: null }, 201));
    expect(await createTaskAction({ title: "Buy milk", due_date: null })).toEqual({
      ok: true,
      task: { id: "8", title: "Buy milk", due_date: null },
    });
  });
});
