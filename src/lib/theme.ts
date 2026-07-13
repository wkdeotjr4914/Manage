// Shared display metadata for domain enums (labels + colors).
// Colors mirror the CSS variables declared in globals.css so the graph canvas
// (which needs raw hex) and Tailwind badges stay in sync.

// Mirrors the Prisma `NodeType` enum 1:1 — used anywhere a value flows into a
// Prisma `type` filter. Do NOT widen this; add graph-only kinds to
// GraphNodeTypeKey instead.
export type NodeTypeKey =
  | "SEMANTIC"
  | "REFLECTIVE"
  | "PROCEDURAL"
  | "EPISODIC"
  | "THESIS"
  | "TOPIC"
  | "ENTITY"
  | "CLUSTER";

// Graph rendering key. PROJECT is a virtual hub the graph adapter injects per
// multi-document project so same-project files read as one group. It is NOT a
// DB NodeType, so it must never reach a Prisma `type` filter or
// NODE_TYPE_VALUES (validation.ts). Only graph code (GraphNode.type, NODE_TYPES)
// uses this wider key.
export type GraphNodeTypeKey = NodeTypeKey | "PROJECT";

// The DB-backed node types in display order. Use this — NOT Object.keys(NODE_TYPES)
// — for type pickers, legends, and filters, so the graph-only PROJECT hub kind
// never leaks into a list that maps to real notes.
export const NODE_TYPE_KEYS: NodeTypeKey[] = [
  "SEMANTIC",
  "REFLECTIVE",
  "PROCEDURAL",
  "EPISODIC",
  "THESIS",
  "TOPIC",
  "ENTITY",
  "CLUSTER",
];

export type EdgeTypeKey =
  | "SUPPORTS"
  | "EXTENDS"
  | "INSTANTIATES"
  | "CONTRADICTS"
  | "REFINES"
  | "COMPOSES"
  | "MENTIONS"
  | "REQUIRES";

export type TaskStatusKey =
  | "BACKLOG"
  | "TODO"
  | "IN_PROGRESS"
  | "IN_REVIEW"
  | "DONE";

export type TaskPriorityKey = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export const NODE_TYPES: Record<
  GraphNodeTypeKey,
  { label: string; color: string; description: string }
> = {
  SEMANTIC: { label: "개념", color: "#60a5fa", description: "사실·정의·개념 지식" },
  REFLECTIVE: { label: "성찰", color: "#a78bfa", description: "회고·통찰·의견" },
  PROCEDURAL: { label: "절차", color: "#34d399", description: "방법·프로세스·how-to" },
  EPISODIC: { label: "경험", color: "#fbbf24", description: "사건·경험·사례" },
  THESIS: { label: "주장", color: "#f472b6", description: "핵심 주장·논지" },
  TOPIC: { label: "토픽", color: "#22d3ee", description: "주제 묶음" },
  ENTITY: { label: "개체", color: "#fb7185", description: "사람·조직·제품 등" },
  CLUSTER: { label: "클러스터", color: "#94a3b8", description: "노드 그룹" },
  PROJECT: { label: "프로젝트", color: "#e879f9", description: "같은 프로젝트 문서 묶음" },
};

export const EDGE_TYPES: Record<
  EdgeTypeKey,
  { label: string; color: string }
> = {
  SUPPORTS: { label: "뒷받침", color: "#34d399" },
  EXTENDS: { label: "확장", color: "#60a5fa" },
  INSTANTIATES: { label: "구체화", color: "#a78bfa" },
  CONTRADICTS: { label: "반박", color: "#f87171" },
  REFINES: { label: "정교화", color: "#22d3ee" },
  COMPOSES: { label: "구성", color: "#fbbf24" },
  MENTIONS: { label: "언급", color: "#94a3b8" },
  REQUIRES: { label: "선행", color: "#f472b6" },
};

export const TASK_STATUSES: Record<
  TaskStatusKey,
  { label: string; color: string }
> = {
  BACKLOG: { label: "백로그", color: "#94a3b8" },
  TODO: { label: "할 일", color: "#60a5fa" },
  IN_PROGRESS: { label: "진행 중", color: "#fbbf24" },
  IN_REVIEW: { label: "리뷰", color: "#a78bfa" },
  DONE: { label: "완료", color: "#34d399" },
};

export const TASK_STATUS_ORDER: TaskStatusKey[] = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
];

export const TASK_PRIORITIES: Record<
  TaskPriorityKey,
  { label: string; color: string }
> = {
  LOW: { label: "낮음", color: "#94a3b8" },
  MEDIUM: { label: "보통", color: "#60a5fa" },
  HIGH: { label: "높음", color: "#fbbf24" },
  URGENT: { label: "긴급", color: "#f87171" },
};

// ----------------------------------------------------------------------------
// PMS submenu domain (ported from spmf)
// ----------------------------------------------------------------------------
export type RequirementSpecStatusKey =
  | "PENDING"
  | "RECEIVED"
  | "IN_PROGRESS"
  | "DONE"
  | "ON_HOLD"
  | "REJECTED";

export const REQUIREMENT_SPEC_STATUSES: Record<
  RequirementSpecStatusKey,
  { label: string; color: string }
> = {
  PENDING: { label: "접수대기", color: "#94a3b8" },
  RECEIVED: { label: "접수", color: "#60a5fa" },
  IN_PROGRESS: { label: "진행", color: "#fbbf24" },
  DONE: { label: "완료", color: "#34d399" },
  ON_HOLD: { label: "보류", color: "#a78bfa" },
  REJECTED: { label: "반려", color: "#f87171" },
};

export const REQUIREMENT_SPEC_STATUS_ORDER: RequirementSpecStatusKey[] = [
  "PENDING",
  "RECEIVED",
  "IN_PROGRESS",
  "DONE",
  "ON_HOLD",
  "REJECTED",
];

export type ImportanceKey = "LOW" | "MEDIUM" | "HIGH";

export const IMPORTANCE_LEVELS: Record<
  ImportanceKey,
  { label: string; color: string }
> = {
  LOW: { label: "하", color: "#94a3b8" },
  MEDIUM: { label: "중", color: "#60a5fa" },
  HIGH: { label: "상", color: "#f87171" },
};

export const IMPORTANCE_ORDER: ImportanceKey[] = ["HIGH", "MEDIUM", "LOW"];

// Free-form select options (stored as plain strings, mirroring spmf).
export const REQUIREMENT_CATEGORIES = [
  "기능",
  "비기능",
  "데이터",
  "인터페이스",
  "보안",
  "성능",
  "기타",
];

export const REQUIREMENT_ACCEPTANCES = ["수용", "부분수용", "불수용", "협의"];

export const REQUIREMENT_SPEC_SYSTEM_TYPES = [
  "선택",
  "관리자",
  "사용자",
  "공통",
];
