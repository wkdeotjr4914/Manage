"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, Plus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { EDGE_TYPES, NODE_TYPES, type NodeTypeKey } from "@/lib/theme";
import { EDGE_TYPE_VALUES } from "@/lib/validation";
import { tint } from "@/lib/utils";
import { createEdge, deleteEdge } from "@/server/actions/links";

type EdgeItem = {
  id: string;
  type: string;
  node: { id: string; title: string; type: NodeTypeKey };
};

export function NoteConnections({
  noteId,
  outgoing,
  incoming,
  candidates,
}: {
  noteId: string;
  outgoing: EdgeItem[];
  incoming: EdgeItem[];
  candidates: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [targetId, setTargetId] = useState("");
  const [edgeType, setEdgeType] = useState<string>("SUPPORTS");
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    if (!targetId) {
      setError("연결할 노트를 선택하세요.");
      return;
    }
    const input =
      direction === "out"
        ? { sourceId: noteId, targetId, type: edgeType }
        : { sourceId: targetId, targetId: noteId, type: edgeType };
    startTransition(async () => {
      const res = await createEdge(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTargetId("");
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteEdge(id);
      router.refresh();
    });
  }

  const renderEdge = (e: EdgeItem, dir: "out" | "in") => {
    const em = EDGE_TYPES[e.type as keyof typeof EDGE_TYPES];
    const nm = NODE_TYPES[e.node.type];
    return (
      <div
        key={e.id}
        className="group flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-xs hover:border-border hover:bg-surface-2"
      >
        {dir === "out" ? (
          <ArrowRight className="size-3 shrink-0 text-muted-2" />
        ) : (
          <ArrowLeft className="size-3 shrink-0 text-muted-2" />
        )}
        <span
          className="shrink-0 rounded border px-1 py-0.5 text-[10px] font-medium"
          style={em ? tint(em.color) : undefined}
        >
          {em?.label ?? e.type}
        </span>
        <a
          href={`/notes/${e.node.id}`}
          className="truncate text-foreground hover:underline"
          style={{ textDecorationColor: nm.color }}
        >
          {e.node.title}
        </a>
        <button
          onClick={() => remove(e.id)}
          disabled={pending}
          className="ml-auto shrink-0 rounded p-0.5 text-muted-2 opacity-0 hover:text-danger group-hover:opacity-100"
          aria-label="연결 삭제"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  };

  return (
    <div className="card-shadow flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">
        연결 ({outgoing.length + incoming.length})
      </h2>

      <div className="flex flex-col gap-0.5">
        {outgoing.map((e) => renderEdge(e, "out"))}
        {incoming.map((e) => renderEdge(e, "in"))}
        {outgoing.length + incoming.length === 0 && (
          <p className="text-xs text-muted-2">아직 연결이 없습니다.</p>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-2">
          연결 추가
        </span>
        <div className="flex gap-2">
          <Select
            value={direction}
            onChange={(e) => setDirection(e.target.value as "out" | "in")}
            className="w-28 shrink-0"
          >
            <option value="out">이 노트 →</option>
            <option value="in">→ 이 노트</option>
          </Select>
          <Select
            value={edgeType}
            onChange={(e) => setEdgeType(e.target.value)}
            className="flex-1"
          >
            {EDGE_TYPE_VALUES.map((k) => (
              <option key={k} value={k}>
                {EDGE_TYPES[k].label}
              </option>
            ))}
          </Select>
        </div>
        <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">노트 선택…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </Select>
        {error && <p className="text-xs text-danger">{error}</p>}
        <Button size="sm" onClick={add} disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          연결 추가
        </Button>
      </div>
    </div>
  );
}
