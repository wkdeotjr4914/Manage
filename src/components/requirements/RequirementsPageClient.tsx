"use client";

import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { PmsListPage } from "@/components/pms/PmsListPage";
import type { Column } from "@/components/pms/DataTable";
import type { FieldDef, FieldValue } from "@/components/pms/RecordFormModal";
import { REQUIREMENT_CATEGORIES, REQUIREMENT_ACCEPTANCES } from "@/lib/theme";
import {
  createRequirement,
  updateRequirement,
  deleteRequirement,
} from "@/server/actions/requirements";

export type RequirementItem = {
  id: string;
  category: string;
  classif: string | null;
  rfpNo: string | null;
  subNo: string | null;
  name: string;
  subName: string | null;
  detail: string | null;
  acceptance: string;
  output: string | null;
  requestDate: string;
  dueDate: string;
  targetDate: string;
  updatedBy: string | null;
};

const toOptions = (arr: string[]) => arr.map((v) => ({ value: v, label: v }));

function DateText({ v }: { v: string }) {
  return (
    <span className="whitespace-nowrap text-muted-2">
      {v ? formatDate(v) : "-"}
    </span>
  );
}

const columns: Column<RequirementItem>[] = [
  { header: "구분", cell: (r) => <Badge>{r.category}</Badge> },
  {
    header: "RFP No.",
    cell: (r) => <span className="text-muted">{r.rfpNo || "-"}</span>,
  },
  {
    header: "요구사항 명칭",
    cell: (r) => (
      <div>
        <div className="font-medium text-foreground">{r.name}</div>
        {r.subName && <div className="text-xs text-muted-2">{r.subName}</div>}
      </div>
    ),
  },
  {
    header: "수용여부",
    cell: (r) => <span className="text-muted">{r.acceptance}</span>,
  },
  { header: "요청일", cell: (r) => <DateText v={r.requestDate} /> },
  { header: "기한", cell: (r) => <DateText v={r.dueDate} /> },
  { header: "목표일", cell: (r) => <DateText v={r.targetDate} /> },
];

const fields: FieldDef[] = [
  { key: "name", label: "요구사항 명칭", kind: "text", full: true, required: true },
  { key: "subName", label: "요구사항 세부명칭", kind: "text", full: true },
  {
    key: "category",
    label: "구분",
    kind: "select",
    options: toOptions(REQUIREMENT_CATEGORIES),
  },
  {
    key: "acceptance",
    label: "수용여부",
    kind: "select",
    options: toOptions(REQUIREMENT_ACCEPTANCES),
  },
  { key: "classif", label: "요구사항 분류", kind: "text" },
  { key: "output", label: "산출물", kind: "text" },
  { key: "rfpNo", label: "RFP No.", kind: "text" },
  { key: "subNo", label: "Sub No.", kind: "text" },
  { key: "detail", label: "요구사항 세부내용", kind: "textarea", rows: 4 },
  { key: "requestDate", label: "요청일", kind: "date" },
  { key: "dueDate", label: "처리 기한", kind: "date" },
  { key: "targetDate", label: "완료 목표일", kind: "date" },
  { key: "updatedBy", label: "최종수정자", kind: "text" },
];

const toInitial = (
  item: RequirementItem | null,
): Record<string, FieldValue> => ({
  category: item?.category ?? "기능",
  acceptance: item?.acceptance ?? "수용",
  classif: item?.classif ?? "",
  rfpNo: item?.rfpNo ?? "",
  subNo: item?.subNo ?? "",
  output: item?.output ?? "",
  name: item?.name ?? "",
  subName: item?.subName ?? "",
  detail: item?.detail ?? "",
  requestDate: item?.requestDate ?? "",
  dueDate: item?.dueDate ?? "",
  targetDate: item?.targetDate ?? "",
  updatedBy: item?.updatedBy ?? "",
});

export function RequirementsPageClient({
  projectId,
  items,
}: {
  projectId: string;
  items: RequirementItem[];
}) {
  return (
    <PmsListPage
      projectId={projectId}
      title="요구사항 정의"
      description="과업 요구사항을 정의하고 요청일·기한·목표일을 관리합니다."
      items={items}
      columns={columns}
      fields={fields}
      toInitial={toInitial}
      actions={{
        onCreate: createRequirement,
        onUpdate: updateRequirement,
        onDelete: deleteRequirement,
      }}
    />
  );
}
