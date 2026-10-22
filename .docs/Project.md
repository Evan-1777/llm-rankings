# Project

> 项目的单一事实来源，供 Agent 动手前建立全局认知。定位与设计原则见 `SCOPE.md`，工作流规则见 `AGENTS.md`。

## 概述

- **定位**：LLM Rank，一个用于个人记录、评分与比较 LLM 表现的自托管 Web 服务。
- **阶段**：首版实现完成（2026-10-22）。代码、测试、部署配置与 CI 已落地；生产镜像由 GitHub Actions 构建。
- **当前增量**：维度手动拖动排序（2026-10-22）；展示顺序独立于评分计算。
- **首版范围**：单管理员维护模型、维度、全局维度权重与评分；公开只读排行；加权综合分与覆盖率；模型详情、对比、评分工作台；JSON 导出；Docker Compose 与 GHCR 镜像。
- **非目标**：多用户/注册/OAuth、评论社区、自动抓取 benchmark、AI 自动评分、原生 App、实时协作、国际化、付费、暗色主题、评分历史、JSON 导入。

## 环境与运行

- **平台**：Linux x86_64（WSL 文件系统），开发与测试在本机；生产为个人 VPS。
- **Shell**：bash
- **运行时**：Go 1.27；Node 24 + pnpm 11.23；SQLite（modernc.org/sqlite，纯 Go，无 CGO）；React 19 + TypeScript 7 + Vite 8。
- **版本管理**：git；远端 [Evan-1777/llm-rankings](https://github.com/Evan-1777/llm-rankings)（公开）；`master` 为当前分支。
- **依赖**：Go 模块（`go.mod` / `go.sum`）；前端 pnpm（`web/pnpm-lock.yaml`）。生产镜像由 CI 构建，本机无 Docker。
- **本地运行**：
  1. `pnpm --dir web install`
  2. `pnpm --dir web build`（写入 `web/dist`，供 Go 内嵌）
  3. 设置必需环境变量后运行 `go run ./cmd/server`
  4. 开发前端时可运行 `pnpm --dir web dev`，Vite 将 `/api` 代理到 `127.0.0.1:8080`
- **环境变量**：
  - `PORT`：监听端口，默认 8080。
  - `DB_PATH`：SQLite 文件路径，默认 `./llm-rank.db`；生产为 `/data/llm-rank.db`。
  - `ADMIN_PASSWORD_HASH`：必填，bcrypt 哈希；缺失或格式错误时启动失败。
  - `SESSION_SECRET`：必填，至少 32 字节；用于 HMAC 签名 Cookie。
  - `COOKIE_SECURE`：默认 false；HTTPS 生产环境设为 true。
  - `TRUST_PROXY`：默认 false；仅当反向代理覆盖 `X-Forwarded-For` 时设为 true。
- **测试**：
  - `go test ./...`
  - `go vet ./...`
  - `pnpm --dir web typecheck`
  - `pnpm --dir web test`（Node 原生 `node --test`）
  - `pnpm --dir web build`
  - `CGO_ENABLED=0 go build ./cmd/server`
- **部署**：
  - CI 将镜像推送到 `ghcr.io/evan-1777/llm-rankings`（`latest` 与 `sha-*`、分支、版本标签）。
  - 复制 `deploy/.env.example` 为 `deploy/.env`，填写镜像、密码哈希与会话密钥。
  - `docker compose --env-file deploy/.env -f deploy/compose.yaml pull`
  - `docker compose --env-file deploy/.env -f deploy/compose.yaml up -d`
  - 容器只绑定 `127.0.0.1:8080`，由宿主反向代理终止 TLS；SQLite 使用命名卷 `llm-rank-data` 挂载到 `/data`。
- ★ 本机未安装 Docker；不本地构建镜像，镜像构建由 GitHub Actions 验证。
- ★ 前端构建产物通过 `//go:embed all:dist` 进入 Go 二进制；生产只运行一个进程。
- ★ SQLite 使用 WAL、外键与单连接；备份以卷或 JSON 导出为准。

## 结构

```
cmd/server/main.go             # 配置、数据库、HTTP 服务、优雅关闭
internal/
  api/                         # 路由、处理器、中间件、JSON 错误、静态资源
  auth/                        # bcrypt 会话、HMAC Cookie、登录限流
  config/                      # 环境变量解析与校验
  domain/                      # 评分、权重、覆盖率、排名纯函数
  store/                       # SQLite 连接、迁移、查询与错误类型
migrations/
  001_init.sql                 # 建表，无种子数据
  embed.go                     # 迁移文件内嵌
web/
  src/api/                     # fetch 客户端与类型
  src/components/              # 弹窗、表单、表格、页头等共享组件
  src/domain/                  # 与 Go 对齐的评分/排序纯函数
  src/hooks/                   # 异步数据加载
  src/lib/                     # 格式化、文档标题
  src/pages/                   # 排行、详情、对比、工作台、设置、登录
  src/session/                 # 会话上下文与路由保护
  src/styles/global.css        # 设计令牌、reset、排版
  public/brand-icon.png        # 页头与站点图标
  dist/.gitkeep                # 构建前占位
  embed.go                     # 内嵌 dist
deploy/
  compose.yaml                 # 单 app 容器 + 数据卷
  .env.example                 # 生产环境变量模板
.github/workflows/ci.yml       # 测试、构建、GHCR 推送
Dockerfile
.dockerignore
```

- **分层**：`api → domain`、`api → store`；`domain` 不依赖 `store` 或 `api`；`store` 不依赖 `api`。评分与排名在 `domain` 计算，HTTP 层只解析与序列化。
- **数据流**：浏览器 → `/api` → `api` → `domain` / `store` → SQLite；响应原路返回。非 API 路径由 Go 内嵌的 SPA 接管。
- **API 面**：
  - `GET /api/health`
  - `GET /api/bootstrap`
  - `POST /api/auth/login`、`POST /api/auth/logout`
  - `GET /api/rankings`
  - `GET /api/dimensions`；`POST /api/dimensions`；`PATCH /api/dimensions/{id}`；`PUT /api/dimensions/order`；`POST /api/dimensions/{id}/archive|restore`；`DELETE /api/dimensions/{id}`
  - `GET /api/models`；`POST /api/models`；`GET /api/models/{slug}`；`PATCH /api/models/{slug}`；`DELETE /api/models/{slug}`
  - `PUT /api/models/{slug}/scores/{dimensionId}`；`DELETE /api/models/{slug}/scores/{dimensionId}`
  - `GET /api/export`（管理员）
- **数据模型**：`dimensions`（名称、描述、0–100 权重、展示位置 `position`、归档时间）、`models`（唯一 slug、名称、厂商、私人备注）、`scores`（模型 + 维度复合主键、非负 REAL、备注、更新时间）。三表外键级联；不插入种子数据；展示位置按原 ID 初始化，新建追加末尾。
- **排名规则**：只计权重 > 0 的启用维度；综合分按已评分维度的权重归一，不设上限，按两位小数展示；单维度评分保留一位小数；覆盖率 = 已评分权重 / 总权重，显示向下截断到一位小数，低于 80% 标记「暂定」；同分按覆盖率高者、名称、slug 排序；未评分模型始终置底；官方排名不随视图排序改变。
- **认证与安全**：bcrypt 哈希存环境变量；HMAC 签名 `llmrank_session` HttpOnly Cookie，24 小时；登录失败每 IP 15 分钟 5 次；写请求校验 Origin host 与 Host 一致；安全响应头含 CSP、`X-Frame-Options`、`X-Content-Type-Options`、`Referrer-Policy`；公开接口不返回私人备注。
- **静态资源**：`assets/` 下带哈希文件使用一年 immutable 缓存；其他文件一天；缺失的 `assets/` 与带扩展名路径返回 404，其余路径回落到 `index.html`；API 未知路径返回 JSON 404。

## 前端

- **路由**：`/`（排行）、`/models/:slug`（详情）、`/compare?models=...`（对比）、`/workbench`（工作台）、`/settings?tab=dimensions|models|data`（设置）、`/login`（登录）。
- **信息架构**：排行表头即排序控件；评分只通过共享评分弹窗；模型只通过共享模型表单创建；设置页独立于排行；工作台按覆盖率升序暴露补测优先级；对比最多 4 个模型，移动端改为纵向卡片。
- **状态**：每页具备加载骨架、错误重试、空状态与成功反馈；无数据时给出下一步入口（先建维度 / 新增模型 / 去评分）。
- **交互与可访问性基准**：沿用首版方案的 Apple HIG，包含清晰层级、克制反馈、键盘操作与焦点恢复；视觉执行瑞士平面规范。
- **视觉**：瑞士/编辑式排版，纸白 `#F2EFE6`、墨黑 `#14130F`、信号红 `#B92A20`；0 圆角、无阴影/渐变、1px 分隔线；桌面 12 栏，内容最大 1500px；移动端表格隐藏维度列，保留排名、模型、综合分、覆盖率与操作；功能文字不小于 10px，移动主按钮 44px，行内图标 34px；维度拖动手柄桌面 52×44px、≤900px 44×48px，对应首列 60/44px。
- **交互细节**：评分弹窗打开后聚焦首个评分输入；未保存改动拦截站内跳转与 `beforeunload`；关闭后焦点回到触发按钮；评分预览实时更新综合分与排名；评分输入拒绝负数、NaN、Infinity，允许 12.5 与更大有限值。
- **维度排序**：设置页维度列表的序号区为拖动手柄；拖动或方向键调整顺序，释放后一次性提交含归档项的完整 ID 排列；指针靠近视口上下边缘时持续滚动；保存期间只禁用排序，失败保留已加载顺序，409 自动重载并提示。

## 约定

- **语言**：用户可见文本中文；代码标识符、注释、日志英文。
- **Go**：标准库优先；`net/http` + `ServeMux` 方法路由；`log/slog`；错误向上返回，HTTP 层映射为 `{error:{code,message,fields?}}`。
- **前端**：函数组件 + hooks；CSS Modules + CSS 自定义属性；不引入 UI 组件库与图表库；图标使用内联 SVG；不加载外部字体。
- **数据**：迁移只追加、不改已执行文件；迁移只建表，不插入任何种子数据；评分写入统一四舍五入到一位小数。
- **API**：`/api` 前缀；JSON；写请求要求 `Content-Type: application/json`；Cookie `HttpOnly`、`SameSite=Lax`；公开读接口不返回私人备注。
- **Git**：Conventional Commits 英文类型 + 中文描述；不提交 `.env`、密钥、数据库文件或构建产物。

## 约束与决策

- 2026-10-21 技术栈选 Go + SQLite + React/TS，单二进制部署——个人 VPS 资源有限，避免常驻 Node 与外部数据库；前端仍用 Vite 构建后内嵌。
- 2026-10-21 数据库零种子数据——不预置维度、模型、权重、评分或任何展示型数据；首次使用由管理员创建。
- 2026-10-21 单一全局权重——权重直接属于维度，为 0–100 整数；不设评分方案或方案切换层。新增维度权重默认 0，不改变现有排行并标记「不参与」，需先设权重才进入评分弹窗；归档保留分数与权重，可恢复；永久删除才级联。
- 2026-10-21 排名不落库——按维度权重实时计算；综合分只计已评分维度，覆盖率按权重计算；低于 80% 暂定；未评分行置底。
- 2026-10-21 评分不设上限——只要求有限且不小于 0，统一保留一位小数；综合分可超过 10；计算先归一权重再乘分数，避免有限极大值溢出。
- 2026-10-21 品牌标识——使用用户提供的圆形图标，保持原色，不重绘。
- 2026-10-21 单管理员 + 公开只读——密码 bcrypt 哈希存环境变量，会话为 HMAC 签名 Cookie；私人备注仅登录可见；不引入用户表。
- 2026-10-21 瑞士平面风格——纸白/墨黑/`#B92A20` 信号红、12 栏、1px 分隔线、0 圆角、无阴影/渐变；正文对比度 ≥4.5:1。
- 2026-10-22 排名求和按维度顺序而非 map 顺序——避免浮点累加顺序导致展示末位在 8.69/8.70 之间漂移；前端格式使用极小 epsilon 后再取舍。
- 2026-10-22 移动端表格隐藏维度列，保留核心五列；页面级不横向溢出，宽表只在容器内滚动。
- 2026-10-22 弹窗打开后聚焦首个可编辑评分输入；关闭时恢复触发按钮焦点；未保存改动同时拦截 SPA 路由与浏览器离开。
- 2026-10-22 部署由 CI 构建单架构 `linux/amd64` 镜像；容器只监听 loopback，TLS 与域名由宿主反向代理负责；数据库挂载命名卷。
- 2026-10-22 维度展示顺序独立于评分顺序——`position` 只影响 API 与页面展示；评分按维度 ID 稳定累加，重排不改变分数、覆盖率与排名。
- 2026-10-22 重排整集提交——`PUT /api/dimensions/order` 接收含归档项的完整 ID 排列，单事务校验后原子写入；载荷结构/重复/非正 ID 为 422，合法 ID 集合与当前库不一致为 409。

## 测试与验收

- 2026-10-22：`go test ./...` 通过（config、store、domain、auth、api）。
- 2026-10-22：`go vet ./...` 通过。
- 2026-10-22：`pnpm --dir web typecheck` 通过；`pnpm --dir web test` 10/10 通过；`pnpm --dir web build` 通过。
- 2026-10-22：`CGO_ENABLED=0 go build ./cmd/server` 通过。
- 2026-10-22：浏览器手工验收覆盖 1440 / 1024 / 768 / 390；排行、详情、对比、工作台、设置、登录、评分弹窗与空/错/加载状态可用；页面级无横向溢出；移动端表格与弹窗可用。
- 2026-10-22：GitHub Actions run `39633816016` 的 test 与 image job 均通过，镜像 `ghcr.io/evan-1777/llm-rankings:latest` 已推送；匿名拉取 manifest 返回 200。
- 2026-10-22：`go test ./...`、`go vet ./...` 通过；新增展示顺序迁移、稳定计分与重排接口回归。
- 2026-10-22：`pnpm --dir web test` 14/14 通过；`typecheck`、`build` 通过；新增排序纯函数与稳定计分测试。
- 2026-10-22：浏览器验收覆盖 1440/900/760/390、16 项列表持续边缘滚动、鼠标拖动、键盘排序、触摸合成事件、同位置/取消/边界不提交、保存失败、409 自动重载、重载失败重试、刷新持久化、归档隐藏槽位、零/单项状态；排行、详情、导出与评分弹窗顺序一致。
- 未在本地验证：Docker 镜像构建与 Compose 实际启动（本机无 Docker）；Compose 仅完成 YAML 解析与变量检查。

## 外部集成

- **GitHub Actions / ghcr.io**：push 到 `master` 或 `v*` 标签时运行测试、构建并推送镜像；PR 构建镜像但不推送。仓库需允许 Packages 写入（公开仓库默认允许 Actions 使用 `GITHUB_TOKEN` 推送）。
- **VPS 反向代理**：由现有反向代理提供 HTTPS 与域名；应用只监听 `127.0.0.1:8080`；反代须保留 Host，并在覆盖 `X-Forwarded-For` 时设置 `TRUST_PROXY=true`。
- **备份**：SQLite 卷备份或管理员 JSON 导出；不提供导入。
- 无数据库、缓存、对象存储等外部服务。

## 已知限制

- 单管理员、单 SQLite 写连接；不支持并发多用户或水平扩展。
- 无评分历史、审计日志、JSON 导入、暗色主题、国际化。
- 评分与模型删除为硬删除；维度归档可恢复，永久删除会级联评分。
- 浏览器验收为手工执行，无端到端自动化；Go/前端纯函数与 HTTP 集成测试覆盖主要规则。
- 真实触屏手势需人工验收；自动化仅验证合成 `pointerType=touch` 的生命周期与清理。
- 本机无 Docker，镜像与 Compose 的实际启动需在 CI/VPS 验证。

## 术语

- **维度**：可增减的评分项，评分为不小于 0 的有限数，不设上限。
- **权重**：全局唯一的维度系数，0–100；不另设评分方案层。
- **覆盖率**：当前权重中已评分维度权重占全部启用权重的比例。
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