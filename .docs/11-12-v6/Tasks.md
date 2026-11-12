# Tasks：榜单维度名强调与权重展示移除

**关联工作流**：Quick（Explore → Formulate Tasks → Execute → Document Maintenance → Archive → Git Commit）
**状态**：DONE
**完成日期**：2026-11-12
**总计 Task**：4 个
**回归测试结论**：自动化基线全绿 —— `go test ./...`（64 个测试函数全绿）、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`（72/72）、`pnpm --dir web typecheck`、`pnpm --dir web build`、`gofmt -l cmd internal` 无输出。浏览器用临时库真实数据（8 维度含 1 个 2 维组与长维度名、10 模型、含 Skip 与缺失值）读回：组列与维度列名称色 `rgb(63, 59, 51)`（`--ink-2`）、字重 500，「综合排名」「模型」仍为 `rgb(107, 102, 90)` / 400，激活列（点选「工程能力」排序后）仍为 `rgb(20, 19, 15)`；页面文本（含组明细抽屉）不含「权重」，顶部统计只剩「8 个维度」，表脚只剩「加权平均」，组列副行为「2 项」、维度列副行为空；表头首行墨迹顶 341.1、评分列宽 107.3、列内数字右缘与列头右缘逐列同值（624.2 / 731.6 / 838.9 / 946.3 / 1053.6 / 1161 / 1268.3）与 11-12-v5 相同，切换排序后列头右缘不变；1440 与 390 页面级无横向溢出。
**执行主体**：全部主线

---

## Phase 1：列头维度名强调

### TASK-001：榜单评分列名改为轻微强调

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `web/src/pages/Rankings.module.css` 让评分列（组列与维度列）的名称比表头其它文字深一档并略重，作为列的身份标识。
- **Details**：
  - 现状：列名走共享排序控件的 `.label`（11px，颜色继承 `.button` 的 `--ink-3`），与「模型」「综合分」同等弱，与取值框内的分值是视觉断层
  - 改法：`.dimHead` 补 `color: var(--ink-2)`（只作用于按钮子树，副行与小箭头各有自己的颜色声明，不受影响）；既有的 `.dimHead > :first-child` 换行规则内补 `font-weight: 500`
  - 状态保留：激活列由标签自身的 `.active`（`--ink`）压过继承色、悬停由 `.button:hover`（更高特异性）压过 `.dimHead`，排序与悬停反馈不变
- **Acceptance Criteria**：浏览器读回评分列标签色为 `--ink-2`、字重 500，激活列仍为 `--ink`；「模型」「综合分」等表头与工作台表头不被波及

## Phase 2：权重展示移除

### TASK-002：榜单移除权重与权重合计

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `web/src/pages/Rankings.tsx` 删除榜单上的权重文本：维度列副行、组列副行的权重部分、页头「权重合计」统计、表脚权重合计、明细抽屉 meta 的权重。
- **Details**：
  - 维度列 `sub` 传空串（副行仍占位，表头首行基线不变）；组列 `sub` 收为「n 项」
  - 删除页头统计里的「权重合计」整块与随之失去引用的 `totalWeight` / `weight` 局部变量（`noUnusedLocals` 生效）
  - 表脚保留展示口径字样，仅去掉「权重合计 N / 」前缀；导出与展示口径不变
  - 抽屉 meta 去掉权重，保留「组值按综合分公式的组内部分计算」「名次按同维度已评分模型」
  - 空态文案（「排行需要维度与权重」等）是引导信息，不在移除范围
- **Acceptance Criteria**：榜单 DOM 文本不含「权重」与权重数字；副行占位高度与列头首行基线不变；抽屉与表脚无权重

### TASK-003：导出图片图例行移除权重合计

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `web/src/lib/exportImage.ts` 删除导出 PNG 顶部信息行与底部信息行里的「权重合计 N」。
- **Details**：
  - 导出图是榜单的静态镜像，榜单不再展示权重后此处保持同口径
- **Acceptance Criteria**：`pnpm --dir web test` 通过（列锚点断言不受影响）；导出图信息行不含权重

## Phase 3：验证与归档

### TASK-004：回归基线、浏览器验收、文档同步与归档提交

- **Status**：DONE
- **Executor**：主线
- **Description**：跑通验证基线，用临时库真实数据在浏览器三视口验收列头强调、权重消失与表头对齐不变，更新 `.docs/Project.md`，归档并提交。
- **Details**：
  - 基线：`go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`、`pnpm --dir web typecheck`、`pnpm --dir web build`、`gofmt -l cmd internal`
  - 浏览器：临时库含成组维度、长维度名与 Skip，读回列头标签颜色/字重、页面文本无权重、评分列列宽与首行基线单值
  - 文档：Project.md 排行与导出图片段落改写，验证与归档补本轮结论
  - 归档：`Tasks.md` 移入 `.docs/11-12-v6/`
- **Acceptance Criteria**：全部命令退出码 0；`git status` 干净；归档目录含 Tasks.md；提交信息符合项目规范
