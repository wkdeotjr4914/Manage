// 회사 프로필 — 입찰공고 AI 적합도 판정의 단일 기준(SSOT). 순수 상수/타입이라
// 클라(설정 폼)와 서버(프롬프트 생성) 공용. DB의 CompanyProfile 레코드가 비어 있을
// 때 이 기본값으로 폴백한다. 실제 값은 /settings/company 편집 UI에서 관리.

export type CompanyProfileData = {
  businessArea: string; // 사업영역(한 줄)
  strengths: string; // 주력 기술·역량(여러 줄)
  preferred: string; // 선호 사업유형
  avoided: string; // 기피 조건(서술)
  extraNotes: string; // 규모·실적·보유자격 등 자유 서술
  avoidKeywords: string[]; // 네거티브 키워드
};

// 기존 BID_KEYWORD_GROUPS(AI·AX/DX·데이터·챗봇·홈페이지·고도화·기능개선)에서 유추한
// 초안. 사용자가 설정 화면에서 실제 회사 정보로 덮어쓴다.
export const DEFAULT_COMPANY_PROFILE: CompanyProfileData = {
  businessArea: "공공·기업 대상 소프트웨어 개발 및 웹 구축",
  strengths: [
    "AI·인공지능(LLM·생성형·머신러닝·딥러닝) 솔루션 개발",
    "AX·DX·디지털전환·업무 자동화(RPA)",
    "데이터 분석·빅데이터 플랫폼 구축",
    "챗봇·대화형·자연어처리(NLP)·음성인식",
    "홈페이지·누리집·포털 구축 및 고도화/재구축/개편",
    "기능개선·기능개발",
  ].join("\n"),
  preferred: "용역(소프트웨어 개발·SI·시스템 고도화)",
  avoided: "단순 물품구매, 공사(건설), 하드웨어 납품, 단순 유지관리·인력 파견",
  extraNotes: "",
  avoidKeywords: [
    "공사",
    "물품",
    "구매",
    "납품",
    "임차",
    "임대",
    "청소",
    "경비",
    "인쇄",
    "급식",
  ],
};

/** 공고명에 기피 키워드가 있으면 첫 매칭어를 반환(없으면 null). 프리필터용. */
export function matchedAvoidKeyword(
  bidNtceNm: string,
  avoidKeywords: string[],
): string | null {
  const name = bidNtceNm ?? "";
  for (const k of avoidKeywords) {
    const t = k.trim();
    if (t && name.includes(t)) return t;
  }
  return null;
}
