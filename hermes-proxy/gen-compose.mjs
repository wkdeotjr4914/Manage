// server.mjs 를 base64로 compose에 임베드한 자체완결형 배포 compose를 생성한다.
// (VPS에 파일을 따로 놓을 필요 없이 붙여넣기 한 번으로 배포하기 위함)
// 비밀은 하드코딩하지 않고 env에서 읽는다(생성물 compose.deploy.yml은 .gitignore).
//   PROXY_API_KEY=... HERMES_KEY=... node hermes-proxy/gen-compose.mjs
import { readFileSync, writeFileSync } from "node:fs";

const b64 = Buffer.from(readFileSync(new URL("./server.mjs", import.meta.url))).toString("base64");

const PROXY_KEY = process.env.PROXY_API_KEY; // 앱↔프록시 키(메일분석 전용, 저위험)
const HERMES_KEY = process.env.HERMES_KEY; // Hermes API_SERVER_KEY(내부 전용)
if (!PROXY_KEY || !HERMES_KEY) {
  console.error("PROXY_API_KEY 와 HERMES_KEY 환경변수가 필요합니다.");
  process.exit(1);
}

const cmd =
  '["sh","-c","echo \'' + b64 + "' | base64 -d > /tmp/server.mjs && node /tmp/server.mjs\"]";

const lines = [
  "services:",
  "  hermes-agent:",
  "    image: ghcr.io/hostinger/hvps-hermes-agent:latest",
  "    restart: unless-stopped",
  "    ports:",
  '      - "4860"',
  "    labels:",
  "      - traefik.enable=true",
  "      - traefik.http.routers.${COMPOSE_PROJECT_NAME}.rule=Host(`${COMPOSE_PROJECT_NAME}.${TRAEFIK_HOST}`)",
  "      - traefik.http.routers.${COMPOSE_PROJECT_NAME}.entrypoints=websecure",
  "      - traefik.http.routers.${COMPOSE_PROJECT_NAME}.tls.certresolver=letsencrypt",
  "      - traefik.http.services.${COMPOSE_PROJECT_NAME}.loadbalancer.server.port=4860",
  "    env_file:",
  "      - .env",
  "    volumes:",
  "      - ./data:/opt/data",
  "  mail-proxy:",
  "    image: node:20-alpine",
  "    restart: unless-stopped",
  "    command: " + cmd,
  "    environment:",
  "      - PROXY_API_KEY=" + PROXY_KEY,
  "      - HERMES_URL=http://hermes-agent:8642",
  "      - HERMES_KEY=" + HERMES_KEY,
  "      - HERMES_MODEL=hermes-agent",
  "      - PORT=8080",
  "    labels:",
  "      - traefik.enable=true",
  "      - traefik.http.routers.hermes-mail.rule=Host(`hermes-mail.${TRAEFIK_HOST}`)",
  "      - traefik.http.routers.hermes-mail.entrypoints=websecure",
  "      - traefik.http.routers.hermes-mail.tls.certresolver=letsencrypt",
  "      - traefik.http.routers.hermes-mail.service=hermes-mail",
  "      - traefik.http.services.hermes-mail.loadbalancer.server.port=8080",
  "",
];

writeFileSync(new URL("./compose.deploy.yml", import.meta.url), lines.join("\n"));
console.log("wrote compose.deploy.yml, base64 len =", b64.length);
