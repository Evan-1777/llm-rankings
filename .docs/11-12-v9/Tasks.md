# Tasks：导出图严格遵循排行榜显示设置

**关联工作流**：Quick（Explore → Formulate Tasks → Execute → Document Maintenance → Archive → Git Commit）
**状态**：DONE
**开始日期**：2026-11-12
**完成日期**：2026-11-12
**总计 Task**：6 个
**执行主体**：全部主线
**回归测试结论**：自动化基线全绿 —— `go test ./...`（64 个测试函数全绿）、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`（77/77，新增导出图百分比口径、色阶底色与下划线断言）、`pnpm --dir web typecheck`、`pnpm --dir web build`、`gofmt -l cmd internal` 无输出。浏览器用临时库真实数据在四种设置组合下各导出一次 PNG，导出画布的绘制调用与榜单 DOM 逐值比对：分差百分比、最高分占比与关闭百分比三态的综合分、组值与维度值均与榜单列逐模型一致；强调开启时维度值与组值各 8 个 58×29.5 取值框底色与 2px 下划线，综合分列无底色；关闭强调后底色、下划线与图例一并消失。

**需求来源**：用户指令「导出图需要按照排行榜的设置严格进行，包括颜色强调」

| 排行榜的口径 | 导出图改动前 | 本轮处理 |
|---|---|---|
| 综合分、组值、维度值按百分比模式显示（相对强度 / 最高分占比），表头随之改为「综合强度 / 综合占比」 | 三处一律绘制一位 / 两位小数原生分，表头恒为「综合分」 | TASK-002 |
| 维度列与组列按全榜同列 min/max 取色阶，带底色与 2px 下划线 | 无任何底色与下划线 | TASK-002 |
| 强调开启时页面显示「低分红 → 高分蓝」图例 | 无图例，着色无从判读 | TASK-002 |
| 表脚口径标签随模式改为「相对强度 / 最高分占比」 | 恒为「加权平均」 | TASK-002 |
| 色阶与百分比所需的列区间与最大值由盘面列（每个维度、每个组）min/max 决定 | 导出图无区间概念 | TASK-001（提取为共享纯函数，两个视图同源） |

---

## Phase 1：显示口径同源

### TASK-001：提取盘面列显示区间为共享纯函数

- **Status**：DONE
- **Executor**：主线
- **Description**：把榜单与导出图共用的「每列显示区间与最大值」从 Rankings.tsx 的五个 useMemo 提取为 scoreEmphasis.ts 的纯函数，使导出图的百分比分母与色阶区间与榜单逐值同源。
- **Details**：
  - 现状：综合分区间、各维度区间与最大值、各组区间与最大值分散在 web/src/pages/Rankings.tsx 的五个 useMemo 中；导出图没有等价实现，无从对齐
  - 改法：web/src/lib/scoreEmphasis.ts 新增 ColumnDisplay / BoardDisplays 与 boardDisplays(dimensions, models)，复用既有 dimensionScoreRanges / dimensionMax / scoreRange / scoreMax / groupValue / snapshotBaselines；Rankings.tsx 改为单一 memo 并替换全部取值点
  - 维度最大值对每个维度恒有值（同分维度无区间但仍有最大值，最高分占比模式据此显示 100%）
- **Acceptance Criteria**：pnpm --dir web typecheck 通过；浏览器读回榜单综合分、组值与维度值的百分比、色阶与表头标签与改动前逐值相同

## Phase 2：导出图按设置绘制

### TASK-002：导出图按排行榜设置绘制取值、标签与色阶

- **Status**：DONE
- **Executor**：主线
- **Description**：让导出图接收排行榜当前显示设置（百分比模式、最高分占比、色阶强调），按同一口径绘制综合分 / 组值 / 维度值、表头标签、表脚标签与色阶底色、下划线与图例。
- **Details**：
  - 现状：web/src/lib/exportImage.ts 中综合分走 formatScore、组值与维度值走 formatDimension，取色阶的能力完全缺失
  - 改法：renderExportCanvas / downloadRankingsImage 接收 ExportDisplay（ScoreDisplayMode + emphasis）；取值改走 formatDisplayScore（维度与组值传 formatDimension，综合分沿用默认两位小数）；综合分列表头按 displayScoreLabel 改为「综合强度 / 综合占比」，表脚改为「相对强度 / 最高分占比」
  - 色阶：emphasis 开启时对维度值与组值按 scoreEmphasisTone 绘制取值框底色（沿用排行榜的 58px 最小宽度、9px 横向内边距、13px 行框 + 5px 纵向内边距）与 2px 下划线；底色取色令牌与纸白按排行榜的整数百分比混合；综合分列不参与色阶（与榜单一致）
  - 图例：emphasis 开启时顶部信息行追加「低分红 → 高分蓝」
  - Rankings.tsx 导出调用传入当前偏好
- **Acceptance Criteria**：浏览器导出的 PNG 在百分比两种模式与关闭三态下的取值文本与榜单逐模型一致；开启强调时维度值与组值带底色与下划线、综合分不带；关闭强调或百分比时对应元素消失

## Phase 3：测试与交付

### TASK-003：导出图单测覆盖模式与色阶

- **Status**：DONE
- **Executor**：主线
- **Description**：在 web/src/lib/exportImage.test.ts 覆盖导出图的百分比口径、标签与色阶绘制，并直接断言底色混合值。
- **Details**：
  - 记录器记录 fillRect 的坐标与填充色，用于断言底色与下划线
  - 覆盖：分差百分比与最高分占比两种模式的取值与表头标签、关闭百分比后的实际分值、强调开关的开与关、综合分列不参与色阶
  - toneFill 直接断言纸白混合后的定点色值（低分端强度 1 与 0.18、高分端强度 1）
- **Acceptance Criteria**：pnpm --dir web test 全绿且新增断言覆盖上述分支

### TASK-004：回归基线与浏览器验收

- **Status**：DONE
- **Executor**：主线
- **Description**：跑通自动化基线，并用临时库真实数据在浏览器按三种显示设置导出 PNG，与榜单读回值逐模型比对。
- **Details**：
  - 基线：go test ./...、go vet ./...、CGO_ENABLED=0 go build ./cmd/server、pnpm --dir web test、pnpm --dir web typecheck、pnpm --dir web build、gofmt -l cmd internal
  - 验收：分差百分比 / 最高分占比 / 关闭三态各导出一次，读回 PNG 中综合分、组值与维度值的文本与榜单列逐模型比对；开启强调时统计底色的像素位置与榜单取值框位置对照
- **Acceptance Criteria**：全部命令退出码 0；三态导出的取值、标签与色阶与榜单一致

### TASK-005：Project.md 同步

- **Status**：DONE
- **Executor**：主线
- **Description**：把导出图遵循显示设置的结论写入 Project.md 的导出图片、显示口径与验证归档段落。
- **Details**：
  - 导出图片段：取值、表头与表脚标签、色阶底色与下划线、图例随显示设置变化
  - 显示口径表与「导出不受百分比模式影响」的旧表述一并修正
  - 验证与归档：追加 11-12-v9 结论
- **Acceptance Criteria**：Project.md 描述与代码一致，无过期表述

### TASK-006：归档与提交

- **Status**：DONE
- **Executor**：主线
- **Description**：归档 Tasks 到当天递增版本目录，按 Conventional Commits 提交本轮改动。
- **Details**：
  - 归档目录：.docs/11-12-v9/（当天已有 v1–v8）
  - 归档前确认 Tasks 标注 DONE、含完成日期与回归测试结论
  - 提交信息：英文类型前缀 + 中文描述，正文说明「为什么」
- **Acceptance Criteria**：归档目录含 Tasks.md、根目录无残留；git status 干净
