# Tasks：Review 报告吸收与残留修复

**关联 Plan**：Plan.md（Quick 执行记录）  
**状态**：DONE  
**日期**：2026-10-25  
**完成日期**：2026-10-25  
**总计 Task**：4 个（全部 DONE；执行主体均为主线）  
**上游**：2026-10-25 只读 Review（86/100）  
**回归测试结论**：`go test ./...`（61 项）、`go vet ./...`、`CGO_ENABLED=0` 构建、`pnpm --dir web test`（61/61）、`typecheck`、`build` 全部通过。

---

### TASK-001：移除评分弹窗的完整榜单请求

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Depends On**：无
- **Description**：删除 ScoreDialog 的 `fullRankings`、`rankingsComplete` 与并行榜单请求，预览统一以详情生效值兜底；同步 Workbench 调用点。
- **Details**：
  - 详情接口的快照包含隐藏模型，其 `effectiveBaselineMax` 即服务端基准；草稿抬高由 `resolveBaselines` 的 fallback 取最大值覆盖。
  - 预览行恢复为传入榜单加当前模型，不再替换数据源。
  - 移除 Workbench 的 `rankingsComplete` 传参。
- **Acceptance Criteria**：
  - 评分弹窗只发起模型详情请求；无 `rankingsComplete` 或 `fullRankings` 残留。
  - `pnpm --dir web typecheck` 与 `test` 通过；预览公式与测试夹具不变。

### TASK-002：统一 effectiveBaselineMax 的读接口契约

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Depends On**：无
- **Description**：为维度列表与导出引入携带生效值的响应类型，无评分时返回 `null`；bootstrap 与写接口保持省略该字段。
- **Details**：
  - 共享配置响应只保留 `baselineMax`；快照响应内嵌配置响应并新增无 `omitempty` 的 `effectiveBaselineMax`。
  - 列表与导出改用快照响应；导出响应类型同步。
  - 补列表与导出在无评分维度上的键存在且为 null 的断言。
- **Acceptance Criteria**：
  - `go test ./...` 通过；列表与导出 JSON 均为 `"effectiveBaselineMax": null` 而非缺键。
  - bootstrap、创建、更新、归档响应仍不含该键。

### TASK-003：拒绝文字维度的基准值

- **Status**：DONE
- **Executor**：主线
- **Priority**：P2
- **Depends On**：TASK-002
- **Description**：在维度写入校验中拒绝 `textMode: true` 与 `baselineMax` 同时出现，返回字段级 422；补新建与更新用例。
- **Details**：
  - 校验顺序为：先校验基准为有限且大于 0，再校验文字维度不得携带基准。
  - 前端提交文字维度时已固定发送 `baselineMax: null`，无需改动。
- **Acceptance Criteria**：
  - 新建或更新文字维度携带基准返回 422 且字段名为 `baselineMax`。
  - 文字维度清空基准后更新成功；既有前端交互不变。

### TASK-004：文档同步、回归、归档与提交

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Depends On**：TASK-001、TASK-002、TASK-003
- **Description**：更新 Project.md 的预览数据源、生效值契约、文字维度约束与验证记录；执行完整回归，归档本轮文档并提交。
- **Details**：
  - 删除 Project.md 中「读取完整榜单/失败兜底」的旧描述，改为详情生效值兜底。
  - 契约章节注明列表/导出始终含生效值，写接口与 bootstrap 省略。
  - Plan/Tasks 标 DONE、记录完成日期与回归结论，移入 .docs/10-25-v2/。
- **Acceptance Criteria**：
  - 六项基线命令全部通过。
  - 归档目录同时含 Plan.md 与 Tasks.md，根目录无残留；提交不含构建产物。
