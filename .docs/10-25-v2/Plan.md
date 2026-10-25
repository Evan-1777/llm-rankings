# Plan：Review 报告吸收与残留修复

**状态**：DONE  
**日期**：2026-10-25  
**完成日期**：2026-10-25  
**版本**：v1.0  
**工作流**：Quick（无独立规划阶段，本文件为执行记录）  
**上游**：2026-10-25 只读 Review（86/100），审计 10-25-v1「综合分按维度基准最大值换算」  
**回归测试结论**：`go test ./...`（61 项）、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server` 通过；`pnpm --dir web test`（61/61）、`typecheck`、`build` 通过。

---

## 1. 背景

Review 复核了已归档交付 `ba0c986`，基线测试结论一致，提出 4 项问题：评分弹窗完整榜单请求冗余（−8）、`effectiveBaselineMax` 的 null 契约在列表/导出分裂（−4）、文字维度可通过写接口保留基准（−1）、验收记录未回填偏差（−1）。

本轮按工程纪律逐条核实，只修复确属实现缺陷或与验收标准冲突的部分，不为已记录的极端边界追加防御分支。

## 2. 批判性吸收

| 问题 | 结论 | 依据与处理 |
|------|------|------------|
| 评分弹窗完整榜单请求冗余 | 采纳 | 详情接口的 `loadRanking` 使用 `ListModels(false)`，快照本就包含隐藏模型，`effectiveBaselineMax` 即服务端生效基准；草稿抬高由 `resolveBaselines` 的 `Math.max` 覆盖。删除 `fullRankings`、`rankingsComplete` 与并行请求，统一以详情生效值兜底。 |
| 列表/导出缺失 `effectiveBaselineMax` 键 | 采纳 | 与 Plan/Tasks 的「无评分时为 null」验收冲突。读接口统一返回 null：新增快照响应类型承载生效值，写接口与 bootstrap 继续省略。补列表与导出的无评分断言。 |
| 文字维度可持久化基准 | 采纳 | 模型不变量应在信任边界成立。`validateDimension` 拒绝文字维度携带基准，返回字段级 422；补新建与更新用例。 |
| 归档 Tasks/Plan 的验收表述 | 部分采纳 | 不回改已归档文档（历史记录不重写），在本 Plan 第 5 节声明契约修订并覆盖 v1 表述；当前事实以 Project.md 为准。 |
| 极端固定基准下界与非有限兜底 | 驳回 | 原 Plan 已作为已知限制接受；自动基准天然有界，为管理员自设极端值增加任意下界属于超出实际需求的防御。 |
| 隐藏模型最高分暴露 | 驳回 | 已作为产品决策记录；本轮不改字段暴露范围。 |

## 3. 改动范围

1. `web/src/components/ScoreDialog.tsx`、`web/src/pages/Workbench.tsx`：移除完整榜单请求与完整性入参，预览无条件使用详情生效值兜底。
2. `internal/api/handlers_dimensions.go`、`internal/api/handlers_export.go`：列表与导出统一返回 `effectiveBaselineMax`（无评分时为 null），写接口响应保持不含该字段。
3. `internal/api/handlers_dimensions.go`：文字维度带基准返回 422；补接口测试。
4. `.docs/Project.md` 同步契约、预览数据源、文字维度约束与验证结论。

## 4. 验证

- `go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`。
- `pnpm --dir web test`、`pnpm --dir web typecheck`、`pnpm --dir web build`。
- 手工确认评分弹窗仍只用详情请求即可得到正确预览（阅读代码与既有浏览器验收结论；本轮不改预览数值路径）。

## 5. 契约修订说明

10-25-v1 的 Tasks 写「列表、排行、详情、导出 JSON 含配置值与生效值；无评分时为 null」，实现遗漏了列表/导出的 null 键。本轮统一为：**维度列表与导出始终包含 `effectiveBaselineMax`，无评分时为 null；bootstrap、创建、更新、归档响应不含该字段**。历史归档文档不回改，本 Plan 与 Project.md 为当前基准。
