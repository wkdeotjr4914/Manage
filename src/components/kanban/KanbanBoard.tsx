"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCard, type TaskData } from "./TaskCard";
import { TASK_STATUS_ORDER, type TaskStatusKey } from "@/lib/theme";
import { moveTask, deleteTask } from "@/server/actions/tasks";

type Grouped = Record<TaskStatusKey, TaskData[]>;

function group(tasks: TaskData[]): Grouped {
  const g = Object.fromEntries(
    TASK_STATUS_ORDER.map((s) => [s, [] as TaskData[]]),
  ) as Grouped;
  for (const t of [...tasks].sort((a, b) => a.order - b.order)) {
    const s = t.status as TaskStatusKey;
    (g[s] ??= []).push(t);
  }
  return g;
}

const isColumnId = (id: string): id is TaskStatusKey =>
  (TASK_STATUS_ORDER as string[]).includes(id);

export function KanbanBoard({
  projectId,
  initialTasks,
}: {
  projectId: string;
  initialTasks: TaskData[];
}) {
  const router = useRouter();
  const [columns, setColumns] = useState<Grouped>(() => group(initialTasks));
  const [activeId, setActiveId] = useState<string | null>(null);

  // Mirror latest columns in a ref so drag-end reads post-drag-over state
  // (React may not have committed the setColumns from onDragOver into `columns`).
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  // Resync when the server sends fresh data (after refresh / mutations).
  useEffect(() => {
    setColumns(group(initialTasks));
  }, [initialTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const findContainer = (
    id: string,
    cols: Grouped = columns,
  ): TaskStatusKey | null => {
    if (isColumnId(id)) return id;
    for (const s of TASK_STATUS_ORDER) {
      if (cols[s].some((t) => t.id === id)) return s;
    }
    return null;
  };

  const activeTask = activeId
    ? Object.values(columns)
        .flat()
        .find((t) => t.id === activeId) ?? null
    : null;

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    const from = findContainer(activeIdStr);
    const to = findContainer(overIdStr);
    if (!from || !to || from === to) return;

    setColumns((prev) => {
      const fromItems = prev[from];
      const toItems = prev[to];
      const activeIndex = fromItems.findIndex((t) => t.id === activeIdStr);
      if (activeIndex < 0) return prev;
      const moved = { ...fromItems[activeIndex], status: to };

      let insertAt = toItems.length;
      if (!isColumnId(overIdStr)) {
        const overIndex = toItems.findIndex((t) => t.id === overIdStr);
        if (overIndex >= 0) insertAt = overIndex;
      }
      return {
        ...prev,
        [from]: fromItems.filter((t) => t.id !== activeIdStr),
        [to]: [...toItems.slice(0, insertAt), moved, ...toItems.slice(insertAt)],
      };
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    // Read the freshest state (onDragOver may have moved the card across columns).
    const current = columnsRef.current;
    const container = findContainer(activeIdStr, current);
    if (!container) return;

    // Reorder within the destination column when dropped over a sibling task.
    let list = current[container];
    if (!isColumnId(overIdStr)) {
      const oldIndex = list.findIndex((t) => t.id === activeIdStr);
      const newIndex = list.findIndex((t) => t.id === overIdStr);
      if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
        list = arrayMove(list, oldIndex, newIndex);
      }
    }

    const idx = list.findIndex((t) => t.id === activeIdStr);
    const prevOrder = list[idx - 1]?.order;
    const nextOrder = list[idx + 1]?.order;
    const newOrder =
      prevOrder != null && nextOrder != null
        ? (prevOrder + nextOrder) / 2
        : prevOrder != null
          ? prevOrder + 1000
          : nextOrder != null
            ? nextOrder - 1000
            : 1000;

    const finalList = list.map((t) =>
      t.id === activeIdStr ? { ...t, order: newOrder, status: container } : t,
    );
    setColumns((prev) => ({ ...prev, [container]: finalList }));

    void moveTask({ taskId: activeIdStr, toStatus: container, newOrder }).then(
      () => router.refresh(),
    );
  }

  function handleDelete(id: string) {
    setColumns((prev) => {
      const copy = { ...prev };
      for (const s of TASK_STATUS_ORDER) {
        copy[s] = copy[s].filter((t) => t.id !== id);
      }
      return copy;
    });
    void deleteTask(id).then(() => router.refresh());
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto p-6">
        {TASK_STATUS_ORDER.map((s) => (
          <KanbanColumn
            key={s}
            status={s}
            tasks={columns[s]}
            projectId={projectId}
            onDelete={handleDelete}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
