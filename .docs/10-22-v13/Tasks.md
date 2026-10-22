# Tasks：模型显隐归档、文字维度与审阅残留收口

**关联 Plan**：`Plan.md` —— 模型显隐归档、文字维度与审阅残留收口 v1.0
**状态**：DONE
**日期**：2026-10-22
**完成日期**：2026-10-22
**版本**：v1.0
**总计 Task**：20 个，均由主线执行
**回归测试结论**：通过。`go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server` 通过；`pnpm --dir web test` 46/46、`typecheck`、`build` 通过；浏览器验收覆盖 1440/1100/390，显隐、归档、文字维度、权重 0 与维护页各项验收均通过。

---

## Phase 1：数据模型与接口契约

### TASK-001：追加模型显隐/归档迁移与存储读写

- **Status**：DONE
- **Executor**：主线
- **Description**：新增迁移 `005_model_visibility_archive.sql`，为 `models` 追加 `hidden` 与 `archived_at`；在 `internal/store/models.go` 扩展模型结构、列表过滤与状态写入，并集中扫描列清单。
- **Details**：
  - `hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1))`；`archived_at TEXT` 可空。
  - `Model` 增加 `Hidden bool`、`ArchivedAt *time.Time`；新增统一的列扫描函数，覆盖 `ListModels`、`ModelBySlug`、`UpdateModel` 的返回路径。
  - `ListModels(ctx, includeArchived bool)`：默认排除 `archived_at` 非空的模型；排序保持名称与 slug。
  - 新增 `SetModelHidden(ctx, id, hidden)` 与 `SetModelArchived(ctx, id, archived)`，返回更新后的模型并推进 `updated_at`；`SetModelArchived` 写入或清空时间戳。
  - 同步更新现有调用点（排行快照、导出、模型接口、测试）。
- **Acceptance Criteria**：
  - 旧库升级后 `hidden` 为 0、`archived_at` 为空。
  - 隐藏与归档可独立持久化，恢复后 `archived_at` 为空。
  - `ListModels` 默认不含归档、显式包含时按名称返回全部。
  - `go test ./internal/store` 通过。
- **依赖**：无
- **优先级**：P0

### TASK-002：新增维度文字模式与文字存储

- **Status**：DONE
- **Executor**：主线
- **Description**：新增迁移 `006_dimension_text_mode.sql`，为 `dimensions` 追加 `text_mode` 并建立 `dimension_texts` 表；在存储层扩展维度读写与文字内容读写。
- **Details**：
  - `text_mode INTEGER NOT NULL DEFAULT 0 CHECK (text_mode IN (0, 1))`。
  - `dimension_texts(model_id, dimension_id, content, updated_at)`，复合主键，双向外键级联删除，`dimension_id` 建索引。
  - `Dimension` 增加 `TextMode bool`；维度查询、创建、更新、归档返回全部携带该字段。
  - 新增 `TextsForModel(ctx, modelID) (map[int64]string, error)` 与 `AllTexts(ctx) ([]DimensionText, error)`，供详情与导出使用。
  - 新增 `SetDimensionText(ctx, modelSlug, dimensionID, content string)`：内容为空时删除记录，否则 upsert；维度不存在、维度已归档或不是文字维度时返回明确错误；模型已归档按不存在处理。
  - `UpsertScore` 拒绝文字维度（返回新的文字维度哨兵错误），避免文字维度产生数值评分。
- **Acceptance Criteria**：
  - 文字内容可写入、读取、清空；清空后详情返回空串。
  - 数值评分写入文字维度返回可映射的 422 错误。
  - 删除模型或维度后文字记录级联消失。
  - `go test ./internal/store` 通过。
- **依赖**：TASK-001
- **优先级**：P0

### TASK-003：扩展模型接口与导出字段

- **Status**：DONE
- **Executor**：主线
- **Description**：修改 `internal/api/handlers_models.go`、`internal/api/server.go` 与 `internal/api/handlers_export.go`，暴露模型显隐、归档列表与归档/恢复接口。
- **Details**：
  - 模型响应与列表项增加 `hidden`、`archivedAt`。
  - `GET /api/models?includeArchived=1` 仅管理员可用，匿名返回 401；默认列表只排除归档，包含隐藏模型（隐藏只影响排行展示，不影响设置页对模型的读写）。
  - `PATCH /api/models/{slug}` 接受 `hidden`，与名称、厂商、备注可单独或组合提交；归档模型不可编辑（按不存在返回 404）。
  - 新增 `POST /api/models/{slug}/archive` 与 `POST /api/models/{slug}/restore`，管理员，返回更新后的模型。
  - 导出模型增加 `hidden`、`archivedAt`，导出仍包含归档与隐藏项。
- **Acceptance Criteria**：
  - 归档后默认列表与公开排行消失，`includeArchived` 可读并含时间戳；恢复后回归。
  - 默认列表包含隐藏模型，隐藏模型可在设置页再次显示。
  - 匿名 `includeArchived` 为 401，匿名归档/恢复为 401。
  - 仅提交 `hidden` 的 PATCH 不覆盖名称、厂商与备注。
  - 导出 JSON 可解析且含新字段。
- **依赖**：TASK-001
- **优先级**：P0

### TASK-004：扩展维度接口并新增文字写入端点

- **Status**：DONE
- **Executor**：主线
- **Description**：修改 `internal/api/handlers_dimensions.go`，新增 `internal/api/handlers_texts.go` 与路由，暴露维度文字模式与按模型的文字内容。
- **Details**：
  - 维度响应与创建/更新载荷增加 `textMode`；说明文字维度权重固定为 0。
  - 校验：`textMode` 为真且权重不为 0 时返回 422，字段指向 `weight`。
  - 新增 `PUT /api/models/{slug}/texts/{dimensionId}`，管理员，载荷 `{text}`；超过 2000 字符返回 422；空串删除记录并返回 204。
  - 文字写入仅接受处于启用状态的文字维度；数值维度返回 422，归档维度或模型返回 404。
  - 导出增加 `texts` 数组（模型 slug、维度 id、内容、更新时间），维度响应含 `textMode`。
- **Acceptance Criteria**：
  - 创建/更新文字维度后，`GET /api/dimensions` 与导出均体现 `textMode`。
  - 文字写入、清空、长度校验与权限符合约定。
  - 数值维度写入文字返回 422；文字维度写入数值返回 422。
  - `go test ./internal/api` 可编译（断言在 TASK-016 补齐）。
- **依赖**：TASK-002
- **优先级**：P0

---

## Phase 2：排名口径与后端行为

### TASK-005：排名计算区分隐藏模型与权重 0 维度

- **Status**：DONE
- **Executor**：主线
- **Description**：修改 `internal/domain/ranking.go` 与 `internal/domain/ranking_test.go`，让隐藏模型参与分值计算但不参与名次，权重 0 维度进入展示快照但不进入综合分与覆盖率。
- **Details**：
  - `Model` 增加 `Hidden bool`；排序统一为隐藏行排在可见行之后：可见行按分值、覆盖率、名称、slug 排序，隐藏行追加在后并按同一键排序；名次只在可见行递增。
  - `DimensionScores` 收录所有启用维度的已存评分（含权重 0），`Score`、`Coverage`、`Provisional` 仍只按权重 > 0 的维度计算。
  - 名次只在可见模型中递增；隐藏模型 `Rank = 0`。
  - 增加单元测试：隐藏模型不占名次、权重 0 值可见但不改综合分/覆盖率、可见模型名次连续。
- **Acceptance Criteria**：
  - 含隐藏模型时可见模型名次与不含隐藏模型时一致，隐藏行位于全部可见行之后。
  - 权重 0 维度的值出现在 `DimensionScores`，但不改变综合分、覆盖率与排序。
  - `go test ./internal/domain` 通过。
- **依赖**：TASK-001
- **优先级**：P0

### TASK-006：调整排行、详情与写入的可见性契约

- **Status**：DONE
- **Executor**：主线
- **Description**：修改 `internal/api/rankings.go`、`internal/api/handlers_models.go`、`internal/api/handlers_scores.go`，让公开排行过滤隐藏模型、管理员可显式包含，并让详情返回文字维度。
- **Details**：
  - `loadRanking` 只加载未归档模型；领域模型携带 `Hidden`。
  - `GET /api/rankings` 的维度列表包含全部启用且非文字的维度（含权重 0）；公开响应过滤隐藏模型；`?includeHidden=1` 仅管理员可用（匿名 401），隐藏行保留分值与 `hidden: true`，名次为空。
  - 模型详情：归档模型返回 404；响应携带 `hidden`；数值维度包含权重 0，文字维度返回 `textMode: true` 与 `text`；`scoredCount` 与 `dimensionCount` 只统计权重 > 0 的数值维度。
  - bootstrap 计数排除归档与隐藏模型，避免公开统计与榜单不一致。
  - 数值评分写入归档模型按不存在返回 404；文字写入同样；删除未归档模型评分的幂等语义不变。
- **Acceptance Criteria**：
  - 匿名排行、对比数据不出现隐藏模型；管理员 `includeHidden=1` 可见且名次为空。
  - 权重 0 维度出现在排行维度列表与模型 `scores` 映射中，综合分与覆盖率不变。
  - 归档模型详情与评分/文字写入均为 404；文字维度详情带内容。
  - `go test ./internal/api` 可编译（断言在 TASK-016 补齐）。
- **依赖**：TASK-003、TASK-004、TASK-005
- **优先级**：P0

### TASK-007：维护门禁认证前置并补登出断言

- **Status**：DONE
- **Executor**：主线
- **Description**：调整 `internal/api/middleware.go` 的维护门禁顺序，并在 `internal/api/api_test.go` 的 `TestMaintenanceGate` 补充登出豁免断言。
- **Details**：
  - 先判断 `s.auth.Authenticated(r)`，已认证直接放行；再读取显示设置并判断维护开关。管理员请求不再触发 `display_settings` 查询。
  - 豁免路径清单保持不变，不重构路由表。
  - 测试：维护开启且匿名 `POST /api/auth/logout` 返回 200，响应含 `"authenticated":false`；登录、健康检查与公开显示设置的既有断言保留。
- **Acceptance Criteria**：
  - 管理员在维护期访问非豁免接口不再进入设置读取分支（代码顺序可核对）。
  - 登出豁免被回归覆盖；维护关闭后匿名访问恢复。
  - `go test ./internal/api` 通过。
- **依赖**：无
- **优先级**：P1

---

## Phase 3：设置页与维护页

### TASK-008：同步前端类型与 API 客户端

- **Status**：DONE
- **Executor**：主线
- **Description**：修改 `web/src/api/types.ts` 与 `web/src/api/client.ts`，补齐模型显隐/归档、维度文字模式与文字读写、排行包含隐藏项的参数。
- **Details**：
  - `Dimension` 增加 `textMode`；`ModelSummary` 增加 `hidden`、`archivedAt`；`ModelDimension` 增加 `textMode`、`text`；`RankingModel` 增加 `hidden`。
  - `api.models(includeArchived, signal?)`、`api.rankings(includeHidden, signal?)`、`api.setModelHidden`、`api.setModelArchived`、`api.putModelText`（空串即清空，不新增删除端点）。
  - 保持现有 fetch 与错误封装不变。
- **Acceptance Criteria**：
  - `pnpm --dir web typecheck` 通过；调用点参数含义明确，无隐式默认。
- **依赖**：TASK-003、TASK-004
- **优先级**：P0

### TASK-009：维护页撤下登录入口

- **Status**：DONE
- **Executor**：主线
- **Description**：修改 `web/src/pages/Maintenance.tsx` 与 `Maintenance.module.css`，删除登录链接及相关样式，保留 Logo、标题与状态说明。
- **Details**：
  - 移除 `Link` 与 `styles.login`，不新增替代按钮或说明。
  - `/login` 路由与服务端登录豁免保持不变。
- **Acceptance Criteria**：
  - 维护页 DOM 中不存在指向 `/login` 的链接或按钮。
  - 直接访问 `/login` 仍显示登录表单；维护页在 1440/390 下居中且无溢出。
- **依赖**：无
- **优先级**：P0

### TASK-010：模型设置页新增显隐与归档区

- **Status**：DONE
- **Executor**：主线
- **Description**：修改 `web/src/pages/Settings.tsx`、`web/src/components/Icons.tsx` 与 `Settings.module.css`，实现模型隐藏开关、归档与底部归档区。
- **Details**：
  - 设置页加载 `api.models(true)`，拆分启用与归档模型；页头与「模型」分区统计分别显示启用数与归档数。
  - 启用行操作：查看、编辑、隐藏/显示（眼睛图标，`aria-pressed` 或明确标签）、归档、永久删除；隐藏行显示「已隐藏」标签。
  - 模型列表下方常驻「已归档」区，仅在存在归档项时渲染；每行提供恢复与永久删除（确认文案说明级联删除评分与文字）。
  - 新增 `eye`、`eyeOff` 图标；操作按钮沿用现有 `IconButton` 与 34px 点击区。
  - `ModelDialog` 的厂商候选只传启用模型。
- **Acceptance Criteria**：
  - 隐藏/显示、归档、恢复、永久删除均调用正确接口并刷新列表。
  - 归档项只出现在底部区，启用区计数与列表一致。
  - 操作具备可读标签，键盘可达；1440/390 无横向溢出。
- **依赖**：TASK-008
- **优先级**：P0

### TASK-011：维度弹窗与列表支持不纳入评分和文字

- **Status**：DONE
- **Executor**：主线
- **Description**：修改 `web/src/components/DimensionDialog.tsx` 与 `web/src/pages/Settings.tsx`，增加「不纳入评分」「填入文字」及对应状态展示。
- **Details**：
  - 弹窗状态：`excluded = weight === 0`；勾选「不纳入评分」时权重固定为 0 并禁用输入；取消勾选时自动关闭「填入文字」、恢复权重输入，提交前要求 1–100。
  - 「填入文字」仅在「不纳入评分」勾选时可用；勾选后提交 `textMode: true` 且权重 0；取消勾选时 `textMode: false`，仍保持不纳入、权重为 0，已存数值评分保留但暂不展示，不自动伪造权重；界面提示「仍为不纳入评分，需要参与排行时取消不纳入并设置权重」。
  - 说明文案：不纳入评分仍显示在排行与详情，但不计入综合分与覆盖率；文字维度不参与任何计算，在模型评分弹窗填写。
  - 维度列表状态标签区分「已归档」「文字」「不纳入」「参与排行」；权重列文字维度显示 0。
- **Acceptance Criteria**：
  - 两种选项联动正确，非法组合（文字维度权重 > 0）在提交前被拦截。
  - 取消「不纳入评分」时文字模式同步关闭，不出现提交 422 且无出路的路径；关闭文字后仍为不纳入，权重保持 0。
  - 现有维度打开时按权重与 `textMode` 正确回填。
  - 状态标签与权重列反映实际数据；类型检查通过。
- **依赖**：TASK-008
- **优先级**：P0

---

## Phase 4：展示与编辑面

### TASK-012：排行页展示不纳入评分的维度列

- **Status**：DONE
- **Executor**：主线
- **Description**：调整 `web/src/pages/Rankings.tsx`（必要时 `Rankings.module.css`），接受排行接口新增的权重 0 维度列。
- **Details**：
  - 维度列由接口驱动，权重 0 维度与其他列同样渲染、可排序；表头权重徽标显示 0。
  - 综合分、覆盖率、官方名次仍由服务端与现有纯函数决定，不因新增列改变；百分比区间只基于可见模型综合分。
  - 隐藏模型不进入响应，页面无需额外过滤。
  - 空态区分三种情况：没有任何维度沿用「尚未创建维度」；有维度但没有参与排行的数值维度（全部为文字维度）显示「暂无参与排行的维度」；有数值维度但总权重为 0 显示「维度均未纳入评分」。判定用 bootstrap 的维度列表（含文字维度）与接口数值维度对比，空态文案不把新能力描述成配置错误。
- **Acceptance Criteria**：
  - 权重 0 列可见、可排序，排序只改变视图；综合分与名次不变。
  - 隐藏模型不出现在排行；对比页随同一接口出现权重 0 维度行。
  - 全部维度为文字维度、全部为不纳入维度两种数据下显示对应空态，不误报「尚未创建维度」。
  - 图例与说明不回归；1440/390 无横向溢出。
- **依赖**：TASK-008、TASK-006
- **优先级**：P0

### TASK-013：工作台弱化隐藏模型并保持可编辑

- **Status**：DONE
- **Executor**：主线
- **Description**：修改 `web/src/pages/Workbench.tsx`、`Workbench.module.css` 与 `web/src/styles/global.css`，让工作台加载隐藏模型并以浅灰呈现。
- **Details**：
  - `api.rankings(true)` 获取含隐藏项的数据；表头、快捷编辑与评分弹窗继续工作。
  - 隐藏行增加弱化类：模型名、厂商、维度值、综合分与名次统一使用 `--ink-3`，不新增更浅的令牌，不改变布局与行高。
  - 隐藏行名次显示「—」；覆盖率计数分母与分子都只统计权重 > 0 的维度。
  - 隐藏行仍可快捷编辑与打开评分弹窗。
  - 存在数值维度即渲染表格：总权重为 0 时仍显示维度列与行，快捷编辑只要求模型与数值维度非空；无任何数值维度时显示「暂无参与评分的数值维度」并指向维度设置。无维度与仅文字维度用 bootstrap 维度列表区分。
- **Acceptance Criteria**：
  - 隐藏模型只在工作台出现，名称与数字呈浅灰；公开排行无该模型。
  - 快捷编辑对隐藏模型可保存，保存后仍为浅灰；全部维度权重为 0 时表格仍可编辑。
  - 弱化文字与纸白底的对比度不低于 4.5:1。
  - 1440/1100/390 下表格容器滚动正常，页面级无横向溢出。
- **依赖**：TASK-010、TASK-006
- **优先级**：P0

### TASK-014：详情页展示文字维度并修正隐藏模型入口

- **Status**：DONE
- **Executor**：主线
- **Description**：修改 `web/src/pages/ModelDetail.tsx`、`ModelDetail.module.css`，拆分数值维度与文字维度，并保证隐藏模型仍可打开评分弹窗。
- **Details**：
  - 数值维度表包含权重 0 维度；文字维度在表格下方独立区块展示，按维度名称与内容排列，空内容显示破折号。
  - 只有数值维度参与「已评分维度」「覆盖率」「维度排名」「相对条」；仅文字维度时显示文字区块与综合分为破折号，不显示「尚未设置维度权重」空态。
  - 隐藏模型详情可访问：用详情数据构造评分弹窗所需的模型行（分值来自维度，`hidden: true`），避免弹窗拿到空模型。
  - 隐藏模型详情不展示「对比」入口（对比数据不含隐藏模型），下一步模型导航仅在公开排行存在时显示；私人备注保持现有行为。
- **Acceptance Criteria**：
  - 文字内容中英文均可保存并回显，换行保留。
  - 权重 0 数值维度出现在表中且不影响覆盖率/综合分。
  - 隐藏模型详情打开评分弹窗后可加载并保存，不出现指向空对比页的入口。
  - 1440/390 无横向溢出。
- **依赖**：TASK-010、TASK-006
- **优先级**：P0

### TASK-015：评分弹窗支持文字维度录入

- **Status**：DONE
- **Executor**：主线
- **Description**：修改 `web/src/components/ScoreDialog.tsx` 与 `ScoreDialog.module.css`，在现有逐维度表单中区分数值与文字输入。
- **Details**：
  - 文字维度渲染多行文本框（上限 2000 字符，占位提示中文或英文），不显示评分输入、备注按钮与权重校验。
  - 保存时按维度串行提交：数值走评分接口，文字走文字接口；空文字清空记录；仅提交变化项。
  - 脏检查、错误提示与离开确认覆盖文字内容；预览综合分、名次与「已评分维度」只使用权重 > 0 的数值维度，隐藏行不参与名次编号。
  - 预览前把当前 `model` 按 slug 合并进 `rankings.models`（去重），不依赖公开排行是否包含该模型；隐藏模型详情与工作台的预览取值一致。
  - `previewRanking` 与 `RankRow` 增加隐藏标记处理：隐藏行置底且不编号，目标为隐藏模型时名次为空；共享的 `sortRows` 同样保持隐藏行置底，可见行内部照常按当前键排序。
  - 打开后优先聚焦首个数值输入，无数值维度时聚焦首个文本框。
- **Acceptance Criteria**：
  - 文字可保存、清空、回显；失败保留草稿并显示原因。
  - 文字维度不参与综合分预览；数值维度行为不回归。
  - 隐藏模型详情弹窗的综合分、覆盖率与已评分维度与工作台同一模型一致。
  - 键盘焦点、离开拦截与保存中禁用符合现有约定。
- **依赖**：TASK-014
- **优先级**：P0

---

## Phase 5：验证、文档与归档

### TASK-016：补齐后端与前端回归测试

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `internal/store/store_test.go`、`internal/api/api_test.go`、`internal/domain/ranking_test.go`、`web/src/domain/ranking.test.ts` 补齐本轮契约的确定性断言，并更新受影响旧断言。
- **Details**：
  - 存储：隐藏/归档持久化与列表过滤、文字读写/清空/级联、文字维度数值写入拒绝、归档模型评分拒绝。
  - 领域：隐藏模型不占名次、权重 0 值进入展示快照但不改综合分/覆盖率。
  - API：匿名与管理员 `includeArchived`/`includeHidden`、默认模型列表包含隐藏且排除归档、归档 404 与恢复、隐藏模型公开不可见、权重 0 列返回、文字端点校验与权限、维护期登出豁免。
  - 前端纯函数：`previewRanking` 合并当前模型后不依赖行集、隐藏行置底且不编号、可见模型名次连续；`sortRows` 保持隐藏行置底；现有 `composite` 权重 0 断言保留。
- **Acceptance Criteria**：
  - 新增断言在未实现对应行为时失败（逐项核对）。
  - `go test ./...` 与 `pnpm --dir web test` 通过。
- **依赖**：TASK-005、TASK-006、TASK-007、TASK-015
- **优先级**：P0

### TASK-017：全量验证与浏览器验收

- **Status**：DONE
- **Executor**：主线
- **Description**：执行全部命令，并在已开启 9222 的浏览器实例上用临时数据库完成 1440/390 验收。
- **Details**：
  - 命令：`go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`（Go 缓存使用工作区）、`pnpm --dir web test`、`pnpm --dir web typecheck`、`pnpm --dir web build`。
  - 数据：至少 3 个模型（含 1 个隐藏、1 个归档、1 个可见）、3 个维度（权重 50、权重 0、文字维度），并写入中英文文字。
  - 验收：维护页无登录入口、`/login` 直链可用；排行不含隐藏/归档且显示权重 0 列；工作台隐藏行浅灰且可保存、默认排在可见行之后；设置页显隐/归档/恢复/永久删除；维度弹窗联动与取消路径；详情文字区块、隐藏模型无对比入口、评分弹窗文字录入与预览一致；全部维度为文字/全部不纳入两种空态；弱化文字对比度；无脚本错误与页面级横向溢出。
  - 记录命令结果、测试数量与浏览器结论，供 Project.md 使用。
- **Acceptance Criteria**：
  - 全部命令退出码 0；浏览器验收项逐条通过。
  - 临时数据库与浏览器进程在验收后清理。
- **依赖**：TASK-016
- **优先级**：P0

### TASK-018：重组 Project.md 事实与测试记录

- **Status**：DONE
- **Executor**：主线
- **Description**：同步 `.docs/Project.md` 的事实、决策与测试记录结构。
- **Details**：
  - 概述：当前增量换为本轮；上一增量只保留 v12；不新增变更记录，归档目录与测试记录分组即历史索引。
  - 事实：结构（迁移 005/006）、API 面、数据模型、排名规则、认证与维护、前端路由/登录入口/信息架构/显示偏好/视觉/交互、术语（隐藏、归档、文字维度）、已知限制。
  - 决策：模型显隐、归档语义、权重 0 展示口径、文字维度存储与展示、维护页撤下登录、门禁认证前置、首屏阻塞取舍；删除或改写「权重 0 不进入排行/评分弹窗」与「维护页提供登录入口」的旧结论。
  - 已知限制：隐藏只影响公开排行、对比候选与名次，模型列表接口与详情直链仍可达；隐藏不是权限隔离。
  - 测试记录：按 `### 10-22-v1` … `### 10-22-v12` 分组归入既有记录，本轮新增 `### 10-22-v13`；修正 v12 两条记录插在 v10 两条之间、以及「44/44」多次出现但对应不同交付的表述。
- **Acceptance Criteria**：
  - Project.md 与根目录 Plan/Tasks 不再出现「维护页提供登录入口」「权重 0 的维度不参与排行，也不进入评分弹窗」等失效表述。
  - 测试记录每条都有归档归属，顺序与本轮时间线一致，不新增与归档目录重复的变更记录。
- **依赖**：TASK-017
- **优先级**：P0

### TASK-019：修正 v11/v12 归档头部与 v12 结论

- **Status**：DONE
- **Executor**：主线
- **Description**：只修正 83 分报告点名的三处历史文档问题，不批量回填更早归档。
- **Details**：
  - `.docs/10-22-v12/Plan.md` 的会话过期风险改为「维护期收到 503，需刷新回到维护页」。
  - `.docs/10-22-v12/Tasks.md` 头部补 `状态：DONE`、日期/完成日期与回归测试结论。
  - `.docs/10-22-v11/Plan.md` 头部补回归测试结论（取自 v11 Tasks 的回归结论）。
  - v6–v10 的同类头部缺失（v10 Tasks 另缺完成日期）登记为历史例外，不在本轮批量回填；不重排历史小节。
- **Acceptance Criteria**：
  - 仅修改上述三个文件，diff 只含事实错误与缺失头部字段，不改写历史交付内容。
  - v12 Plan 不再声称会话过期会触发 401 并自动切到维护页。
- **依赖**：TASK-018
- **优先级**：P1

### TASK-020：归档 10-22-v13 并提交

- **Status**：DONE
- **Executor**：主线
- **Description**：补齐 Plan/Tasks 头部状态与回归结论，归档到 `.docs/<当前日期>-vN/`，恢复构建占位文件并分两次提交。
- **Details**：
  - 归档目录按执行当日日期与现有最大版本号加一确定（当前预期 `10-22-v13`）。
  - Plan 与 Tasks 均标注 `状态：DONE`、完成日期与回归测试结论；根目录不残留 Plan.md / Tasks.md。
  - 恢复被构建删除的 `web/dist/.gitkeep`，确认不提交构建产物、数据库或临时文件。
  - 提交一：`feat:` 代码与 Project.md；提交二：`docs:` 归档文件与历史归档修正。提交信息中文描述，遵循 Conventional Commits。
- **Acceptance Criteria**：
  - 归档目录同时含 Plan.md 与 Tasks.md，头部字段齐全。
  - `git status` 干净；最近两次提交粒度与 v12 一致。
  - 全量测试结果记录在归档头部与 Project.md。
- **依赖**：TASK-019
- **优先级**：P0
