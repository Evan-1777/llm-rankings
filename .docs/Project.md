# Project

> 项目的单一事实来源，供 Agent 动手前建立全局认知。定位与设计原则见 `SCOPE.md`，工作流规则见 `AGENTS.md`。

## 概述

- **定位**：LLM Rank，一个用于个人记录、评分与比较 LLM 表现的自托管 Web 服务。
- **阶段**：初始化。架构与范围已确认，应用代码尚未落地。
- **首版范围**：单管理员维护模型、维度、评分方案与评分；公开只读排行；加权综合分与覆盖率；模型详情、对比、评分工作台；JSON 导出；Docker Compose 与 GitHub Actions 镜像。
- **非目标**：多用户/注册/OAuth、评论社区、自动抓取 benchmark、AI 自动评分、原生 App、实时协作、国际化、付费（详见 `SCOPE.md`）。

## 环境与运行

- **平台**：Linux x86_64（WSL 文件系统），开发与测试在本机；生产为个人 VPS。
- **Shell**：bash
- **运行时**：Go 1.27；Node 24 + pnpm 11
- **版本管理**：git；`master` 为当前分支
- **依赖**：Go 模块；前端 pnpm。生产镜像由 CI 构建，本机无 Docker。
- **运行**（实现后）：
  - `pnpm --dir web install && pnpm --dir web build`
  - `go run ./cmd/server`
  - 环境变量：`PORT`、`DB_PATH`、`ADMIN_PASSWORD_HASH`、`SESSION_SECRET`、`PUBLIC_READ`、`COOKIE_SECURE`
- **测试**（实现后）：
  - `go test ./...`
  - `pnpm --dir web typecheck && pnpm --dir web build`
  - 浏览器验收连接用户开启的 9222 实例
- ★ 本机未安装 Docker；不本地构建镜像，`docker compose` 与镜像构建由 GitHub Actions/VPS 验证。
- ★ 前端构建产物通过 `//go:embed` 进入 Go 二进制；生产只运行一个进程。
- ★ SQLite 位于 `DB_PATH`（生产 `/data/llm-rank.db`），WAL 模式；备份以卷或 JSON 导出为准。

## 结构

当前仓库只有文档，应用代码尚未创建。目标结构：

```
cmd/server/          # 启动、配置、优雅关闭
internal/
  api/               # 路由、处理器、中间件、JSON 错误
  auth/              # 密码哈希、会话签名、登录限流
  domain/            # 评分、权重、覆盖率、排名纯函数
  store/             # SQLite 连接、迁移、查询
migrations/          # 只建表的 append-only SQL
web/                 # React + TypeScript + Vite
deploy/              # compose、环境变量示例、部署说明
.github/workflows/   # CI 与镜像构建
```

- **数据流**：浏览器 → `/api` → `api` → `domain` / `store` → SQLite；响应原路返回。`web/dist` 由 Go 内嵌，非 API 路径回落到 `index.html`。
- **依赖方向**：`api → domain`、`api → store`；`domain` 不依赖 `store` 或 `api`；`store` 不依赖 `api`。评分与排名在 `domain` 中计算，HTTP 层只负责解析与序列化。
- **API 面**：`/api/auth/*`、`/api/bootstrap`、`/api/rankings`、`/api/models`、`/api/models/{slug}/scores`、`/api/dimensions`、`/api/profiles`、`/api/export`、`/api/health`。
- **当前状态**：目录尚未创建，以上为实现基线。

## 约定

- **语言**：用户可见文本中文；代码标识符、注释、日志英文。
- **Go**：标准库优先；`net/http` + `ServeMux` 方法路由；`log/slog`；错误向上返回，HTTP 层映射为 `{error:{code,message,fields?}}`。
- **前端**：函数组件 + hooks；CSS Modules + CSS 自定义属性；不引入 UI 组件库与图表库；图表用 SVG。
- **数据**：迁移只追加、不改已执行文件；迁移只建表，不插入任何种子数据。
- **API**：`/api` 前缀；JSON；认证 Cookie `HttpOnly`、`SameSite=Lax`；写请求校验 `Origin`；公开读接口不返回私人备注。
- **Git**：Conventional Commits 英文类型 + 中文描述；不提交 `.env`、密钥、数据库文件。

## 约束与决策

- 2026-10-21 技术栈选 Go + SQLite + React/TS，单二进制部署——个人 VPS 资源有限，避免常驻 Node 与外部数据库；前端仍用 Vite 构建后内嵌。
- 2026-10-21 数据库零种子数据——不预置维度、方案、模型、评分或任何展示型数据；首次使用由管理员创建，空状态按缺失项给出下一步。
- 2026-10-21 维度与方案均为运行时 CRUD——新增维度权重默认 0，不改变现有排行；归档保留分数与权重，可恢复；永久删除才级联。允许全部归档/删除，空状态接管；方案保存时至少一个启用维度权重 > 0。
- 2026-10-21 排名不落库——按方案权重实时计算；综合分只计已评分维度，覆盖率按权重计算；覆盖率低于 80% 标记「暂定」。
- 2026-10-21 单管理员 + 公开只读——密码 bcrypt 哈希存环境变量，会话为 HMAC 签名 Cookie；私人备注仅登录可见；不引入用户表。
- 2026-10-21 瑞士平面风格——纸白/墨黑/信号红、12 栏网格、1px 分隔线、0 圆角、无阴影/渐变；桌面优先的响应式 Web，不用 Flutter Web，不套移动端形态。
- 2026-10-21 生产只跑 app 容器——TLS 由 VPS 现有反向代理终止；compose 默认绑定 `127.0.0.1:8080`，SQLite 挂载 `/data`；镜像由 GitHub Actions 推送 ghcr。
- 2026-10-21 首版不含暗色主题、评分历史、JSON 导入、梯队视图——列入 P1，避免首版范围膨胀。

## 外部集成

- **GitHub Actions / ghcr.io**：push 时运行 Go 与前端检查并构建镜像；仓库需开启 Packages 写权限。
- **VPS 反向代理**：由用户现有反向代理提供 HTTPS 与域名，应用只监听本机端口。
- 无数据库、缓存、对象存储等外部服务。

## 术语

- **维度**：可增减的评分项，统一 0–10 分。
- **方案**：一组维度权重，用于按用途生成排行；无默认方案。
- **覆盖率**：当前方案中已评分维度权重占全部启用维度权重的比例。
- **暂定**：覆盖率低于 80% 的排名标记。
- **归档**：从展示与计算中移除但保留数据，可恢复；与永久删除不同。

## 维护

| 变更 | 同步章节 |
|---|---|
| 运行、测试方式或环境前提变化 | 环境与运行 |
| 依赖增删或升级，关键选型变化 | 环境与运行；约束与决策 |
| 目录、模块、依赖方向变化 | 结构 |
| 命名、语言、日志、API 规范调整 | 约定 |
| 新坑、新约束、选型定型 | 约束与决策 |
| 外部服务接入或下线 | 外部集成 |
| 新增项目特有名词 | 术语 |
