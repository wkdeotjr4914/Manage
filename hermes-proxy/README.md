# Hermes 메일-분석 프록시 — VPS 배포

`server.mjs`는 Hermes 컨테이너 옆(같은 compose 네트워크)에서 도는 **좁은 프록시**다.
공개되는 건 `POST /analyze`(메일→업무 JSON)뿐이고, Hermes의 RCE 가능한 `/v1` API는
**인터넷에 노출하지 않는다**(프록시만 `http://hermes-agent:8642`로 내부 호출).

배포하면: 공개 `hermes-api`(8642) 라우트 제거 + `hermes-mail.srv1813641.hstgr.cloud`(프록시)만 공개.

전제: Traefik 배포됨, Hermes `/opt/data/.env`에 `API_SERVER_ENABLED=true`·`API_SERVER_KEY=...`·`API_SERVER_HOST=0.0.0.0` 있음.

---

## 1. 프록시 전용 키 생성 (앱↔프록시)

VPS 호스트 셸에서:
```
openssl rand -base64 32 | tr -d '=+/' 
```
출력값을 **PROXY_API_KEY**로 쓴다(대화에 노출하지 말 것 — 아래 compose와 앱 양쪽에 넣는다).

## 2. 프록시 코드 배치 (호스트 셸, 한 번에 붙여넣기)

```
DIR=$(docker inspect hermes-agent-wtnq-hermes-agent-1 --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}')
mkdir -p "$DIR/proxy"
cat > "$DIR/proxy/server.mjs" <<'HERMESEOF'
<<< 여기에 repo의 hermes-proxy/server.mjs 전체 내용을 붙여넣기 >>>
HERMESEOF
echo "wrote $DIR/proxy/server.mjs ($(wc -l < "$DIR/proxy/server.mjs") lines)"
```

## 3. compose 교체 (hPanel → Docker Manager → hermes-agent-wtnq → Manage → .yaml editor)

전체 선택(Ctrl+A) 후 아래로 교체하고 **Deploy**. `PROXY_API_KEY` 자리에 1번 값을 넣는다.
(`HERMES_KEY`는 기존 `API_SERVER_KEY` 값 — 이제 내부 전용이라 유출 이력이 있어도 공개 위험은 없음.
 원하면 나중에 `.env`의 `API_SERVER_KEY`와 함께 교체 가능.)

```yaml
services:
  hermes-agent:
    image: ghcr.io/hostinger/hvps-hermes-agent:latest
    restart: unless-stopped
    ports:
      - "4860"
    labels:
      - traefik.enable=true
      - traefik.http.routers.${COMPOSE_PROJECT_NAME}.rule=Host(`${COMPOSE_PROJECT_NAME}.${TRAEFIK_HOST}`)
      - traefik.http.routers.${COMPOSE_PROJECT_NAME}.entrypoints=websecure
      - traefik.http.routers.${COMPOSE_PROJECT_NAME}.tls.certresolver=letsencrypt
      - traefik.http.services.${COMPOSE_PROJECT_NAME}.loadbalancer.server.port=4860
    env_file:
      - .env
    volumes:
      - ./data:/opt/data
  mail-proxy:
    image: node:20-alpine
    restart: unless-stopped
    command: ["node", "/app/server.mjs"]
    volumes:
      - ./proxy:/app
    environment:
      - PROXY_API_KEY=__PUT_FRESH_PROXY_KEY_HERE__
      - HERMES_URL=http://hermes-agent:8642
      - HERMES_KEY=__HERMES_API_SERVER_KEY_HERE__
      - HERMES_MODEL=hermes-agent
      - PORT=8080
    labels:
      - traefik.enable=true
      - traefik.http.routers.hermes-mail.rule=Host(`hermes-mail.${TRAEFIK_HOST}`)
      - traefik.http.routers.hermes-mail.entrypoints=websecure
      - traefik.http.routers.hermes-mail.tls.certresolver=letsencrypt
      - traefik.http.routers.hermes-mail.service=hermes-mail
      - traefik.http.services.hermes-mail.loadbalancer.server.port=8080
```

주의: 위에서 **`hermes-api`(8642) 라우트 5줄이 빠졌다** — 이게 RCE 공개를 닫는 핵심.

## 4. 배포 검증

Deploy 후 30~60초(프록시 부팅 + `hermes-mail` 인증서 발급). 그다음:

- health: `curl -sS https://hermes-mail.srv1813641.hstgr.cloud/health` → `{"ok":true}`
- 분석:
  ```
  curl -sS -m 120 -H "Authorization: Bearer $PROXY_API_KEY" -H "Content-Type: application/json" \
    https://hermes-mail.srv1813641.hstgr.cloud/analyze \
    -d '{"projectName":"샘플","mailText":"내일까지 배너 시안 3개 부탁드립니다. 결제 오류도 금요일까지 수정해주세요."}'
  ```
  → `{"ok":true,"tasks":[...]}` 이면 통과.
- RCE 라우트가 닫혔는지: `curl -s -o /dev/null -w '%{http_code}\n' https://hermes-api.srv1813641.hstgr.cloud/v1/chat/completions` → 404/무응답이어야 정상.

## 앱 설정

Vercel/`.env`:
```
HERMES_PROXY_URL=https://hermes-mail.srv1813641.hstgr.cloud
HERMES_PROXY_KEY=<1번의 PROXY_API_KEY>
```
