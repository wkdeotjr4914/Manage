"use client";

import { useState, type ReactNode } from "react";
import { Plus, List, GanttChartSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { DataTable, type Column } from "./DataTable";
import {
  RecordFormModal,
  type FieldDef,
  type FieldValue,
} from "./RecordFormModal";
import type { ActionResult } from "@/server/actions/notes";

/**
 * Generic list + create/edit surface for a PMS submenu. Domain PageClients
 * (client components) supply serializable rows plus the render/field config —
 * which contains functions, so it cannot come from a server component.
 */
export function PmsListPage<T extends { id: string }>({
  projectId,
  title,
  description,
  addLabel,
  emptyHint,
  items,
  columns,
  fields,
  toInitial,
  actions,
  toolbar,
  indent,
  renderGantt,
}: {
  projectId: string;
  title: string;
  description?: string;
  addLabel?: string;
  emptyHint?: string;
  items: T[];
  columns: Column<T>[];
  fields: FieldDef[];
  toInitial: (item: T | null) => Record<string, FieldValue>;
  actions: {
    onCreate: (
      payload: Record<string, FieldValue>,
    ) => Promise<ActionResult<{ id: string }>>;
    onUpdate: (
      id: string,
      payload: Record<string, FieldValue>,
    ) => Promise<ActionResult>;
    onDelete: (id: string, projectId: string) => Promise<ActionResult>;
  };
  /** Optional extra controls shown next to 추가. */
  toolbar?: ReactNode;
  indent?: (row: T) => number;
  /** When provided, a 리스트/간트 toggle appears and this renders the chart. */
  renderGantt?: (items: T[]) => ReactNode;
}) {
  // undefined = closed, null = create, T = edit
  const [editing, setEditing] = useState<T | null | undefined>(undefined);
  const [view, setView] = useState<"list" | "gantt">("list");

  return (
    <div className="px-6 py-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            {title}
            <span className="text-xs font-normal text-muted-2">
              {items.length}건
            </span>
          </h2>
          {description && (
            <p className="mt-0.5 text-sm text-muted">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {toolbar}
          {renderGantt && (
            <div className="flex rounded-xl border border-border bg-surface-2 p-0.5">
              <button
                onClick={() => setView("list")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  view === "list"
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-muted hover:text-foreground",
                )}
              >
                <List className="size-3.5" /> 리스트
              </button>
              <button
                onClick={() => setView("gantt")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  view === "gantt"
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-muted hover:text-foreground",
                )}
              >
                <GanttChartSquare className="size-3.5" /> 간트
              </button>
            </div>
          )}
          <Button onClick={() => setEditing(null)}>
            <Plus className="size-4" /> {addLabel ?? "추가"}
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="아직 항목이 없습니다."
          description={emptyHint ?? "추가 버튼으로 첫 항목을 만들어 보세요."}
          action={
            <Button variant="secondary" onClick={() => setEditing(null)}>
              <Plus className="size-4" /> {addLabel ?? "추가"}
            </Button>
          }
        />
      ) : renderGantt && view === "gantt" ? (
        renderGantt(items)
      ) : (
        <DataTable
          columns={columns}
          rows={items}
          onRowClick={(r) => setEditing(r)}
          indent={indent}
        />
      )}

      {editing !== undefined && (
        <RecordFormModal
          title={editing ? `${title} 수정` : `${title} 추가`}
          fields={fields}
          initial={toInitial(editing)}
          projectId={projectId}
          itemId={editing ? editing.id : null}
          onCreate={actions.onCreate}
          onUpdate={actions.onUpdate}
          onDelete={actions.onDelete}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}
