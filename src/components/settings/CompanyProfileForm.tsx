"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/field";
import { saveCompanyProfile } from "@/server/actions/bids";
import type { CompanyProfileData } from "@/lib/companyProfile";

// 콤마·줄바꿈으로 구분된 키워드 문자열 ↔ 배열.
function splitKeywords(v: string): string[] {
  return v
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function CompanyProfileForm({ initial }: { initial: CompanyProfileData }) {
  const [businessArea, setBusinessArea] = useState(initial.businessArea);
  const [strengths, setStrengths] = useState(initial.strengths);
  const [preferred, setPreferred] = useState(initial.preferred);
  const [avoided, setAvoided] = useState(initial.avoided);
  const [extraNotes, setExtraNotes] = useState(initial.extraNotes);
  const [avoidKeywords, setAvoidKeywords] = useState(initial.avoidKeywords.join(", "));

  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function submit() {
    setError(null);
    setNotice(null);
    startSave(async () => {
      const res = await saveCompanyProfile({
        businessArea,
        strengths,
        preferred,
        avoided,
        extraNotes,
        avoidKeywords: splitKeywords(avoidKeywords),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice("저장했습니다. 다음 수집부터 이 기준으로 적합도를 분석합니다.");
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5 rounded-2xl border border-border bg-surface-2 p-5">
      <div>
        <Label htmlFor="businessArea">사업영역</Label>
        <Input
          id="businessArea"
          value={businessArea}
          onChange={(e) => setBusinessArea(e.target.value)}
          placeholder="예: 공공·기업 대상 소프트웨어 개발 및 웹 구축"
        />
      </div>

      <div>
        <Label htmlFor="strengths">주력 기술·역량</Label>
        <Textarea
          id="strengths"
          value={strengths}
          onChange={(e) => setStrengths(e.target.value)}
          rows={7}
          placeholder="한 줄에 하나씩. 예: AI·인공지능 솔루션 개발"
        />
        <p className="mt-1 text-[11px] text-muted-2">
          AI가 공고의 적합도를 판단하는 핵심 기준입니다. 구체적으로 적을수록 정확합니다.
        </p>
      </div>

      <div>
        <Label htmlFor="preferred">선호 사업유형</Label>
        <Input
          id="preferred"
          value={preferred}
          onChange={(e) => setPreferred(e.target.value)}
          placeholder="예: 용역(소프트웨어 개발·SI·시스템 고도화)"
        />
      </div>

      <div>
        <Label htmlFor="avoided">기피 조건</Label>
        <Textarea
          id="avoided"
          value={avoided}
          onChange={(e) => setAvoided(e.target.value)}
          rows={2}
          placeholder="예: 단순 물품구매, 공사, 하드웨어 납품, 단순 유지관리"
        />
      </div>

      <div>
        <Label htmlFor="avoidKeywords">기피 키워드 (프리필터)</Label>
        <Input
          id="avoidKeywords"
          value={avoidKeywords}
          onChange={(e) => setAvoidKeywords(e.target.value)}
          placeholder="콤마로 구분. 예: 공사, 물품, 구매, 유지관리"
        />
        <p className="mt-1 text-[11px] text-muted-2">
          공고명에 이 단어가 있으면 AI 분석 없이 저점(5점) 처리해 비용을 아낍니다.
        </p>
      </div>

      <div>
        <Label htmlFor="extraNotes">기타 참고 (규모·실적·보유자격 등)</Label>
        <Textarea
          id="extraNotes"
          value={extraNotes}
          onChange={(e) => setExtraNotes(e.target.value)}
          rows={3}
          placeholder="예: 중소기업, SW사업자 신고, 유사 용역 수행실적 다수, 수행 가능 예산 5천만~10억"
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {notice && <p className="text-sm text-success">{notice}</p>}

      <div>
        <Button onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          저장
        </Button>
      </div>
    </div>
  );
}
