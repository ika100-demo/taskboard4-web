import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTaskAction } from "@/app/actions";
import * as taskBoardModule from "@/app/_components/task-board";

vi.mock("@/app/actions", () => ({ createTaskAction: vi.fn() }));

const action = vi.mocked(createTaskAction);

// The contract names the component but not its export style: accept a named or a default export.
const TaskBoard = (taskBoardModule as unknown as Record<string, typeof taskBoardModule.TaskBoard>).TaskBoard ??
  (taskBoardModule as unknown as { default: typeof taskBoardModule.TaskBoard }).default;

type Initial = { ok: true; tasks: { id: string; title: string; due_date: string | null }[] } | { ok: false };

const loaded = (...tasks: { id: string; title: string; due_date: string | null }[]): Initial => ({ ok: true, tasks });
const failedLoad: Initial = { ok: false };

const LOAD_MESSAGE = "Tasks could not be loaded. Please try again later.";
const SAVE_MESSAGE = "The task could not be saved. Please try again.";

function form() {
  return screen.getByRole("form", { name: "Create task" });
}
function titleInput() {
  return within(form()).getByLabelText("Title") as HTMLInputElement;
}
function dueInput() {
  return within(form()).getByLabelText("Due date") as HTMLInputElement;
}
function fill(title: string, due = "") {
  fireEvent.change(titleInput(), { target: { value: title } });
  fireEvent.change(dueInput(), { target: { value: due } });
}
async function submit() {
  await act(async () => {
    fireEvent.click(within(form()).getByRole("button", { name: "Add task" }));
  });
}
function listItems() {
  return within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem");
}

beforeEach(() => {
  action.mockReset();
});

describe("TaskBoard", () => {
  it("AC-001.1 lists the tasks in order with their due date or No due date", () => {
    render(
      <TaskBoard
        initial={loaded(
          { id: "1", title: "A", due_date: null },
          { id: "2", title: "B", due_date: "2026-12-31" },
          { id: "3", title: "C", due_date: null },
        )}
      />,
    );
    const items = listItems();
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("A");
    expect(items[0]).toHaveTextContent("No due date");
    expect(items[1]).toHaveTextContent("B");
    expect(items[1]).toHaveTextContent("2026-12-31");
    expect(items[1]).not.toHaveTextContent("No due date");
    expect(items[2]).toHaveTextContent("C");
    expect(screen.queryByText("No tasks yet")).not.toBeInTheDocument();
  });

  it("AC-001.2 shows the create form and the Tasks heading instead of the starter page", () => {
    render(<TaskBoard initial={loaded()} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Tasks" })).toBeInTheDocument();
    expect(titleInput()).toHaveAttribute("type", "text");
    expect(titleInput()).toHaveAttribute("name", "title");
    expect(dueInput()).toHaveAttribute("type", "date");
    expect(dueInput()).toHaveAttribute("name", "due_date");
    expect(within(form()).getByRole("button", { name: "Add task" })).toBeInTheDocument();
  });

  it("AC-001.3 shows No tasks yet and the form for an empty list", () => {
    render(<TaskBoard initial={loaded()} />);
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Tasks" })).not.toBeInTheDocument();
    expect(form()).toBeInTheDocument();
  });

  it("AC-001.4 creates a task without due date, appends it, and clears both fields", async () => {
    action.mockResolvedValue({ ok: true, task: { id: "9", title: "Buy milk", due_date: null } });
    render(<TaskBoard initial={loaded({ id: "1", title: "A", due_date: null })} />);
    fill("Buy milk");
    await submit();
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith({ title: "Buy milk", due_date: null });
    await waitFor(() => expect(listItems()).toHaveLength(2));
    expect(listItems()[1]).toHaveTextContent("Buy milk");
    expect(listItems()[1]).toHaveTextContent("No due date");
    expect(titleInput().value).toBe("");
    expect(dueInput().value).toBe("");
  });

  it("AC-001.5 replaces No tasks yet with the list after a successful create", async () => {
    action.mockResolvedValue({ ok: true, task: { id: "9", title: "First", due_date: null } });
    render(<TaskBoard initial={loaded()} />);
    fill("First");
    await submit();
    await waitFor(() => expect(screen.queryByText("No tasks yet")).not.toBeInTheDocument());
    expect(listItems()).toHaveLength(1);
    expect(listItems()[0]).toHaveTextContent("First");
  });

  it("AC-001.6 sends the picked date and shows future and past dates as stored, with no warning", async () => {
    action.mockResolvedValueOnce({ ok: true, task: { id: "9", title: "File taxes", due_date: "2026-12-31" } });
    action.mockResolvedValueOnce({ ok: true, task: { id: "10", title: "Old", due_date: "2020-01-01" } });
    render(<TaskBoard initial={loaded()} />);
    fill("File taxes", "2026-12-31");
    await submit();
    expect(action).toHaveBeenLastCalledWith({ title: "File taxes", due_date: "2026-12-31" });
    await waitFor(() => expect(listItems()).toHaveLength(1));
    fill("Old", "2020-01-01");
    await submit();
    expect(action).toHaveBeenLastCalledWith({ title: "Old", due_date: "2020-01-01" });
    await waitFor(() => expect(listItems()).toHaveLength(2));
    expect(listItems()[0]).toHaveTextContent("2026-12-31");
    expect(listItems()[1]).toHaveTextContent("2020-01-01");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    ["empty", "", ""],
    ["empty with due date", "", "2026-12-31"],
    ["only spaces", "   ", ""],
    ["only spaces with due date", "   ", "2026-12-31"],
  ])("AC-001.7 shows Title is required and sends nothing for a title that is %s", async (_label, title, due) => {
    render(<TaskBoard initial={loaded({ id: "1", title: "A", due_date: null })} />);
    fill(title, due);
    await submit();
    const error = screen.getByText("Title is required");
    expect(error).toHaveAttribute("id", "title-error");
    expect(titleInput()).toHaveAttribute("aria-invalid", "true");
    expect(titleInput()).toHaveAttribute("aria-describedby", "title-error");
    expect(action).not.toHaveBeenCalled();
    expect(listItems()).toHaveLength(1);
  });

  it("AC-001.8 removes Title is required once a valid title is saved", async () => {
    action.mockResolvedValue({ ok: true, task: { id: "9", title: "Buy milk", due_date: null } });
    render(<TaskBoard initial={loaded()} />);
    await submit();
    expect(screen.getByText("Title is required")).toBeInTheDocument();
    fill("Buy milk");
    await submit();
    await waitFor(() => expect(screen.queryByText("Title is required")).not.toBeInTheDocument());
    expect(titleInput()).not.toHaveAttribute("aria-invalid", "true");
  });

  it("AC-001.9 limits the title field to 200 characters and submits what the field holds", async () => {
    action.mockResolvedValue({ ok: true, task: { id: "9", title: "x".repeat(200), due_date: null } });
    render(<TaskBoard initial={loaded()} />);
    expect(titleInput()).toHaveAttribute("maxlength", "200");
    fill("x".repeat(200));
    await submit();
    expect(action).toHaveBeenCalledWith({ title: "x".repeat(200), due_date: null });
  });

  it("AC-001.10 shows the load message in place of the list, with the form and no API detail", () => {
    render(<TaskBoard initial={failedLoad} />);
    expect(screen.getByRole("status")).toHaveTextContent(LOAD_MESSAGE);
    expect(screen.queryByRole("list", { name: "Tasks" })).not.toBeInTheDocument();
    expect(screen.queryByText("No tasks yet")).not.toBeInTheDocument();
    expect(form()).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("database unavailable");
  });

  it.each([
    ["answers save_failed", () => action.mockResolvedValue({ ok: false, error: "save_failed" })],
    ["rejects", () => action.mockRejectedValue(new Error("network down"))],
  ])("AC-001.12 keeps the input, the list and shows the save error when the action %s", async (_label, arrange) => {
    arrange();
    render(<TaskBoard initial={loaded({ id: "1", title: "A", due_date: null })} />);
    fill("Buy milk", "2026-12-31");
    await submit();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(SAVE_MESSAGE);
    expect(form()).toContainElement(alert);
    expect(titleInput().value).toBe("Buy milk");
    expect(dueInput().value).toBe("2026-12-31");
    expect(listItems()).toHaveLength(1);
    expect(action).toHaveBeenCalledTimes(1);
    expect(document.body).not.toHaveTextContent("network down");
  });

  it("AC-001.12 disables the submit button while a save is pending", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof createTaskAction>>) => void;
    action.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<TaskBoard initial={loaded()} />);
    fill("Buy milk");
    await submit();
    expect(within(form()).getByRole("button", { name: "Add task" })).toBeDisabled();
    await submit();
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ ok: true, task: { id: "9", title: "Buy milk", due_date: null } }));
  });

  it("AC-001.13 clears the save error, adds the task and clears the form on a successful retry", async () => {
    action.mockResolvedValueOnce({ ok: false, error: "save_failed" });
    action.mockResolvedValueOnce({ ok: true, task: { id: "9", title: "Buy milk", due_date: "2026-12-31" } });
    render(<TaskBoard initial={loaded()} />);
    fill("Buy milk", "2026-12-31");
    await submit();
    await screen.findByRole("alert");
    await submit();
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(listItems()).toHaveLength(1);
    expect(listItems()[0]).toHaveTextContent("Buy milk");
    expect(titleInput().value).toBe("");
    expect(dueInput().value).toBe("");
  });

  it("AC-001.16 keeps the load message and lists only the tasks created on the page below it", async () => {
    action.mockResolvedValue({ ok: true, task: { id: "9", title: "Buy milk", due_date: null } });
    render(<TaskBoard initial={failedLoad} />);
    fill("Buy milk");
    await submit();
    await waitFor(() => expect(listItems()).toHaveLength(1));
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(LOAD_MESSAGE);
    const list = screen.getByRole("list", { name: "Tasks" });
    expect(status.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(listItems()[0]).toHaveTextContent("Buy milk");
    expect(listItems()[0]).toHaveTextContent("No due date");
    expect(titleInput().value).toBe("");
    expect(dueInput().value).toBe("");
  });
});
