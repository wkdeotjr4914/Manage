"use client";

import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { PmsListPage } from "@/components/pms/PmsListPage";
import { ProgressBar } from "@/components/pms/ProgressBar";
import type { Column } from "@/components/pms/DataTable";
import type { FieldDef, FieldValue } from "@/components/pms/RecordFormModal";
import {
  REQUIREMENT_SPEC_STATUSES,
  REQUIREMENT_SPEC_STATUS_ORDER,
  IMPORTANCE_LEVELS,
  IMPORTANCE_ORDER,
  REQUIREMENT_SPEC_SYSTEM_TYPES,
  type RequirementSpecStatusKey,
  type ImportanceKey,
} from "@/lib/theme";
import {
  createRequirementSpec,
  updateRequirementSpec,
  deleteRequirementSpec,
} from "@/server/actions/requirementSpecs";

export type RequirementSpecItem = {
  id: string;
  iaId: string | null;
  systemType: string;
  status: RequirementSpecStatusKey;
  menuPath: string | null;
  name: string;
  detail: string | null;
  review: string | null;
  confirmed: boolean;
  importance: ImportanceKey;
  requester: string | null;
  receiver: string | null;
  requestDate: string;
  dueDate: string;
  targetDate: string;
  progress: number;
};

const statusOptions = REQUIREMENT_SPEC_STATUS_ORDER.map((k) => ({
  value: k,
  label: REQUIREMENT_SPEC_STATUSES[k].label,
}));
const importanceOptions = IMPORTANCE_ORDER.map((k) => ({
  value: k,
  label: IMPORTANCE_LEVELS[k].label,
}));
const systemTypeOptions = REQUIREMENT_SPEC_SYSTEM_TYPES.map((v) => ({
  value: v,
  label: v,
}));

const columns: Column<RequirementSpecItem>[] = [
  {
    header: "구분",
    cell: (r) => <span className="text-muted">{r.systemType}</span>,
  },
  {
    header: "요구사항명",
    cell: (r) => (
      <div>
        <div className="font-medium text-foreground">{r.name}</div>
        {r.menuPath && (
          <div className="text-xs text-muted-2">{r.menuPath}</div>
        )}
      </div>
    ),
  },
  {
    header: "중요도",
    cell: (r) => (
      <Badge color={IMPORTANCE_LEVELS[r.importance].color}>
        {IMPORTANCE_LEVELS[r.importance].label}
      </Badge>
    ),
  },
  {
    header: "진행상태",
    cell: (r) => (
      <Badge color={REQUIREMENT_SPEC_STATUSES[r.status].color}>
        {REQUIREMENT_SPEC_STATUSES[r.status].label}
      </Badge>
    ),
  },
  { header: "진척률", cell: (r) => <ProgressBar value={r.progress} /> },
  {
    header: "처리 기한",
    cell: (r) => (
      <span className="whitespace-nowrap text-muted-2">
        {r.dueDate ? formatDate(r.dueDate) : "-"}
      </span>
    ),
  },
];

const fields: FieldDef[] = [
  { key: "name", label: "요구사항명", kind: "text", full: true, required: true },
  {
    key: "menuPath",
    label: "메뉴명(경로)",
    kind: "text",
    full: true,
    placeholder: "예. 관리자 > 회원관리 > 회원목록",
  },
  {
    key: "systemType",
    label: "시스템 구분",
    kind: "select",
    options: systemTypeOptions,
  },
  { key: "status", label: "진행상태", kind: "select", options: statusOptions },
  {
    key: "importance",
    label: "중요도",
    kind: "select",
    options: importanceOptions,
  },
  { key: "iaId", label: "IA ID", kind: "text" },
  { key: "requester", label: "요청자", kind: "text" },
  { key: "receiver", label: "접수자", kind: "text" },
  { key: "requestDate", label: "요청일자", kind: "date" },
  { key: "dueDate", label: "처리 기한", kind: "date" },
  { key: "targetDate", label: "완료 목표일자", kind: "date" },
  { key: "progress", label: "진척률(%)", kind: "number", min: 0, max: 100 },
  { key: "confirmed", label: "확정됨", kind: "checkbox" },
  { key: "detail", label: "상세 요구사항", kind: "textarea", rows: 4 },
  { key: "review", label: "검토 사항", kind: "textarea", rows: 3 },
];

const toInitial = (
  item: RequirementSpecItem | null,
): Record<string, FieldValue> => ({
  iaId: item?.iaId ?? "",
  systemType: item?.systemType ?? "선택",
  status: item?.status ?? "PENDING",
  menuPath: item?.menuPath ?? "",
  name: item?.name ?? "",
  detail: item?.detail ?? "",
  review: item?.review ?? "",
  confirmed: item?.confirmed ?? false,
  importance: item?.importance ?? "MEDIUM",
  requester: item?.requester ?? "",
  receiver: item?.receiver ?? "",
  requestDate: item?.requestDate ?? "",
  dueDate: item?.dueDate ?? "",
  targetDate: item?.targetDate ?? "",
  progress: String(item?.progress ?? 0),
});

export function RequirementSpecsPageClient({
  projectId,
  items,
}: {
  projectId: string;
  items: RequirementSpecItem[];
}) {
  return (
    <PmsListPage
      projectId={projectId}
      title="요구사항 명세서"
      description="상세 요구사항을 명세하고 요청/처리/완료 일정과 진척률을 관리합니다."
      items={items}
      columns={columns}
      fields={fields}
      toInitial={toInitial}
      actions={{
        onCreate: createRequirementSpec,
        onUpdate: updateRequirementSpec,
        onDelete: deleteRequirementSpec,
      }}
    />
  );
}
