import { expect, test } from "@playwright/test";

test.skip(!process.env.SMOKE_BASE_URL, "SMOKE_BASE_URL not set");

// Read-only: runs in every environment.
test("AC-001.2 the root page shows the create form and a task list or No tasks yet, not the starter page @smoke", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const main = page.getByRole("main");
  await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible();
  await expect(main.getByLabel("Title")).toBeVisible();
  await expect(main.getByLabel("Due date")).toBeVisible();
  await expect(main.getByRole("button", { name: "Add task" })).toBeVisible();
  await expect(main.getByRole("list", { name: "Tasks" }).or(main.getByText("No tasks yet"))).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "taskboard4-web" })).toHaveCount(0);
});
