"use client";

import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { PmsListPage } from "@/components/pms/PmsListPage";
import { ProgressBar } from "@/components/pms/ProgressBar";
import { GanttChart, type GanttRow } from "@/components/gantt/GanttChart";
import type { Column } from "@/components/pms/DataTable";
import type { FieldDef, FieldValue } from "@/components/pms/RecordFormModal";
import {
  TASK_STATUSES,
  TASK_STATUS_ORDER,
  TASK_PRIORITIES,
  type TaskStatusKey,
  type TaskPriorityKey,
} from "@/lib/theme";
import {
  createWBSItem,
  updateWBSItem,
  deleteWBSItem,
} from "@/server/actions/wbs";

export type WBSListItem = {
  id: string;
  parentId: string | null;
  code: string | null;
  name: string;
  level: number;
  phase: string | null;
  assignee: string | null;
  priority: TaskPriorityKey;
  status: TaskStatusKey;
  progress: number;
  startDate: string;
  endDate: string;
  planStartDate: string;
  planEndDate: string;
  description: string | null;
};

const priorityOptions = (["LOW", "MEDIUM", "HIGH", "URGENT"] as const).map(
  (k) => ({ value: k, label: TASK_PRIORITIES[k].label }),
);
const statusOptions = TASK_STATUS_ORDER.map((k) => ({
  value: k,
  label: TASK_STATUSES[k].label,
}));

function range(start: string, end: string) {
  if (!start && !end) return "-";
  return `${start ? formatDate(start) : "?"} ~ ${end ? formatDate(end) : "?"}`;
}

const columns: Column<WBSListItem>[] = [
  {
    header: "작업",
    cell: (r) => (
      <div>
        <div className="font-medium text-foreground">{r.name}</div>
        {r.code && <div className="text-xs text-muted-2">{r.code}</div>}
      </div>
    ),
  },
  { header: "단계", cell: (r) => <span className="text-muted">{r.phase || "-"}</span> },
  {
    header: "담당",
    cell: (r) => <span className="text-muted">{r.assignee || "-"}</span>,
  },
  {
    header: "상태",
    cell: (r) => (
      <Badge color={TASK_STATUSES[r.status].color}>
        {TASK_STATUSES[r.status].label}
      </Badge>
    ),
  },
  { header: "진척률", cell: (r) => <ProgressBar value={r.progress} /> },
  {
    header: "기간",
    cell: (r) => (
      <span className="whitespace-nowrap text-muted-2">
        {range(r.startDate, r.endDate)}
      </span>
    ),
  },
];

const toInitial = (item: WBSListItem | null): Record<string, FieldValue> => ({
  parentId: item?.parentId ?? "",
  code: item?.code ?? "",
  name: item?.name ?? "",
  phase: item?.phase ?? "",
  assignee: item?.assignee ?? "",
  priority: item?.priority ?? "MEDIUM",
  status: item?.status ?? "TODO",
  progress: String(item?.progress ?? 0),
  planStartDate: item?.planStartDate ?? "",
  planEndDate: item?.planEndDate ?? "",
  startDate: item?.startDate ?? "",
  endDate: item?.endDate ?? "",
  description: item?.description ?? "",
});

function toGanttRows(items: WBSListItem[]): GanttRow[] {
  return items.map((r) => ({
    id: r.id,
    name: r.name,
    start: r.startDate,
    end: r.endDate,
    progress: r.progress,
    color: TASK_STATUSES[r.status].color,
    level: r.level,
    secondary:
      r.planStartDate && r.planEndDate
        ? { start: r.planStartDate, end: r.planEndDate }
        : null,
  }));
}

export function WbsPageClient({
  projectId,
  items,
}: {
  projectId: string;
  items: WBSListItem[];
}) {
  // Parent picker is built from the current items (config that references data
  // must live in the client component, not the server page).
  const fields: FieldDef[] = [
    { key: "name", label: "작업명", kind: "text", full: true, required: true },
    {
      key: "parentId",
      label: "상위 작업",
      kind: "select",
      options: [
        { value: "", label: "— 최상위 —" },
        ...items.map((i) => ({
          value: i.id,
          label: `${i.code ? `${i.code} ` : ""}${i.name}`,
        })),
      ],
    },
    { key: "code", label: "코드", kind: "text" },
    { key: "phase", label: "단계", kind: "text" },
    { key: "assignee", label: "담당자", kind: "text" },
    { key: "priority", label: "우선순위", kind: "select", options: priorityOptions },
    { key: "status", label: "상태", kind: "select", options: statusOptions },
    { key: "progress", label: "진척률(%)", kind: "number", min: 0, max: 100 },
    { key: "planStartDate", label: "계획 시작일", kind: "date" },
    { key: "planEndDate", label: "계획 종료일", kind: "date" },
    { key: "startDate", label: "실제 시작일", kind: "date" },
    { key: "endDate", label: "실제 종료일", kind: "date" },
    { key: "description", label: "설명", kind: "textarea", rows: 3 },
  ];

  return (
    <PmsListPage
      projectId={projectId}
      title="WBS"
      description="작업 분해 구조를 계층으로 관리하고, 계획·실제 일정을 간트로 확인합니다."
      addLabel="작업 추가"
      items={items}
      columns={columns}
      fields={fields}
      toInitial={toInitial}
      indent={(r) => (r.level - 1) * 16}
      renderGantt={(rows) => <GanttChart rows={toGanttRows(rows)} />}
      actions={{
        onCreate: createWBSItem,
        onUpdate: updateWBSItem,
        onDelete: deleteWBSItem,
      }}
    />
  );
}
