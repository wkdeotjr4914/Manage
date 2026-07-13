"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { TaskCard, type TaskData } from "./TaskCard";
import { AddTask } from "./AddTask";
import { TASK_STATUSES, type TaskStatusKey } from "@/lib/theme";

export function KanbanColumn({
  status,
  tasks,
  projectId,
  onDelete,
}: {
  status: TaskStatusKey;
  tasks: TaskData[];
  projectId: string;
  onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { type: "column", status },
  });
  const meta = TASK_STATUSES[status];

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-2xl border border-border bg-surface-2">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="size-2 rounded-full" style={{ backgroundColor: meta.color }} />
        <span className="text-sm font-semibold text-foreground">{meta.label}</span>
        <span className="text-xs text-muted-2">{tasks.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={`flex flex-1 flex-col gap-2 px-2 pb-2 transition-colors ${
          isOver ? "bg-primary/5" : ""
        }`}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} onDelete={onDelete} />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/60 py-6 text-center text-[11px] text-muted-2">
            여기로 드래그
          </div>
        )}

        <AddTask projectId={projectId} status={status} />
      </div>
    </div>
  );
}
