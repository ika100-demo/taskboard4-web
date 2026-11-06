import type { APIRequestContext } from "@playwright/test";

export type Behaviour = { status?: number; body?: unknown; raw?: string; delayMs?: number; destroy?: boolean; hang?: boolean } | null;
export type StubTask = { id: string; title: string; due_date: string | null };
export type Received = { method: string; path: string; body: string };

const stubUrl = () => `http://127.0.0.1:${process.env.STUB_PORT}`;

export async function control(
  request: APIRequestContext,
  settings: { reset?: boolean; store?: StubTask[]; list?: Behaviour; create?: Behaviour },
): Promise<void> {
  const response = await request.post(`${stubUrl()}/__control`, { data: settings });
  if (!response.ok()) throw new Error(`stub control failed: ${response.status()}`);
}

export async function received(request: APIRequestContext): Promise<Received[]> {
  return (await request.get(`${stubUrl()}/__requests`)).json();
}

export async function receivedPosts(request: APIRequestContext): Promise<Received[]> {
  return (await received(request)).filter((r) => r.method === "POST" && r.path === "/tasks");
}
