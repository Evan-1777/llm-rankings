# Tasks：详情相对条方向反转

**关联 Plan**：`Plan.md` —— 详情相对条方向反转 v1.0  
**状态**：DONE（2026-10-22）  
**日期**：2026-10-22  
**总计 Task**：4 个，均由主线执行

---

### TASK-001：新增得分位置纯函数与单元测试

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：无
- **Description**：在 `web/src/lib/scoreEmphasis.ts` 增加 `scorePercentile(value, range)`，返回得分在区间内的位置：最低分 0%、最高分 100%。
- **Details**：
  - 对 `null`、非有限值、负值、缺失区间、零区间返回 `null`，与 `gapPercentile` 的拒绝规则一致。
  - 先减后除，结果裁剪到 0–100；不做舍入，宽度由调用方拼接。
  - `web/src/lib/scoreEmphasis.test.ts` 增加一个用例，覆盖端点、中值、缺失与零区间。
- **Acceptance Criteria**：
  - `scorePercentile(10, {min:0,max:10}) === 100`，`scorePercentile(0, ...) === 0`，中值 50。
  - 缺失/负值/非有限/零区间返回 `null`。
  - `pnpm --dir web test` 通过。

### TASK-002：详情页相对条与说明文案反转

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-001
- **Description**：百分比模式下，相对条宽度改用 `scorePercentile`；说明文案同步为“相对条越强越长”。
- **Details**：
  - `web/src/pages/ModelDetail.tsx`：移除 `gapPercentile` 引入，改用 `scorePercentile`；维度行内取该维度 range，条宽按 `scorePercentageMode ? (percent ?? 0) : barWidth(dimension.value, max)` 输出。
  - 同一文件：百分比模式说明改为“分差百分比 / 1% = 最高分，100% = 最低分 / 相对条越强越长”。
  - 不改 `barWidth`、`gapPercentile`、色阶与移动端隐藏相对条的规则。
- **Acceptance Criteria**：
  - 最高分条宽 100%，最低分 0%，中间值按位置映射；未评分与全同分为 0。
  - 关闭百分比模式后仍按 `value / max` 填充。
  - `pnpm --dir web typecheck`、`build` 通过。

### TASK-003：自动化验证

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1；依赖：TASK-001、TASK-002
- **Description**：运行前端与 Go 全量检查，确认无回归。
- **Details**：
  - `pnpm --dir web test`、`typecheck`、`build`；`go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`（Go 缓存使用工作区路径）。
- **Acceptance Criteria**：
  - 全部命令退出码 0，测试数量与结果记录到 Project.md。

### TASK-004：Project.md 同步、归档与提交

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-003
- **Description**：更新项目事实与决策，归档本轮文档，按主题提交。
- **Details**：
  - `.docs/Project.md`：当前增量、显示偏好、相对条决策改为“越强越长”，追加测试记录。
  - 归档到 `.docs/10-22-v10/`，Plan.md / Tasks.md 标注 DONE；根目录不残留。
  - 提交信息遵循 Conventional Commits + 中文描述。
- **Acceptance Criteria**：
  - Project.md 不再出现“最高分 1% 近零”等旧条宽口径。
  - 归档目录同时含 Plan.md 与 Tasks.md。
  - `git status` 干净。

---

## 回归结论（2026-10-22）

- `pnpm --dir web test` 45/45 通过；`typecheck`、`build` 通过。
- `go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server` 通过。
- 浏览器（1436，临时库 4 模型 × 3 维度）：百分比模式下最高分条宽 100%、最低分 0%、中值按位置；关闭百分比后恢复按最高分归一；说明文案为“相对条越强越长”；无脚本错误与横向溢出。
