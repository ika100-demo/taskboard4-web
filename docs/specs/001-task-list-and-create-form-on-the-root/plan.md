---
spec_id: 001-task-list-and-create-form-on-the-root
shape: web-nextjs
spec_hash: b22b366b21ae
summary: Root page lists tasks and creates them through a server-side Task API client and a Server Action
tasks:
  - id: t1
    title: Server-side Task API client and createTaskAction
    files: [app/_lib/tasks-api.ts, app/actions.ts, docs/env-vars.md]
    covers: [AC-001.1, AC-001.4, AC-001.6, AC-001.7, AC-001.9, AC-001.10, AC-001.11, AC-001.12, AC-001.14, AC-001.15]
    parallel_safe: true
    depends_on: []
    done: true
  - id: t2
    title: Replace the starter page with the task board (list, states, create form)
    files: [app/page.tsx, app/_components/task-board.tsx, app/_components/feature-card.tsx, app/_components/icons.tsx, app/globals.css, tests/page.test.tsx, e2e/home.spec.ts]
    covers: [AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.5, AC-001.6, AC-001.7, AC-001.8, AC-001.9, AC-001.10, AC-001.12, AC-001.13, AC-001.14, AC-001.16]
    parallel_safe: false
    depends_on: [t1]
    done: true
---

# Plan — 001 Task list and create form on the root page

Design and binding interfaces: [design.md](design.md). Two levels: t1 (server side) → t2 (page and UI,
imports `Task`, `ListTasksResult` and `createTaskAction` from t1).

## t1 — Server-side Task API client and createTaskAction

**Files:** app/_lib/tasks-api.ts, app/actions.ts, docs/env-vars.md
**Covers:** AC-001.1, AC-001.4, AC-001.6, AC-001.7, AC-001.9, AC-001.10, AC-001.11, AC-001.12, AC-001.14, AC-001.15
**Goal:** one module that owns the contract with `taskboard4-api` (base URL, timeout, validation, outcome
mapping, failure log) and the Server Action the browser uses to create a task, exactly as specified in
design.md "Contract".

**Implementation notes:**
- `app/_lib/tasks-api.ts`: export `Task`, `FailureKind`, `ListTasksResult`, `CreateTaskResult`,
  `API_TIMEOUT_MS = 5000`, `isTask`, `listTasks`, `createTask` with the signatures in design.md. Neither
  function throws.
- Read `process.env.TASKBOARD4_API_URL` inside each call; unset/empty → failure `config`. Strip one trailing
  `/` before appending `/tasks`.
- `fetch` with `cache: "no-store"` and `signal: AbortSignal.timeout(API_TIMEOUT_MS)`; read the body under the
  same signal. No retries.
- List success only for `200` + array of valid Tasks; create success only for `201` + a valid Task. Map each
  task to exactly `{ id, title, due_date }` (unknown fields dropped).
- POST body is `JSON.stringify({ title, due_date })` with `Content-Type: application/json`; `due_date` is
  always present (`null` when empty).
- Classify failures as in the design table and write exactly one `console.error(JSON.stringify({...}))` line
  per failure with `level`, `msg`, `op`, `kind` and `status` (only when a response arrived). Never log title,
  due date, request or response body.
- `app/actions.ts` (`"use server"`): `createTaskAction` returns `title_required` for a blank title without
  calling the API, normalises `""`/missing `due_date` to `null`, passes the title unchanged, maps any
  `createTask` failure to `save_failed`.
- Do not touch `app/api/health/route.ts` or `app/api/ready/route.ts`: they must not call the API
  (AC-001.11).
- `docs/env-vars.md`: add a "Task API" table row for `TASKBOARD4_API_URL` (no default; server-side only; dev
  value `http://taskboard4-api`; never `NEXT_PUBLIC_`).
- Keep coverage of `app/**` above the 80 % gate with unit tests for the client and the action.

**Done when:** the acceptance tests on the API client, the action and the log (AC-001.10, AC-001.12 and
AC-001.15 at unit level, AC-001.11 probes) pass; `devbox run quality` and `devbox run test` are green.

## t2 — Replace the starter page with the task board

**Files:** app/page.tsx, app/_components/task-board.tsx, app/_components/feature-card.tsx,
app/_components/icons.tsx, app/globals.css, tests/page.test.tsx, e2e/home.spec.ts
**Covers:** AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.5, AC-001.6, AC-001.7, AC-001.8, AC-001.9,
AC-001.10, AC-001.12, AC-001.13, AC-001.14, AC-001.16
**Goal:** the root URL shows the task board described in design.md "Page and UI": h1 `Tasks`, the list or
"No tasks yet" or the load message, and the create form with client-side title check and save handling.

**Implementation notes:**
- `app/page.tsx`: async Server Component, `export const dynamic = "force-dynamic"`, `await listTasks()`,
  render `<TaskBoard initial={result} />`. Nothing of the template stays.
- `app/_components/task-board.tsx` (`"use client"`): props `{ initial: ListTasksResult }`; state for tasks,
  `loadFailed`, title, due date, title error, save error; `useTransition` for the pending flag.
- Exact texts, labels, roles and ids from design.md (form `Create task`, labels `Title` / `Due date`, button
  `Add task`, `#title-error`, `role="alert"` save error, `role="status"` load message,
  `<ul aria-label="Tasks">`, `No tasks yet`, `No due date`).
- Title input `maxLength={200}`; due date `type="date"`; show `due_date` verbatim.
- Submit follows the four steps in design.md: blank title → title error and no action call; success →
  append at the end, clear both fields and both errors; failure or rejected action → save error, fields
  kept, list unchanged. Button disabled while pending.
- After a failed load, created tasks go into a `<ul aria-label="Tasks">` below the load message, which
  stays (AC-001.16).
- Delete `app/_components/feature-card.tsx` and `app/_components/icons.tsx` (used only by the starter
  page) and their template-only CSS (`.hero*`, `.grid`, feature card, `.steps`) in `app/globals.css`; add
  board/form styles using the existing tokens; keep the layout free of horizontal scroll at 375 px.
- Rewrite the template tests: `tests/page.test.tsx` renders the page with a mocked `listTasks` (or delete it
  if the acceptance tests already cover the page); `e2e/home.spec.ts` keeps the landmark, 404 and phone
  checks but expects the h1 `Tasks` instead of the starter content and drops the "Check health" link test.
- Do not change `app/layout.tsx`, the probes or `e2e/smoke.spec.ts`.

**Done when:** all acceptance tests for the covered criteria pass (component tests with `@/app/actions`
mocked, e2e against a stub API including the 7 s budget and the no-direct-API-request check of AC-001.14),
the rewritten template tests pass, and `devbox run ci` is green.
