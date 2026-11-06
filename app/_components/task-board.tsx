"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";

import { createTaskAction } from "@/app/actions";
import type { ListTasksResult, Task } from "@/app/_lib/tasks-api";

export type TaskBoardProps = { initial: ListTasksResult };

function TaskList({ tasks }: { tasks: Task[] }) {
  return (
    <ul className="task-list" aria-label="Tasks">
      {tasks.map((task) => (
        <li key={task.id} className="task-item">
          <span className="task-title">{task.title}</span>
          <span className="task-due">{task.due_date ?? "No due date"}</span>
        </li>
      ))}
    </ul>
  );
}

export function TaskBoard({ initial }: TaskBoardProps) {
  const loadFailed = !initial.ok;
  const [tasks, setTasks] = useState<Task[]>(initial.ok ? initial.tasks : []);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [titleError, setTitleError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (title.trim() === "") {
      setTitleError(true);
      return;
    }
    const input = { title, due_date: dueDate || null };
    startTransition(async () => {
      try {
        const result = await createTaskAction(input);
        if (result.ok) {
          setTasks((current) => [...current, result.task]);
          setTitle("");
          setDueDate("");
          setTitleError(false);
          setSaveError(false);
        } else if (result.error === "title_required") {
          setTitleError(true);
        } else {
          setSaveError(true);
        }
      } catch {
        setSaveError(true);
      }
    });
  }

  return (
    <div className="board">
      <h1 className="board-title">Tasks</h1>

      <form className="task-form" aria-label="Create task" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="task-title">Title</label>
          <input
            id="task-title"
            type="text"
            name="title"
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={titleError ? "true" : undefined}
            aria-describedby={titleError ? "title-error" : undefined}
          />
          {titleError ? (
            <p id="title-error" className="field-error">
              Title is required
            </p>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="task-due-date">Due date</label>
          <input
            id="task-due-date"
            type="date"
            name="due_date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          Add task
        </button>
        {saveError ? (
          <p role="alert" className="form-error">
            The task could not be saved. Please try again.
          </p>
        ) : null}
      </form>

      {loadFailed ? (
        <p role="status" className="notice">
          Tasks could not be loaded. Please try again later.
        </p>
      ) : null}
      {tasks.length > 0 ? <TaskList tasks={tasks} /> : !loadFailed ? <p className="notice">No tasks yet</p> : null}
    </div>
  );
}
