import "server-only";
import { prisma } from "@/server/db";
import {
  DEFAULT_COMPANY_PROFILE,
  type CompanyProfileData,
} from "@/lib/companyProfile";

/**
 * 저장된 회사 프로필을 읽어 {@link CompanyProfileData}로 반환한다. 레코드가 없거나
 * 특정 서술 필드가 비어 있으면 기본 프로필로 폴백해, AI 판정 프롬프트에 항상 의미
 * 있는 기준이 들어가도록 한다. avoidKeywords는 저장값이 있으면 그대로, 없으면 기본값.
 */
export async function getCompanyProfile(): Promise<CompanyProfileData> {
  const row = await prisma.companyProfile.findUnique({ where: { id: "default" } });
  if (!row) return DEFAULT_COMPANY_PROFILE;
  const pick = (v: string | null, fallback: string) =>
    v && v.trim() ? v : fallback;
  return {
    businessArea: pick(row.businessArea, DEFAULT_COMPANY_PROFILE.businessArea),
    strengths: pick(row.strengths, DEFAULT_COMPANY_PROFILE.strengths),
    preferred: pick(row.preferred, DEFAULT_COMPANY_PROFILE.preferred),
    avoided: pick(row.avoided, DEFAULT_COMPANY_PROFILE.avoided),
    extraNotes: row.extraNotes ?? "",
    avoidKeywords: row.avoidKeywords.length
      ? row.avoidKeywords
      : DEFAULT_COMPANY_PROFILE.avoidKeywords,
  };
}

/**
 * 프로필을 Gemini systemInstruction 문자열로 조립한다. 판정 기준·점수 구간·출력
 * 규칙을 명시해 모델이 회사 특성 기준으로만 평가하도록 유도.
 */
export function buildFitSystemPrompt(profile: CompanyProfileData): string {
  return `당신은 공공(나라장터) 및 기업 SW/IT 용역 입찰공고가 "우리 회사"에 적합한지 평가하는 전문가입니다.
아래 [회사 프로필]을 유일한 기준으로, 각 공고의 적합도를 0~100 정수 점수로 매기세요.

[점수 기준]
- 90~100: 주력 분야와 정확히 일치. 즉시 검토 강력 추천.
- 70~89: 회사가 충분히 수행 가능. 관심 대상.
- 40~69: 부분적으로 관련되나 핵심 분야는 아님. 조건부.
- 10~39: 회사 특성과 관련이 약함.
- 0~9: 무관하거나 기피 분야(공사·물품구매·단순 유지관리 등).

[판단 규칙]
- 공고명, 수요기관/공고기관, 계약방법, 매칭 키워드만으로 판단합니다.
- 정보가 부족하면 지어내지 말고 보수적으로 낮게 평가하세요.
- reason(근거)은 40자 이내의 한국어 한 줄로, 왜 그 점수인지 핵심만.
- 반드시 입력으로 준 모든 공고를 같은 id로 하나씩 평가해 results 배열로 반환하세요.

[회사 프로필]
사업영역: ${profile.businessArea}
주력 기술·역량:
${profile.strengths}
선호 사업유형: ${profile.preferred}
기피 조건: ${profile.avoided}${profile.extraNotes ? `\n기타 참고: ${profile.extraNotes}` : ""}`;
}
