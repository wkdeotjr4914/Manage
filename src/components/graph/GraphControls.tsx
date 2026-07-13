"use client";

import {
  NODE_TYPES,
  EDGE_TYPES,
  type NodeTypeKey,
  type GraphNodeTypeKey,
  type EdgeTypeKey,
} from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { ColorMode, Spacing } from "./ConstellationGraph";

type Topic = { id: string; name: string; color: string | null };
type Project = { id: string; name: string; color: string | null };

type Props = {
  colorMode: ColorMode;
  setColorMode: (m: ColorMode) => void;
  spacing: Spacing;
  setSpacing: (s: Spacing) => void;
  showLabels: boolean;
  setShowLabels: (v: boolean) => void;
  nodeTypes: NodeTypeKey[];
  toggleNodeType: (k: NodeTypeKey) => void;
  edgeTypes: EdgeTypeKey[];
  toggleEdgeType: (k: EdgeTypeKey) => void;
  topics: Topic[];
  topicId: string | null;
  setTopicId: (id: string | null) => void;
  projects: Project[];
  projectId: string | null;
  setProjectId: (id: string | null) => void;
  groupByProject: boolean;
  setGroupByProject: (v: boolean) => void;
  visible: { nodes: number; links: number };
  loading: boolean;
};

// PROJECT is a virtual hub type — governed by the "프로젝트로 묶기" toggle, not
// this legend, so exclude it from the node-type badges.
const ALL_NODE_TYPES = (Object.keys(NODE_TYPES) as GraphNodeTypeKey[]).filter(
  (k): k is NodeTypeKey => k !== "PROJECT",
);
const ALL_EDGE_TYPES = Object.keys(EDGE_TYPES) as EdgeTypeKey[];

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg border border-border bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
            value === o.value
              ? "bg-primary/20 text-foreground ring-1 ring-primary/30"
              : "text-muted hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-2">
        {title}
      </span>
      {children}
    </div>
  );
}

export function GraphControls(props: Props) {
  return (
    <div className="flex w-64 flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-surface/80 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">
          {props.loading ? (
            <span className="text-primary">불러오는 중…</span>
          ) : (
            <>
              <span className="font-semibold text-foreground">
                {props.visible.nodes}
              </span>{" "}
              노드 ·{" "}
              <span className="font-semibold text-foreground">
                {props.visible.links}
              </span>{" "}
              엣지
            </>
          )}
        </span>
      </div>

      <Section title="렌즈 (색상)">
        <Segmented
          value={props.colorMode}
          onChange={props.setColorMode}
          options={[
            { value: "type", label: "타입별" },
            { value: "topic", label: "토픽별" },
          ]}
        />
      </Section>

      <Section title="토픽 초점">
        <select
          value={props.topicId ?? ""}
          onChange={(e) => props.setTopicId(e.target.value || null)}
          className="h-8 w-full cursor-pointer rounded-lg border border-border bg-surface-2 px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <option value="">전체 토픽</option>
          {props.topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Section>

      <Section title="프로젝트 초점">
        <select
          value={props.projectId ?? ""}
          onChange={(e) => props.setProjectId(e.target.value || null)}
          className="h-8 w-full cursor-pointer rounded-lg border border-border bg-surface-2 px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <option value="">전체 프로젝트</option>
          {props.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Section>

      <Section title="노드 타입">
        <div className="flex flex-wrap gap-1.5">
          {ALL_NODE_TYPES.map((k) => {
            const active = props.nodeTypes.includes(k);
            const meta = NODE_TYPES[k];
            return (
              <button
                key={k}
                onClick={() => props.toggleNodeType(k)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-opacity",
                  active ? "opacity-100" : "opacity-35 hover:opacity-70",
                )}
                style={{
                  backgroundColor: `${meta.color}1f`,
                  borderColor: `${meta.color}59`,
                  color: meta.color,
                }}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: meta.color }}
                />
                {meta.label}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="엣지 타입">
        <div className="flex flex-wrap gap-1.5">
          {ALL_EDGE_TYPES.map((k) => {
            const active = props.edgeTypes.includes(k);
            const meta = EDGE_TYPES[k];
            return (
              <button
                key={k}
                onClick={() => props.toggleEdgeType(k)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-opacity",
                  active ? "opacity-100" : "opacity-35 hover:opacity-70",
                )}
                style={{
                  backgroundColor: `${meta.color}1f`,
                  borderColor: `${meta.color}59`,
                  color: meta.color,
                }}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="간격">
        <Segmented
          value={props.spacing}
          onChange={props.setSpacing}
          options={[
            { value: "narrow", label: "좁게" },
            { value: "normal", label: "보통" },
            { value: "wide", label: "넓게" },
          ]}
        />
      </Section>

      <label className="flex cursor-pointer items-center justify-between text-xs text-muted">
        <span>프로젝트로 묶기</span>
        <input
          type="checkbox"
          checked={props.groupByProject}
          onChange={(e) => props.setGroupByProject(e.target.checked)}
          className="size-4 accent-[var(--primary)]"
        />
      </label>

      <label className="flex cursor-pointer items-center justify-between text-xs text-muted">
        <span>라벨 항상 표시</span>
        <input
          type="checkbox"
          checked={props.showLabels}
          onChange={(e) => props.setShowLabels(e.target.checked)}
          className="size-4 accent-[var(--primary)]"
        />
      </label>
    </div>
  );
}
