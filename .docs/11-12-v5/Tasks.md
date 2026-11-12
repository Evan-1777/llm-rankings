# Tasks：榜单对齐收口

**关联 Plan**：`Plan.md` —— 榜单对齐收口 v1.0
**状态**：DONE
**日期**：2026-11-12
**完成日期**：2026-11-12
**总计 Task**：8 个
**执行主体**：全部主线
**回归测试结论**：自动化基线全绿 —— `go test ./...`（64 个测试函数全绿）、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`（72/72，新增导出图片右锚点断言）、`pnpm --dir web typecheck`、`pnpm --dir web build`、`gofmt -l cmd internal` 无输出。浏览器在 1440 / 768 / 390 三视口用临时库真实数据逐列读回几何量：名次数字墨迹左缘收敛为单值、表头首行墨迹顶收敛为单值、评分列宽收敛为单值（1440 下 107.3px）、列头文字右缘与列内数字右缘偏移为 0、排序激活前后同一列头文字右缘不变、三视口页面级无横向溢出。

---

## Phase 1：表头与名次对齐

### TASK-001：名次标记在每一行占位

- **Status**：DONE
- **Executor**：主线
- **Description**：把第 1 名的名次条从「仅第 1 名存在」改为「每行都占位、仅第 1 名上色」，使全部名次数字共用一条左缘。
- **Details**：
  - 现状：`web/src/pages/Rankings.module.css` 的 `.topRank::before` 生成 3×18px 色条并参与行内布局，只有第 1 名行有名次条 ⇒ 该行数字右移 11px（3px 条 + 8px 间距）
  - 改法：把色条尺寸与 `content` 移到 `.rank::before`（默认透明），`.topRank::before` 只保留背景色；移动端高度沿用原 15px
  - 不改名次数字的字号、间距与颜色
- **Acceptance Criteria**：浏览器读回 10 行名次文字的墨迹左缘集合收敛为单值；第 1 名色条仍为信号红且在第 1 名行

### TASK-002：表头副行占位与首行基线统一

- **Status**：DONE
- **Executor**：主线
- **Description**：让每个表头都保留副行位置，使全部列头首行落在同一条基线上；名次表头（无排序控件）同样对齐。
- **Details**：
  - 现状：`web/src/components/SortButton.tsx` 只在有 `sub` 时渲染副行 ⇒ 单行表头整块 13px、双行表头整块 29.5px，居中后首行相差 6.5px；名次表头为独立块，再差 0.8px
  - 改法：副行恒定渲染（无内容时留空），`SortButton.module.css` 给副行留出固定高度；`Rankings.module.css` 的表头单元格补上下内边距，`.staticHead` 改为带占位副行的纵向块
  - 长标签换行时表头单元格按内容增高，首行位置不变
- **Acceptance Criteria**：浏览器读回全部表头首行墨迹顶集合收敛为单值（容差 ≤1px）；副行（权重 / 组摘要）仍右对齐在列头下排

### TASK-003：排序箭头占位且不挤动列头文字

- **Status**：DONE
- **Executor**：主线
- **Description**：排序箭头恒定渲染（未激活时仅隐藏），右对齐列头把箭头排在文字左侧，使列头文字右缘在激活前后不变、且压在列内数字右缘。
- **Details**：
  - 现状：箭头作为文字右邻的行内元素 ⇒ 激活的列文字右缘被挤走 16px（5px 间距 + 11px 箭头），切换排序时列头跳动
  - 改法：`SortButton.tsx` 始终渲染箭头图标；`Icons.tsx` 的 `Icon` 接受 `className`；`SortButton.module.css` 未激活箭头仅隐藏、右对齐列头的标签改为反向排列
- **Acceptance Criteria**：同一列头在激活与未激活两种状态下文字右缘相同（浏览器读回）；工作台表头不受破坏

## Phase 2：列网格与取值锚点

### TASK-004：取值框内边距提取为设计令牌

- **Status**：DONE
- **Executor**：主线
- **Description**：把取值框的横向内边距提到全局设计令牌，供取值框与列头共用，消除跨文件的重复常量。
- **Details**：
  - `web/src/styles/global.css` 新增令牌；`web/src/components/DimensionScore.module.css` 的取值框横向内边距改用该令牌
  - 取值框的纵向内边距、最小宽度、字体与色阶不变
- **Acceptance Criteria**：取值框计算样式的横向内边距与改动前逐项相同

### TASK-005：评分列等宽并让列头文字压在列内数字上

- **Status**：DONE
- **Executor**：主线
- **Description**：榜单改用固定表格布局，评分列（组列与维度列）声明同一宽度并允许长维度名换行；评分列列头的右内边距取取值框的横向内边距，使列头文字右缘与列内数字右缘重合。
- **Details**：
  - 现状：自动布局下长维度名把该列撑宽 ⇒ 列宽 `102.9 / 116.4 / … / 140.4`，取值框间距与左侧分隔线随之不齐；列头文字右缘恒比列内数字右缘多 9px
  - 改法：`Rankings.module.css` 的表格改为固定布局、评分列统一宽度；`Rankings.tsx` 给评分列列头传既有换行能力与新增列头类
  - 宽度取值需保证 1280 视口不出现表格容器横向滚动（以三视口量测为准）
- **Acceptance Criteria**：评分列宽集合收敛为单值；同一列内取值框右缘、分隔线左缘集合收敛为单值；列头文字右缘与列内数字右缘偏移为 0；三视口页面级无横向溢出

### TASK-006：导出图片的数字列与 Skip 改为右对齐

- **Status**：DONE
- **Executor**：主线
- **Description**：导出画布中评分列（组列与维度列）的列头与 Skip 改为右对齐，与同列数值共用同一右锚点；排名列与模型列保持左对齐。
- **Details**：
  - 现状：`web/src/lib/exportImage.ts` 中列头一律以列左缘起绘，Skip 也以列左缘起绘，而数值以列右缘内边距起绘
  - 改法：按列类型选择锚点，数字列表头与 Skip 用 `measureText` 反推左缘
- **Acceptance Criteria**：导出 PNG 中数字列列头右缘、Skip 右缘与同列数值右缘一致；导出列序与榜单一致

## Phase 3：测试、文档与归档

### TASK-007：回归基线与三视口浏览器验收

- **Status**：DONE
- **Executor**：主线
- **Description**：跑通自动化基线，并在 1440 / 768 / 390 三视口用临时库真实数据复核全部对齐关系与无溢出。
- **Details**：
  - 基线：`go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`、`pnpm --dir web typecheck`、`pnpm --dir web build`、`gofmt -l cmd internal`
  - 验收：逐列读回名次左缘、表头首行、列宽、取值框宽度与右缘、分隔线左缘、列头文字与数字偏移；核对导出 PNG
- **Acceptance Criteria**：全部命令退出码 0；量测结论与 TASK-001 至 TASK-006 的验收标准逐条吻合

### TASK-008：文档同步、归档与提交

- **Status**：DONE
- **Executor**：主线
- **Description**：更新 Project.md 的榜单与导出段落及验证结论，归档 Plan/Tasks 并提交。
- **Details**：
  - Project.md：记录列头基线、名次标记占位、评分列等宽与列头取值锚点、导出对齐口径；验证结论更新为 11-12-v5
  - 归档：`Plan.md`、`Tasks.md` 移入 `.docs/11-12-v5/`
  - 提交：英文类型 + 中文描述
- **Acceptance Criteria**：Project.md 与代码一致；归档目录同时含 Plan.md 与 Tasks.md 且根目录无残留；`git status` 干净
