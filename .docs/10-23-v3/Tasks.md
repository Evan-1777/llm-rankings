# Tasks：Review 报告吸收与残留修复

**关联 Plan**：`Plan.md`（Quick 执行记录）  
**状态**：DONE（2026-10-23）  
**完成日期**：2026-10-23  
**回归测试结论**：`go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`（50/50）、`typecheck`、`build` 全部通过。  
**总计 Task**：6 个  
**上游**：2026-10-23 代码库 Review（82/100）

## 吸收结论

采纳：

- 模型 PATCH 合并为单次 store 更新，消除部分写入。
- 提取统一的评分显示格式/标签函数，替换页面中的嵌套三元表达式。
- `updatedAt` 纳入维度与文字记录，并注明全量排名的规模上限。
- 前端模型响应类型对齐服务端实际返回。
- API 响应统一 `Cache-Control: no-store`。

不采纳或延后：

- 自定义拖拽排序与厂商选择器：属于既有产品交互，非未证实抽象；本轮不改，避免功能churn。
- `config` 与 `auth` 的重复校验：`auth.New` 是独立包边界，保留其自校验；删掉会让包在错误输入下静默构造。
- 详情页双算排名：个人规模可接受；本轮只补代码注释说明上限，不做 API 重构。
- `Project.md` 全量压缩：属于独立文档治理，Quick 模式不展开；本轮只同步事实。
- `safeNext` 反斜杠前缀：不构成可利用开放重定向，收益不足，本轮不改。
- 评分舍入溢出：极端值不进入真实评分场景，不为此增加分支。

---

### TASK-001：合并模型 PATCH 为单次原子更新

- **Status**：DONE
- **Executor**：主线
- **Description**：将 `UpdateModel` 扩展为一次写入全部可编辑字段，删除仅被该处理器调用的 `SetModelHidden` 与 `SetModelCommentary`。
- **Details**：
  - `internal/store/models.go`：新增 `ModelUpdate` 值对象；`UpdateModel` 单条 UPDATE 写入 name、vendor、notes、hidden、commentary 三字段与 updated_at。
  - `internal/api/handlers_models.go`：合并后的字段一次提交；删除三次独立写入分支。
  - `internal/store/store_test.go`：改用 `UpdateModel`，覆盖隐藏、评语写入与缺失模型。
- **Acceptance Criteria**：
  - `go test ./...` 通过。
  - 模型 PATCH 只执行一条 UPDATE；不存在部分写入路径。
  - 无 `SetModelHidden`、`SetModelCommentary` 残留引用。

### TASK-002：提取评分显示格式与标签函数

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `scoreEmphasis.ts` 增加统一显示入口，并在排行页替换嵌套三元表达式。
- **Details**：
  - `ScoreDisplayMode`、`formatDisplayScore`、`displayScoreLabel`。
  - `Rankings.tsx` 的标签、单元格与表尾统一使用新函数。
  - `scoreEmphasis.test.ts` 覆盖实际分值、分差百分比、最高分占比三种模式。
- **Acceptance Criteria**：
  - `pnpm --dir web test` 通过。
  - 排行页不再出现 `scorePercentageMode ? (scorePercentageMaxMode ? ...)` 形式的分支。

### TASK-003：其余评分表面接入统一显示函数

- **Status**：DONE
- **Executor**：主线
- **Description**：对比页、详情页与维度分值组件改用 `formatDisplayScore` / `displayScoreLabel`。
- **Details**：
  - `Compare.tsx` 两处综合分显示。
  - `ModelDetail.tsx` 综合分、列头与分值显示。
  - `DimensionScore.tsx` 去掉内置模式分支。
- **Acceptance Criteria**：
  - `pnpm --dir web typecheck` 与 `build` 通过。
  - 四个评分表面共用同一显示函数。

### TASK-004：补全 updatedAt 并标注排名规模上限

- **Status**：DONE
- **Executor**：主线
- **Description**：让 `MaxUpdatedAt` 覆盖模型、评分、维度与文字记录；在 `loadRanking` 处注明全量计算的适用规模。
- **Details**：
  - `internal/store/db.go`：单条 UNION ALL 查询取最大值，空库返回 nil。
  - `internal/store/store_test.go`：仅创建维度时也必须返回时间戳。
  - `internal/api/rankings.go`：补充 `ponytail:` 规模上限注释。
- **Acceptance Criteria**：
  - `go test ./...` 通过；空库与仅维度两种状态均正确。
  - 权重/文字更新会进入 `updatedAt`。

### TASK-005：对齐前端模型响应类型

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `api/types.ts` 定义服务端实际返回的 `ModelResponse`，并更新创建、更新、隐藏、归档四个客户端方法。
- **Details**：
  - 覆盖 slug、name、vendor、notes、hidden、archivedAt、commentary 三字段、createdAt、updatedAt。
  - 不改调用方行为，只修正类型契约。
- **Acceptance Criteria**：
  - `pnpm --dir web typecheck` 通过。
  - 客户端不再把完整模型响应声明为 `{ slug }`。

### TASK-006：API 响应统一禁止缓存

- **Status**：DONE
- **Executor**：主线
- **Description**：在安全头中间件中为所有 `/api` 响应设置 `Cache-Control: no-store`，删除显示设置处理器的重复设置。
- **Details**：
  - `internal/api/middleware.go`：按路径前缀统一设置。
  - `internal/api/handlers_display.go`：删除两处局部 no-store。
  - `internal/api/api_test.go`：断言匿名 bootstrap 与管理员模型列表均返回 no-store。
- **Acceptance Criteria**：
  - `go test ./...` 通过。
  - `/api` 响应带 no-store，静态资源缓存策略不变。
