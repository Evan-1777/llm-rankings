# Tasks：组列取值沿用维度列样式元素并还原评分列类定义

**关联 Plan**：`Plan.md` —— 组列取值沿用维度列样式元素并还原评分列类定义 v1.0
**状态**：DONE
**完成日期**：2026-11-12
**总计 Task**：4 个
**回归测试结论**：自动化基线全绿 —— `go test ./...`（64 个测试函数全绿）、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`（71/71）、`pnpm --dir web typecheck`、`pnpm --dir web build`；`gofmt -l cmd internal` 无输出。浏览器在 1440 / 768 / 390 三视口用临时库真实数据验收：组列取值元素的类名与计算样式（等宽 / 14px / min-width 58px / padding 5px 9px）与维度列逐项一致，`.dimValue` 与本轮改动前逐字节相同、榜单样式表无组专属取值类；组列列序、列头排序与组明细抽屉正常，三视口页面级无横向溢出。
**执行主体**：全部主线（详见 Plan 第 6 节协同结论）

---

## Phase 1：还原评分列类定义并把组值接入同款取值元素

### TASK-001：还原 `.dimValue` 并把组值渲染进维度列的取值框

- **Status**：DONE
- **Executor**：主线
- **Description**：`web/src/pages/Rankings.module.css` 的 `.dimValue` 删除 v2 加入的 `font-family`/`font-variant-numeric`，恢复为仅 `font-size: 14px`；`web/src/pages/Rankings.tsx` 的组值分支改为渲染在取值组件的 `.score` 取值框内。
- **Details**：
  - `Rankings.module.css`：`.dimValue { font-size: 14px; }`，维度列样式回到 v2 之前
  - `Rankings.tsx`：引入 `../components/DimensionScore.module.css`，组值分支渲染为 `<span className={scoreStyles.score}>{formatScore(groupValue(...))}</span>`，与维度列取值同元素
  - 组值仍为两位小数，不接入百分比与色阶；列头、列宽、排序、明细入口、移动端隐藏规则不变
- **Acceptance Criteria**：`git diff` 中 `.dimValue` 无新增声明、榜单样式表无组专属取值类；组值字体与取值框与维度列一致；组值仍为两位小数

## Phase 2：测试、文档与归档

### TASK-002：回归基线与浏览器验收

- **Status**：DONE
- **Executor**：主线
- **Description**：跑通验证基线，并在浏览器用真实数据对比组列与维度列的取值样式。
- **Details**：
  - 基线：`go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`、`pnpm --dir web typecheck`、`pnpm --dir web build`
  - 浏览器：临时库真实数据（含一个维度组），相对强度模式 + 维度色阶开启，1440 / 768 / 390 三视口确认组列与维度列取值框、字体、列宽一致，三视口无横向溢出
- **Acceptance Criteria**：全部命令退出码 0；组列与维度列取值样式一致且有截图；三视口无横向溢出

### TASK-003：同步 Project.md

- **Status**：DONE
- **Executor**：主线
- **Description**：更新排行段落中组列取值样式的表述与验证结论，说明组值复用维度列取值元素、`.dimValue` 不含组声明。
- **Details**：
  - 排行段落：明确「组值以维度列同款取值元素渲染（等宽、同取值框），组值仍为换算分两位小数」
  - 验证与归档：替换为 11-12-v3 的结论
- **Acceptance Criteria**：Project.md 与代码库一致，无「组列自带等宽声明」的残留表述

### TASK-004：归档与提交

- **Status**：DONE
- **Executor**：主线
- **Description**：把 `Plan.md` 与 `Tasks.md` 移入 `.docs/11-12-v3/`，按 Conventional Commits（英文类型 + 中文描述）提交本轮变更。
- **Details**：
  - 归档前标注 Plan/Tasks 为 DONE 并写入完成日期与回归结论
  - 校验归档目录同时含两份文件、根目录无残留
  - 提交前 `git status`/`git diff` 复核，清理临时文件
- **Acceptance Criteria**：归档校验通过；`git status` 干净；提交信息符合项目规范
