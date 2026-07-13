"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { GraphControls } from "./GraphControls";
import { NodeDetailPanel } from "./NodeDetailPanel";
import type { ColorMode, Spacing } from "./ConstellationGraph";
import {
  NODE_TYPES,
  EDGE_TYPES,
  type NodeTypeKey,
  type GraphNodeTypeKey,
  type EdgeTypeKey,
} from "@/lib/theme";
import type { GraphData } from "@/lib/graph/adapter";

const ConstellationGraph = dynamic(() => import("./ConstellationGraph"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-sm text-muted">
      별자리 그래프를 그리는 중…
    </div>
  ),
});

// PROJECT is a virtual hub type, not a filterable note type — the "프로젝트로
// 묶기" toggle governs it, so keep it out of the node-type filter set.
const ALL_NODE_TYPES = (Object.keys(NODE_TYPES) as GraphNodeTypeKey[]).filter(
  (k): k is NodeTypeKey => k !== "PROJECT",
);
const ALL_EDGE_TYPES = Object.keys(EDGE_TYPES) as EdgeTypeKey[];

type Topic = { id: string; name: string; color: string | null };
type Project = { id: string; name: string; color: string | null };

export function GraphView({
  initialData,
  topics,
  projects,
}: {
  initialData: GraphData;
  topics: Topic[];
  projects: Project[];
}) {
  const [data, setData] = useState<GraphData>(initialData);
  const [loading, setLoading] = useState(false);

  const [colorMode, setColorMode] = useState<ColorMode>("type");
  const [spacing, setSpacing] = useState<Spacing>("normal");
  const [showLabels, setShowLabels] = useState(false);
  const [nodeTypes, setNodeTypes] = useState<NodeTypeKey[]>(ALL_NODE_TYPES);
  const [edgeTypes, setEdgeTypes] = useState<EdgeTypeKey[]>(ALL_EDGE_TYPES);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [groupByProject, setGroupByProject] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const firstRun = useRef(true);

  // Refetch when filters change (skip the very first render — we have initialData).
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    // Selection may not exist in the newly filtered set — clear it so the
    // graph doesn't dim every node against a vanished selection.
    setSelectedId(null);
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (nodeTypes.length && nodeTypes.length < ALL_NODE_TYPES.length) {
      params.set("nodeTypes", nodeTypes.join(","));
    }
    if (edgeTypes.length && edgeTypes.length < ALL_EDGE_TYPES.length) {
      params.set("edgeTypes", edgeTypes.join(","));
    }
    if (topicId) params.set("topicId", topicId);
    if (projectId) params.set("projectId", projectId);
    // No node types selected → empty graph, no need to hit the server.
    if (nodeTypes.length === 0) {
      setData({ nodes: [], links: [] });
      return;
    }

    setLoading(true);
    fetch(`/api/graph?${params.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d: GraphData) => setData(d))
      .catch((e) => {
        if (e.name !== "AbortError") console.error(e);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [nodeTypes, edgeTypes, topicId, projectId]);

  // Turning off grouping removes hub nodes from viewData. A lingering hub
  // selection would keep the detail panel open for a node the canvas no longer
  // shows, and dim every remaining node against it — so clear it.
  useEffect(() => {
    if (!groupByProject && selectedId?.startsWith("project:")) {
      setSelectedId(null);
    }
  }, [groupByProject, selectedId]);

  const toggleNodeType = (k: NodeTypeKey) =>
    setNodeTypes((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    );
  const toggleEdgeType = (k: EdgeTypeKey) =>
    setEdgeTypes((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    );

  // What the canvas actually renders — drop the project hub nodes and their
  // synthetic links when "프로젝트로 묶기" is off.
  const viewData = useMemo(
    () =>
      groupByProject
        ? data
        : {
            nodes: data.nodes.filter((n) => n.type !== "PROJECT"),
            links: data.links.filter((l) => !l.synthetic),
          },
    [data, groupByProject],
  );

  const selectedNode = useMemo(
    () => data.nodes.find((n) => n.id === selectedId) ?? null,
    [data.nodes, selectedId],
  );

  const neighbors = useMemo(() => {
    if (!selectedNode) return [];
    const byId = new Map(data.nodes.map((n) => [n.id, n]));
    const out: {
      node: GraphData["nodes"][number];
      edgeType: EdgeTypeKey;
      direction: "out" | "in";
    }[] = [];
    // A project hub's "connections" ARE its synthetic member links; for real
    // notes those grouping links aren't relationships, so skip them.
    const isHub = selectedNode.type === "PROJECT";
    for (const l of data.links) {
      if (l.synthetic && !isHub) continue;
      if (l.source === selectedNode.id && byId.has(l.target)) {
        out.push({ node: byId.get(l.target)!, edgeType: l.type, direction: "out" });
      } else if (l.target === selectedNode.id && byId.has(l.source)) {
        out.push({ node: byId.get(l.source)!, edgeType: l.type, direction: "in" });
      }
    }
    return out;
  }, [selectedNode, data]);

  return (
    <div className="graph-dark relative h-[calc(100vh-4rem)] w-full md:h-screen">
      {/* graph canvas fills the area */}
      <ConstellationGraph
        data={viewData}
        colorMode={colorMode}
        showLabels={showLabels}
        spacing={spacing}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      {/* controls (top-left) */}
      <div className="pointer-events-none absolute inset-0 p-4">
        <div className="pointer-events-auto absolute left-4 top-4 max-h-[calc(100%-2rem)]">
          <GraphControls
            colorMode={colorMode}
            setColorMode={setColorMode}
            spacing={spacing}
            setSpacing={setSpacing}
            showLabels={showLabels}
            setShowLabels={setShowLabels}
            nodeTypes={nodeTypes}
            toggleNodeType={toggleNodeType}
            edgeTypes={edgeTypes}
            toggleEdgeType={toggleEdgeType}
            topics={topics}
            topicId={topicId}
            setTopicId={setTopicId}
            projects={projects}
            projectId={projectId}
            setProjectId={setProjectId}
            groupByProject={groupByProject}
            setGroupByProject={setGroupByProject}
            visible={{ nodes: viewData.nodes.length, links: viewData.links.length }}
            loading={loading}
          />
        </div>

        {/* detail (right) */}
        {selectedNode && (
          <div className="pointer-events-auto absolute right-4 top-4 max-h-[calc(100%-2rem)]">
            <NodeDetailPanel
              node={selectedNode}
              neighbors={neighbors}
              onClose={() => setSelectedId(null)}
              onSelect={setSelectedId}
            />
          </div>
        )}
      </div>
    </div>
  );
}
