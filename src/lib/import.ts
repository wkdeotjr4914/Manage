import type {
  NodeTypeKey,
  EdgeTypeKey,
  TaskStatusKey,
  TaskPriorityKey,
  ImportanceKey,
} from "@/lib/theme";

/** A structured plan extracted from a markdown document, ready to commit. */
export type PlanNote = {
  key: string; // temp id used only for edge references within a plan
  title: string;
  type: NodeTypeKey;
  summary?: string;
  content: string;
  tags: string[];
};

export type PlanEdge = {
  sourceKey: string;
  targetKey: string;
  type: EdgeTypeKey;
};

export type PlanTask = {
  title: string;
  status: TaskStatusKey;
  priority: TaskPriorityKey;
  description?: string;
};

// ----------------------------------------------------------------------------
// PMS submenu items extracted from a document. All optional on ImportPlan so the
// existing note/graph path is unaffected when a document has no such content.
// Dates are normalized to `YYYY-MM-DD` strings.
// ----------------------------------------------------------------------------
export type PlanRequirement = {
  name: string;
  category?: string;
  classif?: string;
  detail?: string;
  acceptance?: string;
  output?: string;
  requestDate?: string;
  dueDate?: string;
  targetDate?: string;
};

export type PlanRequirementSpec = {
  name: string;
  systemType?: string;
  menuPath?: string;
  detail?: string;
  importance?: ImportanceKey;
  requester?: string;
  requestDate?: string;
  dueDate?: string;
  targetDate?: string;
  progress?: number;
};

export type PlanWbsItem = {
  key: string;
  parentKey?: string;
  name: string;
  code?: string;
  phase?: string;
  assignee?: string;
  status?: TaskStatusKey;
  priority?: TaskPriorityKey;
  progress?: number;
  startDate?: string;
  endDate?: string;
};

export type PlanPmsTask = {
  name: string;
  code?: string;
  phase?: string;
  assignee?: string;
  status?: TaskStatusKey;
  priority?: TaskPriorityKey;
  progress?: number;
  startDate?: string;
  endDate?: string;
};

export type PlanDeliverable = {
  name: string;
  description?: string;
};

export type ImportPlan = {
  documentTitle: string;
  topicName?: string;
  projectName?: string;
  notes: PlanNote[];
  edges: PlanEdge[];
  tasks: PlanTask[];
  requirements?: PlanRequirement[];
  requirementSpecs?: PlanRequirementSpec[];
  wbsItems?: PlanWbsItem[];
  pmsTasks?: PlanPmsTask[];
  deliverables?: PlanDeliverable[];
};

export type ImportSource = { name: string; markdown: string };
