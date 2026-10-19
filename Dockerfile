# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv
# 위 한 줄은 빌더의 경고 하나만 끕니다. publishable key 는 브라우저가 그대로 보내는 공개 값이고,
# 이 파일에 있는 것은 빌드용 더미(pk_build_only)입니다. 진짜 비밀값은 이미지에 넣지 않습니다.
# commerce-web — Next.js 스토어프런트 이미지
# 단계: deps(의존성) → build(next build) → runner(standalone 산출물만)

FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 빌드 시점에는 백엔드에 닿지 않는다 — provider 가 연결 실패를 빈 화면으로 넘긴다.
# ENV 가 아니라 ARG 로 두는 이유: 값이 이미지 메타데이터에 남지 않고, 이름에 KEY 가 들어간
# 변수를 ENV 로 굳히지 말라는 빌더 경고(SecretsUsedInArgOrEnv)도 피한다. 실제 값은 배포가 준다.
ARG MEDUSA_BACKEND_URL=http://127.0.0.1:9
ARG MEDUSA_PUBLISHABLE_KEY=pk_build_only
ARG SITE_NAME=Commerce
ARG COMPANY_NAME="Commerce Inc."
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app app
# standalone 산출물은 server.js 와 추려 낸 node_modules 를 함께 담고 있다.
COPY --from=build --chown=10001:10001 /app/.next/standalone ./
# 정적 자산은 standalone 에 포함되지 않으므로 따로 넣는다.
COPY --from=build --chown=10001:10001 /app/.next/static ./.next/static
# components/opengraph-image.tsx 가 process.cwd()/fonts/Inter-Bold.ttf 를 읽는다.
COPY --from=build --chown=10001:10001 /app/fonts ./fonts
# 이 저장소에는 public/ 디렉터리가 없다. 나중에 만들면 여기에 COPY 한 줄을 더한다.
# 요청 캐시가 쓰이는 유일한 경로. 미리 만들어 UID 10001 소유로 둔다.
RUN mkdir -p .next/cache && chown -R 10001:10001 .next/cache
USER 10001:10001
EXPOSE 3000
CMD ["node", "server.js"]
