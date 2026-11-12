# Tasks：榜单组列去特殊化与列序归位

**关联 Plan**：`Plan.md` —— 榜单组列去特殊化与列序归位 v1.0
**状态**：DONE
**完成日期**：2026-11-12
**总计 Task**：7 个
**回归测试结论**：自动化基线全绿 —— `go test ./...`（64 个测试函数全绿）、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`（71/71）、`pnpm --dir web typecheck`、`pnpm --dir web build`；`gofmt -l cmd internal` 无输出。浏览器在 1440 / 768 / 390 三视口用临时库真实数据验收：榜单列序为前端纪律 → 前端审美 → 工程能力 → 模型直觉 → …，组列无组色圆点与组色左框线，组列排序（aria-sort）与组明细抽屉正常，导出 PNG 列序与榜单一致且无组色标记，页面级无横向溢出。
**执行主体**：全部主线（详见 Plan 第 6 节协同结论）

---

## Phase 1：领域层列序列与榜单列样式归位

### TASK-001：`boardColumns` 输出按首个成员位置交织的列序列

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `web/src/domain/ranking.ts` 增加列判别联合类型，并让 `boardColumns` 一次遍历同时产出有序 `columns` 序列与既有 `groups`/`ungrouped` 分区。
- **Details**：
  - 新增 `BoardColumn<T>`：`{ kind: "group"; group }` | `{ kind: "dimension"; dimension }`
  - `BoardColumns<T>` 增加 `columns: BoardColumn<T>[]`；`groups` 与 `ungrouped` 语义不变
  - 遍历维度时：未成组或权重为 0 的维度按维度列入序列；组的首个成员处插入该组列，组内后续成员只并入组维度
  - 组色仍按组首次出现的顺序分配，组权重合计口径不变
- **Acceptance Criteria**：给定「未成组维度 → 组 G1 → 未成组维度 → 组 G1 成员 → 组 G2」的夹具，`columns` 序列为 `dim, group:G1, dim, group:G2`；`groups`/`ungrouped` 的既有断言不回归

### TASK-002：榜单列头与单元格改走列序列并统一组列样式

- **Status**：DONE
- **Executor**：主线
- **Description**：`Rankings.tsx` 的列头与表体改为遍历 `columns.columns` 渲染；组列沿用维度列的类名，去掉组色圆点与组色左框线；删除随之无用的 `SortButton` `dot` 属性与面板中 `.groupCol`/`.groupValue` 样式。
- **Details**：
  - 列头：组列与维度列同用 `styles.th + styles.alignRight + styles.dimCol`；组列 `SortButton` 不传 `dot`，小字保留「n 项 · 权重 w」；明细箭头行为不变
  - 单元格：组值不再带 `borderLeftColor`，与维度列同用 `styles.td + styles.dimCol + styles.alignRight + styles.dimValue`
  - `.dimValue` 补充 `font-family: var(--font-mono)` 与 `font-variant-numeric: tabular-nums`，使组值数字与维度列数字同为等宽 14px；删除 `.groupCol`、`.groupValue` 与 `.dimCol, .groupCol` 合并选择器
  - `SortButton` 删除 `dot` 属性与 `.dot` 样式；`Rankings.tsx` 删除 `dot={group.color}`
- **Acceptance Criteria**：组列按组内首个维度的列位出现（前端纪律 → 前端审美 → 工程能力 → …）；组列列头无圆点、单元格无组色左框线；组列与维度列的排序、明细抽屉、`≤760px` 隐藏行为不回归

## Phase 2：导出图片

### TASK-003：导出布局与画布绘制对齐榜单列序

- **Status**：DONE
- **Executor**：主线
- **Description**：`web/src/lib/exportImage.ts` 的 `planExportLayout` 改用 `boardColumns(...).columns` 生成列集合，画布绘制移除组色标记。
- **Details**：
  - 列计划：依次为排名 / 模型 / 综合分 / 按 `columns` 序列展开的组列与维度列
  - 绘制：删除列头与分值行的组色竖条，列头标签不再为组列额外缩进；组值仍以等宽数字绘制
  - 列宽、伸展算法、统计行文案不变
- **Acceptance Criteria**：导出列标签序列与榜单列序一致；组列无组色块；断言列不重叠且不超出画布

## Phase 3：测试、文档与归档

### TASK-004：纯函数测试补齐列序断言

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `web/src/domain/ranking.test.ts` 与 `web/src/lib/exportImage.test.ts` 增加/改写列序用例。
- **Details**：
  - `ranking.test.ts` 新增用例：未成组维度在两个组之前时，`columns` 序列为 `dim → group → dim → group`
  - `exportImage.test.ts` 首个用例夹具改为「未成组维度在前、组在中、权重 0 维度在后」，断言 `["综合排名", "模型", "综合分", "维度 1", "通用", "维度 4"]` 并把标题改为反映交织规则
- **Acceptance Criteria**：`pnpm --dir web test` 全绿；新断言在旧实现下失败（能锁住本轮规则）

### TASK-005：回归基线与浏览器验收

- **Status**：DONE
- **Executor**：主线
- **Description**：跑通验证基线，并在 1440 / 768 / 390 三视口用真实数据验收列序与组列样式。
- **Details**：
  - 基线：`go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`、`pnpm --dir web typecheck`、`pnpm --dir web build`
  - 浏览器：临时库写入「前端纪律(1) / 前端审美(2) / 基础工程能力+复杂长程任务(工程能力组) / 模型直觉 / …」与若干评分，确认榜单列序为前端纪律 → 前端审美 → 工程能力 → …，组列无圆点与组色框，导出图片同序
- **Acceptance Criteria**：全部命令退出码 0；三视口无横向溢出；列序与样式结论可复述并截图

### TASK-006：同步 Project.md

- **Status**：DONE
- **Executor**：主线
- **Description**：更新榜单列序、组列样式、组色用途、导出图片与已知限制的表述，并回填本轮验证结论。
- **Details**：
  - 页面结构：列顺序改为「组列与维度列按首个成员/自身位置交织」；补充组列不带独立样式
  - 导出图片：删除「组值带组色标记」，改为与榜单同列序
  - 视觉与可访问性：组色用途收窄为明细抽屉组内切换、评分弹窗左框线与设置页组色块
  - 已知限制：组顺序表述改为「组列取组内首个维度的位置」
  - 验证与归档：更新为 11-12-v2 结论
- **Acceptance Criteria**：Project.md 与代码库一致，无「组列固定在前」与「组值带组色标记」残留

### TASK-007：归档与提交

- **Status**：DONE
- **Executor**：主线
- **Description**：把 `Plan.md` 与 `Tasks.md` 移入 `.docs/11-12-v2/`，按 Conventional Commits（英文类型 + 中文描述）提交本轮变更。
- **Details**：
  - 归档前标注 Plan/Tasks 为 DONE 并写入完成日期与回归结论
  - 校验归档目录同时含两份文件、根目录无残留
  - 提交前 `git status`/`git diff` 复核，清理临时文件（`/tmp` 下的截图与脚本不入库）
- **Acceptance Criteria**：归档校验通过；`git status` 干净；提交信息符合项目规范
