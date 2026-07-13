"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { getScope } from "@/server/auth";
import { analyzeHeuristic } from "@/server/import/heuristic";
import { analyzeAI, isAiAvailable } from "@/server/import/ai";
import { parseDateInput } from "@/lib/utils";
import type { ImportPlan } from "@/lib/import";

type AnalyzeResult =
  | { ok: true; plan: ImportPlan }
  | { ok: false; error: string };

export async function analyzeImport(input: {
  markdown: string;
  filename?: string;
  mode: "heuristic" | "ai";
}): Promise<AnalyzeResult> {
  const md = input.markdown?.trim();
  if (!md) return { ok: false, error: "내용이 비어 있습니다." };
  const fallbackTitle =
    input.filename?.replace(/\.mdx?$/i, "").trim() || "가져온 문서";

  try {
    if (input.mode === "ai") {
      if (!isAiAvailable()) {
        return { ok: false, error: "GEMINI_API_KEY가 설정되지 않았습니다." };
      }
      const plan = await analyzeAI(md, fallbackTitle);
      if (!plan.notes.length) {
        return { ok: false, error: "AI가 노트를 추출하지 못했습니다." };
      }
      return { ok: true, plan };
    }
    return { ok: true, plan: analyzeHeuristic(md, fallbackTitle) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "분석에 실패했습니다.",
    };
  }
}

export type PmsCounts = {
  requirements: number;
  requirementSpecs: number;
  wbsItems: number;
  pmsTasks: number;
  deliverables: number;
};

type CommitResult =
  | {
      ok: true;
      data: {
        noteCount: number;
        taskCount: number;
        edgeCount: number;
        firstNoteId: string | null;
        projectId: string | null;
        pms: PmsCounts;
      };
    }
  | { ok: false; error: string };

/** Ensure a tag exists (by unique name), returning its id. */
async function ensureTag(name: string): Promise<string> {
  const tag = await prisma.tag.upsert({
    where: { name },
    create: { name },
    update: {},
    select: { id: true },
  });
  return tag.id;
}

export async function commitImport(input: {
  plan: ImportPlan;
  topicName?: string;
  extraTags?: string[];
  projectId?: string | null;
  projectName?: string;
  sourceKey?: string;
  skipTasks?: boolean;
  // Per-domain toggles for the extracted PMS items (default: save when present).
  saveRequirements?: boolean;
  saveRequirementSpecs?: boolean;
  saveWbs?: boolean;
  savePmsTasks?: boolean;
  saveDeliverables?: boolean;
}): Promise<CommitResult> {
  const { plan } = input;
  if (!plan?.notes?.length) {
    return { ok: false, error: "가져올 노트가 없습니다." };
  }
  const scope = await getScope();

  // Resolve the project this document attaches to first — the topic and the
  // note links both depend on it. skipTasks ("프로젝트에 연결 안 함") opts out.
  //   1) an explicitly chosen existing project, else
  //   2) a name from the UI / frontmatter / document title (find-or-create).
  let projectId: string | null = null;
  let resolvedProjectName: string | null = null;
  if (!input.skipTasks) {
    if (input.projectId) {
      const existing = await prisma.project.findUnique({
        where: { id: input.projectId },
        select: { id: true, name: true },
      });
      if (existing) {
        projectId = existing.id;
        resolvedProjectName = existing.name;
      }
    } else {
      const projectName =
        input.projectName?.trim() ||
        plan.projectName?.trim() ||
        plan.documentTitle.trim();
      if (projectName) {
        const existing = await prisma.project.findFirst({
          where: { name: projectName, workspaceId: scope.workspaceId },
          select: { id: true },
        });
        projectId = existing
          ? existing.id
          : (
              await prisma.project.create({
                data: {
                  name: projectName,
                  description: `${plan.documentTitle} 문서에서 가져옴`,
                  ownerId: scope.userId,
                  workspaceId: scope.workspaceId,
                },
                select: { id: true },
              })
            ).id;
        resolvedProjectName = projectName;
      }
    }
  }

  // Topic (find-or-create). Falls back to the project name so files in the same
  // project share one topic instead of each getting a title-named topic.
  let topicId: string | null = null;
  const topicName =
    input.topicName?.trim() ||
    plan.topicName?.trim() ||
    resolvedProjectName?.trim() ||
    plan.documentTitle.trim();
  if (topicName) {
    const existing = await prisma.topic.findFirst({ where: { name: topicName } });
    topicId = existing
      ? existing.id
      : (await prisma.topic.create({ data: { name: topicName } })).id;
  }

  // Resolve all tag names → ids.
  const extraTags = (input.extraTags ?? []).map((t) => t.trim()).filter(Boolean);
  const tagNames = new Set<string>(extraTags);
  for (const n of plan.notes) n.tags.forEach((t) => t && tagNames.add(t.trim()));
  const tagIdByName = new Map<string, string>();
  for (const name of tagNames) {
    if (name) tagIdByName.set(name, await ensureTag(name));
  }

  // Stable per-document key from the uploaded filename. Null for pasted text,
  // which is never deduplicated. Used after creation to replace a prior import
  // of the same file (see the delete-and-replace step below).
  const sourceKey = input.sourceKey?.trim() || null;

  // Create notes, mapping plan keys → db ids.
  const idByKey = new Map<string, string>();
  let firstNoteId: string | null = null;
  for (const n of plan.notes) {
    const noteTagIds = [...new Set([...n.tags, ...extraTags])]
      .map((t) => tagIdByName.get(t.trim()))
      .filter((v): v is string => Boolean(v));
    const note = await prisma.note.create({
      data: {
        title: n.title,
        content: n.content,
        summary: n.summary || null,
        type: n.type,
        topicId,
        sourceKey,
        authorId: scope.userId,
        workspaceId: scope.workspaceId,
        tags: noteTagIds.length
          ? { create: noteTagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
      select: { id: true },
    });
    idByKey.set(n.key, note.id);
    firstNoteId ??= note.id;
  }

  // Create edges (skip dangling / duplicates).
  let edgeCount = 0;
  for (const e of plan.edges) {
    const sourceId = idByKey.get(e.sourceKey);
    const targetId = idByKey.get(e.targetKey);
    if (!sourceId || !targetId || sourceId === targetId) continue;
    try {
      await prisma.edge.create({ data: { sourceId, targetId, type: e.type } });
      edgeCount++;
    } catch {
      // duplicate (sourceId,targetId,type) — ignore
    }
  }

  // Attach every imported note to the project so it appears on the project page
  // and can be focused in the knowledge graph. The source (document) note is
  // labeled distinctly for traceability.
  if (projectId) {
    const pid = projectId;
    const linkData = plan.notes
      .map((n) => ({ noteId: idByKey.get(n.key), key: n.key }))
      .filter((x): x is { noteId: string; key: string } => Boolean(x.noteId))
      .map((x) => ({
        noteId: x.noteId,
        projectId: pid,
        relation: x.key === "doc" ? "출처 문서" : "관련 지식",
      }));
    if (linkData.length) await prisma.noteLink.createMany({ data: linkData });
  }

  // Tasks land in the resolved project. Skip titles that already exist there so
  // re-import doesn't duplicate tasks (and doesn't wipe kanban work in progress).
  let taskCount = 0;
  if (projectId && plan.tasks.length) {
    const existingTasks = await prisma.task.findMany({
      where: { projectId },
      select: { title: true },
    });
    const seenTitles = new Set(existingTasks.map((t) => t.title));
    const perStatus: Record<string, number> = {};
    for (const t of plan.tasks) {
      if (seenTitles.has(t.title)) continue;
      seenTitles.add(t.title);
      perStatus[t.status] = (perStatus[t.status] ?? 0) + 1;
      await prisma.task.create({
        data: {
          projectId,
          title: t.title,
          description: t.description || null,
          status: t.status,
          priority: t.priority,
          order: perStatus[t.status] * 1000,
        },
      });
      taskCount++;
    }
  }

  // PMS submenu records (요구사항/명세/WBS/업무/산출물) land in the resolved
  // project. Each domain dedupes by name so re-import doesn't pile up
  // duplicates, and dates bind straight from the extracted YYYY-MM-DD strings.
  const pms: PmsCounts = {
    requirements: 0,
    requirementSpecs: 0,
    wbsItems: 0,
    pmsTasks: 0,
    deliverables: 0,
  };
  const want = (flag?: boolean) => flag !== false; // undefined ⇒ save when present

  if (projectId) {
    const pid = projectId;

    if (want(input.saveRequirements) && plan.requirements?.length) {
      const existing = await prisma.requirement.findMany({
        where: { projectId: pid },
        select: { name: true, sortOrder: true },
        orderBy: { sortOrder: "desc" },
      });
      const seen = new Set(existing.map((r) => r.name));
      let order = existing[0]?.sortOrder ?? 0;
      for (const r of plan.requirements) {
        if (seen.has(r.name)) continue;
        seen.add(r.name);
        order += 1000;
        await prisma.requirement.create({
          data: {
            projectId: pid,
            sortOrder: order,
            name: r.name,
            category: r.category || "기능",
            classif: r.classif || null,
            detail: r.detail || null,
            acceptance: r.acceptance || "수용",
            output: r.output || null,
            requestDate: parseDateInput(r.requestDate),
            dueDate: parseDateInput(r.dueDate),
            targetDate: parseDateInput(r.targetDate),
          },
        });
        pms.requirements++;
      }
    }

    if (want(input.saveRequirementSpecs) && plan.requirementSpecs?.length) {
      const existing = await prisma.requirementSpec.findMany({
        where: { projectId: pid },
        select: { name: true, sortOrder: true },
        orderBy: { sortOrder: "desc" },
      });
      const seen = new Set(existing.map((r) => r.name));
      let order = existing[0]?.sortOrder ?? 0;
      for (const r of plan.requirementSpecs) {
        if (seen.has(r.name)) continue;
        seen.add(r.name);
        order += 1000;
        await prisma.requirementSpec.create({
          data: {
            projectId: pid,
            sortOrder: order,
            name: r.name,
            systemType: r.systemType || "선택",
            menuPath: r.menuPath || null,
            detail: r.detail || null,
            importance: r.importance ?? "MEDIUM",
            requester: r.requester || null,
            requestDate: parseDateInput(r.requestDate),
            dueDate: parseDateInput(r.dueDate),
            targetDate: parseDateInput(r.targetDate),
            progress: r.progress ?? 0,
          },
        });
        pms.requirementSpecs++;
      }
    }

    if (want(input.saveWbs) && plan.wbsItems?.length) {
      const existing = await prisma.wBSItem.findMany({
        where: { projectId: pid },
        select: { name: true, sortOrder: true },
        orderBy: { sortOrder: "desc" },
      });
      const seen = new Set(existing.map((r) => r.name));
      let order = existing[0]?.sortOrder ?? 0;
      const keyToId = new Map<string, string>();
      const keyToLevel = new Map<string, number>();

      // Order parents before children so parentKey resolves regardless of the
      // order the model emitted them in (dangling/cyclic refs fall through).
      const ordered: NonNullable<typeof plan.wbsItems> = [];
      const placed = new Set<string>();
      const remaining = [...plan.wbsItems];
      for (let pass = 0; pass <= plan.wbsItems.length && remaining.length; pass++) {
        for (let i = remaining.length - 1; i >= 0; i--) {
          const wi = remaining[i];
          if (!wi.parentKey || placed.has(wi.parentKey)) {
            ordered.push(wi);
            placed.add(wi.key);
            remaining.splice(i, 1);
          }
        }
      }
      ordered.push(...remaining);

      for (const wi of ordered) {
        if (seen.has(wi.name)) continue;
        seen.add(wi.name);
        order += 1000;
        const parentId = wi.parentKey ? keyToId.get(wi.parentKey) ?? null : null;
        const level =
          parentId && wi.parentKey
            ? (keyToLevel.get(wi.parentKey) ?? 1) + 1
            : 1;
        const created = await prisma.wBSItem.create({
          data: {
            projectId: pid,
            sortOrder: order,
            parentId,
            level,
            name: wi.name,
            code: wi.code || null,
            phase: wi.phase || null,
            assignee: wi.assignee || null,
            priority: wi.priority ?? "MEDIUM",
            status: wi.status ?? "TODO",
            progress: wi.progress ?? 0,
            startDate: parseDateInput(wi.startDate),
            endDate: parseDateInput(wi.endDate),
          },
          select: { id: true },
        });
        keyToId.set(wi.key, created.id);
        keyToLevel.set(wi.key, level);
        pms.wbsItems++;
      }
    }

    if (want(input.savePmsTasks) && plan.pmsTasks?.length) {
      const existing = await prisma.pmsTask.findMany({
        where: { projectId: pid },
        select: { name: true, sortOrder: true },
        orderBy: { sortOrder: "desc" },
      });
      const seen = new Set(existing.map((r) => r.name));
      let order = existing[0]?.sortOrder ?? 0;
      for (const t of plan.pmsTasks) {
        if (seen.has(t.name)) continue;
        seen.add(t.name);
        order += 1000;
        await prisma.pmsTask.create({
          data: {
            projectId: pid,
            sortOrder: order,
            name: t.name,
            code: t.code || null,
            phase: t.phase || null,
            assignee: t.assignee || null,
            priority: t.priority ?? "MEDIUM",
            status: t.status ?? "TODO",
            progress: t.progress ?? 0,
            startDate: parseDateInput(t.startDate),
            endDate: parseDateInput(t.endDate),
          },
        });
        pms.pmsTasks++;
      }
    }

    if (want(input.saveDeliverables) && plan.deliverables?.length) {
      const existing = await prisma.deliverable.findMany({
        where: { projectId: pid },
        select: { name: true, sortOrder: true },
        orderBy: { sortOrder: "desc" },
      });
      const seen = new Set(existing.map((r) => r.name));
      let order = existing[0]?.sortOrder ?? 0;
      for (const d of plan.deliverables) {
        if (seen.has(d.name)) continue;
        seen.add(d.name);
        order += 1000;
        await prisma.deliverable.create({
          data: {
            projectId: pid,
            sortOrder: order,
            name: d.name,
            description: d.description || null,
          },
        });
        pms.deliverables++;
      }
    }
  }

  // Delete-and-replace: now that the new notes exist, remove any *earlier* notes
  // with the same sourceKey (their edges / tags / links cascade). Deleting after
  // creating means a mid-import failure leaves the old version intact (at worst a
  // duplicate) instead of losing data. Only runs when we have a real file key.
  if (sourceKey) {
    const freshIds = [...idByKey.values()];
    await prisma.note.deleteMany({
      where: {
        sourceKey,
        id: { notIn: freshIds },
        ...(projectId
          ? { links: { some: { projectId } } }
          : { workspaceId: scope.workspaceId }),
      },
    });
  }

  revalidatePath("/");
  revalidatePath("/notes");
  revalidatePath("/graph");
  revalidatePath("/tags");
  revalidatePath("/projects");
  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
    for (const s of [
      "requirements-def",
      "requirements",
      "wbs",
      "tasks",
      "deliverables",
    ]) {
      revalidatePath(`/projects/${projectId}/${s}`);
    }
  }

  return {
    ok: true,
    data: {
      noteCount: plan.notes.length,
      taskCount,
      edgeCount,
      firstNoteId,
      projectId,
      pms,
    },
  };
}
