"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Link2, User, Trash2 } from "lucide-react";
import { TASK_PRIORITIES, type TaskPriorityKey } from "@/lib/theme";
import { formatDate, tint } from "@/lib/utils";

export type TaskData = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: TaskPriorityKey;
  order: number;
  assignee: { name: string | null } | null;
  dueDate: string | null;
  noteCount: number;
};

export function TaskCard({
  task,
  onDelete,
  overlay,
}: {
  task: TaskData;
  onDelete?: (id: string) => void;
  overlay?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { type: "task" } });

  const priority = TASK_PRIORITIES[task.priority];

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging && !overlay ? 0.35 : 1,
      }}
      className={`group rounded-lg border border-border bg-surface-2 p-3 ${
        overlay ? "rotate-2 shadow-2xl ring-1 ring-primary/40" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab touch-none text-muted-2 hover:text-muted active:cursor-grabbing"
          aria-label="드래그"
        >
          <GripVertical className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug text-foreground">
            {task.title}
          </p>
          {task.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted">
              {task.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span
              className="rounded border px-1.5 py-0.5 font-medium"
              style={tint(priority.color)}
            >
              {priority.label}
            </span>
            {task.assignee?.name && (
              <span className="inline-flex items-center gap-1 text-muted-2">
                <User className="size-3" />
                {task.assignee.name}
              </span>
            )}
            {task.noteCount > 0 && (
              <span className="inline-flex items-center gap-1 text-muted-2">
                <Link2 className="size-3" />
                {task.noteCount}
              </span>
            )}
            {task.dueDate && (
              <span className="text-muted-2">{formatDate(task.dueDate)}</span>
            )}
          </div>
        </div>
        {onDelete && !overlay && (
          <button
            onClick={() => onDelete(task.id)}
            className="shrink-0 rounded p-0.5 text-muted-2 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
            aria-label="태스크 삭제"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
