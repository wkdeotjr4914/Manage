"use client";

import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { PmsListPage } from "@/components/pms/PmsListPage";
import type { Column } from "@/components/pms/DataTable";
import type { FieldDef, FieldValue } from "@/components/pms/RecordFormModal";
import {
  STAFF_GRADES,
  STAFF_GRADE_ORDER,
  type StaffGradeKey,
} from "@/lib/theme";
import {
  createStaffDemand,
  updateStaffDemand,
  deleteStaffDemand,
} from "@/server/actions/staffDemands";
import {
  createStaffMember,
  updateStaffMember,
  deleteStaffMember,
} from "@/server/actions/staffMembers";

export type StaffDemandItem = {
  id: string;
  role: string;
  grade: StaffGradeKey;
  headcount: number;
  note: string | null;
};

export type StaffMemberItem = {
  id: string;
  name: string;
  grade: StaffGradeKey;
  role: string | null;
  company: string | null;
  allocation: number;
  startDate: string;
  endDate: string;
  contact: string | null;
  note: string | null;
};

const gradeOptions = STAFF_GRADE_ORDER.map((k) => ({
  value: k,
  label: STAFF_GRADES[k].label,
}));

function range(start: string, end: string) {
  if (!start && !end) return "-";
  return `${start ? formatDate(start) : "?"} ~ ${end ? formatDate(end) : "?"}`;
}

// ----------------------------------------------------------------------------
// 등급별 요구 vs 투입 요약
// ----------------------------------------------------------------------------
function DiffCell({ value }: { value: number }) {
  const label =
    value < 0 ? `${value} 부족` : value > 0 ? `+${value} 초과` : "충족";
  return (
    <span
      className="font-medium"
      style={{ color: value < 0 ? "#ef4444" : "#10b981" }}
    >
      {label}
    </span>
  );
}

function StaffSummary({
  demands,
  members,
}: {
  demands: StaffDemandItem[];
  members: StaffMemberItem[];
}) {
  const rows = STAFF_GRADE_ORDER.map((g) => {
    const required = demands
      .filter((d) => d.grade === g)
      .reduce((sum, d) => sum + d.headcount, 0);
    const assigned = members.filter((m) => m.grade === g).length;
    return { grade: g, required, assigned, diff: assigned - required };
  });
  const total = rows.reduce(
    (acc, r) => ({
      required: acc.required + r.required,
      assigned: acc.assigned + r.assigned,
      diff: acc.diff + r.diff,
    }),
    { required: 0, assigned: 0, diff: 0 },
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-2">
            <th className="px-3 py-2.5 font-medium">등급</th>
            <th className="px-3 py-2.5 font-medium">요구 인원</th>
            <th className="px-3 py-2.5 font-medium">투입 인원</th>
            <th className="px-3 py-2.5 font-medium">과부족</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.grade}
              className="border-b border-border/60 last:border-0"
            >
              <td className="px-3 py-2.5">
                <Badge color={STAFF_GRADES[r.grade].color}>
                  {STAFF_GRADES[r.grade].label}
                </Badge>
              </td>
              <td className="px-3 py-2.5 text-foreground">{r.required}명</td>
              <td className="px-3 py-2.5 text-foreground">{r.assigned}명</td>
              <td className="px-3 py-2.5">
                <DiffCell value={r.diff} />
              </td>
            </tr>
          ))}
          <tr className="border-t border-border">
            <td className="px-3 py-2.5 font-medium text-muted">합계</td>
            <td className="px-3 py-2.5 font-medium text-foreground">
              {total.required}명
            </td>
            <td className="px-3 py-2.5 font-medium text-foreground">
              {total.assigned}명
            </td>
            <td className="px-3 py-2.5">
              <DiffCell value={total.diff} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 요구 인력 (StaffDemand)
// ----------------------------------------------------------------------------
const demandColumns: Column<StaffDemandItem>[] = [
  {
    header: "직무",
    cell: (r) => <span className="font-medium text-foreground">{r.role}</span>,
  },
  {
    header: "등급",
    cell: (r) => (
      <Badge color={STAFF_GRADES[r.grade].color}>
        {STAFF_GRADES[r.grade].label}
      </Badge>
    ),
  },
  {
    header: "요구 인원",
    cell: (r) => <span className="text-foreground">{r.headcount}명</span>,
  },
  {
    header: "비고",
    cell: (r) => <span className="text-muted">{r.note || "-"}</span>,
  },
];

const demandFields: FieldDef[] = [
  { key: "role", label: "직무", kind: "text", full: true, required: true },
  { key: "grade", label: "등급", kind: "select", options: gradeOptions },
  { key: "headcount", label: "요구 인원", kind: "number", min: 0 },
  { key: "note", label: "비고", kind: "textarea", rows: 2 },
];

const demandToInitial = (
  item: StaffDemandItem | null,
): Record<string, FieldValue> => ({
  role: item?.role ?? "",
  grade: item?.grade ?? "INTERMEDIATE",
  headcount: String(item?.headcount ?? 1),
  note: item?.note ?? "",
});

// ----------------------------------------------------------------------------
// 투입 인력 (StaffMember)
// ----------------------------------------------------------------------------
const memberColumns: Column<StaffMemberItem>[] = [
  {
    header: "이름",
    cell: (r) => <span className="font-medium text-foreground">{r.name}</span>,
  },
  {
    header: "등급",
    cell: (r) => (
      <Badge color={STAFF_GRADES[r.grade].color}>
        {STAFF_GRADES[r.grade].label}
      </Badge>
    ),
  },
  {
    header: "직무",
    cell: (r) => <span className="text-muted">{r.role || "-"}</span>,
  },
  {
    header: "소속",
    cell: (r) => <span className="text-muted">{r.company || "-"}</span>,
  },
  {
    header: "투입률",
    cell: (r) => <span className="text-foreground">{r.allocation}%</span>,
  },
  {
    header: "참여기간",
    cell: (r) => (
      <span className="whitespace-nowrap text-muted-2">
        {range(r.startDate, r.endDate)}
      </span>
    ),
  },
  {
    header: "연락처",
    cell: (r) => <span className="text-muted">{r.contact || "-"}</span>,
  },
];

const memberFields: FieldDef[] = [
  { key: "name", label: "이름", kind: "text", required: true },
  { key: "grade", label: "등급", kind: "select", options: gradeOptions },
  { key: "role", label: "직무", kind: "text" },
  { key: "company", label: "소속/회사", kind: "text" },
  { key: "allocation", label: "투입률(%)", kind: "number", min: 0, max: 100 },
  { key: "startDate", label: "참여 시작일", kind: "date" },
  { key: "endDate", label: "참여 종료일", kind: "date" },
  { key: "contact", label: "연락처", kind: "text" },
  { key: "note", label: "비고", kind: "textarea", rows: 2 },
];

const memberToInitial = (
  item: StaffMemberItem | null,
): Record<string, FieldValue> => ({
  name: item?.name ?? "",
  grade: item?.grade ?? "INTERMEDIATE",
  role: item?.role ?? "",
  company: item?.company ?? "",
  allocation: String(item?.allocation ?? 100),
  startDate: item?.startDate ?? "",
  endDate: item?.endDate ?? "",
  contact: item?.contact ?? "",
  note: item?.note ?? "",
});

// ----------------------------------------------------------------------------
export function StaffingPageClient({
  projectId,
  demands,
  members,
}: {
  projectId: string;
  demands: StaffDemandItem[];
  members: StaffMemberItem[];
}) {
  return (
    <>
      <div className="px-6 pt-5">
        <h2 className="mb-3 text-base font-semibold text-foreground">
          등급별 요구 vs 투입 현황
        </h2>
        <StaffSummary demands={demands} members={members} />
      </div>

      <PmsListPage
        projectId={projectId}
        title="요구 인력"
        description="직무·등급별로 필요한 인원을 계획합니다."
        addLabel="요구 인력 추가"
        items={demands}
        columns={demandColumns}
        fields={demandFields}
        toInitial={demandToInitial}
        actions={{
          onCreate: createStaffDemand,
          onUpdate: updateStaffDemand,
          onDelete: deleteStaffDemand,
        }}
      />

      <PmsListPage
        projectId={projectId}
        title="투입 인력"
        description="프로젝트에 실제로 배정된 인원을 관리합니다."
        addLabel="투입 인력 추가"
        items={members}
        columns={memberColumns}
        fields={memberFields}
        toInitial={memberToInitial}
        actions={{
          onCreate: createStaffMember,
          onUpdate: updateStaffMember,
          onDelete: deleteStaffMember,
        }}
      />
    </>
  );
}
