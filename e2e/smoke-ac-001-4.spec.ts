import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

test.skip(!process.env.SMOKE_BASE_URL, "SMOKE_BASE_URL not set");

// Writes a task with a unique title; it never touches other data. Runs only in dev.
test("AC-001.4 a created task appears without reload, the form is cleared, and it survives a reload @smoke @writes", async ({ page }) => {
  const title = `smoke-${randomUUID()}`;
  await page.goto("/");
  const main = page.getByRole("main");
  await main.getByLabel("Title").fill(title);
  await main.getByRole("button", { name: "Add task" }).click();
  const item = main.getByRole("listitem").filter({ hasText: title });
  await expect(item).toBeVisible();
  await expect(item).toContainText("No due date");
  await expect(main.getByLabel("Title")).toHaveValue("");
  await expect(main.getByLabel("Due date")).toHaveValue("");
  await page.reload();
  await expect(main.getByRole("listitem").filter({ hasText: title })).toBeVisible();
});

// Read-only: the create form is wired up and checks its input before anything is sent.
test("AC-001.4 the create form is present and rejects an empty title without writing @smoke", async ({ page }) => {
  await page.goto("/");
  const main = page.getByRole("main");
  await expect(main.getByRole("form", { name: "Create task" })).toBeVisible();
  await main.getByRole("button", { name: "Add task" }).click();
  await expect(main.getByText("Title is required")).toBeVisible();
});
