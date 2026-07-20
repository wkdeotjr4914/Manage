import "server-only";
import { callGemini } from "@/server/import/ai";
import { buildFitSystemPrompt } from "@/server/company/profile";
import { matchedAvoidKeyword, type CompanyProfileData } from "@/lib/companyProfile";

// AI 판정 대상 공고(적합도 계산에 필요한 최소 필드만).
export type FitInput = {
  key: string; // 라운드트립용 유일 id (예: "bidNtceNo:bidNtceOrd")
  bidNtceNm: string;
  ntceInsttNm: string | null;
  dminsttNm: string | null;
  cntrctCnclsMthdNm: string | null;
  matchedKeywords: string[];
};

export type FitResult = {
  fitScore: number; // 0~100
  fitReason: string;
  fitRecommend: boolean;
};

// 공고명이 짧아 배치를 넉넉히 잡아도 토큰이 크지 않다. 한 번에 15건씩 순차 호출.
const BATCH = 15;

// Gemini 구조화 출력 스키마(OpenAPI subset, 대문자 타입).
const FIT_SCHEMA = {
  type: "OBJECT",
  properties: {
    results: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          score: { type: "INTEGER", description: "0~100" },
          reason: { type: "STRING", description: "40자 이내 한 줄 근거" },
        },
        required: ["id", "score"],
      },
    },
  },
  required: ["results"],
};

type RawFit = { results?: Array<{ id?: unknown; score?: unknown; reason?: unknown }> };

function clampScore(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * 프리필터 통과분을 Gemini로 배치 판정. 공고명에 회사 기피 키워드가 있으면 AI를
 * 호출하지 않고 저점(5점) 처리해 토큰을 아낀다. 반환은 key→FitResult 맵.
 * 배치 실패는 조용히 건너뛰어(그 배치의 공고는 미판정으로 남음) 다음 배치를 계속한다.
 */
export async function assessBidFit(
  inputs: FitInput[],
  profile: CompanyProfileData,
): Promise<Map<string, FitResult>> {
  const out = new Map<string, FitResult>();

  // 1) 기피 키워드 프리필터 — AI 없이 저점 처리.
  const toAi: FitInput[] = [];
  for (const b of inputs) {
    const hit = matchedAvoidKeyword(b.bidNtceNm, profile.avoidKeywords);
    if (hit) {
      out.set(b.key, {
        fitScore: 5,
        fitReason: `기피 키워드('${hit}') 포함`,
        fitRecommend: false,
      });
    } else {
      toAi.push(b);
    }
  }
  if (toAi.length === 0) return out;

  const system = buildFitSystemPrompt(profile);

  // 2) 나머지를 배치로 AI 판정.
  for (let i = 0; i < toAi.length; i += BATCH) {
    const batch = toAi.slice(i, i + BATCH);
    const payload = batch.map((b) => ({
      id: b.key,
      공고명: b.bidNtceNm,
      기관: b.dminsttNm ?? b.ntceInsttNm ?? "",
      계약방법: b.cntrctCnclsMthdNm ?? "",
      매칭키워드: b.matchedKeywords,
    }));
    const text =
      "다음 입찰공고들을 회사 프로필 기준으로 각각 평가해 results 배열로 반환하세요. " +
      "id는 그대로 돌려주세요.\n\n" +
      JSON.stringify(payload, null, 0);

    let raw: RawFit;
    try {
      raw = (await callGemini([{ text }], {
        system,
        schema: FIT_SCHEMA,
        maxOutputTokens: 8192,
        temperature: 0.2,
      })) as RawFit;
    } catch (e) {
      console.error("[g2b/fit] 배치 판정 실패:", e instanceof Error ? e.message : e);
      continue; // 이 배치는 미판정으로 남긴다.
    }

    for (const r of raw.results ?? []) {
      const id = typeof r.id === "string" ? r.id : null;
      if (!id) continue;
      const score = clampScore(r.score);
      const reason =
        typeof r.reason === "string" && r.reason.trim()
          ? r.reason.trim().slice(0, 200)
          : "";
      out.set(id, { fitScore: score, fitReason: reason, fitRecommend: score >= 70 });
    }
  }

  return out;
}
