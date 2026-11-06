import { expect, test, type Page } from "@playwright/test";

import { control, receivedPosts, type Behaviour } from "./helpers/stub";

// These specs drive the locally started app against the stub Task API; they do not run against a deployment.
test.skip(!!process.env.SMOKE_BASE_URL, "needs the local stub Task API");

const LOAD_MESSAGE = "Tasks could not be loaded. Please try again later.";
const SAVE_MESSAGE = "The task could not be saved. Please try again.";

test.beforeEach(async ({ request }) => {
  await control(request, { reset: true });
});

const main = (page: Page) => page.getByRole("main");
const titleField = (page: Page) => main(page).getByLabel("Title");
const dueField = (page: Page) => main(page).getByLabel("Due date");
const addButton = (page: Page) => main(page).getByRole("button", { name: "Add task" });
const taskItems = (page: Page) => main(page).getByRole("list", { name: "Tasks" }).getByRole("listitem");

test("AC-001.1 lists the API's tasks in order with their due dates", async ({ page, request }) => {
  await control(request, {
    store: [
      { id: "1", title: "A", due_date: null },
      { id: "2", title: "B", due_date: "2026-12-31" },
      { id: "3", title: "C", due_date: null, extra: "ignored" } as never,
    ],
  });
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(taskItems(page)).toHaveCount(3);
  await expect(taskItems(page).nth(0)).toContainText("A");
  await expect(taskItems(page).nth(0)).toContainText("No due date");
  await expect(taskItems(page).nth(1)).toContainText("B");
  await expect(taskItems(page).nth(1)).toContainText("2026-12-31");
  await expect(taskItems(page).nth(2)).toContainText("C");
});

test("AC-001.2 the root page shows the create form and not the starter page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "taskboard4-web" })).toHaveCount(0);
  await expect(titleField(page)).toBeVisible();
  await expect(dueField(page)).toBeVisible();
  await expect(addButton(page)).toBeVisible();
  await expect(main(page).getByText("No tasks yet")).toBeVisible();
});

test("AC-001.3 an empty list shows No tasks yet and the form", async ({ page, request }) => {
  await control(request, { store: [] });
  await page.goto("/");
  await expect(main(page).getByText("No tasks yet")).toBeVisible();
  await expect(main(page).getByRole("form", { name: "Create task" })).toBeVisible();
});

test("AC-001.4 creating a task posts it once, appends it without reload and persists", async ({ page, request }) => {
  await control(request, { store: [{ id: "1", title: "A", due_date: null }] });
  await page.goto("/");
  await titleField(page).fill("Buy milk");
  await addButton(page).click();
  await expect(taskItems(page)).toHaveCount(2);
  await expect(taskItems(page).nth(1)).toContainText("Buy milk");
  await expect(taskItems(page).nth(1)).toContainText("No due date");
  await expect(titleField(page)).toHaveValue("");
  await expect(dueField(page)).toHaveValue("");
  const posts = await receivedPosts(request);
  expect(posts).toHaveLength(1);
  expect(JSON.parse(posts[0].body)).toEqual({ title: "Buy milk", due_date: null });
  await page.reload();
  await expect(taskItems(page)).toHaveCount(2);
  await expect(taskItems(page).nth(1)).toContainText("Buy milk");
});

test("AC-001.5 No tasks yet disappears after the first task is created", async ({ page }) => {
  await page.goto("/");
  await expect(main(page).getByText("No tasks yet")).toBeVisible();
  await titleField(page).fill("First");
  await addButton(page).click();
  await expect(taskItems(page)).toHaveCount(1);
  await expect(main(page).getByText("No tasks yet")).toHaveCount(0);
});

test("AC-001.6 sends the picked date, future or past, and shows it as stored", async ({ page, request }) => {
  await page.goto("/");
  await titleField(page).fill("File taxes");
  await dueField(page).fill("2026-12-31");
  await addButton(page).click();
  await expect(taskItems(page)).toHaveCount(1);
  await expect(taskItems(page).nth(0)).toContainText("2026-12-31");
  await titleField(page).fill("Old");
  await dueField(page).fill("2020-01-01");
  await addButton(page).click();
  await expect(taskItems(page)).toHaveCount(2);
  await expect(taskItems(page).nth(1)).toContainText("2020-01-01");
  const posts = await receivedPosts(request);
  expect(posts.map((p) => JSON.parse(p.body).due_date)).toEqual(["2026-12-31", "2020-01-01"]);
  await expect(main(page).getByRole("alert")).toHaveCount(0);
});

for (const [label, title, due] of [
  ["empty", "", ""],
  ["spaces", "   ", ""],
  ["spaces with a due date", "   ", "2026-12-31"],
] as const) {
  test(`AC-001.7 a title of ${label} shows Title is required and posts nothing`, async ({ page, request }) => {
    await control(request, { store: [{ id: "1", title: "A", due_date: null }] });
    await page.goto("/");
    await titleField(page).fill(title);
    if (due) await dueField(page).fill(due);
    await addButton(page).click();
    await expect(main(page).getByText("Title is required")).toBeVisible();
    await expect(taskItems(page)).toHaveCount(1);
    expect(await receivedPosts(request)).toHaveLength(0);
  });
}

test("AC-001.8 Title is required disappears after a valid task is saved", async ({ page }) => {
  await page.goto("/");
  await addButton(page).click();
  await expect(main(page).getByText("Title is required")).toBeVisible();
  await titleField(page).fill("Buy milk");
  await addButton(page).click();
  await expect(taskItems(page)).toHaveCount(1);
  await expect(main(page).getByText("Title is required")).toHaveCount(0);
});

test("AC-001.9 the title field holds at most 200 characters and 200 are sent", async ({ page, request }) => {
  await page.goto("/");
  await titleField(page).focus();
  await page.keyboard.insertText("x".repeat(201));
  expect((await titleField(page).inputValue()).length).toBe(200);
  await addButton(page).click();
  await expect(taskItems(page)).toHaveCount(1);
  const posts = await receivedPosts(request);
  expect(posts).toHaveLength(1);
  expect(JSON.parse(posts[0].body).title).toBe("x".repeat(200));
});

const loadFailures: [string, Behaviour][] = [
  ["503", { status: 503, body: { detail: "database unavailable" } }],
  ["500", { status: 500, body: { detail: "database unavailable" } }],
  ["404", { status: 404, body: { detail: "database unavailable" } }],
  ["a body that is not an array", { status: 200, body: { detail: "database unavailable" } }],
  ["a body with an invalid task", { status: 200, body: [{ id: "1" }] }],
  ["a dropped connection", { destroy: true }],
];
for (const [label, behaviour] of loadFailures) {
  test(`AC-001.10 shows the load message and the form when GET /tasks gives ${label}`, async ({ page, request }) => {
    await control(request, { list: behaviour });
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(main(page).getByRole("status")).toHaveText(LOAD_MESSAGE);
    await expect(main(page).getByRole("form", { name: "Create task" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("database unavailable");
  });
}

test("AC-001.10 a GET /tasks that never answers still gives the page within 7 seconds", async ({ page, request }) => {
  test.setTimeout(30_000);
  await control(request, { list: { hang: true } });
  const started = Date.now();
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(main(page).getByRole("status")).toHaveText(LOAD_MESSAGE);
  expect(Date.now() - started).toBeLessThan(7000);
  await expect(main(page).getByRole("form", { name: "Create task" })).toBeVisible();
});

test("AC-001.11 the probes answer 200 while the Task API fails", async ({ request }) => {
  await control(request, { list: { destroy: true } });
  expect((await request.get("/api/ready")).status()).toBe(200);
  expect((await request.get("/api/health")).status()).toBe(200);
});

const saveFailures: [string, Behaviour][] = [
  ["503", { status: 503, body: { detail: "database unavailable" } }],
  ["500", { status: 500, body: { detail: "database unavailable" } }],
  ["422", { status: 422, body: { detail: "database unavailable" } }],
  ["201 with a body that is not a task", { status: 201, body: { detail: "database unavailable" } }],
  ["a dropped connection", { destroy: true }],
];
for (const [label, behaviour] of saveFailures) {
  test(`AC-001.12 shows the save error and keeps the input when POST /tasks gives ${label}`, async ({ page, request }) => {
    await control(request, { store: [{ id: "1", title: "A", due_date: null }], create: behaviour });
    await page.goto("/");
    await titleField(page).fill("Buy milk");
    await dueField(page).fill("2026-12-31");
    await addButton(page).click();
    await expect(main(page).getByRole("alert")).toHaveText(SAVE_MESSAGE);
    await expect(titleField(page)).toHaveValue("Buy milk");
    await expect(dueField(page)).toHaveValue("2026-12-31");
    await expect(taskItems(page)).toHaveCount(1);
    await expect(page.locator("body")).not.toContainText("database unavailable");
    expect(await receivedPosts(request)).toHaveLength(1);
  });
}

test("AC-001.12 a POST /tasks that never answers gives the save error within 7 seconds", async ({ page, request }) => {
  test.setTimeout(30_000);
  await control(request, { create: { hang: true } });
  await page.goto("/");
  await titleField(page).fill("Buy milk");
  await dueField(page).fill("2026-12-31");
  const started = Date.now();
  await addButton(page).click();
  await expect(main(page).getByRole("alert")).toHaveText(SAVE_MESSAGE, { timeout: 7000 });
  expect(Date.now() - started).toBeLessThan(7000);
  await expect(titleField(page)).toHaveValue("Buy milk");
  await expect(dueField(page)).toHaveValue("2026-12-31");
  expect(await receivedPosts(request)).toHaveLength(1);
});

test("AC-001.13 submitting again after a failure saves the task and clears the message", async ({ page, request }) => {
  await control(request, { create: { status: 503, body: {} } });
  await page.goto("/");
  await titleField(page).fill("Buy milk");
  await addButton(page).click();
  await expect(main(page).getByRole("alert")).toHaveText(SAVE_MESSAGE);
  await control(request, { create: null });
  await addButton(page).click();
  await expect(taskItems(page)).toHaveCount(1);
  await expect(taskItems(page).nth(0)).toContainText("Buy milk");
  await expect(main(page).getByRole("alert")).toHaveCount(0);
  await expect(titleField(page)).toHaveValue("");
});

test("AC-001.14 the browser talks only to the web app's own origin", async ({ page, baseURL }) => {
  const origin = new URL(baseURL as string).origin;
  const foreign: string[] = [];
  page.on("request", (req) => {
    if (/^https?:/.test(req.url()) && new URL(req.url()).origin !== origin) foreign.push(req.url());
  });
  await page.goto("/");
  await titleField(page).fill("Buy milk");
  await addButton(page).click();
  await expect(taskItems(page)).toHaveCount(1);
  await page.reload();
  await expect(taskItems(page)).toHaveCount(1);
  expect(foreign).toEqual([]);
});

test("AC-001.16 keeps the load message and shows created tasks in a list below it", async ({ page, request }) => {
  await control(request, { list: { status: 503, body: {} } });
  await page.goto("/");
  await expect(main(page).getByRole("status")).toHaveText(LOAD_MESSAGE);
  await titleField(page).fill("Buy milk");
  await addButton(page).click();
  await expect(taskItems(page)).toHaveCount(1);
  await expect(taskItems(page).nth(0)).toContainText("Buy milk");
  await expect(taskItems(page).nth(0)).toContainText("No due date");
  await expect(main(page).getByRole("status")).toHaveText(LOAD_MESSAGE);
  await expect(titleField(page)).toHaveValue("");
});
