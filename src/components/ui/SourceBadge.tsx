import { Badge } from "@/components/ui/badge";
import { SOURCES, type SourceKey } from "@/lib/theme";

/** 레코드의 생성 출처(메일/카톡/회의록)를 색상 뱃지로 표시. 수동 생성(null)이나
 *  알 수 없는 값이면 아무것도 렌더하지 않는다. */
export function SourceBadge({ source }: { source: string | null | undefined }) {
  if (!source || !(source in SOURCES)) return null;
  const meta = SOURCES[source as SourceKey];
  return <Badge color={meta.color}>{meta.label}</Badge>;
}
