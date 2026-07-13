import { NextResponse, type NextRequest } from "next/server";
import { getGraphData } from "@/lib/graph/adapter";
import { NODE_TYPE_VALUES, EDGE_TYPE_VALUES } from "@/lib/validation";

export const dynamic = "force-dynamic";

// Only allow known enum values through to the Prisma `{ in: [...] }` filter.
function sanitize(raw: string | null, allowed: readonly string[]) {
  if (!raw) return undefined;
  const values = raw.split(",").filter((v) => allowed.includes(v));
  return values.length ? values : undefined;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const nodeTypes = sanitize(sp.get("nodeTypes"), NODE_TYPE_VALUES);
  const edgeTypes = sanitize(sp.get("edgeTypes"), EDGE_TYPE_VALUES);
  const topicId = sp.get("topicId") || null;
  const projectId = sp.get("projectId") || null;

  const data = await getGraphData({ nodeTypes, edgeTypes, topicId, projectId });
  return NextResponse.json(data);
}
