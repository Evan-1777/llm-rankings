# Tasks：评分一致性、维度排名与归档治理

**关联 Plan**：`Plan.md` —— 评分一致性、维度排名与归档治理 v1.0
**状态**：DONE
**完成日期**：2026-10-22
**总计 Task**：18 个，均由主线执行

---

## Phase 1：排名与评分弹窗

### TASK-001：统一同分名称比较契约

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：无
- **Description**：将前端评分排序的名称比较改为与 Go 同序的实现，并在两侧补中文同分回归。
- **Details**：
  - 修改 `web/src/domain/ranking.ts` 的 `compareNames`：名称先 `toLowerCase()`，再按字符串位次比较（`<` / `>`），不再使用 `localeCompare`；名称相等时比较 slug。
  - `internal/domain/ranking.go` 的排序规则不变，只补测试固定小写字节序。
  - `web/src/domain/ranking.test.ts`：新增“张/李同分同覆盖率”用例，断言 `previewRanking` 的排名与 Go 一致（张第 1、李第 2）；保留现有 ASCII 用例。
  - `internal/domain/ranking_test.go`：新增同名场景，断言 `Compute` 输出 `张` 在 `李` 前。
- **Acceptance Criteria**：`pnpm --dir web test` 与 `go test ./internal/domain` 通过；把前端比较改回 `localeCompare(b.name, "zh-CN")` 时中文用例失败；官方综合分、覆盖率与排名分组不变。

### TASK-002：评分输入为空时禁用备注入口

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-001
- **Description**：让备注只能附属已评分维度，堵住“只改备注却提示已保存”的静默丢弃路径。
- **Details**：
  - `web/src/components/ScoreDialog.tsx`：以 `parseValue(row.value).value` 判断该行是否已评分；未评分时 `IconButton` 加 `disabled`，`active` 为 false。
  - 备注 `textarea` 仅在“该行 openNote 且评分解析成功”时渲染；评分清空后编辑区收起，草稿保留，重新填分后再展开。
  - 不修改 `dirty` 与 `save` 的既有删除语义：评分留空仍然删除该维度评分与备注。
- **Acceptance Criteria**：未评分维度的备注按钮为禁用态且无法输入备注；已评分维度可正常展开、编辑、保存；清空评分后备注编辑区收起、保存仍执行删除；`typecheck` 与 `build` 通过。

### TASK-003：移动端显示评分保存失败原因

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-002
- **Description**：移动端只隐藏说明性文案，保留保存失败提示。
- **Details**：
  - `web/src/components/ScoreDialog.module.css`：给说明文案增加独立类；`@media (max-width: 760px)` 只隐藏该类，不再隐藏整个 `.footNote`；`.footNote` 增加 `min-width: 0`。
  - `web/src/components/ScoreDialog.tsx`：说明文案改用该类名；`saveError` 保持在页脚、`role="alert"` 与信号红。
- **Acceptance Criteria**：390px 与 760px 下模拟保存失败可见失败原因且弹窗保持打开；1440px 布局不变；页脚按钮不被错误文案挤出弹窗。

### TASK-004：说明部分写入并让评分删除幂等

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1；依赖：TASK-003
- **Description**：保存失败时说明已提交数量；让评分 DELETE 可重复调用，使重试能够收敛。
- **Details**：
  - `web/src/components/ScoreDialog.tsx`：保存循环统计成功请求数；失败且计数大于 0 时提示“已提交 N 项，可再次保存补齐”；计数为 0 时只显示原始错误。
  - `internal/store/scores.go`：删除 `RowsAffected == 0` 返回 `ErrNotFound` 的分支；未知模型仍返回 `ErrNotFound`。
  - `internal/api/api_test.go`：补“同一评分连续 DELETE 两次均为 204、未知模型为 404”的用例。
- **Acceptance Criteria**：`go test ./...` 通过；首次失败显示原始错误，部分成功后显示已提交数量；重复 DELETE 返回 204；未知模型 DELETE 仍为 404；前端 `typecheck` 通过。

---

## Phase 2：详情页

### TASK-005：相对条按实际最高分归一

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-001
- **Description**：移除维度上限的 10 分下限，使最高分（含并列）填满条形图。
- **Details**：
  - `web/src/domain/ranking.ts`：`dimensionMax` 从 0 开始取最大值；`barWidth` 的 0/负数保护不变。
  - `web/src/domain/ranking.test.ts`：改写相对条用例，断言最高分 8.7 得到 100%、并列最高均 100%、0 分维度不产生宽度、缺失值为 0。
  - `web/src/pages/ModelDetail.tsx`：区块说明改为“相对条按最高分归一”，移除“下限 10”。
- **Acceptance Criteria**：`pnpm --dir web test` 通过；详情页最高分条 100% 宽；全 0 维度不显示假宽度；综合分、覆盖率与排名不受影响。

### TASK-006：添加维度排名纯函数与测试

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-001
- **Description**：在评分纯函数模块添加同维度名次计算，供详情页使用。
- **Details**：
  - `web/src/domain/ranking.ts`：新增 `dimensionRanks(rows, dimensionIds)`，返回 `Map<dimensionId, Map<slug, ordinal>>`；每个维度只纳入该维度有评分的模型，按分值降序、`compareNames` 次序编号，序号从 1 开始。
  - 不修改输入数组；未评分模型不出现在映射中；该维度无评分时为空的 Map。
  - `web/src/domain/ranking.test.ts`：覆盖并列、未评分、无评分维度、输入不变与维度重排不影响结果。
- **Acceptance Criteria**：新用例通过；名次总数等于该维度已评分模型数；并列按名称稳定排序；不改变 `composite`、`previewRanking` 与 `sortRows` 的现有结果。

### TASK-007：详情页新增维度排名列

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-006
- **Description**：在维度得分表中加入右对齐的“维度排名”列，沿用等宽数字与现有表格语言。
- **Details**：
  - `web/src/pages/ModelDetail.tsx`：在组件顶部以 `useMemo` 基于 `data?.rankings.models` 与 `data?.detail.dimensions` 计算名次；表头为“维度排名”；单元格显示两位序号与已评分模型数（如 `01 / 06`），未评分显示破折号；更新表说明与 `caption`。
  - `web/src/pages/ModelDetail.module.css`：新增排名列宽、等宽字体、`tabular-nums`、右对齐与次要总数样式；760px 以下保留该列，只隐藏相对条。
  - 不新增接口、不把名次写入数据；不使用信号红，避免与“暂定”混淆。
- **Acceptance Criteria**：1440px 与 390px 下名次列可读且不重叠；名次与同维度模型得分排序一致；未评分维度显示破折号；`typecheck`、`build` 通过。

---

## Phase 3：数据口径与交互

### TASK-008：拆分模型评分总数与可评分维度完整度

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：无
- **Description**：设置页模型行的分子与分母都只统计启用且权重 > 0 的维度，同时保留全部评分的总数。
- **Details**：
  - `internal/store/models.go`：`ModelSummary` 增加 `ScoredDimensions`；查询增加“未归档且 weight > 0 的评分计数”，保留原有全部评分计数。
  - `internal/api/handlers_models.go`：列表响应增加 `scoredDimensions`。
  - `web/src/api/types.ts` 与 `web/src/pages/Settings.tsx`：模型行显示 `scoredDimensions / scoreableDimensions`；`totalScores` 仍按 `scoreCount` 求和。
  - `internal/store/store_test.go`：覆盖权重 0、归档维度、已评分与未评分模型。
- **Acceptance Criteria**：两个维度都评分后归档其一，完整度不再出现 `2 / 1`；零权重维度不进入分母；页头与数据页总数仍包含归档评分；`go test ./...` 与 `typecheck` 通过。

### TASK-009：页面空态改用本页数据

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1；依赖：无
- **Description**：排行与工作台不再用 bootstrap 计数判断“尚未创建维度”。
- **Details**：
  - `web/src/pages/Rankings.tsx`：`session.counts.dimensions === 0` 改为已加载的 `dimensions.length === 0`；页头统计的加载前占位保持不变。
  - `web/src/pages/Workbench.tsx`：同样改用已加载维度数。
- **Acceptance Criteria**：`/api/rankings` 成功而 bootstrap 失败时页面展示排行数据而非空态；真实空库仍显示空态与入口；`typecheck` 通过。

### TASK-010：清理未使用契约与误导文案

- **Status**：DONE
- **Executor**：主线
- **Priority**：P2；依赖：TASK-008
- **Description**：删除已漂移的前端类型、字段与格式化函数，并修正导出页的“快照”措辞。
- **Details**：
  - `web/src/api/types.ts`：删除 `Counts.scores` 与未使用的 `ExportSnapshot`。
  - `web/src/session/SessionProvider.tsx`：`emptyCounts` 同步去掉 `scores`。
  - `web/src/lib/format.ts`：删除未使用的 `formatDateTime` 与其 formatter。
  - `internal/store/db.go`：删除 `Counts.Scores` 字段与对应查询。
  - `web/src/pages/Settings.tsx`：数据页标题“完整 JSON 快照”改为“完整 JSON 导出”，与实际非事务导出行为一致。
- **Acceptance Criteria**：全项目检索不到 `formatDateTime`、`ExportSnapshot`、`Counts.Scores` 与 `counts.scores` 的引用；`go test ./...`、`go vet ./...`、`typecheck` 通过。

### TASK-011：补齐设置页 Tab 与拖动手柄键盘语义

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1；依赖：无
- **Description**：让 Tab 声明与实际键盘行为一致，并让手柄的方向键操作可被读屏发现。
- **Details**：
  - `web/src/pages/Settings.tsx`：Tab 增加 roving `tabIndex`（选中为 0，其余 -1）；左右方向键循环切换，Home/End 跳到首尾；切换后焦点落到对应 Tab；保持现有 `aria-selected`、`aria-controls` 与 URL 行为。
  - 拖动手柄 `aria-label` 补“使用上下方向键移动”，并增加 `aria-keyshortcuts="ArrowUp ArrowDown"`；不改变拖动、保存与焦点恢复逻辑。
- **Acceptance Criteria**：键盘可只用方向键在四个 Tab 间切换并看到焦点；手柄获得焦点时读屏名称包含方向键说明；鼠标拖动与排序保存不回归；`typecheck` 通过。

### TASK-012：修正部署示例的 TRUST_PROXY 默认值

- **Status**：DONE
- **Executor**：主线
- **Priority**：P2；依赖：无
- **Description**：让示例与 Project 的“默认 false”约定一致。
- **Details**：
  - `deploy/.env.example`：`TRUST_PROXY=false`；注释说明仅在确认反向代理覆盖 `X-Forwarded-For` 后改为 true。
- **Acceptance Criteria**：示例不含 true 默认值；注释与 Project.md 的约定一致；不包含任何密钥。

---

## Phase 4：归档文档

### TASK-013：修正 v2 归档文档的内部状态

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1；依赖：TASK-001 至 TASK-012（事实确认）
- **Description**：让 v2 归档不再同时提供 TODO 与 DONE 两种状态。
- **Details**：
  - `.docs/10-22-v2/Tasks.md`：TASK-001 至 TASK-004 改 DONE；工作流行去掉“等待交付段”；删除 TASK-006 中“当前规划交接阶段不得提前执行本任务”。
  - `.docs/10-22-v2/Plan.md`：第 7 节标注为规划段交接记录并改为过去时；删除或改写“服务端保存仍待验证”“新功能回归全部待执行”；第 8 节“六项交付任务仍为 TODO”改为交付段已完成，第 9 节保持为交付结果。
- **Acceptance Criteria**：v2 文档不再出现 TODO、等待交付、待执行与交付结果冲突；四个任务状态与第 8 节总数一致；只改状态与过时陈述，不改任务范围与历史验收记录。

### TASK-014：重写 v2/v3 归档相对链接

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1；依赖：TASK-013
- **Description**：按归档目录位置重写仓库路径链接，并标注仅本机存在的 Demo。
- **Details**：
  - `.docs/10-22-v2/Plan.md`、`Tasks.md`、`.docs/10-22-v3/Tasks.md`：`.docs/...` 改为 `../...`；`web/`、`internal/`、`migrations/` 改为 `../../...`；`temp/...` 改为 `../../temp/...` 并在链接文字标注“仅本机存在”。
  - 保留同目录 `Plan.md` 链接与有效的行锚点；失效的 `Project.md#L99` 去掉锚点。
  - 用脚本逐条解析链接目标并校验存在性，脚本放在 `temp/`，验证后删除。
- **Acceptance Criteria**：链接检查除 `temp` 外零失效；所有 `temp` 链接均带“仅本机存在”标注；Markdown 结构不被破坏。

### TASK-015：补齐 v1 TASK-026 验收标准

- **Status**：DONE
- **Executor**：主线
- **Priority**：P2；依赖：无
- **Description**：为归档中唯一缺验收项的任务补三类可验证标准。
- **Details**：
  - `.docs/10-22-v1/Tasks.md`：在 TASK-026 的 Details 后增加 Acceptance Criteria：全链路命令与流程、79.9%/80.0% 与零权重数据校验、临时库与进程清理。
  - 不改该任务状态、编号与其他任务内容。
- **Acceptance Criteria**：TASK-026 含验收标准；文件结构完整；其余 25 个任务不被改动。

---

## Phase 5：验收与交付

### TASK-016：同步 Project.md

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-001 至 TASK-015
- **Description**：把本轮实现、契约与测试结论写回项目事实来源。
- **Details**：
  - 更新当前增量、排名规则、详情页维度排名、相对条满格、设置页完整度口径、评分备注约束、空态与错误反馈、TRUST_PROXY 示例默认值。
  - 在“约束与决策”补同分比较契约、相对条归一与完整度拆分；在“测试与验收”记录本轮命令结果与浏览器结论；不记录未执行项为通过。
- **Acceptance Criteria**：Project.md 与代码实际状态一致；无过期描述；未验证项明确标注。

### TASK-017：执行全量检查与浏览器验收

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-016
- **Description**：运行全部可自动检查，并用临时库在 9222 浏览器验收关键路径。
- **Details**：
  - 命令：`go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`、`typecheck`、`build`。Go 缓存若被沙箱拒绝，按工作区缓存重试，不绕过权限。
  - 浏览器：临时 `DB_PATH` 与临时口令，端口 8099 启动单一受管进程；1440/760/390 检查详情页满格条与维度排名、评分弹窗备注入口、移动端失败提示、设置页完整度、排行/工作台空态、Tab 与手柄键盘、导出文案。
  - 使用合成失败数据或断网/拦截制造一次保存失败；不修改用户真实数据；结束后关闭进程并清理临时目录。
- **Acceptance Criteria**：全部命令退出 0；浏览器结论有实际路径与视口记录；无未清理进程与一次性产物；失败项先修复再进入归档。

### TASK-018：归档计划与任务并提交

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-017
- **Description**：标记完成、归档到当天递增目录并创建中文 Conventional Commit。
- **Details**：
  - Plan.md 与 Tasks.md 标记 DONE、完成日期与回归结论；移入 `.docs/10-22-v4/`，确认成对存在且根目录无残留。
  - 检查 `git status`、`git diff`、`git log`；仅暂存本轮相关文件，不提交密钥、数据库或构建产物。
  - 提交信息使用英文类型 + 中文描述，聚焦“为什么”；不 amend、不跳过钩子、不强推。
- **Acceptance Criteria**：归档目录含 Plan 与 Tasks；根目录无已完成计划；提交成功且工作区干净；提交信息符合规范。

---

## 回归与验收结论

- 2026-10-22：`go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server` 通过；新增评分删除幂等、模型完整度与中文同分排序回归。
- 2026-10-22：`pnpm --dir web test` 25/25 通过；`typecheck`、`build` 通过；新增相对条满格、维度名次与中文同分排序回归。
- 2026-10-22：归档链接检查 v2 25/25、v3 31/31 可解析；`temp` 链接均标注“仅本机存在”。
- 2026-10-22：浏览器验收覆盖 1440/760/390：满格条与并列最高、维度名次、未评分备注入口、移动端保存失败提示、部分写入与重试、设置页完整度 2/2、Tab 与手柄键盘、导出文案、bootstrap 失败空态；无页面横向溢出。
- 未执行：真实触屏手势；Docker 镜像与 Compose 实际启动（本机无 Docker）。
