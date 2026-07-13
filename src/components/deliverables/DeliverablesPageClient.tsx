"use client";

import { ExternalLink } from "lucide-react";
import { PmsListPage } from "@/components/pms/PmsListPage";
import type { Column } from "@/components/pms/DataTable";
import type { FieldDef, FieldValue } from "@/components/pms/RecordFormModal";
import {
  createDeliverable,
  updateDeliverable,
  deleteDeliverable,
} from "@/server/actions/deliverables";

export type DeliverableItem = {
  id: string;
  name: string;
  description: string | null;
  templateFile: string | null;
  outputFile: string | null;
  outputLink: string | null;
};

const columns: Column<DeliverableItem>[] = [
  {
    header: "산출물",
    cell: (r) => (
      <div>
        <div className="font-medium text-foreground">{r.name}</div>
        {r.description && (
          <div className="text-xs text-muted-2">{r.description}</div>
        )}
      </div>
    ),
  },
  {
    header: "템플릿",
    cell: (r) => <span className="text-muted">{r.templateFile || "-"}</span>,
  },
  {
    header: "산출물 파일",
    cell: (r) => <span className="text-muted">{r.outputFile || "-"}</span>,
  },
  {
    header: "링크",
    cell: (r) => {
      // Only treat http(s) URLs as links — blocks javascript:/data: hrefs.
      const safe = /^https?:\/\//i.test(r.outputLink ?? "");
      if (safe) {
        return (
          <a
            href={r.outputLink!}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <ExternalLink className="size-3.5" /> 열기
          </a>
        );
      }
      return (
        <span className="text-muted-2">{r.outputLink || "-"}</span>
      );
    },
  },
];

const fields: FieldDef[] = [
  { key: "name", label: "산출물 이름", kind: "text", full: true, required: true },
  { key: "description", label: "설명", kind: "textarea", rows: 3 },
  { key: "templateFile", label: "템플릿 파일", kind: "text" },
  { key: "outputFile", label: "산출물 파일", kind: "text" },
  {
    key: "outputLink",
    label: "산출물 링크(URL)",
    kind: "text",
    full: true,
    placeholder: "https://",
  },
];

const toInitial = (
  item: DeliverableItem | null,
): Record<string, FieldValue> => ({
  name: item?.name ?? "",
  description: item?.description ?? "",
  templateFile: item?.templateFile ?? "",
  outputFile: item?.outputFile ?? "",
  outputLink: item?.outputLink ?? "",
});

export function DeliverablesPageClient({
  projectId,
  items,
}: {
  projectId: string;
  items: DeliverableItem[];
}) {
  return (
    <PmsListPage
      projectId={projectId}
      title="산출물 관리"
      description="프로젝트 산출물과 템플릿·결과 파일·링크를 관리합니다."
      addLabel="산출물 추가"
      items={items}
      columns={columns}
      fields={fields}
      toInitial={toInitial}
      actions={{
        onCreate: createDeliverable,
        onUpdate: updateDeliverable,
        onDelete: deleteDeliverable,
      }}
    />
  );
}
