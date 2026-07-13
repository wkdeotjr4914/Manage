"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { NODE_TYPES, EDGE_TYPES } from "@/lib/theme";
import type { GraphData } from "@/lib/graph/adapter";

export type ColorMode = "type" | "topic";
export type Spacing = "narrow" | "normal" | "wide";

type Props = {
  data: GraphData;
  colorMode: ColorMode;
  showLabels: boolean;
  spacing: Spacing;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

// react-force-graph mutates node/link objects, so we feed it fresh clones.
type FGNode = GraphData["nodes"][number] & { x?: number; y?: number };

const SPACING_CONFIG: Record<Spacing, { charge: number; distance: number }> = {
  narrow: { charge: -70, distance: 34 },
  normal: { charge: -150, distance: 62 },
  wide: { charge: -280, distance: 110 },
};

function nodeColor(node: FGNode, mode: ColorMode) {
  // Project hubs have no topic, so keep their signature color in every mode.
  if (node.type === "PROJECT") return NODE_TYPES.PROJECT.color;
  if (mode === "topic") return node.topicColor ?? "#64748b";
  return NODE_TYPES[node.type]?.color ?? "#94a3b8";
}

function nodeRadius(node: FGNode) {
  // Project hubs render large and fixed so they read as the group's center.
  if (node.type === "PROJECT") return 9;
  return 3 + Math.sqrt(node.degree || 0) * 1.7;
}

export default function ConstellationGraph({
  data,
  colorMode,
  showLabels,
  spacing,
  selectedId,
  onSelect,
}: Props) {
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  // Clone so the force simulation doesn't mutate props between refetches.
  const graphData = useMemo(
    () => ({
      nodes: data.nodes.map((n) => ({ ...n })),
      links: data.links.map((l) => ({ ...l })),
    }),
    [data],
  );

  // Track connected neighbors of the selected node for highlight.
  const highlight = useMemo(() => {
    const nodes = new Set<string>();
    const links = new Set<string>();
    if (!selectedId) return { nodes, links };
    nodes.add(selectedId);
    for (const l of data.links) {
      if (l.source === selectedId || l.target === selectedId) {
        links.add(l.id);
        nodes.add(l.source);
        nodes.add(l.target);
      }
    }
    return { nodes, links };
  }, [selectedId, data.links]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Apply spacing to the d3 forces.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const cfg = SPACING_CONFIG[spacing];
    fg.d3Force("charge")?.strength(cfg.charge);
    fg.d3Force("link")?.distance(cfg.distance);
    fg.d3ReheatSimulation?.();
  }, [spacing, graphData]);

  const paintNode = useCallback(
    (node: FGNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const r = nodeRadius(node);
      const color = nodeColor(node, colorMode);
      const dimmed = selectedId && !highlight.nodes.has(node.id);

      ctx.globalAlpha = dimmed ? 0.15 : 1;
      ctx.shadowBlur = dimmed ? 0 : 14;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;

      if (selectedId === node.id) {
        ctx.lineWidth = 2 / globalScale;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      }

      // Project hubs always show their label (bold) so the group center is clear.
      const isHub = node.type === "PROJECT";
      if ((showLabels || isHub || globalScale > 1.6) && !dimmed) {
        const label =
          node.label.length > 20 ? node.label.slice(0, 20) + "…" : node.label;
        const fontSize = Math.max(11 / globalScale, 2.4);
        const weight = isHub ? "600 " : "";
        ctx.font = `${weight}${fontSize}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isHub ? color : "rgba(231,233,245,0.9)";
        ctx.fillText(label, node.x!, node.y! + r + 1.5);
      }
      ctx.globalAlpha = 1;
    },
    [colorMode, showLabels, selectedId, highlight.nodes],
  );

  const paintPointerArea = useCallback(
    (node: FGNode, color: string, ctx: CanvasRenderingContext2D) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, nodeRadius(node) + 4, 0, 2 * Math.PI);
      ctx.fill();
    },
    [],
  );

  return (
    <div ref={containerRef} className="absolute inset-0">
      <ForceGraph2D
        ref={fgRef}
        width={size.width}
        height={size.height}
        graphData={graphData}
        backgroundColor="rgba(0,0,0,0)"
        nodeRelSize={4}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={paintPointerArea}
        linkColor={(l: any) => {
          // Synthetic project-hub links: tinted in the hub color so the group
          // reads as one cluster; brightened when its hub/anchor is selected.
          if (l.synthetic) {
            const hub = NODE_TYPES.PROJECT.color;
            if (selectedId) return highlight.links.has(l.id) ? hub + "cc" : hub + "18";
            return hub + "55";
          }
          const base = EDGE_TYPES[l.type as keyof typeof EDGE_TYPES]?.color ?? "#64748b";
          if (selectedId) {
            return highlight.links.has(l.id) ? base + "cc" : base + "10";
          }
          return base + "44";
        }}
        linkLineDash={(l: any) => (l.synthetic ? [3, 3] : null)}
        linkWidth={(l: any) =>
          l.synthetic
            ? highlight.links.has(l.id)
              ? 1.4
              : 0.8
            : highlight.links.has(l.id)
              ? 1.8
              : 0.7
        }
        linkDirectionalArrowLength={(l: any) => (l.synthetic ? 0 : 2.5)}
        linkDirectionalArrowRelPos={1}
        linkDirectionalParticles={(l: any) =>
          !l.synthetic && highlight.links.has(l.id) ? 2 : 0
        }
        linkDirectionalParticleWidth={2}
        cooldownTicks={120}
        onNodeClick={(node: any) => onSelect(node.id)}
        onBackgroundClick={() => onSelect(null)}
        onNodeDragEnd={(node: any) => {
          node.fx = node.x;
          node.fy = node.y;
        }}
      />
    </div>
  );
}
