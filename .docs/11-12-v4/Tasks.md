# Tasks：Skip 取值框对齐与强调色核验

**关联工作流**：Quick（Explore → Formulate Tasks → Execute → Document Maintenance → Archive → Git Commit）
**状态**：DONE
**完成日期**：2026-11-12
**总计 Task**：3 个
**回归测试结论**：自动化基线全绿 —— `go test ./...`（64 个测试函数全绿）、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`（71/71）、`pnpm --dir web typecheck`、`pnpm --dir web build`；`gofmt -l cmd internal` 无输出。浏览器在 1440 / 768 / 390 三视口用临时库真实数据验收：Skip 单元格与分值同取值框（58px / 5px 9px）且文字右缘对齐；「维度得分强调」开启后底色、下划线与图例恢复，强调相关文件自 715f7f0 起零改动；三视口页面级无横向溢出。
**执行主体**：全部主线

---

## Phase 1：Skip 取值框对齐

### TASK-001：Skip 单元格沿用评分列的取值框

- **Status**：DONE
- **Executor**：主线
- **Description**：`web/src/pages/Rankings.tsx` 的 Skip 单元格改为渲染在评分列共用的取值框内并右对齐，使 Skip 与同列分值同框、右缘与左侧分隔线位置一致。
- **Details**：
  - 现状：分值走 `DimensionScore` 的取值框（`min-width: 58px` / `padding: 5px 9px`），Skip 是裸 `ui.skip`（无盒、无内边距），文字右缘比分值多出 9px，左侧分隔线也随内容宽度外移
  - 改法：`<span className={scoreStyles.score + styles.alignRight}><span className={ui.skip}>Skip</span></span>`——复用既有取值框类与既有右对齐工具类，不新增样式规则；`ui.skip` 保留小字号与弱色（作为子元素，其 color/font-size 不受取值框影响）
- **Acceptance Criteria**：Skip 单元格取值框的宽度、内边距与右缘同同列分值一致（浏览器读回计算样式）；列序、排序、抽屉与三视口无回归

## Phase 2：强调色核验与恢复

### TASK-002：核验高分低分强调未被删除并恢复浏览器开关

- **Status**：DONE
- **Executor**：主线
- **Description**：核对强调色相关代码自用户基线（`715f7f0`）以来是否被改动；恢复验收浏览器 origin 的本地开关，验证图例与色阶恢复。
- **Details**：
  - 证据：`git diff 715f7f0 -- web/src/components web/src/lib/scoreEmphasis.ts web/src/styles/global.css` 只含 SortButton `dot` 删除，与强调渲染无关
  - 开关：`llmrank:dimension-score-emphasis`（localStorage、按浏览器、默认开启、仅字面量 `"false"` 关闭），入口在设置 → 显示 → 「维度得分强调」
  - 验收：开关开启后图例「低分红 → 高分蓝」渲染、分值带底色与下划线（读回 `backgroundColor` 非 `rgba(0, 0, 0, 0)`）
- **Acceptance Criteria**：强调代码零改动有 git 证据；开关开启后色阶与图例恢复

## Phase 3：测试、文档与归档

### TASK-003：回归基线、文档同步与归档提交

- **Status**：DONE
- **Executor**：主线
- **Description**：跑通验证基线，浏览器三视口验收 Skip 对齐与强调色，更新 Project.md，归档并提交。
- **Details**：
  - 基线：`go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`、`pnpm --dir web typecheck`、`pnpm --dir web build`
  - 文档：Project.md 排行段落补充「Skip 与分值同取值框」，验证结论更新为 11-12-v4
  - 归档：`Tasks.md` 移入 `.docs/11-12-v4/`
- **Acceptance Criteria**：全部命令退出码 0；`git status` 干净；归档目录含 Tasks.md；提交信息符合项目规范
