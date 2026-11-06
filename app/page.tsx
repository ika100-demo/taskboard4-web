import { listTasks } from "@/app/_lib/tasks-api";

import { TaskBoard } from "./_components/task-board";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await listTasks();
  return <TaskBoard initial={result} />;
}
