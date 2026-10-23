# Tasks：评审残留收口（10-23-v2 收口）

**关联 Plan**：`Plan.md` —— 10-23-v2 评审残留收口（Quick 轮次）
**状态**：DONE
**日期**：2026-10-23
**完成日期**：2026-10-23
**总计 Task**：8 个，均由主线执行
**回归测试结论**：8 个 Task 全部完成；`go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`（49/49）、`typecheck`、`build` 通过；本轮未另做浏览器验收。

---

## TASK-001：核销审阅报告的七项发现

- **Status**：DONE
- **Executor**：主线
- **Description**：逐条核对 10-23-v1 与 10-22-v13 审阅报告中的七项发现，确定采纳范围与不采纳项。
- **Details**：
  - 采纳：归档任务状态、Project.md 隐藏决策、设置页两处文案、评分弹窗初始焦点、详情页评分模型兜底、评语 422 字段名断言。
  - 驳回或不扩大：不改写 `10-22-v13` 归档正文（历史事实）；不新增组件、依赖或测试框架；不升级导出格式版本。
- **Acceptance Criteria**：七项发现均有明确结论；采纳项与后续 Task 一一对应；不引入超出残留修复范围的改动。
- **依赖**：无
- **优先级**：P0

## TASK-002：修正 10-23-v1 归档任务状态

- **Status**：DONE
- **Executor**：主线
- **Description**：将 `.docs/10-23-v1/Tasks.md` 中 12 个 Task 的 `Status` 从 `PENDING` 改为 `DONE`，与头部状态及回归结论一致。
- **Details**：
  - 只改状态行，不改写任务描述、验收标准或历史结论。
  - 保留头部 `状态：DONE`、完成日期与回归结论。
- **Acceptance Criteria**：该文件 12/12 为 `DONE`，无 `PENDING` 残留，diff 仅含状态行。
- **依赖**：TASK-001
- **优先级**：P0

## TASK-003：修正 Project.md 的隐藏模型决策表述

- **Status**：DONE
- **Executor**：主线
- **Description**：改写 `.docs/Project.md` 中 2026-10-22 的显隐决策与 2026-10-23 的匿名可达面决策，消除“详情直链保留”与匿名 404 的冲突。
- **Details**：
  - 2026-10-22 条改为：隐藏退出公开排行、对比候选、名次、匿名模型列表与匿名详情；管理员工作台与登录态详情保留。
  - 2026-10-23 条删除对 Project.md 中不存在短语的“推翻”引用，保留实际行为描述。
- **Acceptance Criteria**：Project.md 不再出现“隐藏只退出……详情直链保留”的表述；两条决策与 `GET /api/models`、`GET /api/models/{slug}` 的实际行为一致。
- **依赖**：TASK-001
- **优先级**：P0

## TASK-004：校正设置页查看标签与导出说明

- **Status**：DONE
- **Executor**：主线
- **Description**：修改 `web/src/pages/Settings.tsx` 的模型查看按钮标签与数据页导出说明。
- **Details**：
  - 按钮标签由“查看……公开详情”改为“查看……详情”，不再暗示隐藏模型可匿名访问。
  - 导出说明补入模型评语与文字维度，覆盖 `handlers_export.go` 的实际导出字段。
- **Acceptance Criteria**：标签对可见与隐藏模型均准确；导出说明完整列出评语与文字维度；`pnpm --dir web typecheck` 通过。
- **依赖**：TASK-001
- **优先级**：P1

## TASK-005：修正评分弹窗的初始焦点

- **Status**：DONE
- **Executor**：主线
- **Description**：修改 `web/src/components/ScoreDialog.tsx`，让首个数值维度的输入获得初始焦点，而不是仅看权重 > 0 的可评分维度。
- **Details**：
  - `firstNumericId` 改为所有非文字维度的第一个。
  - 焦点 effect 以 `firstNumericId` 是否为空判断；`scoreableDimensions` 继续只用于预览计数与已评分维度分母。
- **Acceptance Criteria**：全部维度权重为 0 时打开弹窗聚焦首个数值输入；存在文字维度时不再跳过更靠前的数值输入；类型检查通过。
- **依赖**：TASK-001
- **优先级**：P2

## TASK-006：简化详情页评分模型兜底

- **Status**：DONE
- **Executor**：主线
- **Description**：修改 `web/src/pages/ModelDetail.tsx`，将 `scoreModel` 的兜底从“展示集合最后一项”改为 `selfModel`。
- **Details**：
  - 保留 `displayModels` 的合并逻辑用于强度基准。
  - 评分弹窗的模型来源改为 `storedRow ?? selfModel`，不再依赖数组追加顺序。
- **Acceptance Criteria**：可见与隐藏模型的评分弹窗仍拿到当前模型；`pnpm --dir web typecheck` 通过。
- **依赖**：TASK-001
- **优先级**：P2

## TASK-007：补齐评语 422 字段名断言

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `internal/api/api_test.go` 的评语校验用例中补充 `fields.commentary` 与 `fields.commentaryAt` 断言。
- **Details**：
  - 保留现有消息断言。
  - 追加响应体包含 `"fields":{"commentary"` 与 `"fields":{"commentaryAt"` 的检查。
- **Acceptance Criteria**：`go test ./internal/api` 通过；字段名断言在字段名变更时会失败。
- **依赖**：TASK-001
- **优先级**：P2

## TASK-008：验证、记录、归档与提交

- **Status**：DONE
- **Executor**：主线
- **Description**：执行全量验证，更新 `.docs/Project.md` 的 v2 测试记录与当前增量表述，归档到 `.docs/10-23-v2/`，并分两次提交。
- **Details**：
  - 命令：`go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`、`typecheck`、`build`。
  - Project.md：当前增量补充本轮收口；`### 10-23-v2` 追加本轮命令与收口说明。
  - 归档：Plan.md 与 Tasks.md 均标注 `DONE`、完成日期与回归结论；根目录无残留。
  - 提交：代码与测试一提交，文档与归档一提交。
- **Acceptance Criteria**：全部命令通过；归档目录同时含 Plan.md 与 Tasks.md；工作区干净；提交信息符合 Conventional Commits。
- **依赖**：TASK-002 至 TASK-007
- **优先级**：P0
