"use client";

import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/SourceBadge";
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
  createPmsTask,
  updatePmsTask,
  deletePmsTask,
} from "@/server/actions/pmsTasks";

export type PmsTaskItem = {
  id: string;
  code: string | null;
  name: string;
  phase: string | null;
  assignee: string | null;
  priority: TaskPriorityKey;
  status: TaskStatusKey;
  progress: number;
  startDate: string;
  endDate: string;
  description: string | null;
  source: string | null;
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

const columns: Column<PmsTaskItem>[] = [
  {
    header: "업무명",
    cell: (r) => (
      <div>
        <div className="font-medium text-foreground">{r.name}</div>
        {r.code && <div className="text-xs text-muted-2">{r.code}</div>}
      </div>
    ),
  },
  {
    header: "단계",
    cell: (r) => <span className="text-muted">{r.phase || "-"}</span>,
  },
  {
    header: "담당",
    cell: (r) => <span className="text-muted">{r.assignee || "-"}</span>,
  },
  {
    header: "우선순위",
    cell: (r) => (
      <Badge color={TASK_PRIORITIES[r.priority].color}>
        {TASK_PRIORITIES[r.priority].label}
      </Badge>
    ),
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
  { header: "출처", cell: (r) => <SourceBadge source={r.source} /> },
];

const fields: FieldDef[] = [
  { key: "name", label: "업무명", kind: "text", full: true, required: true },
  { key: "code", label: "코드", kind: "text" },
  { key: "phase", label: "단계", kind: "text" },
  { key: "assignee", label: "담당자", kind: "text" },
  { key: "priority", label: "우선순위", kind: "select", options: priorityOptions },
  { key: "status", label: "상태", kind: "select", options: statusOptions },
  { key: "progress", label: "진척률(%)", kind: "number", min: 0, max: 100 },
  { key: "startDate", label: "시작일", kind: "date" },
  { key: "endDate", label: "종료일", kind: "date" },
  { key: "description", label: "설명", kind: "textarea", rows: 3 },
];

const toInitial = (item: PmsTaskItem | null): Record<string, FieldValue> => ({
  code: item?.code ?? "",
  name: item?.name ?? "",
  phase: item?.phase ?? "",
  assignee: item?.assignee ?? "",
  priority: item?.priority ?? "MEDIUM",
  status: item?.status ?? "TODO",
  progress: String(item?.progress ?? 0),
  startDate: item?.startDate ?? "",
  endDate: item?.endDate ?? "",
  description: item?.description ?? "",
});

function toGanttRows(items: PmsTaskItem[]): GanttRow[] {
  return items.map((r) => ({
    id: r.id,
    name: r.name,
    start: r.startDate,
    end: r.endDate,
    progress: r.progress,
    color: TASK_STATUSES[r.status].color,
  }));
}

export function PmsTasksPageClient({
  projectId,
  items,
}: {
  projectId: string;
  items: PmsTaskItem[];
}) {
  return (
    <PmsListPage
      projectId={projectId}
      title="업무 TASK"
      description="실행 업무를 담당·일정·진척률과 함께 관리하고 간트로 확인합니다."
      addLabel="업무 추가"
      items={items}
      columns={columns}
      fields={fields}
      toInitial={toInitial}
      renderGantt={(rows) => <GanttChart rows={toGanttRows(rows)} />}
      actions={{
        onCreate: createPmsTask,
        onUpdate: updatePmsTask,
        onDelete: deletePmsTask,
      }}
    />
  );
}
