"use client";

import Link from "next/link";
import { X, ArrowRight, ArrowLeft, ExternalLink } from "lucide-react";
import { NODE_TYPES, EDGE_TYPES } from "@/lib/theme";
import { Badge } from "@/components/ui/badge";
import type { GraphData } from "@/lib/graph/adapter";

type Neighbor = {
  node: GraphData["nodes"][number];
  edgeType: keyof typeof EDGE_TYPES;
  direction: "out" | "in";
};

export function NodeDetailPanel({
  node,
  neighbors,
  onClose,
  onSelect,
}: {
  node: GraphData["nodes"][number];
  neighbors: Neighbor[];
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const meta = NODE_TYPES[node.type];
  return (
    <div className="flex w-80 flex-col overflow-hidden rounded-xl border border-border bg-surface/90 backdrop-blur-md">
      <div className="flex items-start justify-between gap-2 border-b border-border p-4">
        <div className="min-w-0">
          <Badge color={meta.color}>{meta.label}</Badge>
          <h3 className="mt-2 text-sm font-semibold leading-snug text-foreground">
            {node.label}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-muted-2 hover:bg-surface-2 hover:text-foreground"
          aria-label="닫기"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-4 overflow-y-auto p-4">
        {node.summary && (
          <p className="text-sm leading-relaxed text-muted">{node.summary}</p>
        )}

        {(node.topicName || node.tags.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {node.topicName && (
              <Badge color={node.topicColor ?? undefined}>{node.topicName}</Badge>
            )}
            {node.tags.map((t) => (
              <Badge key={t}>#{t}</Badge>
            ))}
          </div>
        )}

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-2">
            연결 ({neighbors.length})
          </p>
          <div className="flex flex-col gap-1">
            {neighbors.length === 0 && (
              <p className="text-xs text-muted-2">연결된 노드가 없습니다.</p>
            )}
            {neighbors.map((nb, i) => {
              const em = EDGE_TYPES[nb.edgeType];
              return (
                <button
                  key={`${nb.node.id}-${i}`}
                  onClick={() => onSelect(nb.node.id)}
                  className="flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left text-xs hover:border-border hover:bg-surface-2"
                >
                  {nb.direction === "out" ? (
                    <ArrowRight className="size-3 shrink-0 text-muted-2" />
                  ) : (
                    <ArrowLeft className="size-3 shrink-0 text-muted-2" />
                  )}
                  <span
                    className="shrink-0 rounded px-1 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: `${em.color}22`, color: em.color }}
                  >
                    {em.label}
                  </span>
                  <span className="truncate text-foreground">{nb.node.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="border-t border-border p-3">
        {node.type === "PROJECT" ? (
          <Link
            href={`/projects/${node.projectId}`}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-surface-2 py-2 text-xs font-medium text-foreground hover:bg-surface-3"
          >
            프로젝트 열기 <ExternalLink className="size-3.5" />
          </Link>
        ) : (
          <Link
            href={`/notes/${node.id}`}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-surface-2 py-2 text-xs font-medium text-foreground hover:bg-surface-3"
          >
            노트 열기 <ExternalLink className="size-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}
