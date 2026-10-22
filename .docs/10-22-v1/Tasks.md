# Tasks：LLM Rank 首版交付

**关联 Plan**：Plan.md — LLM Rank 首版交付 v1.4
**总计 Task**：26 个
**状态说明**：26/26 DONE（2026-10-22）。
**回归测试结论**：通过。`go test ./...`、`go vet ./...`、`pnpm --dir web typecheck`、`pnpm --dir web test`（10/10）、`pnpm --dir web build`、`CGO_ENABLED=0 go build ./cmd/server` 全部通过；1440/1024/768/390 宽度关键路径验收，页面级无横向溢出。Docker 镜像由 CI 验证。
**通用约束**：用户可见文案为中文；不引入 UI 组件库、图表库、Flutter Web；三张业务表不插入种子数据；设置页独立于排行；模型只通过共享模型表单创建；评分只通过共享评分弹窗写入，且不设 10 分上限；不提交数据库、构建产物、临时文件或密钥。

---

## Phase 1：数据与领域内核

### TASK-001：建立 Go 模块、配置加载与可启动骨架

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：无
- **Description**：初始化 Go 1.27 模块，建立配置解析、日志与优雅关闭的最小进程骨架，并配置忽略文件。
- **Details**：
  - go.mod 模块名使用 llmrank，Go 版本 1.27。
  - 配置读取 PORT（默认 8080）、DB_PATH（默认 ./llm-rank.db）、ADMIN_PASSWORD_HASH、SESSION_SECRET、COOKIE_SECURE（默认 false）、TRUST_PROXY（默认 false）。
  - ADMIN_PASSWORD_HASH 与 SESSION_SECRET 缺失，或 SESSION_SECRET 少于 32 字节时启动失败；错误信息明确但不打印密钥。
  - 使用 log/slog 输出启动日志；使用 signal.NotifyContext 支持 SIGINT/SIGTERM 优雅退出。
  - .gitignore 忽略 node_modules、web/dist/*（保留 !web/dist/.gitkeep）、数据库、.env、日志、编辑器文件与 /temp；确保占位文件可被 git add。
  - 添加配置单元测试，覆盖默认值、必填缺失、布尔解析错误、密钥长度。
- **Acceptance Criteria**：
  - go test ./... 通过且不连接数据库。
  - 缺少必填环境变量时进程以非零状态退出并给出可定位错误。
  - 默认配置包含 8080、./llm-rank.db、COOKIE_SECURE=false、TRUST_PROXY=false。
  - 仓库中不存在密钥、数据库或 web build 产物。

### TASK-002：建立 SQLite 迁移与存储连接

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-001
- **Description**：引入纯 Go SQLite 驱动，建立三张业务表、迁移机制与连接配置，确保空库启动无种子数据。
- **Details**：
  - 加入 modernc.org/sqlite 依赖并锁定 go.sum。
  - 新建 migrations/001_init.sql 与内嵌迁移入口；使用 schema_migrations 版本表，按文件名升序在事务中执行。
  - 表结构只保留 dimensions、models、scores；不含 profiles 与 profile_weights。
  - dimensions 字段：id INTEGER PRIMARY KEY、name TEXT NOT NULL、description TEXT NOT NULL DEFAULT ''、weight INTEGER NOT NULL CHECK (weight BETWEEN 0 AND 100)、archived_at、created_at、updated_at；name COLLATE NOCASE 唯一。
  - models：id INTEGER PRIMARY KEY、slug TEXT NOT NULL COLLATE NOCASE UNIQUE、name TEXT NOT NULL、vendor TEXT NOT NULL DEFAULT ''、notes TEXT NOT NULL DEFAULT ''、created_at、updated_at。
  - scores：model_id INTEGER NOT NULL、dimension_id INTEGER NOT NULL、value REAL NOT NULL CHECK (value >= 0)、note TEXT NOT NULL DEFAULT ''、updated_at，复合主键 (model_id, dimension_id)；外键级联。
  - 建立 scores.dimension_id 等查询索引；时间戳为 UTC RFC3339 文本。
  - modernc DSN 或连接钩子为每个连接设置 WAL、foreign_keys、busy_timeout；固定连接数与事务边界，避免只对一个池连接生效。
  - 迁移只允许 CREATE TABLE/INDEX，不出现 INSERT/REPLACE。
  - 测试：迁移在临时库执行成功且可重复运行；三张业务表初始行数为 0；级联删除生效；PRAGMA 在每个新连接上生效；value/model_id/dimension_id 为 NULL 与 value<0、weight 越界均被约束拒绝。
- **Acceptance Criteria**：
  - go test ./... 通过。
  - 全新数据库启动后三张业务表为空。
  - 删除 dimension 级联删除 scores；删除 model 级联删除 scores。
  - 迁移源码中无种子插入语句，且不存在 profiles 表。

### TASK-003：实现维度存储 CRUD 与单一权重

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-002
- **Description**：实现维度的创建、读取、更新权重、归档、恢复和永久删除。
- **Details**：
  - 维度：按启用/全部列出、创建、更新名称/说明/权重、归档、恢复、永久删除。
  - 权重字段为 0–100 整数；允许为 0；不实现第二套方案或权重表。
  - 名称不区分大小写唯一；字段校验在 API 层，约束在 SQLite 层。
  - 归档维度默认列表与后续排名输入不再包含；评分保留，恢复后可再次参与。
  - 删除维度级联删除其评分。
  - 列表返回稳定顺序（id），包含 weight 与 archivedAt。
  - 测试覆盖：重复名称、权重边界 -1/0/100/101、归档与恢复、删除级联、权重更新。
- **Acceptance Criteria**：
  - 存储测试全部通过。
  - 权重 0 与 100 可保存，越界被拒绝。
  - 归档后启用列表不可见但全部列表可见；恢复后重新可见。
  - 更新权重直接反映在后续读取中，无需额外方案记录。

### TASK-004：实现模型与评分存储 CRUD

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-002
- **Description**：实现模型档案、模型私人备注与模型维度评分的存储操作。
- **Details**：
  - 模型：按 slug 查询、列出（含评分数量与时间戳）、创建、更新名称/厂商/私人备注、删除；slug 创建后不可变，仅允许小写字母、数字与连字符。
  - 评分：按模型读取全部评分；按模型 × 维度 upsert 数值与私人备注；按模型 × 维度删除；仅允许启用维度；数值为有限且不小于 0 的数，统一保留一位小数，不设上限。
  - 删除模型级联评分；删除维度级联相关评分。
  - 读取模型时不在此层过滤私人字段，由 API 序列化层决定可见性。
  - 测试覆盖：slug 重复、未知模型/维度、归档维度拒绝、评分边界 0/10/12.5/100、负数/NaN/Infinity/NULL、upsert 更新、删除、级联。
- **Acceptance Criteria**：
  - 存储测试全部通过。
  - 同一模型同一维度仅一条评分。
  - 0、10、12.5 与 100 可保存；负数、NaN、Infinity 与 NULL 被拒绝，不存在 10 分上限。
  - 删除模型后该模型的评分数量为 0。

### TASK-005：实现纯函数计分与排名

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-002
- **Description**：在 domain 层实现单一权重组的加权综合分、覆盖率、暂定判定、排序与名次分配。
- **Details**：
  - 输入为启用维度（含 weight）与全部启用模型及其评分；不修改输入；不依赖 store、api 或 HTTP。
  - 只使用权重 > 0 的维度；综合分为已评分维度的加权平均，分母是这些维度的权重之和。
  - 覆盖率为已评分维度权重 / 所有启用且权重 > 0 的维度权重之和；权重合计为 0 时所有模型无综合分、无名次、覆盖率 0。
  - 覆盖率小于 0.8 标记暂定；0.8 本身不是暂定。
  - 未评分模型综合分为空、覆盖率为 0、名次为空，排在所有已评分模型之后。
  - 官方排序：综合分降序 → 覆盖率降序 → 名称升序；名次为已评分模型中的顺序名次。
  - 权重总和非 100 时结果与归一化后一致；忽略未知维度与非法评分输入。
  - 权重先归一化再计算：W = 已评分维度权重和，Σ((weight / W) × score)，避免有限极大值相乘溢出。
  - 表驱动测试覆盖：全评分、部分评分、单维度、全空、零权重、80%/79.9% 边界、并列、名称排序、空列表、超过 10 的评分与归一化一致性。
- **Acceptance Criteria**：
  - go test ./... 通过；domain 包不导入 store、api 或数据库驱动。
  - 综合分不会因未评分维度被计为 0 而下降。
  - 覆盖率 80% 与 79.9% 的暂定状态符合规范。
  - 未评分模型没有名次且排在最后。

---

## Phase 2：API、认证与单二进制骨架

### TASK-006：建立 HTTP 路由、错误信封与基础中间件

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-003, TASK-004, TASK-005
- **Description**：建立 API 路由骨架、JSON 编解码、统一错误模型、请求限制、安全响应头、日志与恢复中间件。
- **Details**：
  - 使用 Go 1.22+ ServeMux 方法路由；所有 API 统一 /api 前缀。
  - 成功响应为 JSON；错误统一为 {error:{code,message,fields?}}，fields 为字段到错误信息映射。
  - 错误映射至少覆盖 400 malformed、401 unauthorized、403 forbidden、404 not_found、409 conflict、422 validation、429 rate_limited、500 internal。
  - 请求体限制 1 MiB，拒绝未知字段；Content-Type 非 JSON 的写请求返回 400。
  - 写请求若存在 Origin，取 URL.Host 与 r.Host 比较（忽略 http/https scheme），不匹配返回 403；无 Origin 的非浏览器请求允许通过；反代必须保留 Host。
  - 设置 X-Content-Type-Options、Referrer-Policy、X-Frame-Options、Content-Security-Policy（允许自身脚本与内联样式，不加载外部资源）。
  - 处理器 panic 恢复为 500；使用 slog 记录方法、路径、状态和耗时，不记录密码、Cookie 或备注正文。
  - 配置 HTTP 服务器 ReadHeaderTimeout、ReadTimeout、WriteTimeout、IdleTimeout。
  - 测试：错误信封、未知字段、超大请求体、Origin host 匹配（忽略 scheme）、跨 host 拒绝、panic 恢复、API 404 JSON。
- **Acceptance Criteria**：
  - go test ./... 通过。
  - 未注册 API 路径返回 JSON 404 而不是 HTML。
  - 非法 Origin 的 POST 被 403 拒绝，合法同源请求可通过。
  - 错误响应不包含堆栈、SQL 或敏感字段。

### TASK-007：实现管理员登录、签名会话与登录限流

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-006
- **Description**：实现单管理员 bcrypt 校验、HMAC 签名 Cookie、登录/登出端点、失败限流及认证中间件。
- **Details**：
  - 登录请求仅接收 password；服务端使用 ADMIN_PASSWORD_HASH 做 bcrypt 比较，失败返回统一 401 文案。
  - 登录成功写入 HttpOnly、SameSite=Lax、Path=/ 的签名 Cookie，Secure 由配置决定，有效期 24 小时。
  - Cookie 包含版本、过期时间与 HMAC-SHA256 签名；常量时间比较，拒绝篡改、过期、结构错误。
  - POST /api/auth/login 成功返回 authenticated 状态；POST /api/auth/logout 清除 Cookie；两者均需 Origin 校验。
  - 同一 IP 15 分钟内失败 5 次后返回 429 并带 Retry-After；成功登录清零计数；限流器有过期清理。
  - 默认使用 RemoteAddr；TRUST_PROXY=true 时读取反代覆盖写入的 X-Forwarded-For / X-Real-IP；直接暴露时忽略转发头。
  - 认证中间件支持匿名读取上下文与强制管理员两种模式。
  - 启动时校验 hash 是合法 bcrypt，密钥长度符合要求。
  - 测试：正确/错误密码、Cookie 属性、签名篡改、过期、登出、限流、密钥错误；TRUST_PROXY=false 时伪造 X-Forwarded-For 不改变桶，true 时按转发 IP 计数。
- **Acceptance Criteria**：
  - 密码不出现在响应体与日志中。
  - 伪造或过期 Cookie 均被识别为未登录。
  - 第 6 次连续失败在窗口内返回 429；成功登录后重置。
  - 登录限流测试不依赖真实等待时间，可注入时钟或窗口参数。

### TASK-008：实现公开只读 API

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-005, TASK-006, TASK-007
- **Description**：实现会话引导、排行、模型列表/详情、维度列表读取，并严格裁剪公共字段。
- **Details**：
  - GET /api/bootstrap：始终可访问；返回 authenticated、启用维度（含 weight）、计数与当前时间。计数至少包含 models、scoredModels。
  - GET /api/rankings：不使用 profile 参数；返回 totalWeight、updatedAt、启用且权重 > 0 的维度、全部启用模型条目（slug/name/vendor、综合分、覆盖率、暂定、官方名次、各维度分数）。totalWeight=0 时固定返回全部模型且 score/rank 为 null、coverage=0；updatedAt 取模型/评分最大 updated_at，无数据为 null。
  - GET /api/models：返回启用模型摘要与评分数量，不含私人备注。
  - GET /api/models/{slug}：返回模型公开档案、维度权重、评分值、摘要与暂定阈值；未评分维度为 null。匿名响应不得包含 models.notes 或 scores.note。
  - GET /api/dimensions：默认启用项；管理员使用 includeArchived=1 时返回归档项。维度包含 weight。
  - 不实现 /api/profiles，不接受 profile 查询参数。
  - 公开读取始终开放；只有写入、导出与 includeArchived 读取要求管理员会话。
  - 管理员模型详情额外包含私人备注与评分备注；匿名永不包含这两个字段键。
  - 添加 httptest 集成测试，使用临时数据库；覆盖 totalWeight=0 的完整模型结构、updatedAt 与最大更新时间一致。
- **Acceptance Criteria**：
  - go test ./... 通过。
  - 匿名响应不存在 notes 与 note 键。
  - 归档维度不出现在匿名响应中。
  - 排行响应包含 weight、totalWeight、updatedAt，不含 profile 字段。
  - 空库与全零权重返回可渲染结构而非 500；全零权重返回全部模型且无伪造分数。

### TASK-009：实现管理员写 API 与校验

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-008
- **Description**：实现维度、模型与评分的写操作，接线认证、Origin 校验、字段校验和冲突映射。
- **Details**：
  - 维度：POST 创建（名称、说明、weight）、PATCH 更新、POST /archive、POST /restore、DELETE。名称 1–40 字符、说明不超过 500、weight 0–100 整数。
  - 模型：POST 创建，要求名称 1–80、slug 1–64 且匹配小写字母数字连字符、厂商不超过 80、私人备注不超过 2000；请求只创建模型档案，不接收评分字段；PATCH 不改 slug；DELETE 永久删除。
  - 评分：PUT /api/models/{slug}/scores/{dimensionId}，body 为 {value,note}；value 为有限且不小于 0 的数，规范到一位小数，不设上限；note 不超过 500；DELETE 删除评分。仅允许启用维度。
  - 归档/恢复返回更新后的对象；DELETE 返回 204；创建返回 201。
  - 唯一冲突返回 409，字段错误返回 422 且 fields 指明字段；未知实体 404；未认证 401；无权限 403。
  - 所有写接口使用管理员中间件与同源校验；不使用 GET 做修改。
  - 不增加方案、权重表或 profile 端点；权重就是维度字段。
  - 测试覆盖所有端点成功路径、未认证、Origin 拒绝、字段边界、重复名称/slug、归档后排行变化、删除级联、评分清空、评分 12.5 与 100、负数/NaN/Infinity。
- **Acceptance Criteria**：
  - go test ./... 通过。
  - 校验错误响应包含字段级信息且不泄露内部错误。
  - 更新维度 weight 后排行立即变化；归档维度立即排除。
  - 评分 12.5 与 100 可写入，负数/NaN/Infinity 返回 422；模型创建请求携带评分字段时不产生评分。
  - 未认证执行任一写操作均不能改变数据库。

### TASK-010：实现 JSON 导出、静态嵌入、健康检查与优雅关闭

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-009
- **Description**：补齐 JSON 快照导出、前端资源嵌入与回退、健康端点、HTTP 生命周期收口。
- **Details**：
  - GET /api/export 仅管理员可访问；以附件下载返回完整快照：version、exportedAt、dimensions（含归档与 weight）、models（含私人备注）、scores（含评分备注）；不含 profiles；JSON 可解析，文件名含日期。
  - GET /api/health 返回 200 与 {status:"ok"}，不查询业务数据。
  - 创建 web/embed.go，以 go:embed all:dist 嵌入前端；提交 web/dist/.gitkeep，并验证 fresh clone 下该文件未被 .gitignore 忽略、Go 仍可编译。
  - 静态资源：/assets/ 下带 hash 文件长期缓存；index.html no-cache；非 /api 路径回退到 index.html；/api 未知路径保持 JSON 404。
  - 若 dist 中没有 index.html，返回明确 503，不 panic。
  - main 组装配置、存储、认证、API 与静态处理器；收到退出信号后 10 秒内优雅关闭数据库与 HTTP 服务器。
  - 单元测试覆盖导出认证与结构、静态文件缓存头、SPA 深链接回退、API 404 不回退、health。
- **Acceptance Criteria**：
  - go test ./... 通过。
  - 匿名访问 /api/export 返回 401。
  - /models/example 深链接返回前端 index；/api/not-found 返回 JSON 404。
  - 未构建前端时进程可启动并返回 503，而不是启动失败。

---

## Phase 3：公开前端体验

### TASK-011：建立 React/Vite 前端骨架与 API 数据层

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-008, TASK-010
- **Description**：初始化 React 19 + TypeScript + Vite 工程，建立数据路由、类型定义、API 客户端、请求 Hook 与构建脚本。
- **Details**：
  - web/package.json 设置 packageManager 为 pnpm 11，脚本包含 dev、build、typecheck、test（node --test）；依赖仅 react、react-dom、react-router-dom 与必要的 Vite/TypeScript 开发依赖；锁定 pnpm-lock.yaml。
  - 使用 createBrowserRouter + RouterProvider，保留 useBlocker 与滚动恢复能力；定义 /、/models/:slug、/compare、/workbench、/settings、/login、* 路由占位。评分弹窗不占路由。
  - 建立 API 客户端：同源 credentials、JSON Content-Type、错误解析、ApiError（code/message/fields/status）、AbortSignal；401 由上层统一处理。
  - 类型覆盖 bootstrap、ranking、model detail、dimension、model、score、export 等响应和请求体，字段与后端一致；不定义 profile 类型。
  - 自建 useAsyncData Hook：loading/error/data、重取、AbortController 清理，不引入查询库。
  - Vite 开发代理 /api 到 127.0.0.1:8080；index.html 语言 zh-CN、标题、viewport。
  - 添加 web/public 目录；从 temp/icon_compressed.png 复制品牌图标到 web/public/brand-icon.png。
  - 运行 pnpm --dir web install、typecheck、build。
- **Acceptance Criteria**：
  - pnpm --dir web typecheck、build 与 test 通过。
  - 构建产物包含 index.html 与带 hash 的 assets。
  - 路由占位页面可访问且无控制台错误。
  - 没有 UI 组件库、图表库或 profile 类型。

### TASK-012：实现设计系统、密度令牌、品牌标识与共享组件

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-011
- **Description**：按瑞士平面规范实现设计令牌、密度刻度、品牌标识、粘性页头、共享按钮、表单、浮层、通知和状态组件。
- **Details**：
  - 设计令牌：纸白、墨色、信号文本红 #B92A20（对纸白 ≥4.5:1）、1px 线条、0 圆角、无阴影/渐变；系统字体栈 + 等宽数字；12 栏容器、统一间距与断点。
  - 密度令牌：刊头 clamp(44px, 5.6vw, 74px)；模型名 17px、维度名 14–15px、表格评分 24px；功能元数据 10px、权重 10px、暂定徽标 10px；桌面表头 58px、行高 82px，移动表头 50px、行高约 70px；区块间距 32–64px。
  - 触控：桌面表行图标 30–32px，移动表行图标 34px，移动主按钮 44px；不低于 WCAG 2.2 AA 的 24px。
  - 品牌：页头使用 web/public/brand-icon.png，32px 圆形裁切（≤760px 28px），品牌文字 LLM RANK；favicon 与 apple-touch-icon 指向同一资源；不重绘、不调色。
  - 图标组件使用内联 SVG，覆盖新增、编辑、关闭、箭头、勾选、备注、垃圾桶、归档、恢复、设置、下载、锁、对比、登出等；不实现未使用的搜索图标；均有可访问名称，必要时提供 title。
  - 共享组件：Button（primary/quiet/danger/compact）、IconButton、Field/label/input/textarea/select、CoverageMeter、Tag、Dialog、ConfirmDialog、Toast、EmptyState、ErrorState、Loading skeleton、PageHeading。
  - Dialog 提供窄版确认框（约 440px）、模型表单（约 560px）与宽版评分弹窗（约 920px）三种宽度；基于原生 dialog：showModal、ESC、焦点返回、遮罩点击关闭、aria-labelledby；确认真实执行回调。
  - 数据条只有覆盖率条（0–100）与详情页相对条；评分不设固定上限，不绘制以 10 为分母的刻度。
  - 页头含品牌、主导航、会话区；窄屏不横向溢出。匿名与管理员导航状态通过 props 或上下文预留，TASK-017 接通认证。
  - 全局 CSS 提供 reset、焦点样式、skip link、表格与排版基础；组件样式使用 CSS Modules。按本节令牌重写，不复制 temp/demo.css 的历史方案/权重侧栏选择器。
  - 动效统一 token 并尊重 prefers-reduced-motion；排序场景可关闭整页入场。
  - 验证 1440/390 下组件不溢出，键盘焦点可见。
- **Acceptance Criteria**：
  - typecheck 与 build 通过。
  - 1440px 下刊头计算字号不超过 74px，表格行高为 82px；390px 下无页面级横向溢出。
  - 功能文字、权重与暂定徽标不小于 10px；仅非功能索引可 9px；不应通过缩小正文来压缩布局。
  - 正文信号色对比度 ≥4.5:1；移动主按钮 ≥44px，表行图标 ≥34px。
  - 无 border-radius、box-shadow、gradient 用于业务表面（品牌图标裁切除外）。
  - Dialog 可用键盘打开、关闭并返回焦点；宽版弹窗在 390px 下内部滚动。
  - 评分不使用固定 10 分刻度；详情相对条由该维度最高分（下限 10）归一。
  - 品牌图标出现在页头与 favicon，页面无外部字体请求。

### TASK-013：实现全宽排行页、密度校准与直接列排序

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-012
- **Description**：实现默认首页排行：全宽数据表、微型权重标注、表头排序、覆盖率与对比选择，并按密度令牌控制版面节奏。
- **Details**：
  - 并行加载 bootstrap 与 rankings；不读取 profile 参数；无方案选择器。
  - 刊头：标题 + 维度数 + 权重合计 + 模型数/已评分/updatedAt；权重侧栏、权重条形图与方案说明全部删除；刊头字号按 TASK-012 令牌收敛。
  - 全宽表：综合排名、模型、综合分、覆盖率、启用的维度（列名下方 10px 权重）与操作列；操作列预留约 82px，Phase 3 只渲染对比按钮，TASK-020 追加管理员评分按钮。
  - 维度总宽超过内容宽度时由表格容器内部横向滚动，页面不溢出；不设维度数量硬上限。
  - 榜单标题行右侧预留管理员动作区；TASK-019 接入「新增模型」按钮并打开共享模型表单；匿名态与 Phase 3 均不渲染该按钮。
  - 桌面行高 82px、表头 58px；列间与行内边距按令牌放大，模型名 17px、评分 24px、维度值 14px；综合分固定两位小数，维度分固定一位。
  - 表头排序（不加额外控件）：模型、综合分、覆盖率、每个维度名本身为按钮。数字列首次点击降序，模型首次升序，第二次点击反向；未评分行始终在已评分行之后，维度空值置底，不随方向翻转。
  - 覆盖率显示向下截断到一位小数（整数省略小数）；79.9% 显示为 79.9% 且保持暂定，不能四舍五入成 80%。
  - 综合排名列保持官方加权名次，不随视图排序重新编号；列名写为「综合排名」，并附 title。
  - 激活列显示信号红升降箭头；th 设置 aria-sort；焦点在重绘后回到同列；排序不播放整页入场动画。
  - 排序状态写入 URL 的 sort 与 dir；刷新后可复现；无非法 key 时回落到综合分降序。
  - 空状态：无维度、全零权重、无模型分别给出对应空态；全零权重显示权重合计 0 与「尚未设置权重」，不伪造分数；管理员可见创建/设置入口，匿名仅见登录入口。
  - 对比选择上限 4，查询状态写入当前页 URL；至少 2 项后提供 /compare 链接。
  - 表格使用 table 语义、caption 或 aria-label；对比按钮 aria-pressed；对比图标使用 compare，而不是与评分混淆的 plus。
  - 移动端隐藏维度列，保留综合排名、模型、综合分、覆盖率与操作；列宽取 32 / 27.5% / 64 / 62 / 74px，整表适配 360–430px；模型名可换行，评分 18px，100.00 仍完整显示且不与覆盖率重叠；综合排名表头在窄屏可简写为「排名」，title 与可访问名称仍保留完整语义。
  - 覆盖 1440/1024/768/390 四档，确认无页面级横向滚动；用 12.5 与 100 的评分、79.9% 覆盖率与 10 个以上维度验证列宽、滚动与状态。
- **Acceptance Criteria**：
  - typecheck/build 通过。
  - 1440px 下刊头不超过 74px，表格行高 82px，页面保留明显留白；390px 下行高约 70px，模型名换行时自然增高。
  - 直接点击列名即可在升序/降序之间切换；综合分、覆盖率、模型、维度均验证。
  - 排序后官方综合排名列保持一致，空值始终在底部。
  - URL 可刷新复现排序；键盘焦点在排序后仍位于同列表头。
  - 390px 下综合分、覆盖率与对比按钮均可见，模型名不与综合分重叠，页面横向溢出为 0；12.5 的评分完整显示。

### TASK-014：实现模型详情页

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Depends on**：TASK-013
- **Description**：实现模型详情，展示综合表现、维度得分、权重小标注与管理员私有内容。
- **Details**：
  - 按 slug 加载；不读取 profile；未知 slug 显示 404。
  - 头部展示模型名、厂商、综合分、名次、覆盖率、已评分维度占比；模型名最大 64px，综合分最大 90px；移动端堆叠并保留大字分。
  - 维度表全宽展示名称、权重、非负得分与相对条；相对条按该维度所有模型中的最高分归一（最低基准 10），仅作视觉参考，不参与计算；无评分维度显示占位且不绘制伪数据；不渲染右侧权重卡。
  - 得分不设上限，显示一位小数；页面不出现「/10」或「0—10」固定刻度；相对条列在窄屏隐藏。
  - 管理员的模型私人备注放在维度表下方的整宽条带，带「仅管理员」锁标；匿名不渲染该区域。
  - 操作：对比链接打开 /compare?models=slug；管理员评分按钮预留位置，TASK-020 接通共享评分弹窗；提供返回排行与下一个模型导航；维度表头右侧为「相对」而非「0—10」。
  - 状态：加载骨架、404、服务器错误与重试；窄屏隐藏条状标尺但保留分数与权重。
  - 不以颜色单独表达数值或状态。
- **Acceptance Criteria**：
  - typecheck/build 通过。
  - 详情数值与排行页同一权重组的结果一致。
  - 匿名页面 DOM 中不存在私人备注文本，也不存在评分按钮。
  - 390px 下维度分数不丢失、无横向溢出；12.5 与 100 的得分可完整显示。
  - 页面不出现固定 10 分刻度或「/10」文案；相对条宽度随该维度最高分变化。

### TASK-015：实现模型对比页

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Depends on**：TASK-013
- **Description**：实现 2–4 个模型的并排对比与窄屏纵向对照。
- **Details**：
  - 从 URL models 参数读取、去重、过滤未知 slug，限制 4 个；不足 2 个时展示从排行或下拉添加的路径。
  - 使用 rankings 数据渲染，不新增对比后端接口；顶部无方案选择器。
  - 桌面：首列维度/小号权重，模型列展示综合分、覆盖率、各维度得分；最高分使用信号红与 sr-only 文本双表达。
  - 窄屏 <760：隐藏宽表，使用模型总览 + 按维度分组；新增/移除模型仍可用。
  - 支持添加、移除模型并同步 models URL；达到 4 个后不渲染添加入口。
  - 未评分维度显示空值，不参与最高分比较；覆盖率低于 80% 标记暂定；评分可超过 10，最高分不按 10 截断。
  - 加载、错误、空选择状态完整；无页面级横向滚动。
- **Acceptance Criteria**：
  - typecheck/build 通过。
  - 2、3、4 个模型场景均正常；达到 4 个后无第 5 个入口。
  - 桌面与窄屏最高分逻辑一致。
  - 从排行对比栏进入时顺序与选择一致。

### TASK-016：接通前端路由状态、404 与可访问性收口

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Depends on**：TASK-013, TASK-014, TASK-015
- **Description**：补齐公开路由的加载边界、未找到页、运行时错误边界及公开页面的可访问性验收。
- **Details**：
  - 添加顶层 ErrorBoundary，显示简洁错误页与重新加载动作；未知路径渲染 404，保留品牌和返回排行入口。
  - 页面标题随路由变化；path 导航恢复滚动位置；skip link 指向主内容；/settings 与 /workbench 的占位路由在 TASK-017 接通权限。
  - 所有图标按钮具备可访问名称；所有输入均有 label；表格有 caption；焦点环可见。
  - 共享 Dialog 的焦点进入、关闭返回、ESC 与遮罩行为在公开端验证；评分弹窗本身由 TASK-020 实现。
  - 使用键盘走通：列排序、模型详情、添加/移除对比、关闭错误弹层。
  - 确认 reduced-motion 下无大幅位移动画；正文信号色对比度 ≥4.5:1；功能文字 ≥10px。
  - 修正 TASK-013 至 TASK-015 暴露的问题，仅修改相关组件和样式，不扩大功能范围。
- **Acceptance Criteria**：
  - typecheck/build 通过。
  - 404、加载、错误、空态均可见且提供可用下一步。
  - 390 与 1440 两档公开路由冒烟无页面级横向溢出；完整视觉 sweep 留给 TASK-022。
  - 只使用键盘可完成公开端主路径；浏览器控制台无错误。

---

## Phase 4：设置、评分工作台与评分弹窗

### TASK-017：实现登录页、认证上下文与管理员路由守卫

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-016, TASK-007
- **Description**：接通单管理员登录、登出、会话状态、受限路由和匿名/管理员导航差异。
- **Details**：
  - SessionProvider 使用 /api/bootstrap 初始化，暴露 authenticated、refresh、logout；加载中显示骨架，不闪出错误权限内容。
  - /login 提供单密码表单：自动聚焦、密码 autocomplete、提交中禁用、字段错误、通用 401 文案、429 提示；登录后跳转 next（仅站内相对路径）。
  - RequireAdmin 包裹 /settings 与 /workbench；未登录跳转 /login?next=当前路径；已登录访问 /login 自动回到目标页。
  - 公开端始终可匿名访问排行、详情与对比；管理端路由始终要求会话。
  - 页头匿名态只显示排行与登录；管理员态显示排行、评分、设置与退出。退出调用 logout 并回到排行。
  - 登录页使用 56px 品牌图标与同一视觉系统；API 401 时清理会话并引导重新登录。
  - 表单可键盘提交；错误用 aria-live 通知；无引导文案。
- **Acceptance Criteria**：
  - 正确密码登录成功并保留 next；错误密码显示通用错误。
  - 匿名访问 /settings 与 /workbench 被导向 /login；登录后回到原目标。
  - 登出后受保护页面立即不可访问，管理入口消失。
  - 页头管理员态不包含旧的管理页入口。
  - typecheck/build 通过。

### TASK-018：实现独立设置页与维度增减

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-017
- **Description**：实现独立 /settings 页面与维度分区，支持维度的新增、编辑、权重修改、归档、恢复与永久删除。
- **Details**：
  - /settings 使用分区标签：维度 / 模型 / 数据；支持 tab 查询参数并刷新还原；页面标题 72px，列表行保持 19px 上下内边距。
  - 维度列表读取 includeArchived=1；展示名称、说明、权重、状态；默认隐藏归档项，可切换显示；页头显示启用维度数与权重合计。
  - 新增/编辑使用 Dialog 表单：名称必填、说明可空、权重 0–100 整数；新增默认权重 0，不改变现有排行并标记「不参与」；需编辑权重后才进入评分弹窗；行内校验与服务端字段错误回填。
  - 仅此一个权重编辑入口；不提供第二套方案、方案切换或独立权重表单。
  - 归档/恢复直接生效；永久删除使用确认框，文案说明会同时删除该维度评分并影响排行。
  - 全部权重为 0 时显示「排行尚未启用」状态，不渲染死链路；空状态直接提供创建第一个维度。
  - 保存权重后刷新维度列表与排行数据；归档项不提供编辑入口，只提供恢复/删除。
  - 所有操作只通过管理 API，服务端错误不吞掉；不使用 /manage 路由。
- **Acceptance Criteria**：
  - typecheck/build 通过。
  - 设置页可完成创建/重命名/改权重/归档/恢复/删除全流程，且入口不依赖排行页。
  - 权重改为 0 后该维度退出排行与评分弹窗，行内显示「不参与」；归档后权重合计与排行同步；恢复后重新参与。
  - 删除确认展示级联影响；取消不发送请求。
  - 未认证无法进入页面或完成写操作。
  - 390px 下设置行重排为两行网格，页面无横向溢出。

### TASK-019：实现模型管理、共享表单与新增入口

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-018
- **Description**：实现设置页模型列表、新建、编辑、删除与管理员备注；排行页复用同一新增模型表单，工作台入口在 TASK-020 接入。
- **Details**：
  - 列表展示名称、厂商、slug、评分数量与完整度；提供公开详情入口；不显示评分表单。
  - 排行页榜单标题行提供管理员「新增模型」按钮，点击打开约 560px 的模型 Dialog；创建成功后留在当前页，新模型以未评分行出现，不自动打开评分弹窗。
  - 创建 Dialog：名称、slug、厂商、私人备注；slug 默认由名称生成并可在创建时编辑，保存前校验小写字母数字连字符；生成结果为空（如纯中文名）时留空并要求手填，不自动拼出空 slug；编辑时 slug 只读。
  - 编辑保存名称、厂商、备注；私人备注仅管理员可见，最多 2000 字；评分字段不在此表单中，避免出现第二套评分入口。
  - 删除确认明确表示会永久删除该模型与全部评分；取消不发请求。
  - 空态提供创建第一个模型入口；加载、错误、保存中与成功提示完整。
  - 列表按名称排序；空厂商显示破折号；新模型初始无评分、无排名，供 TASK-020 的行内评分入口补测。
  - 分区说明只呈现计数，不写操作教学。
- **Acceptance Criteria**：
  - typecheck/build 通过。
  - 新建后模型出现在排行（若权重已设置）与详情页，初始无评分、无排名；TASK-020 完成后出现在工作台并可通过评分入口补测。
  - 从排行与设置页点击「新增模型」均打开同一表单，创建后回到原页；表单不包含评数字段，也不在创建后自动打开评分弹窗。
  - 匿名详情 API 与页面看不到私人备注，排行页不渲染新增模型按钮；工作台入口在 TASK-020 验证。
  - 设置页模型表单不包含评数字段。
  - 删除后模型与评分不可恢复，列表与排行同步。

### TASK-020：实现评分工作台与共享评分弹窗

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-013, TASK-018, TASK-019
- **Description**：实现覆盖率总览式评分工作台、共享评分弹窗，并在排行榜与详情页接通管理员评分入口。
- **Details**：
  - 评分工作台位于 /workbench：按覆盖率升序列出模型，展示综合分、名次、已评分维度、覆盖率与「添加/编辑评分」；不渲染内联评分表、权重侧栏或第二套预览面板。
  - 工作台标题行提供「新增模型」按钮，复用 TASK-019 的模型表单；创建成功后留在工作台，新模型以未评分行出现。
  - 工作台顶部提供「维度设置」链接，指向 /settings?tab=dimensions。
  - 共享 ScoreDialog 使用原生 dialog：宽度约 920px、最大高度 90vh、主体内部滚动、底部操作固定。
  - 弹窗头部展示模型名与厂商；摘要条展示综合分、排名、覆盖率、暂定与已评分维度，随输入实时更新。
  - 弹窗主体逐行展示启用且权重 > 0 的维度名称、权重、非负评分输入与备注开关；备注由用户主动展开为文本域，不默认铺开。
  - 评分数值不设上限，仅接受有限且不小于 0 的数；步长 0.1，统一保留一位小数；空值代表未评分；保存只提交差异（PUT/DELETE）；备注为空则删除备注。
  - 实时预览使用与后端一致的加权计算；保存成功后重取排行、详情与工作台数据并 toast；失败保留草稿与弹窗并显示错误。
  - 关闭按钮、ESC 与遮罩点击在未保存时弹出确认；取消保留弹窗，确认后丢弃。存在改动时注册 useBlocker 拦截站内导航、beforeunload 拦截刷新/关闭标签页。打开后焦点落在首个评分输入，关闭后返回触发按钮。
  - 排行榜操作列追加管理员评分按钮：已有评分显示铅笔与「编辑 <模型> 评分」，未评分显示加号与「为 <模型> 添加评分」；匿名不渲染该按钮。
  - 详情页管理员评分按钮改为打开同一弹窗，不再跳转工作台带模型参数。
  - 不新增工作台专用端点；评分弹窗读取 rankings 与管理员模型详情；不自动保存，不调用 AI 或自动 benchmark。
  - 将评分预览、覆盖率与排序抽为纯函数，添加 node --test 用例，至少覆盖 79.9/80 边界、未评分置底、12.5/100 与归一化权重；与 Go fixture 对齐。
  - 空态：全部权重为 0、无模型或无维度时显示前往设置页设置权重的动作。
- **Acceptance Criteria**：
  - typecheck/build 通过。
  - 从排行榜行内、详情页与工作台打开的评分弹窗字段、预览与保存行为一致，不存在第二个评分表单；工作台「新增模型」打开 TASK-019 的模型表单，不打开评分弹窗。
  - 修改评分与备注、保存后排行、详情、工作台与列表数据一致。
  - 清空评分后覆盖率、综合分、暂定与维度完成数正确变化；0、10、12.5 与 100 可保存，负数、NaN 与 Infinity 被拒绝；弹窗不出现「/10」或「0–10」。
  - 评分超过 10 时综合分同步超过 10，详情与排行不截断显示。
  - 存在未保存改动时关闭弹窗触发确认；站内返回/刷新被拦截；取消保持草稿，确认后丢弃。
  - node --test 的前端纯函数用例通过；预览与后端 fixture 一致。
  - 匿名不渲染排行评分按钮与详情评分按钮，也看不到评分备注。
  - 390px 下弹窗内部滚动、底部保存可见，评分输入与备注入口可达，无横向溢出。

### TASK-021：接通设置页导出、空状态与会话反馈

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Depends on**：TASK-018, TASK-019, TASK-020
- **Description**：完成管理员跨页收口：设置页 JSON 导出、初始化空状态、会话过期与统一操作反馈。
- **Details**：
  - 设置页「数据」分区提供「导出 JSON」按钮，指向 /api/export，使用浏览器下载；401 时提示重新登录。
  - 排行、详情、设置、工作台空状态根据 authenticated 与缺失数据展示明确动作；匿名仅显示登录入口。
  - 统一 toast 成功/失败、删除确认、表单禁用与错误提示；避免重复提交。
  - API 401 触发会话刷新/跳转登录并保留 next；403 提示无权限；429 显示稍后再试。
  - 导航在排行、评分、设置三处高亮正确；页面标题与当前分区同步。
  - 导出文件不包含 profiles 字段，包含维度权重、归档项、全部评分与私人备注，仅管理员可获取。
  - 检查所有入口闭环，不渲染无法执行的按钮、# 链接、旧的 /manage 入口或方案入口。
- **Acceptance Criteria**：
  - typecheck/build 通过。
  - 管理员能下载可解析的完整 JSON；匿名请求返回 401 并有可理解反馈。
  - 初始化空库可从排行、工作台或设置页直达模型创建入口，从设置页直达维度创建入口。
  - 页面内不存在 dead controls、调试文案、旧管理页或方案选择残留。

### TASK-022：执行多尺寸、键盘与视觉一致性验收

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Depends on**：TASK-021
- **Description**：对公开端与管理端执行跨尺寸、键盘、排序、设置、评分弹窗与视觉规范验收，并修正发现的问题。
- **Details**：
  - 使用 Chrome 远程实例检查 1440、1024、768、390 四档；记录并修复页面级横向滚动、元素重叠、按钮截断与断点跳变。
  - 逐页验证空/加载/错误/成功状态；确保无示例、Demo、待实现、TODO 等非产品文案。
  - 在 1440 与 390 下点击模型、综合分、覆盖率及任一可见维度列，验证升降序、空值后置、官方名次不变、URL 可刷新、焦点回到表头。
  - 检查 1440px 刊头字号不超过 74px、表格行高 82px；390px 行高约 70px、页面无横向溢出；功能文字、权重与暂定徽标不小于 10px，索引可 9px。
  - 正文信号色对比度 ≥4.5:1；移动主按钮 ≥44px，表行图标 ≥34px。
  - 键盘走通登录、排行排序、对比、详情、排行与工作台「新增模型」、设置页维度与模型 CRUD、排行榜评分按钮、评分弹窗输入/备注/保存、未保存关闭确认、确认框；ESC 可关闭弹层。
  - 检查焦点样式、对比度、图标可访问名称、表单 label、表格 caption、aria-sort 与弹窗 aria-labelledby。
  - 检查评分弹窗在 390px 下的内部滚动、底部按钮可见与焦点返回；设置页行在两行网格下不溢出；排行标题行的「新增模型」按钮在 390px 下可见且不与说明文字重叠。
  - 输入 12.5 与 100，确认排行、详情与评分弹窗显示不截断；页面不存在「0–10」或「/10」评分上限文案；详情相对条随维度最高分变化。
  - 构造 79.9% 覆盖率，确认显示 79.9% 且带「暂定」，不出现「80% + 暂定」；80.0% 时不带。
  - 构造 10 个以上维度，确认表格容器内部横向滚动且页面不溢出；设置页权重 0 维度标「不参与」且不出现在评分弹窗。
  - 检查全零权重时 totalWeight=0、updatedAt 不为伪造时间、全部模型无综合分；未评分行在覆盖率升序下仍置底。
  - 检查 reduced-motion 下动画退化、200% 缩放不横向溢出。
  - 清理未使用 CSS、无效变量、重复样式和硬编码颜色；删除未使用的搜索图标与遗留方案/权重侧栏选择器；品牌图标圆形裁切保持一致。
  - 对照 temp Demo 核对层级与交互，但不复制演示数据。
- **Acceptance Criteria**：
  - typecheck/build 通过，浏览器控制台无错误。
  - 四档宽度均无页面级横向溢出。
  - 排序交互在桌面与移动可见列上符合规则，键盘焦点不丢失。
  - 排行与详情评分按钮、工作台与设置页入口均可键盘到达并打开同一评分弹窗。
  - 排行与工作台「新增模型」按钮均可键盘到达，打开同一模型表单；匿名态不渲染。
  - 页面中不存在引导文案、示例标签、无响应控件、旧管理页或方案选择器。

---

## Phase 5：构建、验收与文档收口

### TASK-023：完成前端嵌入后的单二进制集成验证

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-022, TASK-010
- **Description**：将实际前端构建产物嵌入 Go 二进制并验证单进程提供 API、静态资源和深链接。
- **Details**：
  - 执行 pnpm --dir web build，确认 web/dist 包含 index.html 与 assets。
  - 检查 go:embed 指向构建产物；构建 CGO_ENABLED=0 的二进制，复制到不依赖仓库 web/dist 的临时目录启动。
  - 验证 /、/models/{slug}、/compare、/workbench、/settings 返回前端 index；/assets/* 带正确 Content-Type 与缓存头；/api/* 返回 JSON。
  - 验证缺少 dist 时的 503 回退不 panic；fresh clone 中 web/dist/.gitkeep 未被忽略；品牌图标与 favicon 可从嵌入资源路径访问。
  - 运行 go test ./... 与 go vet ./...；在完整构建后再次执行。
  - 修复嵌入路径、缓存头或 SPA 回退问题，保持 Vite 开发模式可独立使用。
- **Acceptance Criteria**：
  - 单二进制从任意工作目录启动后可访问前端、品牌图标与 API。
  - 直接刷新前端深层路径不返回 404。
  - go test ./... 与 go vet ./... 通过。
  - 未构建前端时开发服务器行为明确，不影响正常生产构建。

### TASK-024：编写 Dockerfile、Compose 与环境变量示例

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-023
- **Description**：创建可复现的多阶段镜像、单服务 Compose 与不含密钥的配置示例。
- **Details**：
  - Dockerfile 三阶段：Node 24 构建前端；Go 1.27 以 CGO_ENABLED=0 构建；最终镜像使用非 root 用户，只包含二进制与运行时证书。
  - 最终镜像暴露 8080，声明 /data 写入目录；SQLite 路径为 /data/llm-rank.db。
  - .dockerignore 排除 .git、node_modules、web/dist、数据库、temp、环境文件与构建缓存。
  - deploy/compose.yaml 使用 LLM_RANK_IMAGE 环境变量拉取镜像，不 build；绑定 127.0.0.1:8080；设置环境变量、命名卷与 restart。
  - 部署说明写明：反向代理须与容器共享宿主网络（或使用 host network），且保留 Host；TRUST_PROXY=true 时只信任反代覆盖写入的转发头。
  - deploy/.env.example 列出 LLM_RANK_IMAGE、ADMIN_PASSWORD_HASH、SESSION_SECRET、COOKIE_SECURE、TRUST_PROXY；包含生成 bcrypt 哈希与反代网络要求的注释，TRUST_PROXY 默认 false，不写真实密钥。
  - 在无 Docker 的本机静态检查 YAML 可解析、Dockerfile 路径与构建上下文一致；实际镜像由 CI 构建。
- **Acceptance Criteria**：
  - Compose 配置可被 YAML 解析，且不含明文密码。
  - Dockerfile 中前端构建产物正确复制到 Go 构建阶段。
  - .env.example 覆盖所有必需变量并说明生产 COOKIE_SECURE=true；TRUST_PROXY=false 时忽略转发头，反代必须保留 Host。
  - 本地不构建镜像，记录由 CI 验证。

### TASK-025：配置 GitHub Actions 测试与镜像发布

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-024
- **Description**：建立 GitHub Actions：前端检查、Go 测试、镜像构建与 GHCR 推送。
- **Details**：
  - 触发：pull_request、push 到 master、push 版本标签 v*。
  - test job：checkout、Go 1.27、Node 24、pnpm 11；执行前端 install --frozen-lockfile、typecheck、build、pnpm --dir web test，go test ./...，go vet ./...。
  - image job：needs test；使用 docker/setup-buildx-action、docker/metadata-action、docker/build-push-action 构建镜像；PR 时构建不推送，push 事件使用 GITHUB_TOKEN 推送 GHCR。
  - 权限：contents read、packages write；镜像名使用 github.repository；标签至少包含 sha 与分支或版本标签。
  - 缓存 pnpm 与 Docker layer；超时与失败日志清晰。
  - 不写入任何密钥到工作流；GHCR 使用内置 GITHUB_TOKEN。
  - 本地验证 YAML 语法；不尝试在本机运行 Docker。
- **Acceptance Criteria**：
  - 工作流 YAML 可解析；action 引用版本有效。
  - PR 执行 Go 与前端检查并验证镜像构建。
  - master 或标签推送向 GHCR 发布镜像。
  - 工作流不含凭据、私钥或数据库文件。

### TASK-026：执行全链路验收并记录结果

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-023, TASK-025
- **Description**：在空数据库上完成从启动、登录、设置维度与模型、弹窗评分、排行到导出和匿名读取的完整验收。
- **Details**：
  - 使用临时 DB_PATH、临时 bcrypt 哈希与 SESSION_SECRET 启动单一进程；浏览器连接远程 Chrome 实例。
  - 完整执行：空状态 → 登录 → 设置页创建至少 3 个维度并设置权重（含一个权重 0 验证不参与）→ 归档并恢复一个维度 → 从排行榜「新增模型」创建一个模型，再从设置页创建其余模型 → 排行榜点击未评分模型的加号打开弹窗评分与备注（至少一项填 12.5）→ 保存 → 再用铅笔编辑 → 详情与工作台打开同一弹窗 → 排行/排序/对比 → JSON 导出。
  - 验证不存在方案选择器、方案 API、第二套权重表单或内联评分表；排行权重仅出现在列名、页头和页脚。
  - 点击模型、综合分、覆盖率、维度名，分别验证升序与降序；空值置底；官方综合排名列保持稳定；URL 刷新复现。
  - 使用匿名上下文验证无管理入口、写请求被拒、私人备注与评分备注不可见；使用 curl 验证排行/详情 JSON 不含 notes/note、scores.note 与 profile 字段。
  - 构造覆盖率 79.9% 的模型，确认显示 79.9% 且带暂定；补测到 80.0% 后去除，不出现「80% + 暂定」。
- **Acceptance Criteria**：
  - 按 Details 顺序完成空库启动、登录、维度与模型创建、评分弹窗保存与编辑、排行、详情、工作台、对比与 JSON 导出，并记录实际结果；`go test ./...`、`go vet ./...`、`pnpm --dir web typecheck`、`pnpm --dir web test`、`pnpm --dir web build` 全部通过。
  - 零权重维度不进入排行与评分弹窗；未评分模型置底；79.9% 显示为 79.9% 并带暂定，80.0% 去除暂定；视图排序不改变官方综合排名，刷新 URL 可复现排序。
  - 匿名上下文无管理入口、写请求被拒；排行与详情 JSON 不含 `notes`、`note` 与 `scores.note`。
  - 执行功能链路：设置页增减维度、排行与工作台新增模型、评分弹窗内部滚动、未保存关闭/返回/刷新保护、相对条、键盘主路径；视觉与对比度四档 sweep 交给 TASK-022，本任务只做 390 冒烟。
  - 验收使用临时数据库、临时口令与临时进程；结束后关闭进程、删除临时文件，仓库不残留数据库、构建产物或截图。
