import "server-only";
import { prisma } from "@/server/db";
import type { NodeTypeKey, GraphNodeTypeKey, EdgeTypeKey } from "@/lib/theme";

export type GraphNode = {
  id: string;
  label: string;
  type: GraphNodeTypeKey;
  topicId: string | null;
  topicName: string | null;
  topicColor: string | null;
  summary: string | null;
  tags: string[];
  degree: number;
  /** Real project id — set only on virtual PROJECT hub nodes (see buildProjectHubs). */
  projectId?: string | null;
};

export type GraphLink = {
  id: string;
  source: string;
  target: string;
  type: EdgeTypeKey;
  /** True for links the graph adds to group same-project docs (not real edges). */
  synthetic?: boolean;
};

export type GraphData = {
  nodes: GraphNode[];
  links: GraphLink[];
};

export type GraphFilters = {
  nodeTypes?: string[];
  edgeTypes?: string[];
  topicId?: string | null;
  projectId?: string | null;
};

/**
 * Load the knowledge graph and shape it for react-force-graph.
 * Applies node-type / edge-type / topic filters, drops dangling edges, and
 * computes each node's degree so the renderer can size hubs larger.
 */
export async function getGraphData(filters: GraphFilters = {}): Promise<GraphData> {
  const { nodeTypes, edgeTypes, topicId, projectId } = filters;

  const notes = await prisma.note.findMany({
    where: {
      ...(nodeTypes && nodeTypes.length
        ? { type: { in: nodeTypes as NodeTypeKey[] } }
        : {}),
      ...(topicId ? { topicId } : {}),
      ...(projectId ? { links: { some: { projectId } } } : {}),
    },
    select: {
      id: true,
      title: true,
      type: true,
      summary: true,
      topicId: true,
      topic: { select: { name: true, color: true } },
      tags: { select: { tag: { select: { name: true } } } },
      links: {
        where: { projectId: { not: null } },
        select: {
          projectId: true,
          relation: true,
          project: { select: { name: true, color: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const nodeIds = new Set(notes.map((n) => n.id));

  const edges = await prisma.edge.findMany({
    where: edgeTypes && edgeTypes.length
      ? { type: { in: edgeTypes as EdgeTypeKey[] } }
      : {},
    select: { id: true, sourceId: true, targetId: true, type: true },
  });

  // Keep only edges whose endpoints both survived node filtering.
  const links: GraphLink[] = edges
    .filter((e) => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId))
    .map((e) => ({
      id: e.id,
      source: e.sourceId,
      target: e.targetId,
      type: e.type as EdgeTypeKey,
    }));

  const degree = new Map<string, number>();
  for (const l of links) {
    degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
    degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
  }

  const nodes: GraphNode[] = notes.map((n) => ({
    id: n.id,
    label: n.title,
    type: n.type as NodeTypeKey,
    topicId: n.topicId,
    topicName: n.topic?.name ?? null,
    topicColor: n.topic?.color ?? null,
    summary: n.summary,
    tags: n.tags.map((t) => t.tag.name),
    degree: degree.get(n.id) ?? 0,
  }));

  // Files imported into one project have no cross-file edges, so they'd render
  // as separate islands. Inject a virtual PROJECT hub node per project and link
  // it to each document's anchor (the "출처 문서" / EPISODIC source notes) so the
  // project reads as one constellation centered on its hub. Hub nodes/links are
  // flagged (synthetic) so the renderer draws them distinctly and they don't
  // count as real relationships.
  const { nodes: hubNodes, links: hubLinks } = buildProjectHubs(notes);

  return { nodes: [...nodes, ...hubNodes], links: [...links, ...hubLinks] };
}

type NoteForLinks = {
  id: string;
  type: string;
  links: {
    projectId: string | null;
    relation: string | null;
    project: { name: string; color: string | null } | null;
  }[];
};

type ProjectAnchors = {
  name: string;
  anchors: Set<string>;
};

/**
 * Build a virtual PROJECT hub node per project and link it to that project's
 * document anchors. Anchors are the source notes (relation "출처 문서" or EPISODIC
 * type) — each represents one imported document. Projects with fewer than two
 * anchors are skipped (a single doc is already one component and needs no hub).
 * Every anchor is already in the graph's node set, so the hub→anchor links have
 * a guaranteed endpoint.
 */
function buildProjectHubs(notes: NoteForLinks[]): {
  nodes: GraphNode[];
  links: GraphLink[];
} {
  const byProject = new Map<string, ProjectAnchors>();
  for (const n of notes) {
    for (const l of n.links) {
      if (!l.projectId) continue;
      if (l.relation === "출처 문서" || n.type === "EPISODIC") {
        let entry = byProject.get(l.projectId);
        if (!entry) {
          entry = { name: l.project?.name ?? "프로젝트", anchors: new Set() };
          byProject.set(l.projectId, entry);
        }
        entry.anchors.add(n.id);
      }
    }
  }

  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  for (const [projectId, { name, anchors: set }] of byProject) {
    const anchors = [...set].sort(); // stable order → stable synthetic link ids
    if (anchors.length < 2) continue; // single doc → already one component

    const hubId = `project:${projectId}`;
    nodes.push({
      id: hubId,
      label: name,
      type: "PROJECT",
      topicId: null,
      topicName: null,
      topicColor: null,
      summary: null,
      tags: [],
      degree: anchors.length,
      projectId,
    });
    for (const anchor of anchors) {
      links.push({
        id: `proj:${projectId}:${anchor}`,
        source: hubId,
        target: anchor,
        type: "COMPOSES",
        synthetic: true,
      });
    }
  }
  return { nodes, links };
}

/** Lightweight counts for the graph header / dashboard. */
export async function getGraphStats() {
  const [nodes, edges] = await Promise.all([
    prisma.note.count(),
    prisma.edge.count(),
  ]);
  return { nodes, edges };
}
