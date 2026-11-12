# Tasks：明细抽屉遵循显示口径

**关联 Plan**：`Plan.md` —— 明细抽屉遵循显示口径 v1.0
**状态**：DONE
**日期**：2026-11-12
**完成日期**：2026-11-12
**总计 Task**：6 个
**执行主体**：全部主线
**回归测试结论**：自动化基线全绿 —— `go test ./...`（64 个测试函数全绿）、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`（74/74，新增相对条填充口径断言）、`pnpm --dir web typecheck`、`pnpm --dir web build`、`gofmt -l cmd internal` 无输出。浏览器在 1440 视口用临时库真实数据读回明细抽屉三态：分差百分比模式与同列榜单取值框逐模型逐字一致（100% / 60.4% / 40.6% / 1%）、最高分占比模式一致（100% / 77.8% / 66.7% / 44.4%）、关闭百分比后同为一位小数实际分值（9.0 / 7.0 / 6.0 / 4.0），三态均带色阶底色；相对条与数字同口径；取值框右缘四行同值 1395、框内文字右缘同值 1386（含 Skip 行）；行高与改动前同值 59.2px。

---

## Phase 1：抽屉取值接入共享显示口径

### TASK-001：明细抽屉得分列改用共享取值元素

- **Status**：DONE
- **Executor**：主线
- **Description**：把明细抽屉的得分列从 `formatDimension` 裸文本改为 `DimensionScore`，并让 Skip 单元格沿用同款取值框，使抽屉的取值与榜单 / 详情 / 对比共享同一显示口径。
- **Details**：
  - 现状：`web/src/components/DetailDrawer.tsx` 第 73 行 `<span className={styles.rankNum}>{formatDimension(row.scores[String(dimension.id)])}</span>`；Skip 行为同列裸文字
  - 改法：得分单元格渲染 `<DimensionScore value={row.scores[String(dimension.id)]} range={range} max={max} />`；Skip 沿用 `DimensionScore.module.css` 的 `.score` 取值框（与榜单 Skip 单元格同结构）
  - 色阶范围取 `dimensionScoreRanges(rows, [dimension.id])`，与榜单同一 helper、同一行集合
  - 抽屉网格、字号与列宽不改
- **Acceptance Criteria**：百分比模式下抽屉取值与同列榜单取值框逐字一致且带 `_tone_` 类；实际分值模式下同为一位小数；Skip 与同列数值的数字右缘对齐

## Phase 2：相对条口径共享

### TASK-002：相对条填充口径提取为共享纯函数

- **Status**：DONE
- **Executor**：主线
- **Description**：把详情页内联的「相对条与数字同口径」三元表达式提取为 `scoreEmphasis.ts` 的纯函数，详情页与明细抽屉共用，抽屉相对条不再恒按最高分归一。
- **Details**：
  - 现状：`web/src/pages/ModelDetail.tsx` 在渲染内联 `scorePercentageMode && !scorePercentageMaxMode ? strengthPercentile(...) : barWidth(...)`；`DetailDrawer` 恒用 `barWidth(value, max)`
  - 改法：`scoreEmphasis.ts` 新增纯函数（分差百分比模式取相对强度，最高分占比与实际分值模式按最高分归一）；详情页删除内联三元与多余中间变量，抽屉改用同一函数
  - 分差模式无有效区间时填充 0，与现状一致
- **Acceptance Criteria**：分差百分比模式下抽屉相对条宽度等于该值相对强度；最高分占比与实际分值模式下等于 值 / 最高分；详情页相对条宽度与改动前同值

### TASK-003：单测覆盖相对条填充口径

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `web/src/lib/scoreEmphasis.test.ts` 覆盖新纯函数的三种模式分支与无区间/无最高分边界。
- **Details**：
  - 覆盖：分差百分比模式（端点与中点）、最高分占比模式、实际分值模式、无有效区间与最高分为 0
  - 沿用该文件既有的断言风格与 `close` 浮点比较
- **Acceptance Criteria**：`pnpm --dir web test` 全绿且新增断言覆盖上述分支

## Phase 3：测试、文档与归档

### TASK-004：回归基线与三态浏览器验收

- **Status**：DONE
- **Executor**：主线
- **Description**：跑通自动化基线，并用临时库真实数据在浏览器读回明细抽屉在三种显示模式下的取值、色阶与相对条，与同列榜单单元格和详情页对照。
- **Details**：
  - 基线：`go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`、`pnpm --dir web typecheck`、`pnpm --dir web build`、`gofmt -l cmd internal`
  - 验收：分差百分比 / 最高分占比 / 关闭三态下，逐模型读回抽屉取值文本与类名、相对条宽度百分比，与同列榜单取值框、详情页相对条比对；组明细抽屉同样读回
- **Acceptance Criteria**：全部命令退出码 0；三态读回结论与 TASK-001、TASK-002 的验收标准逐条吻合

### TASK-005：Project.md 同步

- **Status**：DONE
- **Executor**：主线
- **Description**：把明细抽屉的显示口径写入 Project.md 的显示口径与页面结构段落，并更新验证结论。
- **Details**：
  - 显示口径：明细抽屉与榜单 / 详情 / 对比共享百分比模式与色阶；相对条与数字同口径
  - 页面结构「排行」段：明细抽屉取值走共享取值元素
  - 验证与归档：追加 11-12-v8 结论
- **Acceptance Criteria**：Project.md 描述与代码一致，无过期表述

### TASK-006：归档与提交

- **Status**：DONE
- **Executor**：主线
- **Description**：归档 Plan/Tasks 到当天递增版本目录，按 Conventional Commits 提交本轮改动。
- **Details**：
  - 归档目录：`.docs/11-12-v8/`（当天已有 v1–v7）
  - 归档前确认 Plan/Tasks 标注 DONE、含完成日期与回归测试结论
  - 提交信息：英文类型前缀 + 中文描述，正文说明「为什么」
- **Acceptance Criteria**：归档目录同时含 Plan.md 与 Tasks.md、根目录无残留；`git status` 干净
