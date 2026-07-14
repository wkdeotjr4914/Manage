"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  Loader2,
  Link2,
  Unlink,
  Mail,
  CalendarDays,
  Sheet,
  ExternalLink,
  CheckCircle2,
  KeyRound,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Label } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import {
  startGoogleConnect,
  disconnectGoogle,
  addGmailLabelRule,
  removeGmailLabelRule,
  saveGoogleClientConfig,
  clearGoogleClientConfig,
  syncGmailNow,
  syncCalendarNow,
  exportSheetsNow,
} from "@/server/actions/google";

// 콜백이 넘겨준 error 코드(화이트리스트) → 한국어. Korean 메시지는 그대로 통과.
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  state: "인증 상태 검증에 실패했습니다. 다시 시도해 주세요.",
  denied: "구글 인증이 거부되었습니다.",
  access_denied: "구글 계정 접근을 취소했습니다.",
  invalid_scope: "요청한 권한 범위가 올바르지 않습니다.",
  invalid_request: "잘못된 인증 요청입니다.",
  unauthorized_client: "허용되지 않은 클라이언트입니다.",
  server_error: "구글 인증 서버 오류입니다.",
  temporarily_unavailable: "구글 인증 서버가 일시적으로 사용 불가합니다.",
};

function mapOAuthError(raw: string): string {
  const decoded = decodeURIComponent(raw);
  return OAUTH_ERROR_MESSAGES[decoded] ?? decoded;
}

type Account = {
  status: "CONNECTED" | "REVOKED";
  googleEmail: string | null;
  scope: string | null;
  gmailSyncedAt: string | null;
  sheetsSpreadsheetId: string | null;
};

type LabelRule = {
  id: string;
  label: string;
  projectId: string | null;
  projectName: string | null;
};

type ConfigStatus = {
  configured: boolean;
  source: "db" | "env" | null;
  clientId: string | null;
  redirectUri: string | null;
  updatedAt: string | null;
};

export function GoogleIntegration({
  configured,
  isAdmin,
  configStatus,
  projects,
  rules,
  account,
}: {
  configured: boolean;
  isAdmin: boolean;
  configStatus: ConfigStatus;
  projects: { id: string; name: string }[];
  rules: LabelRule[];
  account: Account | null;
}) {
  const params = useSearchParams();
  const connectedFlag = params.get("connected") === "1";
  const configuredFlag = params.get("configured") === "1";
  const ruleFlag = params.get("rule") === "1";
  const errorFlag = params.get("error");

  const [connecting, startConnecting] = useTransition();
  const [savingRule, startSavingRule] = useTransition();
  const [running, startRunning] = useTransition();
  const [savingCfg, startSavingCfg] = useTransition();

  // 새 검색어 규칙 입력.
  const [newLabel, setNewLabel] = useState("");
  const [newProjectId, setNewProjectId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(
    errorFlag ? mapOAuthError(errorFlag) : null,
  );

  // 관리자 OAuth 앱 설정 폼. secret은 서버에서 절대 내려오지 않으므로 빈 상태로 시작
  // (기존 설정이 있으면 빈칸 = 유지). client_id/redirect_uri는 기존값을 프리필.
  const [cfgClientId, setCfgClientId] = useState(configStatus.clientId ?? "");
  const [cfgSecret, setCfgSecret] = useState("");
  const [cfgRedirect, setCfgRedirect] = useState(configStatus.redirectUri ?? "");

  const connected = account?.status === "CONNECTED";
  const revoked = account?.status === "REVOKED";

  function saveConfig() {
    setErr(null);
    setMsg(null);
    startSavingCfg(async () => {
      const res = await saveGoogleClientConfig({
        clientId: cfgClientId,
        clientSecret: cfgSecret,
        redirectUri: cfgRedirect,
      });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setCfgSecret("");
      // 새 설정을 반영(연결 버튼 활성화)하려면 서버 렌더를 다시 받아야 한다.
      window.location.href = "/settings/integrations?configured=1";
    });
  }

  function clearConfig() {
    setErr(null);
    setMsg(null);
    startSavingCfg(async () => {
      const res = await clearGoogleClientConfig();
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      window.location.href = "/settings/integrations";
    });
  }

  function connect() {
    setErr(null);
    setMsg(null);
    startConnecting(async () => {
      const res = await startGoogleConnect();
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      window.location.href = res.data!.url;
    });
  }

  function disconnect() {
    setErr(null);
    setMsg(null);
    startConnecting(async () => {
      const res = await disconnectGoogle();
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      window.location.href = "/settings/integrations";
    });
  }

  function addRule() {
    setErr(null);
    setMsg(null);
    startSavingRule(async () => {
      const res = await addGmailLabelRule({
        label: newLabel,
        projectId: newProjectId,
      });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setNewLabel("");
      setNewProjectId("");
      window.location.href = "/settings/integrations?rule=1";
    });
  }

  function removeRule(id: string) {
    setErr(null);
    setMsg(null);
    startSavingRule(async () => {
      const res = await removeGmailLabelRule({ id });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      window.location.href = "/settings/integrations?rule=1";
    });
  }

  function runGmail(full: boolean) {
    setErr(null);
    setMsg(null);
    startRunning(async () => {
      const res = await syncGmailNow({ full });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      const d = res.data!;
      setMsg(
        d.skipped
          ? "검색어 규칙을 먼저 지정하고 저장하세요."
          : `Gmail 수집 완료 — 새로 ${d.collected}건 저장${d.failed ? `, 실패 ${d.failed}건` : ""}` +
              (d.hasMore ? " · 남은 메일이 더 있어요(다시 실행)" : ""),
      );
    });
  }

  function runCalendar() {
    setErr(null);
    setMsg(null);
    startRunning(async () => {
      const res = await syncCalendarNow();
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      const d = res.data!;
      setMsg(`캘린더 동기화 완료 — 생성 ${d.created} · 갱신 ${d.updated} · 삭제 ${d.deleted}`);
    });
  }

  function runSheets() {
    setErr(null);
    setMsg(null);
    startRunning(async () => {
      const res = await exportSheetsNow();
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      const d = res.data!;
      setMsg(`시트 내보내기 완료 — 탭 ${d.tabs}개 · ${d.rows}행`);
    });
  }

  const scopes = account?.scope?.split(/\s+/).filter(Boolean) ?? [];
  const sheetUrl = account?.sheetsSpreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${account.sheetsSpreadsheetId}`
    : null;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {connectedFlag && (
        <p className="flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          <CheckCircle2 className="size-4" /> 구글 계정이 연결되었습니다.
        </p>
      )}
      {configuredFlag && (
        <p className="flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          <CheckCircle2 className="size-4" /> 구글 OAuth 앱 설정을 저장했습니다.
        </p>
      )}
      {ruleFlag && (
        <p className="flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          <CheckCircle2 className="size-4" /> Gmail 수집 규칙을 저장했습니다.
        </p>
      )}
      {err && <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{err}</p>}
      {msg && <p className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">{msg}</p>}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <KeyRound className="size-4" /> 구글 OAuth 앱 설정 (관리자)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-xs text-muted-2">
              Google Cloud Console에서 발급한 앱 자격증명입니다. 모든 사용자가 이 앱 하나를 공유하며,
              여기 저장하면 <code>.env</code> 수정·재시작 없이 적용됩니다. client secret은 암호화되어 저장됩니다.
            </p>
            {configStatus.configured && (
              <p className="text-[11px] text-muted-2">
                현재 설정: {configStatus.source === "env" ? "환경변수(.env) 폴백" : "DB"}
                {configStatus.updatedAt
                  ? ` · 마지막 저장 ${formatDateTime(configStatus.updatedAt)}`
                  : ""}
              </p>
            )}
            <div>
              <Label>클라이언트 ID (client_id)</Label>
              <Input
                value={cfgClientId}
                onChange={(e) => setCfgClientId(e.target.value)}
                placeholder="000000-xxxx.apps.googleusercontent.com"
              />
            </div>
            <div>
              <Label>클라이언트 보안 비밀 (client_secret)</Label>
              <Input
                type="password"
                value={cfgSecret}
                onChange={(e) => setCfgSecret(e.target.value)}
                placeholder={
                  configStatus.source === "db"
                    ? "변경하지 않으려면 비워 두세요 (기존 값 유지)"
                    : "GOCSPX-..."
                }
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label>리디렉션 URI (redirect_uri)</Label>
              <Input
                value={cfgRedirect}
                onChange={(e) => setCfgRedirect(e.target.value)}
                placeholder="http://localhost:3000/api/google/callback"
              />
              <p className="mt-1 text-[11px] text-muted-2">
                Google Cloud Console의 “승인된 리디렉션 URI”와 정확히 일치해야 합니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={saveConfig} disabled={savingCfg}>
                {savingCfg ? <Loader2 className="animate-spin" /> : <KeyRound />} 설정 저장
              </Button>
              {configStatus.source === "db" && (
                <Button variant="secondary" onClick={clearConfig} disabled={savingCfg}>
                  설정 삭제
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>구글 계정 연결</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!configured && (
            <p className="text-sm text-muted-2">
              {isAdmin
                ? "위 “구글 OAuth 앱 설정”에 client_id·secret·redirect_uri를 입력하면 연결할 수 있습니다."
                : "관리자가 구글 OAuth 앱을 설정해야 연결할 수 있습니다."}
            </p>
          )}

          {connected || revoked ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">연결 계정</span>
                <span className="font-medium text-foreground">
                  {account?.googleEmail ?? "(이메일 확인 불가)"}
                </span>
                {revoked && (
                  <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] text-danger">
                    접근 취소됨 — 재연결 필요
                  </span>
                )}
              </div>
              {scopes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {scopes.map((s) => (
                    <span
                      key={s}
                      className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-muted-2"
                    >
                      {s.replace("https://www.googleapis.com/auth/", "")}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                {revoked && (
                  <Button onClick={connect} disabled={connecting || !configured}>
                    {connecting ? <Loader2 className="animate-spin" /> : <Link2 />} 다시 연결
                  </Button>
                )}
                <Button variant="secondary" onClick={disconnect} disabled={connecting}>
                  {connecting ? <Loader2 className="animate-spin" /> : <Unlink />} 연결 해제
                </Button>
              </div>
            </>
          ) : (
            <div>
              <Button onClick={connect} disabled={connecting || !configured}>
                {connecting ? <Loader2 className="animate-spin" /> : <Link2 />} 구글 계정 연결
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {connected && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <Mail className="size-4" /> Gmail 메일 수집
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-xs text-muted-2">
                검색어→프로젝트 규칙을 여러 개 추가할 수 있습니다. 각 검색어가 메일 제목·내용·발신자 중
                하나라도 매칭되는 메일을{" "}
                <a href="/mails" className="text-primary hover:underline">수집 메일</a>로 저장하고,
                노트로 변환할 때 그 규칙의 프로젝트로 연결합니다. 규칙이 하나도 없으면 수집되지 않습니다.
              </p>

              {/* 규칙 목록 */}
              {rules.length > 0 ? (
                <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {rules.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 px-3 py-2">
                      <Badge color="#a78bfa">{r.label}</Badge>
                      <span className="text-muted-2">→</span>
                      <span className="flex-1 truncate text-sm text-foreground">
                        {r.projectName ?? "연결 안 함 (노트만)"}
                      </span>
                      <button
                        onClick={() => removeRule(r.id)}
                        disabled={savingRule}
                        className="rounded p-1 text-muted-2 hover:text-danger disabled:opacity-50"
                        aria-label="규칙 삭제"
                        title="규칙 삭제"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border bg-surface-2/40 px-3 py-3 text-center text-[12px] text-muted-2">
                  아직 규칙이 없습니다. 아래에서 검색어를 추가하세요.
                </p>
              )}

              {/* 규칙 추가 */}
              <div className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <div>
                  <Label>검색어</Label>
                  <Input
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="예: 주간 보고, sender@company.com"
                  />
                </div>
                <div>
                  <Label>연결할 프로젝트 (선택)</Label>
                  <Select value={newProjectId} onChange={(e) => setNewProjectId(e.target.value)}>
                    <option value="">연결 안 함</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button variant="secondary" onClick={addRule} disabled={savingRule || !newLabel.trim()}>
                  {savingRule ? <Loader2 className="animate-spin" /> : <Plus />} 규칙 추가
                </Button>
              </div>

              <div className="mt-1 flex flex-wrap gap-2">
                <Button onClick={() => runGmail(false)} disabled={running}>
                  {running ? <Loader2 className="animate-spin" /> : <Mail />} 지금 Gmail 수집
                </Button>
                <Button variant="secondary" onClick={() => runGmail(true)} disabled={running}>
                  {running ? <Loader2 className="animate-spin" /> : null} 전체 다시 수집(백필)
                </Button>
              </div>
              <p className="text-[11px] text-muted-2">
                “전체 다시 수집”은 기간 제한 없이 각 검색어의 과거 메일까지 훑습니다(이미 수집된 건 건너뜀).
                한 번에 최대 40건씩 저장하니, “남은 메일” 안내가 뜨면 다시 눌러 주세요.
              </p>
              {account?.gmailSyncedAt && (
                <p className="text-[11px] text-muted-2">
                  마지막 수집: {formatDateTime(account.gmailSyncedAt)}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="size-4" /> 마감일 → 구글 캘린더
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-xs text-muted-2">
                작업·WBS·업무·요구사항·프로젝트의 마감일을 전용 “PMS 일정” 캘린더에 이벤트로 내보냅니다.
              </p>
              <div>
                <Button onClick={runCalendar} disabled={running}>
                  {running ? <Loader2 className="animate-spin" /> : <CalendarDays />} 지금 캘린더 동기화
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <Sheet className="size-4" /> PMS → 구글 시트
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-xs text-muted-2">
                프로젝트·작업·요구사항·WBS·업무·산출물을 도메인별 탭으로 스프레드시트에 덮어씁니다.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={runSheets} disabled={running}>
                  {running ? <Loader2 className="animate-spin" /> : <Sheet />} 지금 시트 내보내기
                </Button>
                {sheetUrl && (
                  <a
                    href={sheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 text-sm text-foreground hover:bg-surface-2"
                  >
                    <ExternalLink className="size-4" /> 스프레드시트 열기
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
