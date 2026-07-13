import { getGraphData } from "@/lib/graph/adapter";
import { prisma } from "@/server/db";
import { GraphView } from "@/components/graph/GraphView";

export const dynamic = "force-dynamic";

export const metadata = { title: "지식 그래프 · Second Brain" };

export default async function GraphPage() {
  const [data, topics, projects] = await Promise.all([
    getGraphData(),
    prisma.topic.findMany({
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return <GraphView initialData={data} topics={topics} projects={projects} />;
}
