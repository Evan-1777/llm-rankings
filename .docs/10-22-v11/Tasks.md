# Tasks：百分比口径反转为越强越高

**关联 Plan**：Plan.md —— 百分比口径反转为越强越高 v1.0  
**状态**：DONE（2026-10-22）  
**日期**：2026-10-22  
**总计 Task**：5 个，均由主线执行

---

### TASK-001：反转强度映射并收敛函数

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：无
- **Description**：在 web/src/lib/scoreEmphasis.ts 把区间映射改为最高分 100%、最低分 1%，重命名函数并删除重复的 scorePercentile。
- **Details**：
  - gapPercentile 改为 strengthPercentile，formatGapPercentile 改为 formatStrengthPercentile。
  - 公式改为 1 + 99 × ((value − range.min) / span)，保留先除后乘、有限性校验与 1–100 裁剪。
  - 删除 scorePercentile；相对条改由强度函数取值。
  - 保留非极值舍入保护：未到真实端点时不得显示 1% 或 100%。
- **Acceptance Criteria**：
  - strengthPercentile(10, {min:0,max:10}) === 100，strengthPercentile(0, ...) === 1，中值 50.5%。
  - 缺失、负值、非有限、零区间返回 null。
  - 无 scorePercentile 残留。

### TASK-002：同步调用点与可见文案

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-001
- **Description**：更新排行、详情、对比、评分单元格与设置页的引用和文案，使百分比表达强度。
- **Details**：
  - Rankings.tsx：列头「综合强度」；说明「相对强度 / 100% = 最强」；页脚改为「相对强度」。
  - ModelDetail.tsx：综合标签「综合强度」；维度列头「强度」；说明「相对强度 / 100% = 最强，1% = 最弱 / 相对条越强越长」；相对条宽度用强度百分比。
  - Compare.tsx：两处「综合强度」；角标「百分比 · 100% = 最强」。
  - DimensionScore.tsx、Settings.tsx：引用改名；设置提示「所有设备 · 100% = 最强 · 1% = 最弱」。
- **Acceptance Criteria**：
  - 全仓不再出现「综合差距」「分差百分比」「1% = 最高分」等旧口径。
  - 百分比数值与相对条宽度一致；实际分值模式不变。

### TASK-003：更新单元测试

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-001
- **Description**：翻转 web/src/lib/scoreEmphasis.test.ts 的端点、中值、舍入与极大值断言，移除 scorePercentile 用例。
- **Details**：
  - 端点：最高 100%、最低 1%；中间 50.5%。
  - 舍入：9.99 → 99.9%、0.01 → 1.1%、9.9 → 99%、5 → 50.5%。
  - 极大值：Number.MAX_VALUE → 100%。
  - 测试名称改为强度语义，覆盖缺失与零区间拒绝。
- **Acceptance Criteria**：
  - pnpm --dir web test 全部通过。

### TASK-004：全量验证

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1；依赖：TASK-002、TASK-003
- **Description**：运行前后端检查，确认无回归。
- **Details**：
  - pnpm --dir web test、typecheck、build。
  - go test ./...、go vet ./...、CGO_ENABLED=0 go build ./cmd/server（Go 缓存使用工作区）。
  - 检索旧口径文案与函数名残留。
- **Acceptance Criteria**：
  - 所有命令退出码 0；结果记录到 Project.md。

### TASK-005：Project.md 同步、归档与提交

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-004
- **Description**：更新项目事实与决策，归档本轮文档，按主题提交。
- **Details**：
  - .docs/Project.md：当前增量、显示偏好、百分比公式与相对条决策；追加测试记录。
  - 归档到 .docs/10-22-v11/，Plan.md / Tasks.md 标注 DONE；根目录不残留。
  - 提交信息遵循 Conventional Commits + 中文描述。
- **Acceptance Criteria**：
  - Project.md 与新实现一致，无旧百分比含义。
  - 归档目录同时含 Plan.md 与 Tasks.md；git status 干净。

---

## 回归结论（2026-10-22）

- pnpm --dir web test 44/44 通过；typecheck、build 通过。
- go test ./...、go vet ./...、CGO_ENABLED=0 go build ./cmd/server 通过。
- 全仓检索确认无 gapPercentile、scorePercentile 与「1% = 最高分」残留。
- 浏览器（1436；临时库 4 模型 × 3 维度）：排行 100% / 64.2% / 1%，详情最高分条满格、最低分条约 1%，对比页标签与角标一致。
