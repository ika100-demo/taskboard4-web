# Design — 001 Task list and create form on the root page

## Decisions

- **The browser never calls the Task API.** The root page is a Server Component that loads the list on the
  server; creating a task goes through a Next.js **Server Action** (`createTaskAction`), so the browser only
  ever POSTs to the web app's own origin (AC-001.14). A Server Action is used instead of a `/api/tasks`
  route handler: it is the App Router's built-in mutation path, needs no second HTTP contract and keeps the
  API base URL on the server.
- **One server-side API client** (`app/_lib/tasks-api.ts`) owns the contract with `taskboard4-api`: base URL,
  5 s timeout, response validation, outcome mapping and failure logging. The page and the action never call
  `fetch` themselves. It returns result objects and never throws, so a failing API can never reach
  `app/error.tsx` (AC-001.10, AC-001.12).
- **Configuration is read at call time** from `process.env.TASKBOARD4_API_URL` (not captured at module load
  or build time), so one image runs in every environment and tests can point it at a stub server. An unset or
  empty value counts as a failed call (error kind `config`), never as a crash.
- **Probes stay independent of the API.** `/api/health` and `/api/ready` are not changed and must never
  call the Task API: with the API down the web app stays live and ready, and the page shows the load
  message (AC-001.11).
- **The page is rendered per request** (`export const dynamic = "force-dynamic"`, `fetch(..., { cache: "no-store" })`),
  so a reload always shows the current list (AC-001.4).
- **No new dependency.** Validation is a small hand-written type guard; logging is one JSON line via
  `console.error`. No ADR: every choice is local to this feature or follows the existing App Router
  conventions.

## Modules

| Module | Responsibility | New / changed |
|---|---|---|
| `app/_lib/tasks-api.ts` | `Task` type, response validation, `listTasks()`, `createTask()`, timeout, failure logging | new |
| `app/actions.ts` | `"use server"`; `createTaskAction()` re-checks the title and calls `createTask()` | new |
| `app/_components/task-board.tsx` | `"use client"`; list, empty and load-failure states, create form, client title check, save state | new |
| `app/page.tsx` | Server Component: `await listTasks()`, renders `<TaskBoard initial={...} />` | changed (template replaced) |
| `app/_components/feature-card.tsx`, `app/_components/icons.tsx` | template-only components | deleted |
| `app/globals.css` | styles for the board; template-only rules (`.hero`, `.grid`, `.steps`, feature card) removed | changed |
| `docs/env-vars.md` | documents `TASKBOARD4_API_URL` | changed |

## Contract

### Upstream: Task API (binding, from the system plan)

Base URL `TASKBOARD4_API_URL` (dev `http://taskboard4-api`, no trailing slash expected; the client strips
one if present).

- `GET {base}/tasks` → success only for `200` whose body is a JSON array in which every element is a valid
  Task object; anything else is a failure.
- `POST {base}/tasks`, header `Content-Type: application/json`, body exactly
  `{"title": <string>, "due_date": <"YYYY-MM-DD"> | null}` → success only for `201` whose body is a valid
  Task object; anything else (including `422`, `503`, `500`) is a failure.
- Both requests: `cache: "no-store"`, `signal: AbortSignal.timeout(5000)` covering connect, headers and
  body read. No retries.

**Valid Task object:** a JSON object with `id` a non-empty string, `title` a string, `due_date` either
`null` or a string matching `^\d{4}-\d{2}-\d{2}$`. Unknown fields are ignored and dropped: the client maps
each element to exactly `{ id, title, due_date }` (AC-001.1).

### Server-side TypeScript interface (`app/_lib/tasks-api.ts`)

```ts
export type Task = { id: string; title: string; due_date: string | null };

export type FailureKind = "http_status" | "connection_error" | "timeout" | "malformed_body" | "config";

export type ListTasksResult = { ok: true; tasks: Task[] } | { ok: false };
export type CreateTaskResult = { ok: true; task: Task } | { ok: false };

export const API_TIMEOUT_MS = 5000;

export function isTask(value: unknown): value is Task;   // validation rule above
export async function listTasks(): Promise<ListTasksResult>;          // never throws
export async function createTask(input: { title: string; due_date: string | null }): Promise<CreateTaskResult>; // never throws
```

Failure classification (first match wins):

| Situation | `kind` | `status` |
|---|---|---|
| `TASKBOARD4_API_URL` unset or empty | `config` | – |
| `fetch` rejects with an error whose `name` is `TimeoutError` (also while reading the body) | `timeout` | – |
| `fetch` rejects otherwise (refused, DNS, reset) | `connection_error` | – |
| response status not `200` (list) / not `201` (create) | `http_status` | the status |
| body is not JSON or fails validation | `malformed_body` | the status |

### Failure log (AC-001.15)

Exactly one line per failed call, written with `console.error` as a single JSON object:

```json
{"level":"error","msg":"task api call failed","op":"list_tasks","kind":"http_status","status":503}
```

- `op`: `"list_tasks"` or `"create_task"`; `kind`: one of `FailureKind`; `status`: present only when an
  HTTP response arrived.
- Never contains the task title, the due date, the request body or the API's response body. Successful
  calls log nothing.

### Server Action (`app/actions.ts`)

```ts
"use server";
export type CreateTaskActionResult =
  | { ok: true; task: Task }
  | { ok: false; error: "title_required" | "save_failed" };

export async function createTaskAction(input: { title: string; due_date: string | null }): Promise<CreateTaskActionResult>;
```

- `title.trim() === ""` → `{ ok: false, error: "title_required" }` without calling the API (defence in depth;
  the client checks first, AC-001.7).
- `due_date`: `""` or missing becomes `null`; otherwise passed through unchanged (the date input yields
  `YYYY-MM-DD`; past dates are not checked, AC-001.6).
- `title` is sent as entered (not trimmed, not truncated by the server; the API trims) so the 200 characters
  of AC-001.9 arrive unchanged.
- `createTask` failure → `{ ok: false, error: "save_failed" }`. API error details never leave the server.

### Page and UI (what tests select on)

`app/page.tsx` (`dynamic = "force-dynamic"`) calls `listTasks()` and renders
`<TaskBoard initial={result} />` where `initial: ListTasksResult`.

Accessible structure of `TaskBoard` (all texts exact):

- `<h1>`: `Tasks` (the only level-1 heading; the smoke test checks for a visible h1).
- Form: `<form aria-label="Create task">` with
  - title input: label `Title`, `type="text"`, `name="title"`, `maxLength={200}` (the browser truncates typed
    and pasted text to 200 characters, AC-001.9);
  - due date input: label `Due date`, `type="date"`, `name="due_date"`;
  - submit button: `Add task`, disabled while a save is pending (so one submit sends exactly one POST,
    AC-001.12).
- Title error: `Title is required` in an element with `id="title-error"`, rendered right after the title
  input; the input gets `aria-invalid="true"` and `aria-describedby="title-error"` while it shows.
- Save error: `The task could not be saved. Please try again.` in an element with `role="alert"`, inside the
  form.
- List: `<ul aria-label="Tasks">`, one `<li>` per task in order, each containing the title and either the
  `due_date` string as stored (e.g. `2026-12-31`, no reformatting, no time zone conversion) or
  `No due date`.
- Empty: when the load succeeded and the list is empty, `No tasks yet` instead of the `<ul>`.
- Load failure: `Tasks could not be loaded. Please try again later.` in an element with `role="status"`
  instead of the list; no API detail is shown.

State machine of `TaskBoard`:

| State | Shown |
|---|---|
| load ok, ≥1 task | `<ul aria-label="Tasks">` with the loaded tasks |
| load ok, 0 tasks | `No tasks yet` (AC-001.3) |
| load failed, nothing created yet | load message (AC-001.10) |
| load failed, tasks created on the page | load message, then below it `<ul aria-label="Tasks">` holding only the tasks created on this page (AC-001.16) |

Submit:

1. If `title.trim() === ""`: show the title error, call nothing, list unchanged (AC-001.7).
2. Otherwise call `createTaskAction({ title, due_date: dueDate || null })` inside `useTransition`.
3. `ok: true`: append `task` (from the response) at the end of the list, clear both fields, hide the title
   error and the save error; `No tasks yet` disappears (AC-001.4, .5, .8, .13, .16).
4. `ok: false` with `save_failed`, or the action call itself rejects: show the save error, keep both field
   values, list unchanged (AC-001.12). `title_required` shows the title error.

### Timing (AC-001.10, AC-001.12)

The only blocking upstream call per page load or save is one API request capped at 5 s, so a dead or slow
API yields the page (HTTP `200`) or the save error within about 5 s, inside the 7 s budget.

## Testing seams

- Unit tests (Vitest, jsdom) can stub `globalThis.fetch` and set `process.env.TASKBOARD4_API_URL` per test
  to exercise `listTasks`, `createTask` and `createTaskAction`; spy on `console.error` for the log line.
- `TaskBoard` is testable on its own with `vi.mock("@/app/actions")` and an `initial` prop.
- End-to-end tests point `TASKBOARD4_API_URL` at a stub HTTP server; because the variable is read at request
  time, the same build serves every stub.

## Risks

- The template's own tests (`tests/page.test.tsx`, `e2e/home.spec.ts`) assert the starter page and break
  once it is replaced; t2 rewrites them to the new page (they are not acceptance tests).
- `TASKBOARD4_API_URL` is not yet in the `taskboard4-web` entry of the gitops `system.yaml`; the system plan
  wires it. Until then the deployed page shows the load message (handled as `config` failure).
