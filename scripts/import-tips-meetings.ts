/**
 * 회의록 → 세컨드 브레인 임포트 (TIPS 도전의 IR 프로젝트)
 *
 * 워크플로: 회의록 .md 를 클로드에게 주면, 내용을 이해해 아래처럼
 *   토픽/태그 · 지식 노트 · 엣지(관계) · 프로젝트/태스크 · 크로스링크
 * 로 구조화해 이 스크립트에 반영하고 `npm run import:tips` 로 적재한다.
 * (기존 dc_pms 앱 데이터를 비우고 새로 채운다. ERP public 스키마는 건드리지 않음)
 *
 * 원본:
 *  - TIPS_회의록_260626_온라인.md            (6/26 온라인)
 *  - TIPS_도전의_IR_대면회의_260701_회의록.md (7/1 대면)
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
const schema = connectionString
  ? new URL(connectionString).searchParams.get("schema") ?? undefined
  : undefined;
const adapter = new PrismaPg(
  { connectionString },
  schema ? { schema } : undefined,
);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 기존 앱 데이터 정리 (dc_pms)...");
  await prisma.noteLink.deleteMany();
  await prisma.edge.deleteMany();
  await prisma.noteTag.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.note.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.topic.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();

  console.log("🏢 워크스페이스 & 참여 주체...");
  const workspace = await prisma.workspace.create({
    data: { name: "TIPS 도전의 IR 사업" },
  });
  const dev = await prisma.user.create({
    data: { email: "dev@partner.co", name: "개발사", role: "ADMIN", workspaceId: workspace.id },
  });
  const client = await prisma.user.create({
    data: { email: "team@tips.go", name: "발주처(초기보육팀)", role: "MEMBER", workspaceId: workspace.id },
  });

  console.log("🗂️  토픽...");
  const topicDefs = [
    { key: "data", name: "회원·데이터 구조", color: "#a78bfa", description: "운영사/창업기업 데이터 모델·가입·분류·마이그레이션" },
    { key: "apply", name: "신청·일정 관리", color: "#60a5fa", description: "신청 폼·상태 단계·일정·차수·티켓·통계" },
    { key: "join", name: "조인팁스 연동", color: "#22d3ee", description: "운영사 기준정보 연동과 단일 소스 관리" },
    { key: "design", name: "디자인", color: "#f472b6", description: "컬러웨이·CI·레이아웃" },
    { key: "ops", name: "예산·계약·인프라", color: "#fbbf24", description: "예산·계약·서버 전환·일정" },
    { key: "meeting", name: "회의록", color: "#34d399", description: "원본 회의 기록(에피소드)" },
  ];
  const topics: Record<string, string> = {};
  for (const t of topicDefs) {
    const c = await prisma.topic.create({
      data: { name: t.name, color: t.color, description: t.description },
    });
    topics[t.key] = c.id;
  }

  console.log("🏷️  태그...");
  const tagDefs = [
    ["tips", "TIPS", "#22d3ee"],
    ["operator", "운영사", "#60a5fa"],
    ["startup", "창업기업", "#34d399"],
    ["category", "카테고리", "#a78bfa"],
    ["status", "신청상태", "#f472b6"],
    ["migration", "마이그레이션", "#fb7185"],
    ["schedule", "일정", "#fbbf24"],
    ["ticket", "티켓제한", "#f87171"],
    ["auth", "인증", "#94a3b8"],
    ["join", "조인팁스", "#22d3ee"],
    ["server", "서버", "#60a5fa"],
    ["budget", "예산", "#fbbf24"],
  ] as const;
  const tags: Record<string, string> = {};
  for (const [key, name, color] of tagDefs) {
    const c = await prisma.tag.create({ data: { name, color } });
    tags[key] = c.id;
  }

  console.log("📝 노트...");
  type NoteSeed = {
    key: string;
    title: string;
    type: "SEMANTIC" | "REFLECTIVE" | "PROCEDURAL" | "EPISODIC" | "THESIS" | "TOPIC" | "ENTITY" | "CLUSTER";
    topic: keyof typeof topics;
    tags?: string[];
    summary: string;
    content: string;
    author?: string;
  };

  const notes: NoteSeed[] = [
    // --- 개체(Entity) ---
    {
      key: "e-join",
      title: "조인팁스 (기준 시스템)",
      type: "ENTITY",
      topic: "join",
      tags: ["join", "operator"],
      summary: "운영사 메인(기준) 정보를 관리하는 기존 시스템.",
      content:
        "**조인팁스**는 운영사의 메인(기준) 정보를 CRUD 하는 시스템이다. 도전의 IR은 이 정보를 **참조하여 표시**한다. 심사 승인된 운영사만 조인팁스에 등록되는 구조로 정리.",
    },
    {
      key: "e-ir",
      title: "도전의 IR (모두의 IR)",
      type: "ENTITY",
      topic: "apply",
      tags: ["tips"],
      summary: "운영사 소개·IR·신청/일정을 담는 신규 구축 시스템.",
      content:
        "**도전의 IR**은 운영사 소개, IR 정보, 신청·일정 관리를 제공하는 신규 시스템이다. 운영사 기준정보는 조인팁스에서 가져오고, 신청·선정 절차는 별도 페이지에서 진행한다.",
    },

    // --- 6/26 온라인 회의 결정 ---
    {
      key: "unified",
      title: "운영사 소개 정보 통합 관리(단일 소스)",
      type: "THESIS",
      topic: "join",
      tags: ["operator", "join"],
      summary: "운영사 소개는 조인팁스 한 곳에서만 관리, 도전의 IR은 가져와 표시.",
      content:
        "운영사 소개 정보를 **조인팁스에서만 CRUD**(운영사 계정 다수가 수정)하고, 도전의 IR은 이를 **가져와 노출만** 한다.\n\n- 효과: 한 곳 수정 시 모든 사이트에 동일 반영 → **데이터 불일치 방지**\n- 각자 관리하면 정합성 문제 → 통합이 전제",
    },
    {
      key: "category",
      title: "투자 분야 카테고리 — 회차별 처리",
      type: "PROCEDURAL",
      topic: "apply",
      tags: ["category"],
      summary: "운영사 전체 카테고리 표시 + 미평가 카테고리는 회색·안내, 일정별 평가 카테고리 선택.",
      content:
        "운영사 소개의 카테고리는 **고정값(관리자 승인)**. 신청 화면에서는:\n\n1. 운영사 **전체 카테고리**(예: AI·반도체) 모두 표시\n2. 해당 회차에 평가 안 하는 카테고리는 **회색(비활성)** + \"이번 차수에는 투자 지원을 받지 않습니다\" 안내\n3. 일정 등록 시 운영사가 평가 카테고리 선택(보유 범위 내), 신청은 **라디오 버튼**\n\n카테고리 검색은 OR 조건.",
    },
    {
      key: "status",
      title: "신청 상태 단계 설계(비순차 전환)",
      type: "SEMANTIC",
      topic: "apply",
      tags: ["status"],
      summary: "검토중·반려·보완요청·보완검토·미팅·선정/미선정·취소. 순서 고정 아님. 선정까지만 시스템 관리.",
      content:
        "기존 '접수·검토 중'만 존재 → 단계 확장 필요.\n\n- 단계: **검토 중 · 반려 · 보완 요청 · 보완 검토 · 미팅 · 선정/미선정 · 취소**\n- 순차 진행 아님(재보완, 미팅이 앞단계로 오는 등) → 일부 단계는 **동급 상호 전환**\n- '접수' 단계 불필요(신청=접수). 운영사 **취소(반려)** 기능 필요(불합격과 별개)\n- **선정/미선정까지만** 시스템 관리, 이후(투자검토·현장실사 등)는 외부 절차(일지 작성은 가능)\n- 상태 변경 시 **일지**(시간·날짜·내용) 작성. 흐름 다이어그램은 발주처가 정리해 전달.",
    },
    {
      key: "form",
      title: "신청 폼 단순화 & 개인정보 정리",
      type: "PROCEDURAL",
      topic: "apply",
      tags: ["startup"],
      summary: "한 줄 소개 + 첨부 3종, 불필요 개인정보 제거, 제안서 서식 다운로드 제공.",
      content:
        "- 받지 않는 개인정보(생년월일 등) **항목 제거**(본인 정보 표시는 유지)\n- 신청 폼: **한 줄 소개 + 첨부파일 3개**로 단순화\n- **제안서 서식 다운로드** 버튼 제공(행사 정보/일정 등록 항목에 배치)\n- 첨부 종류는 추후 변경 용이 → 기능부터 우선 구현",
    },
    {
      key: "schedule",
      title: "운영사 일정·미팅 등록",
      type: "PROCEDURAL",
      topic: "apply",
      tags: ["schedule", "operator"],
      summary: "미팅 시작·종료 시간, 장소 텍스트 입력, 소재지와 미팅장소는 별개 항목.",
      content:
        "- 미팅은 **시작·종료 시간**(예: 10:00~12:00)으로 운영사 기준 등록. 세부 시간 배분은 운영사가 개별 안내/현장 결정\n- 미팅 장소는 **텍스트(주소·설명)** 입력, 미확정 가능 → 운영사가 등록·안내\n- 운영사 **소재지**(예: 서울 강남구)와 **미팅 장소**는 별개 항목",
    },
    {
      key: "region",
      title: "지역·소재지 검색",
      type: "SEMANTIC",
      topic: "apply",
      tags: ["operator"],
      summary: "운영사 약 145개 전국 분포 → 전 광역시·도 검색 옵션.",
      content:
        "운영사 약 **145개**가 전국에 분포 → **전 광역시·도**를 검색 옵션으로 제공. 소재지는 운영사 소개 정보에서 가져와 상세에 표시.",
    },
    {
      key: "server",
      title: "서버 전환(2개월 임대 후 반납)",
      type: "PROCEDURAL",
      topic: "ops",
      tags: ["server"],
      summary: "동급/상위 신규 서버 2개월 임대 → 안정화 후 기존 시스템 반납, 비용은 개발사 부담.",
      content:
        "- 동일/상위 사양 **신규 서버 약 2개월 임대** → 세팅·운용·안정화 후 기존 시스템 반납\n- 서버 비용은 **개발사 부담**(소액), 유지보수 비용 변동 없음으로 협의\n- 발주처는 기관 측에 비용·조건 변동 여부 재확인",
    },

    // --- 7/1 대면 회의 결정 ---
    {
      key: "tier3",
      title: "회원·데이터 3단계 구조",
      type: "THESIS",
      topic: "data",
      tags: ["operator", "startup"],
      summary: "① 기본정보(관리자 사전등록) ② 소개 콘텐츠 ③ IR 정보. 운영사/창업기업 분리·공통 통합.",
      content:
        "데이터 이원화 문제 해결을 위해 운영사 정보를 본 시스템에서 기본 등록.\n\n- **① 기본 정보** — 공통·불변, 관리자 사전 등록\n- **② 소개 콘텐츠** — 등록 후 운영사/창업기업 메뉴에서 입력\n- **③ IR 정보** — 소개 상세 기반 IR PDF 산출 정보\n\n운영사와 창업기업은 항목이 상이 → **구조 분리**, 완전 동일 항목만 **공통 영역 통합**.",
    },
    {
      key: "signup",
      title: "가입·승인 프로세스",
      type: "PROCEDURAL",
      topic: "data",
      tags: ["operator", "startup", "auth"],
      summary: "운영사=관리자 사전등록·계정발급(자율가입 불가), 창업기업=가입 후 관리자 승인.",
      content:
        "- **운영사**: 관리자 사전 등록(별도 화면) → 계정(ID/PW) 발급, **자율 회원가입 불가**\n- **창업기업**: 회원가입 시 구분자로 구분되나, 소개·IR 이용은 관리자 **추가 등록(승인)** 필요\n- **승인된 업체만** 소개서 작성·IR 관리 가능\n- 운영사 임직원 무분별 가입 방지: 등록 시 **고유 인증키** 자동 생성·이메일 발송 → 가입 시 입력",
    },
    {
      key: "classify",
      title: "분류 체계(12대 신산업 / 산업기술표준)",
      type: "SEMANTIC",
      topic: "data",
      tags: ["category"],
      summary: "12대 신산업=연도 불변 고정값(복수 선택), 산업기술 표준분류=매년 변경 별도 매핑.",
      content:
        "- **12대 신산업 분류**: 고정값(연도 불변), 운영사 **복수 선택** 가능\n- **산업기술 표준분류**: 매년 변경 → **별도 매핑** 필요, 투자 분야 선택 시 활용",
    },
    {
      key: "migration",
      title: "기존 데이터 마이그레이션(창업기업 4,000건)",
      type: "PROCEDURAL",
      topic: "data",
      tags: ["migration", "startup"],
      summary: "10~20건 테스트로 글자 수 등 검증 후 일괄 이관 여부 결정.",
      content:
        "창업기업 약 **4,000건** 이관 예정.\n\n1. 먼저 **10~20건 테스트**\n2. 글자 수(최소/최대) 등 검증\n3. 전체 리스트로 편차 반영한 입력 검증\n4. → **일괄 이관 여부 결정**",
    },
    {
      key: "round",
      title: "일정 등록 & 차수 자동 계산",
      type: "PROCEDURAL",
      topic: "apply",
      tags: ["schedule"],
      summary: "관리자 연도단위 신청·미팅 기간 등록, 차수 미노출·연도 기준 자동 계산, 신청/미팅 기간 분리.",
      content:
        "- 관리자가 **연도 단위**로 신청기간·미팅기간 등록(예: 1차 신청 6/1~7/30)\n- 일정별 참여 운영사·날짜·시간·장소·최대 인원 개별 설정, 트랙(AI/콘텐츠 등) 선택 활성화\n- **차수는 사용자에게 미노출**, 연도 기준으로만 관리 → 내부 자동 계산(최초 등록=1차수, 이후 순차 증가)\n- 신청/미팅 기간 **분리**: 접수 집중과 미팅 시점을 다르게 운영",
    },
    {
      key: "ticket",
      title: "신청 티켓(횟수) 제한",
      type: "SEMANTIC",
      topic: "apply",
      tags: ["ticket", "startup"],
      summary: "쏠림 방지 위해 연 4회(상2·하2) 제한, 관리자 입력값, 무제한 시 9999.",
      content:
        "창업기업의 운영사 신청 횟수를 제한(예: **상반기 2회 + 하반기 2회 = 연 4회**)해 특정 운영사 **쏠림 방지**.\n\n- 올해는 제한 유지, 해제는 연말 운영결과·국정감사 후 재검토\n- 관리자 화면 입력 항목으로 추가, **무제한 시 9999** 등으로 설정",
    },
    {
      key: "stats",
      title: "통계 — 월말 스냅샷",
      type: "PROCEDURAL",
      topic: "apply",
      tags: ["tips"],
      summary: "실시간 대신 월말 스냅샷 표시, 상세는 엑셀, 삭제 대신 비활성 플래그로 이력 보존.",
      content:
        "- 실시간 집계 대신 **월말(마지막 날) 스냅샷** 데이터로 표시\n- 상세·일별은 **엑셀 다운로드**(DB 직접 추출)\n- 조인팁스에서 삭제돼도 **완전 삭제하지 않고 비활성 플래그**로 이력 보존\n- 메인 누적 통계(운영사 수·선정기업 수·투자금액) 노출/디자인은 추가 논의",
    },
    {
      key: "join-link",
      title: "조인팁스 연동 정책",
      type: "PROCEDURAL",
      topic: "join",
      tags: ["join", "operator", "auth"],
      summary: "운영사 기준정보는 조인팁스, 도전의 IR은 참조. 심사 승인 운영사만 조인팁스 등록.",
      content:
        "- 운영사 **메인 정보는 조인팁스**에서 관리, 도전의 IR은 **참조**\n- 신청·선정은 별도 페이지 → **심사 승인된 운영사만 조인팁스 등록**\n- 성과 이력 메뉴는 기존 항목 참고하되 불필요 기능 정리 후 재개발\n- 비TIPS 창업기업은 사업자등록번호 검증 제한적 → 관리자 승인 시 유선 확인 등 보완",
    },
    {
      key: "design",
      title: "디자인 컬러웨이 차별화",
      type: "REFLECTIVE",
      topic: "design",
      summary: "조인팁스 빨강 계열과 구분되게 초록·청색 계열 검토(미확정), CI 정사각 이슈·여백 보완.",
      content:
        "- 조인팁스가 빨강/마젠타 계열 → 도전의 IR은 **초록·청색 계열** 차별화 검토(최종 미확정, 우선 설계 진행)\n- CI(로고)가 **정사각 비율**이라 메뉴 영역 활용 비효율 의견\n- 여백이 많아 허전 → 컬러 박스·경계선·이미지 보완(디자이너 검토)\n- 상단 배너·통계 노출 위치는 시안 확인 후 결정",
    },
    {
      key: "budget",
      title: "예산·계약",
      type: "SEMANTIC",
      topic: "ops",
      tags: ["budget"],
      summary: "총 약 5,500만 원(운영사관리+도전의IR+팁스 안정화), 유지보수/개발 계약 분리, 8월 수익계약.",
      content:
        "- 총 예산 약 **5,500만 원**: 운영사 관리 시스템 + 도전의 IR + 팁스 안정화 포함\n- **유지보수 계약과 개발 계약 분리**, 8월부터 수익계약 체결 예정\n- 견적서·확인서 등 서류 각각 준비·제출",
    },

    // --- 회의록 원본(에피소드) ---
    {
      key: "m0626",
      title: "회의록 · 6/26 온라인 (TIPS 타운 시스템 개편)",
      type: "EPISODIC",
      topic: "meeting",
      tags: ["tips"],
      author: "client",
      summary: "운영사 소개 통합관리·카테고리 회차 처리·신청 상태 단계·서버 전환 논의. 다음 회의 수 13:30 대면.",
      content:
        "**일시** 2026-06-26 (온라인) · **참석** 개발사 ↔ 발주처(초기보육팀)\n\n**주요 결정**\n1. 운영사 소개 **조인팁스 단일 관리**, 도전의 IR은 표시만\n2. 투자 카테고리 **회차별 처리**(미평가 회색+안내, 라디오 선택)\n3. 운영사 **일정·미팅** 등록(시간·장소 텍스트)\n4. 신청 폼 **단순화**(한 줄 소개+첨부 3), 개인정보 정리\n5. **신청 상태 단계** 확장(비순차) — 흐름은 발주처가 다이어그램 정리\n6. 지역(광역시·도)별 검색\n7. **서버 전환**(2개월 임대→반납)\n8. 실작업 ~15일, 20일경 가시적 산출물\n\n**다음** 수요일 13:30 발주처 방문(대면).",
    },
    {
      key: "m0701",
      title: "회의록 · 7/1 대면 (도전의 IR 시스템 구축)",
      type: "EPISODIC",
      topic: "meeting",
      tags: ["tips"],
      author: "client",
      summary: "회원·데이터 3단계 구조, 일정·차수·티켓, 통계 스냅샷, 조인팁스 연동, 디자인, 예산 5,500만.",
      content:
        "**일시** 2026-07-01 (대면)\n\n**주요 결정**\n1. 회원·데이터 **3단계 구조**(기본정보/소개/IR), 운영사·창업기업 분리\n2. **가입·승인**: 운영사 사전등록·계정발급, 창업기업 승인, 인증키 발송\n3. 분류: **12대 신산업(고정)** + 산업기술표준(매년 매핑)\n4. 창업기업 **4,000건 마이그레이션**(10~20건 테스트 선행)\n5. **일정·차수 자동 계산**(연도 기준, 차수 미노출), 신청/미팅 기간 분리\n6. **신청 티켓 연 4회** 제한\n7. 통계 **월말 스냅샷**, 삭제 대신 비활성\n8. **조인팁스 연동**(기준정보 참조)\n9. 디자인 **컬러웨이 차별화**(초록·청색 검토)\n10. 예산 **약 5,500만**, 계약 분리(8월 수익계약)\n\n**향후** 피드백 마감 다음 주 월~수, 개발 킥오프, 연내 1차 사이클(12월 오픈 가능성). 차기 회의 7/2 오전.",
    },
  ];

  const noteId: Record<string, string> = {};
  for (const n of notes) {
    const created = await prisma.note.create({
      data: {
        title: n.title,
        content: n.content,
        summary: n.summary,
        type: n.type,
        topicId: topics[n.topic],
        authorId: n.author === "client" ? client.id : dev.id,
        workspaceId: workspace.id,
        tags: n.tags?.length
          ? { create: n.tags.map((t) => ({ tagId: tags[t] })) }
          : undefined,
      },
    });
    noteId[n.key] = created.id;
  }

  console.log("🔗 엣지(관계)...");
  const edges: [string, string, string][] = [
    // 지식 관계
    ["tier3", "unified", "EXTENDS"],
    ["signup", "tier3", "INSTANTIATES"],
    ["migration", "tier3", "REQUIRES"],
    ["classify", "tier3", "COMPOSES"],
    ["category", "classify", "REQUIRES"],
    ["round", "status", "SUPPORTS"],
    ["ticket", "round", "EXTENDS"],
    ["join-link", "unified", "SUPPORTS"],
    ["stats", "join-link", "EXTENDS"],
    ["form", "status", "COMPOSES"],
    ["schedule", "round", "COMPOSES"],
    ["region", "schedule", "SUPPORTS"],
    // 개체 언급
    ["unified", "e-join", "MENTIONS"],
    ["join-link", "e-join", "MENTIONS"],
    ["category", "e-ir", "MENTIONS"],
    ["status", "e-ir", "MENTIONS"],
    // 회의 → 후속
    ["m0701", "m0626", "EXTENDS"],
  ];
  // 회의가 담은 결정들(회의 노드를 허브로)
  const m0626Notes = ["unified", "category", "status", "form", "schedule", "region", "server"];
  const m0701Notes = ["tier3", "signup", "classify", "migration", "round", "ticket", "stats", "join-link", "design", "budget"];
  for (const k of m0626Notes) edges.push(["m0626", k, "MENTIONS"]);
  for (const k of m0701Notes) edges.push(["m0701", k, "MENTIONS"]);

  for (const [s, t, type] of edges) {
    await prisma.edge.create({
      data: { sourceId: noteId[s], targetId: noteId[t], type: type as never },
    });
  }

  console.log("📋 프로젝트 & 태스크(칸반)...");
  const project = await prisma.project.create({
    data: {
      name: "TIPS 도전의 IR 시스템 구축",
      description:
        "운영사 관리 + 도전의 IR + 팁스 안정화. 회원·데이터 구조 개편, 신청·일정 관리, 조인팁스 연동. 연내 1차 사이클 목표.",
      status: "ACTIVE",
      color: "#22d3ee",
      ownerId: dev.id,
      workspaceId: workspace.id,
    },
  });

  type TaskSeed = {
    key: string;
    title: string;
    status: "BACKLOG" | "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    who: "dev" | "client";
    desc?: string;
  };
  const taskSeeds: TaskSeed[] = [
    // 발주처
    { key: "t-diagram", title: "신청 상태 단계 흐름 다이어그램 정리(최우선)", status: "TODO", priority: "URGENT", who: "client", desc: "순서·분기 확정해 개발사에 전달." },
    { key: "t-catpolicy", title: "카테고리 분류 정리 & 통합 관리 방침 확정", status: "TODO", priority: "HIGH", who: "client" },
    { key: "t-formfix", title: "신청 폼 항목·제안서 서식 확정", status: "TODO", priority: "MEDIUM", who: "client" },
    { key: "t-servercost", title: "서버 비용·유지보수 변동 기관 재확인", status: "TODO", priority: "LOW", who: "client" },
    // 개발사
    { key: "t-unified", title: "운영사 소개 조인팁스 단일 관리 구성", status: "IN_PROGRESS", priority: "HIGH", who: "dev", desc: "도전의 IR은 가져와 표시, 카테고리는 관리자만 변경." },
    { key: "t-tier3", title: "회원 3단계 구조 & 가입·승인 프로세스 구현", status: "IN_PROGRESS", priority: "HIGH", who: "dev" },
    { key: "t-milestone", title: "20일경 가시적 산출물 제작·테스트·보고", status: "IN_PROGRESS", priority: "URGENT", who: "dev" },
    { key: "t-category", title: "신청 화면 카테고리 회색 처리 + 안내문구 + 라디오", status: "TODO", priority: "HIGH", who: "dev" },
    { key: "t-schedule", title: "일정 등록(평가 카테고리·미팅 시간·장소)", status: "TODO", priority: "MEDIUM", who: "dev" },
    { key: "t-form", title: "신청 폼 단순화 + 개인정보 제거 + 서식 다운로드", status: "TODO", priority: "MEDIUM", who: "dev" },
    { key: "t-migration", title: "창업기업 데이터 마이그레이션(10~20건 테스트)", status: "TODO", priority: "HIGH", who: "dev" },
    { key: "t-server", title: "신규 서버 임대·세팅 후 전환", status: "TODO", priority: "MEDIUM", who: "dev" },
    { key: "t-status", title: "신청 상태 단계 + 비순차 전환 + 일지 구현", status: "BACKLOG", priority: "HIGH", who: "dev" },
    { key: "t-cancel", title: "운영사 취소(반려) 기능 구현", status: "BACKLOG", priority: "MEDIUM", who: "dev" },
    { key: "t-region", title: "지역별 검색 + 소재지·미팅 장소 표시", status: "BACKLOG", priority: "LOW", who: "dev" },
    { key: "t-roundticket", title: "차수 자동계산 & 티켓 제한 관리화면", status: "BACKLOG", priority: "MEDIUM", who: "dev" },
    // 결정 필요
    { key: "t-scope", title: "선정 이후 단계 시스템 관리 범위 결정", status: "BACKLOG", priority: "LOW", who: "client" },
    { key: "t-color", title: "디자인 컬러웨이 확정", status: "BACKLOG", priority: "LOW", who: "client" },
  ];

  const perStatus: Record<string, number> = {};
  const taskId: Record<string, string> = {};
  for (const s of taskSeeds) {
    perStatus[s.status] = (perStatus[s.status] ?? 0) + 1;
    const created = await prisma.task.create({
      data: {
        projectId: project.id,
        title: s.title,
        description: s.desc,
        status: s.status,
        priority: s.priority,
        assigneeId: s.who === "client" ? client.id : dev.id,
        order: perStatus[s.status] * 1000,
      },
    });
    taskId[s.key] = created.id;
  }

  console.log("🧷 크로스 링크(노트 ↔ 프로젝트/태스크)...");
  await prisma.noteLink.createMany({
    data: [
      // 프로젝트 근거 노트
      { noteId: noteId["tier3"], projectId: project.id, relation: "핵심 구조" },
      { noteId: noteId["status"], projectId: project.id, relation: "상태 설계" },
      { noteId: noteId["unified"], projectId: project.id, relation: "데이터 원칙" },
      { noteId: noteId["budget"], projectId: project.id, relation: "예산·계약" },
      { noteId: noteId["m0701"], projectId: project.id, relation: "킥오프 회의" },
      // 태스크 근거 노트
      { noteId: noteId["status"], taskId: taskId["t-status"], relation: "설계 근거" },
      { noteId: noteId["status"], taskId: taskId["t-diagram"], relation: "요청 산출물" },
      { noteId: noteId["category"], taskId: taskId["t-category"], relation: "요구사항" },
      { noteId: noteId["unified"], taskId: taskId["t-unified"], relation: "요구사항" },
      { noteId: noteId["tier3"], taskId: taskId["t-tier3"], relation: "요구사항" },
      { noteId: noteId["migration"], taskId: taskId["t-migration"], relation: "절차" },
      { noteId: noteId["server"], taskId: taskId["t-server"], relation: "요구사항" },
      { noteId: noteId["form"], taskId: taskId["t-form"], relation: "요구사항" },
      { noteId: noteId["schedule"], taskId: taskId["t-schedule"], relation: "요구사항" },
      { noteId: noteId["round"], taskId: taskId["t-roundticket"], relation: "요구사항" },
      { noteId: noteId["region"], taskId: taskId["t-region"], relation: "요구사항" },
    ],
  });

  const counts = {
    notes: await prisma.note.count(),
    edges: await prisma.edge.count(),
    topics: await prisma.topic.count(),
    tags: await prisma.tag.count(),
    projects: await prisma.project.count(),
    tasks: await prisma.task.count(),
    links: await prisma.noteLink.count(),
  };
  console.log("✅ TIPS 임포트 완료:", counts);
}

main()
  .catch((e) => {
    console.error("❌ 임포트 실패:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
