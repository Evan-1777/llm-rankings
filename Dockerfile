# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS web
WORKDIR /src/web
RUN npm install -g pnpm@11.23.0
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /src/web/dist ./web/dist
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /llm-rank ./cmd/server

FROM alpine:3.22
RUN apk add --no-cache ca-certificates \
 && addgroup -S app \
 && adduser -S -G app -u 10001 app \
 && mkdir -p /data \
 && chown app:app /data
COPY --from=build /llm-rank /llm-rank
USER app
EXPOSE 8080
VOLUME ["/data"]
ENV PORT=8080 DB_PATH=/data/llm-rank.db
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
ENTRYPOINT ["/llm-rank"]