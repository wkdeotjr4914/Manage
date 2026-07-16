import { z } from "zod";

export const NODE_TYPE_VALUES = [
  "SEMANTIC",
  "REFLECTIVE",
  "PROCEDURAL",
  "EPISODIC",
  "THESIS",
  "TOPIC",
  "ENTITY",
  "CLUSTER",
] as const;

export const EDGE_TYPE_VALUES = [
  "SUPPORTS",
  "EXTENDS",
  "INSTANTIATES",
  "CONTRADICTS",
  "REFINES",
  "COMPOSES",
  "MENTIONS",
  "REQUIRES",
] as const;

export const TASK_STATUS_VALUES = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
] as const;

export const TASK_PRIORITY_VALUES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const ROLE_VALUES = ["MEMBER", "ADMIN"] as const;

// 레코드 생성 출처(메일/카톡/회의록)의 캐노니컬 값 목록 — theme.ts의 SOURCES와 짝.
// 출처는 시스템이 생성 시점에 내부 리터럴("MAIL"/"KAKAO"/"MEETING")로 지정하므로
// 폼 스키마엔 넣지 않는다. 표시할 때 SourceBadge가 미지정/알 수 없는 값을 걸러낸다.
export const SOURCE_VALUES = ["MAIL", "KAKAO", "MEETING"] as const;

export const noteSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력하세요.").max(200),
  content: z.string().max(20000).optional().default(""),
  summary: z.string().max(400).optional().or(z.literal("")),
  type: z.enum(NODE_TYPE_VALUES),
  topicId: z.string().optional().or(z.literal("")),
  tagIds: z.array(z.string()).optional().default([]),
});

export const edgeSchema = z
  .object({
    sourceId: z.string().min(1),
    targetId: z.string().min(1),
    type: z.enum(EDGE_TYPE_VALUES),
  })
  .refine((v) => v.sourceId !== v.targetId, {
    message: "노드는 자기 자신과 연결할 수 없습니다.",
    path: ["targetId"],
  });

export const tagSchema = z.object({
  name: z.string().trim().min(1, "태그 이름을 입력하세요.").max(40),
  color: z.string().optional().or(z.literal("")),
});

export const topicSchema = z.object({
  name: z.string().trim().min(1, "토픽 이름을 입력하세요.").max(60),
  description: z.string().max(300).optional().or(z.literal("")),
  color: z.string().optional().or(z.literal("")),
});

export const projectSchema = z.object({
  name: z.string().trim().min(1, "프로젝트 이름을 입력하세요.").max(120),
  description: z.string().max(1000).optional().or(z.literal("")),
  color: z.string().optional().or(z.literal("")),
});

export const taskSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1, "할 일을 입력하세요.").max(200),
  description: z.string().max(2000).optional().or(z.literal("")),
  status: z.enum(TASK_STATUS_VALUES).default("TODO"),
  priority: z.enum(TASK_PRIORITY_VALUES).default("MEDIUM"),
});

export type NoteInput = z.infer<typeof noteSchema>;
export type EdgeInput = z.infer<typeof edgeSchema>;
export type TaskInput = z.infer<typeof taskSchema>;

// ----------------------------------------------------------------------------
// Auth
// ----------------------------------------------------------------------------
// Normalize email once here (trim + lowercase) so lookups and the unique
// constraint stay consistent.
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("올바른 이메일 형식이 아닙니다."));

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "비밀번호를 입력하세요."),
});

export const createUserSchema = z.object({
  email: emailField,
  name: z.string().trim().min(1, "이름을 입력하세요.").max(60),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다.").max(200),
  role: z.enum(ROLE_VALUES).default("MEMBER"),
});

// 수정 폼: 생성과 달리 비밀번호는 선택. 빈 문자열이면 기존 비밀번호 유지,
// 값이 있으면 8자 이상이어야 한다.
export const updateUserSchema = z.object({
  email: emailField,
  name: z.string().trim().min(1, "이름을 입력하세요.").max(60),
  role: z.enum(ROLE_VALUES),
  password: z
    .string()
    .max(200)
    .refine((v) => v === "" || v.length >= 8, "비밀번호는 8자 이상이어야 합니다."),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// ----------------------------------------------------------------------------
// PMS submenu domain (ported from spmf). Date fields arrive as `YYYY-MM-DD`
// strings and are converted to Date in the server actions (parseDateInput).
// ----------------------------------------------------------------------------
export const REQUIREMENT_SPEC_STATUS_VALUES = [
  "PENDING",
  "RECEIVED",
  "IN_PROGRESS",
  "DONE",
  "ON_HOLD",
  "REJECTED",
] as const;

export const IMPORTANCE_VALUES = ["LOW", "MEDIUM", "HIGH"] as const;

export const STAFF_GRADE_VALUES = [
  "JUNIOR",
  "INTERMEDIATE",
  "SENIOR",
  "EXPERT",
] as const;

const optionalText = z.string().optional().or(z.literal(""));
const dateInput = z.string().optional().or(z.literal(""));
const progress = z.coerce.number().int().min(0).max(100).optional().default(0);

export const requirementSchema = z.object({
  projectId: z.string().min(1),
  category: z.string().max(40).optional().default("기능"),
  classif: optionalText,
  rfpNo: optionalText,
  subNo: optionalText,
  name: z.string().trim().min(1, "요구사항 명칭을 입력하세요.").max(300),
  subName: z.string().max(300).optional().or(z.literal("")),
  detail: z.string().max(5000).optional().or(z.literal("")),
  acceptance: z.string().max(40).optional().default("수용"),
  output: z.string().max(300).optional().or(z.literal("")),
  requestDate: dateInput,
  dueDate: dateInput,
  targetDate: dateInput,
  updatedBy: optionalText,
});

export const requirementSpecSchema = z.object({
  projectId: z.string().min(1),
  iaId: optionalText,
  systemType: z.string().max(40).optional().default("선택"),
  status: z.enum(REQUIREMENT_SPEC_STATUS_VALUES).default("PENDING"),
  menuPath: z.string().max(300).optional().or(z.literal("")),
  name: z.string().trim().min(1, "요구사항명을 입력하세요.").max(300),
  detail: z.string().max(5000).optional().or(z.literal("")),
  review: z.string().max(5000).optional().or(z.literal("")),
  confirmed: z.boolean().optional().default(false),
  importance: z.enum(IMPORTANCE_VALUES).default("MEDIUM"),
  requester: optionalText,
  receiver: optionalText,
  requestDate: dateInput,
  dueDate: dateInput,
  targetDate: dateInput,
  progress,
});

export const wbsSchema = z.object({
  projectId: z.string().min(1),
  parentId: optionalText,
  code: optionalText,
  name: z.string().trim().min(1, "작업명을 입력하세요.").max(300),
  phase: optionalText,
  assignee: optionalText,
  priority: z.enum(TASK_PRIORITY_VALUES).default("MEDIUM"),
  status: z.enum(TASK_STATUS_VALUES).default("TODO"),
  progress,
  startDate: dateInput,
  endDate: dateInput,
  planStartDate: dateInput,
  planEndDate: dateInput,
  description: z.string().max(2000).optional().or(z.literal("")),
});

export const pmsTaskSchema = z.object({
  projectId: z.string().min(1),
  code: optionalText,
  name: z.string().trim().min(1, "작업명을 입력하세요.").max(300),
  phase: optionalText,
  assignee: optionalText,
  priority: z.enum(TASK_PRIORITY_VALUES).default("MEDIUM"),
  status: z.enum(TASK_STATUS_VALUES).default("TODO"),
  progress,
  startDate: dateInput,
  endDate: dateInput,
  description: z.string().max(2000).optional().or(z.literal("")),
});

export const deliverableSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1, "산출물 이름을 입력하세요.").max(300),
  description: z.string().max(2000).optional().or(z.literal("")),
  templateFile: z.string().max(500).optional().or(z.literal("")),
  outputFile: z.string().max(500).optional().or(z.literal("")),
  outputLink: z.string().max(1000).optional().or(z.literal("")),
});

export const staffDemandSchema = z.object({
  projectId: z.string().min(1),
  role: z.string().trim().min(1, "직무를 입력하세요.").max(100),
  grade: z.enum(STAFF_GRADE_VALUES).default("INTERMEDIATE"),
  headcount: z.coerce.number().int().min(0).max(9999).optional().default(1),
  note: z.string().max(1000).optional().or(z.literal("")),
});

export const staffMemberSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1, "이름을 입력하세요.").max(100),
  grade: z.enum(STAFF_GRADE_VALUES).default("INTERMEDIATE"),
  role: optionalText,
  company: optionalText,
  allocation: z.coerce.number().int().min(0).max(100).optional().default(100),
  startDate: dateInput,
  endDate: dateInput,
  contact: optionalText,
  note: z.string().max(1000).optional().or(z.literal("")),
});

export type StaffDemandInput = z.infer<typeof staffDemandSchema>;
export type StaffMemberInput = z.infer<typeof staffMemberSchema>;

export type RequirementInput = z.infer<typeof requirementSchema>;
export type RequirementSpecInput = z.infer<typeof requirementSpecSchema>;
export type WBSInput = z.infer<typeof wbsSchema>;
export type PmsTaskInput = z.infer<typeof pmsTaskSchema>;
export type DeliverableInput = z.infer<typeof deliverableSchema>;
