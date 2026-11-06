---
spec_id: 001-task-list-and-create-form-on-the-root
title: Task list and create form on the root page, talking to the Task API
status: draft
priority: P1
shape: web-nextjs
parent: ika100-demo/taskboard4-gitops:001-persistent-tasks-in-postgres-with-a-web
---

# 001 — Task list and create form on the root page, talking to the Task API

## Problem

The taskboard4 Task API can create and list tasks, but it keeps them in process memory: every restart or redeploy wipes them, and the API cannot run more than one instance without each instance seeing different tasks. The only way to use tasks today is to call the API by hand; the web app still shows the template starter page and does not talk to the API. People who want to record what needs doing therefore have nowhere durable to put it and no screen to work in. This feature keeps tasks in a Postgres database owned by the system, so they survive restarts and are shared by every API instance, and lets people see and create tasks in the web app.

## System context

Slice of the system plan `001-persistent-tasks-in-postgres-with-a-web` in `ika100-demo/taskboard4-gitops` for `taskboard4-web` (web-nextjs). The system criteria and the contract below are binding: every criterion of this spec implements one of them and names it: `(system AC-<NNN>.<n>)`.

### System criteria

- **AC-001.6** Given tasks "A", "B" and "C" were created in that order (through the web app or the API), when a person opens the web app's root URL, then the page lists the three tasks in creation order, oldest first, each showing its title and its due date as stored in the form `YYYY-MM-DD` (for example "2026-12-31"), or "No due date" when it has none.
- **AC-001.7** Given no task exists, when a person opens the web app's root URL, then the page shows the message "No tasks yet" and the form to create a task.
- **AC-001.8** Given the web app's root URL is open, when a person enters the title "Buy milk", leaves the due date empty and submits, then "Buy milk" appears in the list with "No due date" without the person reloading the page, the form is cleared, and `GET /tasks` on the API returns a task titled "Buy milk" with `due_date` `null`.
- **AC-001.9** Given the web app's root URL is open, when a person enters the title "File taxes", picks the due date 31 December 2026 and submits, then the task appears in the list with the due date "2026-12-31" and `GET /tasks` returns it with `due_date` `"2026-12-31"`; a due date in the past is accepted the same way.
- **AC-001.10** Given the web app's root URL is open, when a person submits with an empty title or a title of only spaces, then the message "Title is required" is shown next to the title field and no task is created; when a person types a title, then the field accepts at most 200 characters.
- **AC-001.11** Given the Task API is unreachable or answers with an error, when a person opens the web app's root URL, then the page still loads and shows "Tasks could not be loaded. Please try again later." instead of the list.
- **AC-001.12** Given the Task API is unreachable or answers with an error, when a person submits a valid task, then the page shows "The task could not be saved. Please try again.", keeps the entered title and due date in the form, and no task is added to the list.

### Contract

The Task API (`taskboard4-api`) serves the web app's Next.js server. In dev the base URL is
`TASKBOARD4_API_URL=http://taskboard4-api`. The request/response contract of component spec
001-create-and-list-tasks is unchanged; this plan adds the `503` outcome and the readiness behaviour.

**Task object** (JSON): `{"id": string, "title": string, "due_date": string | null}`. `id` is a non-empty
opaque string (a UUID today; callers must not parse it). `title` is trimmed, 1 to 200 characters.
`due_date` is `"YYYY-MM-DD"` or `null`. No other fields; callers ignore unknown fields if any appear.

### `POST /tasks`

- Request: `Content-Type: application/json`, body `{"title": string, "due_date": string | null}`;
  `due_date` may be omitted (same as `null`). The web app sends `due_date: null` for an empty date field.
- `201 Created`: body is the created Task object, title trimmed.
- `422 Unprocessable Entity`: validation failed, no task stored. Body is FastAPI's standard
  `{"detail": [{"loc": ["body", "<field>"], "msg": string, "type": string}, ...]}`; `loc[-1]` names the
  offending field (`title` or `due_date`). An invalid JSON body also answers `422`. Validation runs before
  the database is touched, so `422` is returned even while the database is down.
- `503 Service Unavailable`: the database is unreachable or did not answer in time; no task stored. Body
  `{"detail": "database unavailable"}`.

### `GET /tasks`

- `200 OK`: a bare JSON array of Task objects, oldest first (creation order across all instances); `[]`
  when there are none. No pagination.
- `503 Service Unavailable`: the database is unreachable or did not answer in time. Body
  `{"detail": "database unavailable"}`.

### Probes (platform, not the web app)

- `GET /health`: `200 {"status": "ok"}` whenever the process runs; never touches the database.
- `GET /ready`: `200 {"status": "ready"}` when `SELECT 1` succeeds; `503 {"status": "not ready"}` when it
  fails or times out.

### Errors

- Error bodies are JSON with a `detail` key: a list of validation entries for `422`, a string for `503`
  and for unexpected `500`s.
- The web app maps outcomes as follows. `GET /tasks`: only `200` with a JSON array counts as success; any
  other status (`503`, `500`, `404`, ...), a malformed body, a connection error or a timeout shows "Tasks
  could not be loaded. Please try again later." `POST /tasks`: only `201` with a Task object counts as
  success; any other status (including `422`, which cannot happen after the web app's own title check,
  and `503`), a malformed body, a connection error or a timeout shows "The task could not be saved.
  Please try again." with the form kept and nothing added to the list.
- A caller treats any status this contract does not list exactly like `503`: a failure, with no
  assumption that a task was or was not stored. The web app does not retry automatically.
- The web app logs the failure on its server (status or error kind, no task content beyond the id);
  error details from the API are never shown to the person.

### Timeouts

- **Web server -> API:** `GET /tasks` and `POST /tasks` each with a 5 s total timeout (connect plus
  response); on timeout the call counts as failed (see Errors). No retries.
- **API -> Postgres:** connect timeout 3 s, statement timeout 5 s, waiting for a pooled connection at most
  2 s; any of them expiring answers `503`. Together the API answers within 10 s in the worst case
  (AC-001.4); in practice an unreachable database answers in about 3 s.
- **`/ready`:** the database check uses a 0.5 s timeout so the probe answers within the kubelet's default
  1 s probe timeout; on expiry it reports `503 not ready`.
- **Database down:** the API keeps running (liveness stays green), answers `503` on task calls, and is
  taken out of the Service by readiness. With both instances not ready, the Service has no endpoints and
  the web app's calls fail fast with a connection error, which it treats as above. When the database
  returns, the next request opens a fresh connection; no restart is needed (AC-001.5).
- **API down or slow:** the web page still renders within the 5 s budget with the load message
  (AC-001.11); a create shows the save message (AC-001.12).

### Provided by the system

The gitops part of this plan wires these for this repo; rely on them, do not ask for them again:

- env `TASKBOARD4_API_URL=http://taskboard4-api`

### Notes for this repo

The API base URL comes from the server-side env variable TASKBOARD4_API_URL (in dev
`http://taskboard4-api`); the browser never calls the API directly. Replace the template starter
page at `/`.

## Stories

As a person using taskboard4, I want the web app's root page to list every task with its due date, oldest first, so that I can see what needs doing without calling the API by hand.

As a person using taskboard4, I want to create a task with a title and an optional due date from that page and see it appear right away, so that I can record new work where I see it.

As a person using taskboard4, I want a clear message when tasks cannot be loaded or saved, with what I typed kept, so that I know to try again and lose nothing.

## Acceptance criteria

- **AC-001.1** Given the Task API's `GET /tasks` answers `200` with tasks "A" (no due date), "B" (`due_date` `"2026-12-31"`) and "C" in that order, when a person opens the web app's root URL, then the page lists exactly "A", "B", "C" in that order, "A" showing "No due date", "B" showing "2026-12-31"; a task object with additional unknown fields is listed the same way. (system AC-001.6)
- **AC-001.2** Given the deployed web app, when a person opens its root URL, then the page loads with the create form (a title field, a due date field and a submit control) and either a task list or the message "No tasks yet", and no longer shows the template starter page. (system AC-001.6) (smoke)
- **AC-001.3** Given the Task API's `GET /tasks` answers `200` with `[]`, when a person opens the web app's root URL, then the page shows "No tasks yet" and the create form. (system AC-001.7)
- **AC-001.4** Given the root page is open, when a person enters the title "Buy milk", leaves the due date empty and submits, then the Task API receives one `POST /tasks` with body `{"title": "Buy milk", "due_date": null}`, "Buy milk" appears at the end of the list with "No due date" without a page reload, both fields are emptied, and after a reload the task is still listed. (system AC-001.8) (smoke)
- **AC-001.5** Given the root page shows "No tasks yet", when a person creates a task successfully, then "No tasks yet" disappears and the list shows the new task. (system AC-001.8)
- **AC-001.6** Given the root page is open, when a person enters the title "File taxes", picks the due date 31 December 2026 and submits, then the Task API receives `POST /tasks` with `due_date` `"2026-12-31"` and the task appears in the list showing "2026-12-31"; when the picked date is in the past (for example 1 January 2020), then it is sent and shown the same way ("2020-01-01") with no warning. (system AC-001.9)
- **AC-001.7** Given the root page is open, when a person submits with an empty title or a title of only spaces (with or without a due date), then "Title is required" is shown next to the title field, no `POST /tasks` reaches the Task API and the list is unchanged. (system AC-001.10)
- **AC-001.8** Given "Title is required" is shown, when the person enters a valid title and the task is saved, then the message disappears. (system AC-001.10)
- **AC-001.9** Given the root page is open, when a person types or pastes 201 characters into the title field, then the field holds only the first 200 characters, and submitting sends those 200 characters as the title. (system AC-001.10)
- **AC-001.10** Given the Task API's `GET /tasks` answers `503`, `500` or `404`, answers `200` with a body that is not a JSON array of task objects, refuses the connection, or does not answer within 5 seconds, when a person opens the web app's root URL, then the page loads (HTTP `200`) within 7 seconds and shows "Tasks could not be loaded. Please try again later." in place of the list, the create form is still shown, and no API error detail (such as "database unavailable") appears on the page. (system AC-001.11)
- **AC-001.11** Given the Task API is unreachable, when the web app's readiness endpoint `/api/ready` and liveness endpoint `/api/health` are called, then both still answer `200`. (system AC-001.11)
- **AC-001.12** Given the root page is open and the Task API's `POST /tasks` answers `503`, `500` or `422`, answers `201` with a body that is not a task object, refuses the connection, or does not answer within 5 seconds, when a person submits the title "Buy milk" with due date 31 December 2026, then within 7 seconds the page shows "The task could not be saved. Please try again.", the title field still holds "Buy milk" and the due date field 2026-12-31, the list is unchanged, exactly one `POST /tasks` was sent (no automatic retry), and no API error detail appears on the page. (system AC-001.12)
- **AC-001.13** Given "The task could not be saved. Please try again." is shown, when the person submits again and the Task API answers `201`, then the message disappears, the task is added to the list and the form is cleared. (system AC-001.12)
- **AC-001.14** Given the root page is used to list and create tasks, when the browser's network requests are inspected, then none goes to the Task API's address: every request goes to the web app's own origin. (system AC-001.6)
- **AC-001.15** Given a load or save against the Task API fails (as in AC-001.10 or AC-001.12), when the web app's server log is read, then it holds one entry for that failure naming the HTTP status or the error kind (connection error, timeout, malformed body) and not the task's title or due date. (system AC-001.11, AC-001.12)
- **AC-001.16** Given the root page shows "Tasks could not be loaded. Please try again later." (as in AC-001.10), when a person creates a task and the Task API answers `201`, then the load message stays, the created task is shown below it in a list of its own (title and due date or "No due date"), and the form is cleared. (system AC-001.11, AC-001.8)

## Non-goals

- Editing, completing, deleting or opening a single task.
- Filtering, searching, sorting options or paginating the list.
- Live updates: a task created elsewhere appears only after the page is reloaded.
- Sign-in, users or per-user lists.
- Due times or time zones, and any date format other than `YYYY-MM-DD`.
- Automatic retries of failed loads or saves, and a "retry" button: the person reloads or submits again.
- Showing field-level messages from the API's `422` answer: the web app's own title check is the only field message.
- Keeping the template starter page anywhere in the app.

## Open questions

- ~~When the list could not be loaded (AC-001.10) and the person then creates a task successfully, what should the page show?~~ Answered: keep the load message and show the created task below it in a list of its own, see AC-001.16.
- ~~Confirm: a task created in the web app is added at the end of the list (oldest first, as on reload), not at the top.~~ Answered: yes, see AC-001.4.
- ~~Confirm: "No tasks yet" disappears once the first task is created on the page.~~ Answered: yes, see AC-001.5.
- ~~Confirm: "Title is required" and the save failure message disappear after the next successful save.~~ Answered: yes, see AC-001.8 and AC-001.13.
- ~~Confirm: the page answers within 7 seconds while the API does not respond (the contract's 5 s API timeout plus 2 s for rendering).~~ Answered: yes, 7 seconds, see AC-001.10 and AC-001.12.

## Decisions taken during the ship

- Page content after a failed load followed by a successful create: the load message stays and the created task is shown below it in a list of its own (AC-001.16).
- Position of a newly created task: appended at the end of the list, oldest first as on reload (AC-001.4).
- "No tasks yet" after the first create on the page: it disappears (AC-001.5).
- "Title is required" and the save failure message after the next successful save: both disappear (AC-001.8, AC-001.13).
- Page response time while the API does not respond: within 7 seconds, the 5 s API timeout plus 2 s for rendering (AC-001.10, AC-001.12).

## Changelog

- 2026-11-06 created
- 2026-11-06 amended: answered all open questions with the suggested answers; added AC-001.16 (a task created after a failed load is shown below the load message); added "Decisions taken during the ship".
