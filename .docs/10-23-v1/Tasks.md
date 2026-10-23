# Tasks：模型评语与审阅残留收口

**关联 Plan**：`Plan.md` —— 模型评语与 10-22-v13 审阅残留收口 v1.1
**状态**：DONE
**日期**：2026-10-23
**完成日期**：2026-10-23
**回归结论**：12 个 Task 全部完成；`go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`、`typecheck`、`build` 通过，浏览器验收见 Project.md 的 10-23-v1 记录。
**版本**：v1.1
**总计 Task**：12 个，均由主线执行

---

## Phase 1：数据与接口契约

### TASK-001：追加评语迁移与存储读写

- **Status**：PENDING
- **Executor**：主线
- **Description**：新增迁移 `migrations/007_model_commentary.sql`，为 `models` 追加评语正文、公开标记与评语日期；在 `internal/store/models.go` 扩展模型结构、扫描列与评语写入。
- **Details**：
  - `commentary TEXT NOT NULL DEFAULT ''`；`commentary_public INTEGER NOT NULL DEFAULT 0 CHECK (commentary_public IN (0, 1))`；`commentary_at TEXT NOT NULL DEFAULT ''`（`YYYY-MM-DD`，空串表示未填写）。
  - `Model` 增加 `Commentary string`、`CommentaryPublic bool`、`CommentaryAt string`。
  - `modelColumns` 常量与 `scanModel` 增加三列；`ListModels` 的 SELECT 与 Scan 同步（顺序一致）。
  - 新增 `SetModelCommentary(ctx, id int64, commentary string, public bool, at string) (Model, error)`：单条 UPDATE 写入三列并推进 `updated_at`，返回更新后模型；受影响行数为 0 返回 `ErrNotFound`。
  - 不修改 `CreateModel` 与 `UpdateModel` 的签名。
- **Acceptance Criteria**：
  - 旧库执行迁移后，已有模型三列为空串、0、空串。
  - 写入后 `ModelBySlug`、`ListModels` 均返回相同的评语三字段。
  - `go test ./internal/store` 与 `CGO_ENABLED=0 go build ./cmd/server` 通过。
- **依赖**：无
- **优先级**：P0

### TASK-002：扩展模型接口的评语字段与可见性

- **Status**：PENDING
- **Executor**：主线
- **Description**：修改 `internal/api/handlers_models.go`：模型响应、列表项、详情响应与 PATCH 载荷增加评语三字段，按管理员身份裁剪可见性，并补齐写入校验。
- **Details**：
  - `modelResponse` 增加 `commentary`、`commentaryPublic`、`commentaryAt`（仅管理员可达的创建、更新、归档、恢复响应）。
  - `modelListItem` 使用指针字段 `*string`/`*bool` 并保留 `omitempty`，仅在管理员分支填充，值即使为空也显式返回；匿名列表不含三字段。
  - `modelPatch` 增加 `Commentary *string`、`CommentaryPublic *bool`、`CommentaryAt *string`；“没有需要更新的字段”判定包含新字段。
  - 新增 `validateCommentary(commentary, at string) map[string]string`：正文超过 500 个字符返回 `commentary`；`at` 非空且不能按 `2006-01-02` 解析时返回 `commentaryAt`。`at` 先 `TrimSpace`。
  - 任一评语字段出现时，以当前值补齐缺失字段后校验并调用 `SetModelCommentary`；与名称/厂商/备注、`hidden` 的写入相互独立。
  - `modelDetailResponse` 增加同名字段；仅当管理员或 `commentary_public` 为真时填充（管理员视图包含 `commentaryPublic: false` 用于「未公开」标记），匿名私有评语整组字段缺失。
  - `POST /api/models` 的创建载荷保持现状，不接收评语字段。
- **Acceptance Criteria**：
  - PATCH 仅提交评语三字段可成功，且不覆盖名称、厂商、备注。
  - 匿名详情在评语未公开时不出现 `commentary`、`commentaryAt`；公开后出现且带 `commentaryPublic: true`。
  - 管理员详情在两种状态下均可读评语，未公开时 `commentaryPublic` 为 false。
  - 501 字正文与非法日期分别返回 422，字段名分别为 `commentary`、`commentaryAt`。
  - `go vet ./...` 与 `go test ./internal/api` 可编译通过。
- **依赖**：TASK-001
- **优先级**：P0

### TASK-003：导出包含评语字段

- **Status**：PENDING
- **Executor**：主线
- **Description**：在 `internal/api/handlers_export.go` 的 `exportModel` 与填充逻辑中增加评语三字段，保证备份可还原评语、公开状态与日期。
- **Details**：
  - 字段名与模型接口一致：`commentary`、`commentaryPublic`、`commentaryAt`。
  - 导出仍为管理员专用，不做可见性裁剪，归档模型一并包含。
- **Acceptance Criteria**：
  - 导出 JSON 中每个模型都含三字段，空评语为 `""`、`false`、`""`。
  - 导出结构可被 `encoding/json` 解析，既有字段不变。
- **依赖**：TASK-001
- **优先级**：P0

---

## Phase 2：设置弹窗录入

### TASK-004：模型编辑弹窗增加评语、公开与日期

- **Status**：PENDING
- **Executor**：主线
- **Description**：在 `web/src/api/types.ts` 同步评语字段，在 `web/src/components/ModelDialog.tsx` 的编辑态增加评语文本域、公开勾选与评语日期输入，并随更新请求提交。
- **Details**：
  - 类型：`ModelSummary` 与 `ModelDetail` 增加可选 `commentary`、`commentaryPublic`、`commentaryAt`；`ModelPatch` 增加同名字段。
  - 弹窗状态：`commentary`、`commentaryPublic`、`commentaryAt`，`useEffect` 中按 `model` 回填，默认 `""`、`false`、`""`。
  - 字段顺序：厂商之后依次为评语（`TextAreaField`，`maxLength` 500，3 行，提示「公开后显示在详情页底部。」）、评语时间（`TextField type="date"`）、公开勾选（`ui.checkboxRow`，文案「公开显示」，紧随一行 `ui.hint`「关闭后仅管理员在详情页可见。」）、私人备注保持最后。
  - 校验：正文超过 500 字提示「评语不能超过 500 个字符」；日期交由原生控件，不额外解析。
  - 仅编辑态渲染评语字段；创建请求载荷不变。更新请求在编辑态始终提交三字段。
- **Acceptance Criteria**：
  - 打开已有模型的编辑弹窗回填三项，保存后重开保持。
  - 关闭公开后再次打开显示未勾选，日期原样回填。
  - 新建模型弹窗不出现评语字段，创建请求不带评语字段。
  - `pnpm --dir web typecheck` 通过。
- **依赖**：TASK-002
- **优先级**：P0

---

## Phase 3：详情页展示

### TASK-005：详情页底部「模型评语」区块

- **Status**：PENDING
- **Executor**：主线
- **Description**：在 `web/src/pages/ModelDetail.tsx` 的文字维度之后、私人备注之前渲染评语区块，并在 `web/src/pages/ModelDetail.module.css` 补充样式。
- **Details**：
  - 渲染条件：`detail.commentary` 去空白后非空；为空时整块不渲染。
  - 结构：左列标签固定为「模型评语」，未公开时右侧追加 `ui.tag` 文案「未公开」；右列为正文段落，正文结尾内联 `<time dateTime={commentaryAt}>` 显示日期原文，日期为空则不渲染时间。
  - 文案：区块内不添加说明性描述或引导语。
  - 样式：与私人备注相同的两列网格（180px + 正文）、`margin-top: 44px`、`padding: 20px 0 8px`、顶部 1px `--ink` 分隔线；正文 15px / 1.85、`--ink`、保留换行；时间等宽 11px、`--ink-3`、左间距 14px；≤760px 改单列、`margin-top: 32px`。
  - 将 `.privateHead` 重命名为 `.footHead` 供两个区块共用，私人备注的结构与字号保持不变。
- **Acceptance Criteria**：
  - 公开评语在匿名与管理员视图均显示，日期紧跟正文结尾。
  - 未公开评语仅管理员可见并带「未公开」标记；匿名访问时区块不存在。
  - 无评语、仅有日期、日期为空三种数据下不出现空区块或孤立日期。
  - 私人备注的可见性与内容不变；1440 与 390 宽度无横向溢出。
  - `pnpm --dir web typecheck` 与 `build` 通过。
- **依赖**：TASK-002、TASK-004
- **优先级**：P0

---

## Phase 4：审阅残留收口

### TASK-006：收紧隐藏模型的匿名可达面

- **Status**：PENDING
- **Executor**：主线
- **Description**：修改 `internal/api/handlers_models.go`，让隐藏模型对匿名访客不可见；同步修正 `internal/api/api_test.go` 中「默认列表包含隐藏模型」的旧断言。
- **Details**：
  - `handleListModels`：管理员判定后，构建列表时跳过 `m.Hidden` 为真的项；管理员默认列表与 `includeArchived=1` 仍包含隐藏模型。
  - `handleGetModel`：把 `admin := s.auth.Authenticated(r)` 前移到归档判定之前；归档返回 404 的既有分支之后，隐藏且非管理员同样返回 404 `not_found`「对象不存在」，不暴露模型存在性。
  - 隐藏模型的管理员详情、评分写入、文字写入、显示/隐藏切换与工作台入口保持不变。
  - 测试：匿名 `GET /api/models` 不含 `"slug":"hidden"`；管理员默认列表含隐藏模型；匿名隐藏详情 404；管理员隐藏详情 200 且含名称、厂商与私人备注。
- **Acceptance Criteria**：
  - 匿名列表与详情均无法读取隐藏模型；管理员行为与改动前一致。
  - `go test ./...` 通过，旧断言已按新契约更新。
- **依赖**：TASK-002（同一处理器文件的最终形态）
- **优先级**：P0

### TASK-007：工作台隐藏行弱化覆盖率

- **Status**：PENDING
- **Executor**：主线
- **Description**：为 `web/src/components/Coverage.tsx` 增加弱化态，并在 `web/src/pages/Workbench.tsx` 的隐藏行传入；样式写入 `web/src/components/ui.module.css`。
- **Details**：
  - `Coverage` 增加可选 `muted?: boolean`，根节点附加 `ui.coverageMuted`。
  - `ui.module.css`：`.coverageMuted .coverageLabel` 与 `.coverageMuted .coverageFill` 使用 `--ink-3`；`暂定` 标记保留 `--signal`。
  - 工作台覆盖率单元格传 `muted={model.hidden}`；可见行不传。
- **Acceptance Criteria**：
  - 隐藏行的覆盖率百分比与进度条颜色与同行名称、分值一致（`--ink-3`），可见行保持原色。
  - 隐藏行仍显示覆盖率数值、暂定标记与已评分计数。
  - `pnpm --dir web typecheck` 通过。
- **依赖**：无
- **优先级**：P1

### TASK-008：修正维度弹窗的初始与回退权重

- **Status**：PENDING
- **Executor**：主线
- **Description**：修改 `web/src/components/DimensionDialog.tsx`，让新建维度与取消「不纳入评分」后都处于合法权重区间。
- **Details**：
  - 打开弹窗时：编辑态回填原权重；新建态权重为 `"50"`、`excluded` 为 false。
  - 「不纳入评分」勾选时权重置 `"0"`；取消勾选时若当前权重非正数（`Number(weight) <= 0` 或非整数）则置回 `"50"`，并保持既有的 `setTextMode(false)`。
  - 校验规则不变（参与评分时 1–100 的整数）。
- **Acceptance Criteria**：
  - 新建维度弹窗填入名称即可直接保存，权重为 50，无初始校验错误。
  - 从「不纳入评分」或文字维度取消勾选后，权重为 50、文字模式关闭，可直接保存。
  - 编辑已有维度时原权重原样回填，不因本次改动被重置。
  - `pnpm --dir web typecheck` 通过。
- **依赖**：无
- **优先级**：P1

### TASK-009：隐藏模型详情合并自身到强度基准

- **Status**：PENDING
- **Executor**：主线
- **Description**：修改 `web/src/pages/ModelDetail.tsx`，把当前模型并入详情页的展示范围，使隐藏模型的综合强度、维度强度与相对条不再落回 99.9% 或「—」。
- **Details**：
  - 由 `detail` 构造 `selfModel: RankingModel`（含 slug、名称、厂商、隐藏标记、综合分、覆盖率、名次与该模型的数值维度分值），作为 `scoreModel` 的唯一来源。
  - 新增 `displayModels`：公开排行已含该 slug 时沿用排行，否则追加 `selfModel`；`dimensionScoreRanges` 与 `scoreRange` 改用该集合。
  - 评分弹窗的 `scoreModel` 改为 `storedRow ?? selfModel`，删除原先内联的重复构造。
  - 维度名次仍按公开排行计算，隐藏模型保持「—」。
- **Acceptance Criteria**：
  - 隐藏模型分数高于全部可见模型时综合强度为 100%，不再是 99.9%。
  - 隐藏模型的各维度强度与相对条按其与可见模型的实际区间渲染；无有效区间时仍显示「—」。
  - 非隐藏模型的数值与改动前完全一致。
  - `pnpm --dir web typecheck` 与 `build` 通过。
- **依赖**：TASK-005（同一页面文件）
- **优先级**：P1

---

## Phase 5：验证、文档与归档

### TASK-010：补齐评语存储与接口回归

- **Status**：PENDING
- **Executor**：主线
- **Description**：在 `internal/store/store_test.go` 与 `internal/api/api_test.go` 增加评语持久化、可见性与校验的回归测试。
- **Details**：
  - 存储：新建模型的默认三字段；`SetModelCommentary` 后经 `ModelBySlug` 与 `ListModels` 回读一致；重复写入覆盖旧值。
  - 接口：管理员 PATCH 评语三字段；匿名详情在未公开时不含 `"commentary"` 与 `"commentaryAt"`，公开后包含正文、日期与 `"commentaryPublic":true`；管理员详情在未公开时含正文且 `commentaryPublic` 为 false；匿名列表不含评语、管理员列表含；501 字与非法日期各返回 422 且字段名正确；导出含三字段；仅提交评语的 PATCH 不改变名称、厂商与私人备注。
  - 复用现有 `env`、`createModel` 测试脚手架，不新增依赖。
- **Acceptance Criteria**：
  - `go test ./...` 通过。
  - 测试文件显式包含以下断言：匿名详情字段缺失、公开后字段存在、501 字与非法日期的 422 字段名、匿名/管理员列表差异、导出三字段；执行结果记入 Project.md 的 10-23-v1 测试记录。
  - 既有隐私断言（匿名详情/列表不含私人备注）保持通过。
- **依赖**：TASK-002、TASK-003
- **优先级**：P0

### TASK-011：全量命令与浏览器验收

- **Status**：PENDING
- **Executor**：主线
- **Description**：执行全量校验命令，并在浏览器中验收评语、隐藏模型可达面与三处展示修正。
- **Details**：
  - 命令：`go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`、`pnpm --dir web typecheck`、`pnpm --dir web build`。
  - 评语：编辑弹窗填写评语、勾选公开、选择日期；管理员与匿名（无痕）视图核对详情页区块、日期位置与「未公开」标记；确认排行、对比、工作台与评分弹窗无新增评语痕迹；覆盖回填、清空评语、清空日期、取消弹窗四种编辑路径。
  - 隐藏模型：匿名直接访问隐藏模型详情得到 404 页面，匿名模型列表接口不含隐藏项；管理员工作台与设置页入口正常；工作台隐藏行覆盖率数字与进度条为浅灰。
  - 维度弹窗：新建维度填入名称直接保存成功；已有 0 权重维度取消「不纳入」后权重为 50。
  - 隐藏模型强度：构造分数高于全部可见模型的隐藏模型，详情综合强度为 100%，维度相对条与强度同基准。
  - 检查 1440 与 390 宽度、无横向溢出与脚本错误。
- **Acceptance Criteria**：
  - 全部命令通过并记录结果。
  - 浏览器验收项逐条通过；失败项修复后重跑。
- **依赖**：TASK-005、TASK-009、TASK-010
- **优先级**：P0

### TASK-012：同步文档、归档与提交

- **Status**：PENDING
- **Executor**：主线
- **Description**：更新 `.docs/Project.md`，随后将 Plan.md 与 Tasks.md 标注完成并归档到 `.docs/10-23-v1/`，最后提交。
- **Details**：
  - Project.md：当前/上一增量顺延；API 面补充模型 PATCH 评语字段与详情可见性，并注明匿名模型列表不含隐藏模型、隐藏详情对匿名为 404；数据模型补充三列；前端补充详情区块与弹窗字段；约束与决策补充「日期手填不取系统时间」「评语默认不公开」「评语与私人备注分列」「隐藏模型不对匿名提供列表与详情」；已知限制删除或改写「隐藏不是权限隔离」，补评语无历史；测试与验收新增 `10-23-v1` 分组；术语新增「模型评语」。
  - 归档：Plan.md 与 Tasks.md 头部改为 `状态：DONE`，补完成日期与回归结论，移入 `.docs/10-23-v1/`，确认根目录无残留。
  - 提交：`git status` / `git diff` 核对，按 Conventional Commits 英文类型 + 中文描述提交，不含构建产物与数据库文件。
- **Acceptance Criteria**：
  - Project.md 与实现、测试记录一致，无「隐藏不是权限隔离」与现状冲突的表述。
  - 归档目录同时含 Plan.md 与 Tasks.md，状态 DONE 且含完成日期与测试结论。
  - 工作区干净，提交信息符合项目规范。
- **依赖**：TASK-011
- **优先级**：P1
