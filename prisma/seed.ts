import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/password";

// Shared demo password for the seeded accounts (email로 로그인, 비번은 동일).
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "password123!";

const connectionString = process.env.DATABASE_URL;
const schema = connectionString
  ? new URL(connectionString).searchParams.get("schema") ?? undefined
  : undefined;
const adapter = new PrismaPg(
  // Match src/server/db.ts: force ISO datestyle on the EDB connection.
  { connectionString, options: "-c datestyle=ISO,MDY" },
  schema ? { schema } : undefined,
);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 기존 데이터 정리...");
  // Delete in dependency order.
  await prisma.noteLink.deleteMany();
  await prisma.edge.deleteMany();
  await prisma.noteTag.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.note.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.topic.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();

  console.log("🏢 워크스페이스 & 사용자...");
  const workspace = await prisma.workspace.create({
    data: { name: "Acme AI" },
  });

  // Hash once, reuse for all demo users.
  const demoHash = await hashPassword(DEMO_PASSWORD);

  const [alex, jiwon, minjun] = await Promise.all([
    prisma.user.create({
      data: {
        email: "alex@acme.ai",
        name: "알렉스",
        role: "ADMIN",
        passwordHash: demoHash,
        workspaceId: workspace.id,
      },
    }),
    prisma.user.create({
      data: {
        email: "jiwon@acme.ai",
        name: "지원",
        role: "MEMBER",
        passwordHash: demoHash,
        workspaceId: workspace.id,
      },
    }),
    prisma.user.create({
      data: {
        email: "minjun@acme.ai",
        name: "민준",
        role: "MEMBER",
        passwordHash: demoHash,
        workspaceId: workspace.id,
      },
    }),
  ]);
  const authors = [alex.id, jiwon.id, minjun.id];
  const pick = (i: number) => authors[i % authors.length];

  console.log("🗂️  토픽...");
  const topicData = [
    { key: "product", name: "제품 전략", color: "#22d3ee", description: "제품 방향과 우선순위" },
    { key: "eng", name: "엔지니어링", color: "#60a5fa", description: "아키텍처·인프라·개발 관행" },
    { key: "ai", name: "AI / LLM", color: "#a78bfa", description: "모델·프롬프트·RAG" },
    { key: "onboard", name: "온보딩", color: "#34d399", description: "신규 입사자 가이드" },
    { key: "retro", name: "회고 / 인사이트", color: "#fbbf24", description: "회고와 배운 점" },
  ];
  const topics: Record<string, string> = {};
  for (const t of topicData) {
    const created = await prisma.topic.create({
      data: { name: t.name, color: t.color, description: t.description },
    });
    topics[t.key] = created.id;
  }

  console.log("🏷️  태그...");
  const tagData = [
    { key: "rag", name: "RAG", color: "#a78bfa" },
    { key: "prompt", name: "프롬프트", color: "#f472b6" },
    { key: "infra", name: "인프라", color: "#60a5fa" },
    { key: "hiring", name: "채용", color: "#34d399" },
    { key: "okr", name: "OKR", color: "#22d3ee" },
    { key: "security", name: "보안", color: "#f87171" },
    { key: "ux", name: "UX", color: "#fbbf24" },
    { key: "perf", name: "성능", color: "#fb7185" },
  ];
  const tags: Record<string, string> = {};
  for (const t of tagData) {
    const created = await prisma.tag.create({
      data: { name: t.name, color: t.color },
    });
    tags[t.key] = created.id;
  }

  console.log("📝 노트...");
  type NoteSeed = {
    key: string;
    title: string;
    type:
      | "SEMANTIC"
      | "REFLECTIVE"
      | "PROCEDURAL"
      | "EPISODIC"
      | "THESIS"
      | "TOPIC"
      | "ENTITY"
      | "CLUSTER";
    topic?: keyof typeof topics;
    tags?: string[];
    summary?: string;
    content: string;
  };

  const notes: NoteSeed[] = [
    {
      key: "vision",
      title: "회사 비전: 지식이 흐르는 조직",
      type: "THESIS",
      topic: "product",
      tags: ["okr"],
      summary: "흩어진 지식을 연결해 팀의 의사결정 속도를 높인다.",
      content:
        "## 우리가 푸는 문제\n\n조직의 지식은 슬랙, 노션, 사람 머릿속에 **흩어져** 있다. 우리는 이 지식을 노드와 엣지로 연결해 *두 번째 뇌*를 만든다.\n\n- 검색이 아니라 **탐색**한다\n- 문서가 아니라 **연결**을 남긴다\n- 온보딩 시간을 절반으로 줄인다",
    },
    {
      key: "second-brain",
      title: "세컨드 브레인이란",
      type: "SEMANTIC",
      topic: "product",
      tags: ["ux"],
      summary: "노트를 그래프로 연결해 맥락을 보존하는 지식 관리 방식.",
      content:
        "세컨드 브레인은 개별 노트를 **관계**로 연결해, 나중에 맥락과 함께 다시 떠올릴 수 있게 하는 방법론이다. 핵심은 폴더가 아니라 **링크**다.",
    },
    {
      key: "graph-ui",
      title: "지식 그래프 UI 원칙",
      type: "PROCEDURAL",
      topic: "product",
      tags: ["ux"],
      summary: "노드 타입 색상, 렌즈, 필터로 복잡한 그래프를 읽히게 한다.",
      content:
        "1. **노드 타입별 색상**으로 한눈에 종류를 구분\n2. **렌즈**(전체/토픽/클러스터)로 관점 전환\n3. 라벨 토글과 스페이싱으로 밀도 조절\n4. 클릭하면 내용을 즉시 펼친다",
    },
    {
      key: "rag-arch",
      title: "RAG 파이프라인 아키텍처",
      type: "SEMANTIC",
      topic: "ai",
      tags: ["rag", "infra"],
      summary: "임베딩 → 벡터검색 → 리랭크 → 생성의 4단계.",
      content:
        "## 단계\n\n1. 문서 청킹 & **임베딩**\n2. 벡터 DB에서 top-k **검색**\n3. cross-encoder **리랭크**\n4. 컨텍스트 주입 후 **생성**\n\n> 리랭크 단계가 품질에 가장 큰 영향을 준다.",
    },
    {
      key: "chunking",
      title: "청킹 전략 실험 기록",
      type: "EPISODIC",
      topic: "ai",
      tags: ["rag", "perf"],
      summary: "512 토큰 + 15% 오버랩이 가장 안정적이었다.",
      content:
        "여러 청킹 크기를 A/B로 실험했다. **512 토큰 + 15% 오버랩**이 recall과 비용의 균형이 가장 좋았다. 문단 경계를 존중하는 것이 고정 길이보다 나았다.",
    },
    {
      key: "rerank",
      title: "리랭커 도입으로 정확도 +18%",
      type: "EPISODIC",
      topic: "ai",
      tags: ["rag", "perf"],
      summary: "cross-encoder 리랭커가 top-3 정확도를 크게 올렸다.",
      content:
        "bge-reranker를 붙였더니 top-3 정확도가 **+18%p**. 지연은 요청당 40ms 증가에 그쳐 트레이드오프가 훌륭했다.",
    },
    {
      key: "prompt-guide",
      title: "프롬프트 작성 가이드",
      type: "PROCEDURAL",
      topic: "ai",
      tags: ["prompt"],
      summary: "역할·제약·예시·출력형식 4요소를 항상 포함.",
      content:
        "좋은 프롬프트는 4요소를 갖춘다:\n\n- **역할**: 누구로서 답하는가\n- **제약**: 하지 말아야 할 것\n- **예시**: 1~2개의 few-shot\n- **출력 형식**: JSON/마크다운 등 명시",
    },
    {
      key: "hallucination",
      title: "환각은 검색 실패에서 온다",
      type: "THESIS",
      topic: "ai",
      tags: ["rag", "prompt"],
      summary: "대부분의 환각은 모델이 아니라 컨텍스트 부족 문제다.",
      content:
        "현장 사례를 보면 환각의 상당수는 모델 능력이 아니라 **검색이 관련 문서를 못 가져온** 경우다. 즉 RAG 품질을 올리면 환각이 준다.",
    },
    {
      key: "vector-db",
      title: "벡터 DB 선택: pgvector",
      type: "SEMANTIC",
      topic: "eng",
      tags: ["infra", "rag"],
      summary: "이미 쓰는 Postgres에 pgvector로 운영 단순화.",
      content:
        "별도 벡터 DB 대신 **pgvector**를 골랐다. 운영 부담이 적고, 메타데이터 필터와 벡터 검색을 한 쿼리로 결합할 수 있다. 수천만 벡터 전까지는 충분하다.",
    },
    {
      key: "infra-overview",
      title: "인프라 개요",
      type: "SEMANTIC",
      topic: "eng",
      tags: ["infra"],
      summary: "Next.js(Vercel) + Postgres(AWS RDS) + 워커.",
      content:
        "- 프론트/API: **Next.js**, Vercel 배포\n- DB: **Postgres** (AWS RDS)\n- 비동기 작업: 큐 + 워커\n- 관측: 로그/메트릭 대시보드",
    },
    {
      key: "db-migration",
      title: "무중단 스키마 마이그레이션 절차",
      type: "PROCEDURAL",
      topic: "eng",
      tags: ["infra"],
      summary: "확장 → 배포 → 백필 → 축소의 4단계 롤아웃.",
      content:
        "1. **확장**: 새 컬럼을 nullable 로 추가\n2. **배포**: 신·구 코드 동시 호환\n3. **백필**: 데이터 채우기\n4. **축소**: 구 컬럼 제거\n\n각 단계는 되돌릴 수 있어야 한다.",
    },
    {
      key: "security-baseline",
      title: "보안 기본선",
      type: "PROCEDURAL",
      topic: "eng",
      tags: ["security", "infra"],
      summary: "최소 권한, 비밀은 시크릿 매니저, 전송구간 암호화.",
      content:
        "- 모든 접근은 **최소 권한**\n- 비밀값은 코드가 아니라 **시크릿 매니저**\n- DB 연결은 **sslmode=require**\n- 의존성 취약점 주기적 스캔",
    },
    {
      key: "incident-rds",
      title: "장애 회고: RDS 커넥션 고갈",
      type: "EPISODIC",
      topic: "retro",
      tags: ["infra", "perf"],
      summary: "서버리스 함수의 커넥션 폭증 → 풀러 도입으로 해결.",
      content:
        "배포 직후 RDS 커넥션이 한도에 도달해 장애가 났다. 원인은 서버리스 인스턴스마다 새 커넥션을 연 것. **커넥션 풀러**를 도입해 해결했다.\n\n**교훈**: 서버리스 + DB 는 반드시 풀러를 낀다.",
    },
    {
      key: "conn-pooling",
      title: "커넥션 풀링 개념",
      type: "SEMANTIC",
      topic: "eng",
      tags: ["infra", "perf"],
      summary: "커넥션을 재사용해 DB 부하와 지연을 줄인다.",
      content:
        "커넥션 풀러는 소수의 물리 커넥션을 여러 요청이 **재사용**하게 한다. 서버리스 환경에서 특히 중요하다.",
    },
    {
      key: "okr-q3",
      title: "Q3 OKR",
      type: "TOPIC",
      topic: "product",
      tags: ["okr"],
      summary: "검색 품질과 온보딩 두 축에 집중.",
      content:
        "**O**: 지식 탐색 경험을 최고 수준으로.\n\n- **KR1** 검색 top-3 정확도 85%\n- **KR2** 신규 온보딩 3일 → 1.5일\n- **KR3** 주간 활성 사용자 +40%",
    },
    {
      key: "onboarding-guide",
      title: "신규 입사자 온보딩 체크리스트",
      type: "PROCEDURAL",
      topic: "onboard",
      tags: ["hiring", "ux"],
      summary: "1일차 환경설정, 1주차 첫 PR, 2주차 온콜 셰도잉.",
      content:
        "- **1일차**: 계정/환경설정, 아키텍처 개요 읽기\n- **1주차**: 첫 PR 머지\n- **2주차**: 온콜 셰도잉\n- 멘토 1:1 주 2회",
    },
    {
      key: "hiring-bar",
      title: "채용 기준: 학습 속도 우선",
      type: "THESIS",
      topic: "onboard",
      tags: ["hiring"],
      summary: "현재 스킬보다 학습 속도와 협업 태도를 본다.",
      content:
        "빠르게 변하는 분야에서는 **지금 아는 것**보다 **얼마나 빨리 배우는가**가 중요하다. 협업 태도는 타협하지 않는다.",
    },
    {
      key: "eng-culture",
      title: "엔지니어링 문화",
      type: "REFLECTIVE",
      topic: "retro",
      tags: ["ux"],
      summary: "작게 배포하고, 되돌릴 수 있게 만들고, 글로 남긴다.",
      content:
        "우리가 믿는 것:\n\n1. **작게 자주** 배포한다\n2. 항상 **되돌릴 수 있게** 만든다\n3. 결정은 **글로 남긴다** (이 그래프처럼)",
    },
    {
      key: "search-quality",
      title: "검색 품질을 어떻게 측정할까",
      type: "REFLECTIVE",
      topic: "ai",
      tags: ["rag", "okr"],
      summary: "오프라인 지표와 실제 사용 로그를 함께 본다.",
      content:
        "검색 품질은 하나의 숫자로 안 잡힌다. **오프라인**(recall@k, MRR)과 **온라인**(클릭·재검색율)을 함께 봐야 실제 체감과 맞는다.",
    },
    {
      key: "pgvector-index",
      title: "pgvector 인덱스 튜닝",
      type: "PROCEDURAL",
      topic: "eng",
      tags: ["rag", "perf", "infra"],
      summary: "HNSW 파라미터로 recall과 지연을 조율.",
      content:
        "HNSW 인덱스의 `m`, `ef_construction`, `ef_search` 를 조정해 recall과 지연의 균형을 잡는다. 프로덕션 쿼리 분포로 `ef_search` 를 튜닝하라.",
    },
  ];

  const noteIds: Record<string, string> = {};
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const created = await prisma.note.create({
      data: {
        title: n.title,
        content: n.content,
        summary: n.summary,
        type: n.type,
        authorId: pick(i),
        workspaceId: workspace.id,
        topicId: n.topic ? topics[n.topic] : undefined,
        tags: n.tags
          ? { create: n.tags.map((t) => ({ tagId: tags[t] })) }
          : undefined,
      },
    });
    noteIds[n.key] = created.id;
  }

  console.log("🔗 엣지...");
  const edges: [string, string, string][] = [
    ["second-brain", "vision", "SUPPORTS"],
    ["graph-ui", "second-brain", "EXTENDS"],
    ["graph-ui", "vision", "SUPPORTS"],
    ["rag-arch", "vector-db", "REQUIRES"],
    ["chunking", "rag-arch", "INSTANTIATES"],
    ["rerank", "rag-arch", "EXTENDS"],
    ["rerank", "search-quality", "SUPPORTS"],
    ["prompt-guide", "hallucination", "SUPPORTS"],
    ["hallucination", "rag-arch", "REQUIRES"],
    ["hallucination", "search-quality", "SUPPORTS"],
    ["vector-db", "infra-overview", "COMPOSES"],
    ["pgvector-index", "vector-db", "REFINES"],
    ["pgvector-index", "chunking", "SUPPORTS"],
    ["conn-pooling", "incident-rds", "SUPPORTS"],
    ["incident-rds", "infra-overview", "MENTIONS"],
    ["db-migration", "infra-overview", "EXTENDS"],
    ["security-baseline", "infra-overview", "EXTENDS"],
    ["okr-q3", "vision", "INSTANTIATES"],
    ["search-quality", "okr-q3", "SUPPORTS"],
    ["onboarding-guide", "okr-q3", "SUPPORTS"],
    ["hiring-bar", "onboarding-guide", "SUPPORTS"],
    ["eng-culture", "db-migration", "SUPPORTS"],
    ["eng-culture", "hiring-bar", "EXTENDS"],
    ["chunking", "search-quality", "SUPPORTS"],
    ["rerank", "pgvector-index", "REQUIRES"],
    ["conn-pooling", "infra-overview", "COMPOSES"],
    ["prompt-guide", "graph-ui", "MENTIONS"],
    ["okr-q3", "search-quality", "REQUIRES"],
  ];
  for (const [s, t, type] of edges) {
    await prisma.edge.create({
      data: { sourceId: noteIds[s], targetId: noteIds[t], type: type as never },
    });
  }

  console.log("📋 프로젝트 & 태스크...");
  const searchProject = await prisma.project.create({
    data: {
      name: "검색 품질 개선",
      description: "RAG 파이프라인의 top-3 정확도를 85%까지 끌어올린다.",
      status: "ACTIVE",
      color: "#a78bfa",
      ownerId: alex.id,
      workspaceId: workspace.id,
    },
  });
  const onboardProject = await prisma.project.create({
    data: {
      name: "온보딩 리뉴얼",
      description: "신규 입사자 온보딩을 3일에서 1.5일로 단축한다.",
      status: "ACTIVE",
      color: "#34d399",
      ownerId: jiwon.id,
      workspaceId: workspace.id,
    },
  });

  type TaskSeed = {
    title: string;
    status: "BACKLOG" | "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    assignee?: string;
    desc?: string;
  };

  const searchTasks: TaskSeed[] = [
    { title: "리랭커 프로덕션 배포", status: "DONE", priority: "HIGH", assignee: minjun.id, desc: "bge-reranker 를 검색 파이프라인에 통합." },
    { title: "청킹 전략 확정", status: "DONE", priority: "MEDIUM", assignee: jiwon.id },
    { title: "pgvector HNSW 튜닝", status: "IN_PROGRESS", priority: "HIGH", assignee: minjun.id, desc: "ef_search 를 프로덕션 분포로 조정." },
    { title: "온라인 평가 대시보드", status: "IN_PROGRESS", priority: "MEDIUM", assignee: alex.id },
    { title: "오프라인 평가셋 확장", status: "IN_REVIEW", priority: "MEDIUM", assignee: jiwon.id },
    { title: "쿼리 재작성 실험", status: "TODO", priority: "MEDIUM", assignee: minjun.id },
    { title: "환각 사례 라벨링", status: "TODO", priority: "LOW", assignee: jiwon.id },
    { title: "멀티-쿼리 검색 PoC", status: "BACKLOG", priority: "LOW" },
  ];
  const onboardTasks: TaskSeed[] = [
    { title: "온보딩 체크리스트 초안", status: "DONE", priority: "MEDIUM", assignee: jiwon.id },
    { title: "환경설정 자동화 스크립트", status: "IN_PROGRESS", priority: "HIGH", assignee: minjun.id, desc: "1일차 환경설정을 30분 내로." },
    { title: "아키텍처 개요 문서 최신화", status: "IN_REVIEW", priority: "MEDIUM", assignee: alex.id },
    { title: "멘토 매칭 프로세스", status: "TODO", priority: "MEDIUM", assignee: jiwon.id },
    { title: "온콜 셰도잉 가이드", status: "TODO", priority: "LOW" },
    { title: "온보딩 만족도 설문", status: "BACKLOG", priority: "LOW" },
  ];

  async function createTasks(projectId: string, seeds: TaskSeed[]) {
    const created: Record<string, string> = {};
    const perStatus: Record<string, number> = {};
    for (const s of seeds) {
      perStatus[s.status] = (perStatus[s.status] ?? 0) + 1;
      const task = await prisma.task.create({
        data: {
          projectId,
          title: s.title,
          description: s.desc,
          status: s.status,
          priority: s.priority,
          assigneeId: s.assignee,
          order: perStatus[s.status] * 1000,
        },
      });
      created[s.title] = task.id;
    }
    return created;
  }

  const searchTaskIds = await createTasks(searchProject.id, searchTasks);
  await createTasks(onboardProject.id, onboardTasks);

  console.log("🧷 크로스 링크 (노트 ↔ 프로젝트/태스크)...");
  await prisma.noteLink.createMany({
    data: [
      { noteId: noteIds["rag-arch"], projectId: searchProject.id, relation: "설계 근거" },
      { noteId: noteIds["search-quality"], projectId: searchProject.id, relation: "측정 방법" },
      { noteId: noteIds["okr-q3"], projectId: searchProject.id, relation: "목표" },
      { noteId: noteIds["onboarding-guide"], projectId: onboardProject.id, relation: "기준 문서" },
      { noteId: noteIds["hiring-bar"], projectId: onboardProject.id, relation: "배경" },
      { noteId: noteIds["rerank"], taskId: searchTaskIds["리랭커 프로덕션 배포"], relation: "실험 기록" },
      { noteId: noteIds["pgvector-index"], taskId: searchTaskIds["pgvector HNSW 튜닝"], relation: "튜닝 노트" },
    ],
  });

  const counts = {
    notes: await prisma.note.count(),
    edges: await prisma.edge.count(),
    tags: await prisma.tag.count(),
    topics: await prisma.topic.count(),
    projects: await prisma.project.count(),
    tasks: await prisma.task.count(),
  };
  console.log("✅ 시드 완료:", counts);
  console.log(
    `🔑 데모 로그인: alex@acme.ai (관리자) / 비밀번호 "${DEMO_PASSWORD}"`,
  );
}

main()
  .catch((e) => {
    console.error("❌ 시드 실패:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
