// 나라장터 입찰공고 회사 키워드 그룹 — 단일 출처(SSOT). 순수 상수라 클라/서버 공용.
export type BidKeywordGroup = {
  key: string;
  label: string;
  terms: string[];
};

export const BID_KEYWORD_GROUPS: BidKeywordGroup[] = [
  { key: "ai", label: "AI·인공지능", terms: ["AI", "인공지능", "머신러닝", "딥러닝", "LLM", "생성형"] },
  { key: "ax", label: "AX·DX", terms: ["AX", "DX", "디지털전환", "지능형", "자동화", "RPA"] },
  { key: "data", label: "데이터", terms: ["데이터", "빅데이터", "데이터레이크", "분석플랫폼"] },
  { key: "chatbot", label: "챗봇·NLP", terms: ["챗봇", "상담", "대화형", "자연어", "음성인식"] },
  { key: "homepage", label: "홈페이지", terms: ["홈페이지", "웹사이트", "누리집", "포털", "리뉴얼"] },
  { key: "advancement", label: "고도화", terms: ["고도화", "재구축", "개편"] },
  { key: "feature", label: "기능개선", terms: ["기능개선", "기능개발", "기능추가"] },
];

/** 공고명에 포함된 term이 있는 그룹의 label 배열을 반환. */
export function matchKeywordGroups(bidNtceNm: string): string[] {
  const name = bidNtceNm ?? "";
  const matched: string[] = [];
  for (const g of BID_KEYWORD_GROUPS) {
    if (g.terms.some((t) => name.includes(t))) matched.push(g.label);
  }
  return matched;
}

/** 선택한 그룹 key들의 모든 검색어를 펼쳐 중복 제거. groupKeys 미지정/빈배열이면 전체. */
export function termsForGroups(groupKeys?: string[]): string[] {
  const groups = groupKeys?.length
    ? BID_KEYWORD_GROUPS.filter((g) => groupKeys.includes(g.key))
    : BID_KEYWORD_GROUPS;
  return [...new Set(groups.flatMap((g) => g.terms))];
}
