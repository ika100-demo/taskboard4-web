import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import HomePage, { dynamic } from "@/app/page";

vi.mock("@/app/actions", () => ({ createTaskAction: vi.fn() }));
vi.mock("@/app/_lib/tasks-api", () => ({
  listTasks: vi.fn(async () => ({ ok: true, tasks: [{ id: "1", title: "Buy milk", due_date: null }] })),
}));

describe("HomePage", () => {
  it("is rendered per request", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("renders the task board with the loaded tasks", async () => {
    render(await HomePage());
    expect(screen.getByRole("heading", { level: 1, name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByText("Buy milk")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Create task" })).toBeInTheDocument();
  });
});
