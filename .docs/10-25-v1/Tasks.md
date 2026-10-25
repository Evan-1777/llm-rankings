# Tasks：综合分改为按维度基准最大值换算

**关联 Plan**：Plan.md —— 综合分改为按维度基准最大值换算 v1.1  
**状态**：DONE  
**日期**：2026-10-25  
**完成日期**：2026-10-25  
**总计 Task**：9 个（全部 DONE；执行主体均为主线）  
**回归测试结论**：`go test ./...`（60 项）、`go vet ./...`、`CGO_ENABLED=0` 构建、`pnpm --dir web test`（61/61）、`typecheck`、`build` 全部通过；浏览器手工验收通过。  
**审阅基线**：2026-10-25 只读 Review（80/100）；修订见 Plan 第 8 节。

---

## Phase 1：数据层与领域公式

### TASK-001：新增基准列并贯通维度存储读写

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Depends On**：无
- **Description**：在 migrations/ 新增基准列迁移；在 internal/store/dimensions.go 的维度结构、统一列清单、扫描、创建与更新写入该字段。
- **Details**：
  - 迁移仅追加：ALTER TABLE dimensions ADD COLUMN baseline_max REAL，约束为 null 或 > 0。
  - 维度结构增加可空基准；统一 SELECT/Scan 顺序加在文字模式之后。
  - 创建/更新接收可空基准；其余归档、排序、删除路径不变。
  - 同步 internal/store/store_test.go 的调用点，并在维度生命周期用例中断言写入、读取与清空。
- **Acceptance Criteria**：
  - go test ./internal/store 通过。
  - 创建时留空读回 null；填写 7.5 读回 7.5；更新为 null 后读回 null。
  - 既有维度排序、归档、删除用例不受影响。

### TASK-002：实现唯一基准解析、换算公式与综合分

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Depends On**：TASK-001
- **Description**：在 internal/domain/ranking.go 为维度增加可空基准，新增 domain.EffectiveBaselines 作为唯一解析入口，综合分改为换算分的加权平均，并在结果中携带生效基准；重写 internal/domain/ranking_test.go 相关断言并补充新场景。
- **Details**：
  - EffectiveBaselines(dimensions, models, scores) 返回每个维度的生效基准：配置值优先；自动且存在有效评分时取快照内模型的最高分（全 0 即 0）；自动且无任何有效评分时不在映射中返回。
  - 自动基准只接受快照内模型（归档模型不在快照内），隐藏模型照常参与；忽略非有限与负分。
  - 换算分 = 原始分 ÷ 生效基准 × 100；基准缺失或为 0 时按 0 计；不封顶。
  - 综合分仍按已评分且权重 > 0 的维度归一权重，累加顺序保持维度 ID 稳定序；覆盖率、名次、同分、隐藏规则不变。
  - Compute 将 EffectiveBaselines 的结果写入结果，供接口序列化；Compute、维度列表与导出共用该函数。
  - 既有断言按新公式改期望；不涉及基准语义的用例改用显式固定基准隔离变量。
  - 新增用例：自动基准随最高分变化、固定基准不受榜单变化影响、超过基准 >100、全 0、无评分维度缺席、快照外评分不计入基准、隐藏模型持有最高分时可见模型按隐藏最高分换算。
  - 旧溢出用例改为断言自动基准下换算分有界（≤100）；不再断言综合分等于 1e308。
- **Acceptance Criteria**：
  - go test ./internal/domain 通过。
  - 自动基准用例中改最高分后换算分与综合分同时变化；未评分维度不在基准映射中。
  - 固定基准用例中新增更高分不改变基准；超过基准的换算分大于 100。
  - 全 0 维度综合分按 0 计入；隐藏模型最高分决定可见模型的换算基准。

---

## Phase 2：接口契约

### TASK-003：维度、排行、详情与导出返回配置值与生效值

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Depends On**：TASK-002
- **Description**：在 internal/api/ 贯通基准字段：共享维度响应携带配置值，列表、排行、详情与导出按需计算生效值；新建/编辑接收可空基准并校验 > 0 的有限数；补充接口测试。
- **Details**：
  - 共享维度响应增加 baselineMax（可空，自动为 null）与 effectiveBaselineMax（指针 + omitempty）；生效值只由维度列表与导出填充，bootstrap、创建、更新、归档省略该字段。
  - 维度列表用 domain.EffectiveBaselines 计算生效值（非归档模型 + 全部评分）；导出复用同一函数；归档维度的生效值按同一规则计算，供恢复参考。
  - 排行维度项与详情维度项返回 baselineMax 与 effectiveBaselineMax（无评分时为 null）；详情取自排行快照的生效基准，排行只序列化领域结果。
  - 新建接收可空基准；部分更新区分“缺省不动 / null 恢复自动 / 数值固定”。
  - 0 与负数返回 422 且字段名为 baselineMax；非数字或类型错误沿用统一解码的 400 malformed，不新增自定义解码。
  - 抽出 store 模型/维度/评分到领域对象的转换，供排行与基准计算共用。
  - 更新 internal/api/api_test.go 旧综合分期望；新增基准新建/编辑/清空、0 与负数 422、类型错误 400、隐藏模型最高分影响公开排行、详情与导出字段用例。
- **Acceptance Criteria**：
  - go test ./... 与 go vet ./... 通过。
  - 列表、排行、详情、导出的 JSON 含配置值与生效值；无评分维度生效值为 null；bootstrap 与写接口不含生效值。
  - 0、负数返回 422 字段错误；非数字返回 400；缺省字段不改变已存值。
  - 匿名接口的访问范围与原始分返回不变。

---

## Phase 3：前端公式与预览

### TASK-004：前端实现同构的基准解析与换算

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Depends On**：TASK-003
- **Description**：在 web/src/api/types.ts 补齐字段；在 web/src/domain/ranking.ts 增加 resolveBaselines，综合分改为换算分加权平均，预览复用同一路径并支持兜底基准；同步 web/src/domain/ranking.test.ts。
- **Details**：
  - 维度类型增加可空基准；排行、详情维度类型增加配置值与生效值（可为 null）。
  - resolveBaselines(dimensions, scoreSets, fallback?)：配置值优先；自动取评分集合最高分，全 0 记 0，无有效评分且无兜底时不在映射中返回；忽略无效与非有限值。
  - 兜底基准只在完整榜单请求失败时传入，取详情的生效值，避免公开榜单漏掉隐藏模型导致基准偏低。
  - 综合分签名显式接收生效基准，避免调用方忘记解析；换算与累加顺序与 Go 对齐，基准缺失或 0 时按 0 计。
  - 评分预览先合并草稿，再解析基准，最后计算综合分与名次。
  - 更新旧断言；新增自动基准变化、固定基准、>100、全 0、无评分缺席、兜底基准与“预览同值同基准结果一致”用例。
- **Acceptance Criteria**：
  - pnpm --dir web test 与 pnpm --dir web typecheck 通过。
  - 同一夹具下前端换算结果与 Go 领域断言一致（两位小数展示一致）。
  - 固定基准不随传入评分集合变化；无评分维度不产生基准项。

### TASK-005：评分弹窗按需读取完整榜单

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Depends On**：TASK-004
- **Description**：在 web/src/components/ScoreDialog.tsx 增加榜单完整性入参；榜单不完整时与模型详情并行读取含隐藏模型的完整榜单，失败时用详情生效值兜底；Workbench 调用点声明榜单已完整。
- **Details**：
  - 自动基准包含隐藏模型；公开榜单缺少隐藏行会算低基准，完整榜单使预览与保存后的服务端结果一致。
  - 父级已传完整榜单（Workbench 的 includeHidden 请求）时跳过请求，避免重复全量计算。
  - 请求失败时用详情的 effectiveBaselineMax 作为自动基准兜底，并按草稿抬高；不静默使用公开榜单推导。
  - 与详情同一加载态：两者完成后再结束加载，避免先显示错误综合分。
  - 当前模型不在榜单时仍按 slug 合并，保持隐藏模型预览置底与不编号的既有规则。
  - 不改变弹窗布局、字段、保存流程与排名展示。
- **Acceptance Criteria**：
  - Workbench 打开弹窗不新增榜单请求；排行与详情打开时只新增一次，失败不阻塞详情与预览。
  - 隐藏模型存在且持有维度最高分时，预览综合分与保存后排行一致。
  - pnpm --dir web typecheck 与 build 通过。

---

## Phase 4：设置界面

### TASK-006：维度弹窗增加基准最大值

- **Status**：DONE
- **Executor**：主线
- **Priority**：P2
- **Depends On**：TASK-003
- **Description**：在 web/src/components/DimensionDialog.tsx 增加“基准最大值”数值输入，随新建与编辑提交可空值。
- **Details**：
  - 留空提交 null（自动），填写提交数值；编辑时回填已存值；步长不限（step=any），不四舍五入，保留输入精度。
  - 校验有限且 > 0，错误显示在字段上；后端字段错误回填同一输入；类型错误由后端统一返回 400。
  - 文字维度禁用该输入并说明不参与换算；切换文字模式时保留已填值。
  - 位置在权重之后，文案说明“留空按当前最高分自动换算，填写后固定”。
- **Acceptance Criteria**：
  - 留空、填写、清空三种路径提交的载荷正确。
  - 0、负数、非有限值被前端拦截并显示字段错误；小数无需按一位小数补齐。
  - 文字维度输入不可编辑；其余维度交互与既有表单一致。

### TASK-007：设置页维度列表显示基准值

- **Status**：DONE
- **Executor**：主线
- **Priority**：P2
- **Depends On**：TASK-003
- **Description**：在 web/src/pages/Settings.tsx 维度行的名称块增加基准信息：固定值与自动生效值分开展示。
- **Details**：
  - 固定：显示“基准 x（固定）”；自动且有评分：显示“自动 · y”；自动且无评分：显示“自动 · —”。
  - 数值按存储原值展示，不做一位小数截断，避免小基准被误读。
  - 文字维度显示不适用；归档维度只显示配置值（固定 x 或自动），不显示生效值。
  - 复用既有次要信息样式，不新增网格列，不改三档断点布局。
- **Acceptance Criteria**：
  - 启用、归档、文字、权重 0 四类维度的展示均正确。
  - 1440/768/390 视口下维度行无溢出，操作按钮位置不变。

---

## Phase 5：文档、回归与归档

### TASK-008：同步 Project.md

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Depends On**：TASK-002、TASK-003、TASK-004、TASK-005、TASK-006、TASK-007
- **Description**：按实际实现更新 .docs/Project.md 的评分公式、数据模型、接口、架构迁移清单、术语、显示口径、已知限制与验证记录。
- **Details**：
  - 数据模型：dimensions 增加可空 baseline_max（> 0，null 为自动）。
  - 架构：迁移清单追加 010_dimension_baseline.sql。
  - 接口：维度、排行、详情、导出返回配置值与生效值（无评分时为 null）；写接口与 bootstrap 不带生效值；部分更新可清空。
  - 评分与排名：换算公式、自动基准来源与候选集（含隐藏、排除归档）、全 0 与无评分处理、不封顶、隐藏模型影响公开综合分。
  - 显示口径：最高分占比仍按当前榜最高分，与基准无关；综合分变为百分制量纲，关闭百分比模式时与维度原始分不同量纲，展示形式未变。
  - 术语：基准最大值、换算分、生效基准。
  - 已知限制：极端固定基准可能溢出；评分弹窗完整榜单请求失败时用详情生效值兜底，下调唯一最高分的预览存在残留偏差；导出含派生生效值。
  - 验证与归档：记录最近一次回归命令、结果与手工界面验收结论。
- **Acceptance Criteria**：
  - Project.md 无与实现冲突的旧表述，维护表所列章节均已核对。
  - 仅维护项目事实，不复制逐轮日志。

### TASK-009：回归、手工验收、归档与提交

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Depends On**：TASK-008
- **Description**：执行完整回归与手工界面验收，确认文档与代码一致，归档本轮 Plan/Tasks 并提交。
- **Details**：
  - 运行 go test ./...、go vet ./...、CGO_ENABLED=0 go build ./cmd/server、pnpm --dir web test、pnpm --dir web typecheck、pnpm --dir web build。
  - 手工浏览器验收清单：隐藏模型持有某维度最高分时公开综合分与排行；固定/自动/清空三种基准的保存与榜单刷新；设置页启用、归档、文字、权重 0 四类维度；1440/768/390 三档视口；评分弹窗预览与保存后一致。
  - 记录测试数量、手工验收结论与残留偏差；失败时回到对应 Phase 修复后重跑。
  - Plan.md 与 Tasks.md 标注 DONE、完成日期与回归结论，移入 .docs/10-25-v1/，确认根目录无残留。
  - 只暂存源码与文档，提交信息使用 Conventional Commits 英文前缀与中文描述。
- **Acceptance Criteria**：
  - 基线命令全部通过，无新增告警。
  - 手工验收清单逐项通过或有明确记录。
  - 归档目录同时含 Plan.md 与 Tasks.md。
  - 提交不含构建产物、数据库文件或无关改动。