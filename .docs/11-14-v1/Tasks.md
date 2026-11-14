# Tasks：11-12 交付审阅收口（统计口径 · 备份完整性 · 交互契约）

**关联工作流**：Main-hybrid — 规划段产出，交付段接手执行
**状态**：DONE
**开始日期**：2026-11-14
**完成日期**：2026-11-14
**总计 Task**：9 个
**执行主体**：全部主线（交付段接手模型）
**回归测试结论**：`go test -count=1 ./...`、`go vet ./...`、`gofmt -l cmd internal`（无输出）、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web typecheck`、`pnpm --dir web test`（78 通过）、`pnpm --dir web build` 全部退出码 0；浏览器 6 项验收全部通过，结论见 TASK-007 与 Project.md「验证与归档」。

**需求来源**：外部 Review 审计报告（覆盖 11-12-v1 … v9）；采纳/驳回明细见 Plan.md 第 2 节。

---

## Phase 1：统计口径统一

### TASK-001：两处服务端计数排除已跳过维度

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Dependency**：无
- **Description**：让模型行的已评维度数与 bootstrap 摘要的已评分模型数都排除该模型已跳过的维度，使两侧与领域层 `Compute` 的 `ScoredCount` 完全同义。
- **Details**：
  - 现状一：internal/store/models.go 的 `COUNT(CASE WHEN d.archived_at IS NULL AND d.weight > 0 THEN 1 END)` 只判维度可用性与权重，未排除 `score_skips`；设置页显示的已评维度数会高于工作台与详情页的 `scoredCount`（Project.md 已规定「跳过不进入已评分维度计数」）
  - 现状二：internal/store/db.go 的 `Store.Counts` 只数 `scores` 行（权重与归档条件之外未排除跳过）；「有历史分值的已跳过维度」会让榜单首屏占位数比加载后的统计多 1
  - 改法：两处各追加同一个排除条件 `AND NOT EXISTS (SELECT 1 FROM score_skips sk WHERE sk.model_id = <模型列> AND sk.dimension_id = <维度列>)`——模型行计数用 `m.id` / `d.id`，摘要计数用 `s.model_id` / `s.dimension_id`；不改连接、分组与既有权重条件
  - 同步 `ModelSummary` 与 `Counts` 的文档注释，写明跳过维度不计入
  - 测试：internal/store/store_test.go 的 `TestListModelsCompletenessCountsScoreableDimensions` 增加「已评分且已跳过」用例——对某个已评分的有权重维度 `SetSkip` 后断言 `ScoredDimensions` 与 `Counts().ScoredModels` 各减 1 且 `ScoreCount` 不变；`DeleteSkip` 后断言两者恢复
- **Acceptance Criteria**：`go test ./internal/store/` 全绿；新增断言在改动前会失败；同一模型在设置页、工作台与详情的已评维度数读回一致

### TASK-002：榜单与工作台「已评分」统计改用 scoredCount

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Dependency**：无
- **Description**：把两处顶部统计的判定从「有综合分」改为「至少一个已评分维度」，与 `/api/bootstrap` 的 `scoredModels` 及 Project.md 的「跳过不计入已评分」口径统一。
- **Details**：
  - 现状：web/src/pages/Rankings.tsx 与 web/src/pages/Workbench.tsx 各自写 `models.filter((model) => model.score != null).length`；只有跳过的模型会算出综合分并被计入，而 bootstrap 的 SQL 只数 `scores` 行，导致榜单首屏占位数字与加载后数字跳变
  - 改法：两处均改为 `models.filter((model) => model.scoredCount > 0).length`（`scoredCount` 已是 `RankingModel` 的必填字段，语义为「有权重、未归档、未跳过的已评分维度数」）
  - 保留 `session.counts.scoredModels` 作为加载前占位（其后端口径由 TASK-001 修正），不新增接口字段；工作台无占位计数，只要求同一判定规则
- **Acceptance Criteria**：`pnpm --dir web typecheck` 通过；浏览器中仅有跳过的模型不计入「已评分」；榜单首屏占位数与加载后统计数相同

## Phase 2：导出备份完整性

### TASK-003：管理员 JSON 导出补齐跳过记录

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Dependency**：无
- **Description**：在导出载荷中加入 `skips` 数组，使导出结果可还原综合分与名次。
- **Details**：
  - 现状：internal/api/handlers_export.go 的 `exportResponse` 只含 dimensions / models / scores / texts；跳过状态是综合分计算输入却不在导出中，Project.md 记作已知限制
  - 改法：新增导出条目类型 `exportSkip`（字段 `modelSlug` 与 `dimensionId`）；`exportResponse` 在 `Scores` 之后追加 `Skips` 数组；`handleExport` 调用既有 `s.store.AllSkips(ctx)`，用既有 `slugByID` 映射模型 slug（`AllSkips` 只回 model_id 与 dimension_id，故不为时间戳扩展查询）；切片按既有导出项同样用 `make([]exportSkip, 0, len(skips))` 初始化，零记录序列化为 `[]` 而非 `null`
  - 载荷只增字段，`version` 保持 1；无导入功能，无消费方依赖字段顺序
  - 测试：internal/api/api_test.go 的 `TestExportAndStatic` 把 `skips` 加入必需字段列表，并新建一条跳过记录后断言导出条目与库中一致；另断言无跳过记录时 `skips` 为空数组（键存在性检查对 `null` 同样通过，需显式判空）；同时确认匿名访问仍为 401
- **Acceptance Criteria**：`go test ./internal/api/` 全绿；管理员导出的 JSON 能被用来还原跳过状态与综合分

## Phase 3：交互与绘制契约修正

### TASK-004：明细抽屉重置选中维度并改用按钮组语义

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Dependency**：无
- **Description**：抽屉每次打开都落在该列的首个维度；组内选择器去掉无键盘支持却声明 tablist 的 ARIA 契约。
- **Details**：
  - 现状一：web/src/components/DetailDrawer.tsx 的 `activeId` 存在组件内部，而挂载点（web/src/pages/Rankings.tsx 末尾的 `<DetailDrawer target={detail} …/>`）常驻不卸载，关闭后重开原组会停留在上次选中的子维度
  - 改法一：挂载点改为条件挂载（`detail` 为空时不渲染抽屉）并加 `key`（取值为 kicker 与 title 的组合串），与同文件相邻的 `ScoreDialog` / `ModelDialog` 同构；卸载即重置组件内状态，不再保留常驻空组件与关闭哨兵值
  - 现状二：组内维度切换的容器声明 `role="tablist"`、按钮声明 `role="tab"` 与 `aria-selected`，但没有 roving tabindex 与方向键，不符合 WAI-ARIA Tabs 约定
  - 改法二：容器改为 `role="group"` 并保留 `aria-label`；按钮去掉 `role` 与 `aria-selected`，改用 `aria-pressed={item.id === dimension.id}`（与排行榜对比选择、评分弹窗 Skip 开关同一约定）；不复制设置页分区 Tab 的方向键机制，样式类与视觉不变
- **Acceptance Criteria**：浏览器读回——关闭后重开同一组落在首个维度、切到另一组同样落在首个维度；`web/src` 中除设置页分区外无 `role="tab"`；`pnpm --dir web typecheck` 通过

### TASK-005：导出图第 1 名标记按名次判定

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Dependency**：无
- **Description**：导出图的冠军信号条与红色名次改按 `rank === 1` 绘制，与榜单 DOM 契约一致。
- **Details**：
  - 现状：web/src/lib/exportImage.ts 的行循环用 `index === 0` 判定（左缘信号竖条与名次文字颜色），榜单用 `model.rank === 1`；无排名行（全部模型未评分）会被涂成冠军，行序与名次不一致时冠军标记落错行
  - 改法：在行循环内取 `const top = model.rank === 1;`，两处判定统一用它
  - 测试：web/src/lib/exportImage.test.ts 的 `board()` 夹具中 rank 1（Bravo）位于第二行，按记录器断言红色信号填充落在该行的 y 坐标、rank 2 行用墨色，覆盖「无排名行不标记」
- **Acceptance Criteria**：`pnpm --dir web test` 全绿且新增断言覆盖 rank 2 在前与 rank 全空两种排布

### TASK-006：设置页行内新建组名收敛为失焦单一提交入口

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Dependency**：无
- **Description**：维度组列「新建组名」输入框的提交只走失焦一条路径：点击他处或回车都提交非空组名，Escape 只取消；空输入回车不再把维度移出原分组。
- **Details**：
  - 现状一：web/src/pages/Settings.tsx 的输入框 `onBlur` 只收起，输入内容静默丢弃（该入口是 Project.md 记录的既有能力，保留而非删除）
  - 现状二：Enter 分支对空输入同样调用 `assignGroup([dimension.id], "")`，经 `assignGroup` 归一为 `{ groupName: null }` 提交并提示「已移出分组」，把已有分组的维度误移出
  - 改法：提交收敛到 `onBlur` 单一入口——`onBlur` 读 `event.currentTarget.value.trim()`，非空则 `void assignGroup([dimension.id], name)`，随后统一 `setNewGroupFor(null)`（空值仅收起）；Enter 分支改为 `event.preventDefault()` 后 `event.currentTarget.blur()`，由失焦路径完成提交或收起；Escape 分支先置 `event.currentTarget.value = ""` 再 `setNewGroupFor(null)`，清空 DOM 值使元素卸载时无论是否派发 focusout 都不会误提交
  - 该结构不引入额外 `ref` 或状态守卫：Enter、Escape、点击他处三态各自只触发一次 `onBlur`，重复提交与误提交都不成立
- **Acceptance Criteria**：浏览器四态读回——输入组名后点击他处完成分配并出现既有提示且只发一次请求；输入组名后回车同样只提交一次；空输入回车不触发请求、原分组保持不变；Escape 收起且不提交

## Phase 4：验证与文档

### TASK-007：全量回归与浏览器验收

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Dependency**：TASK-001 … TASK-006
- **Description**：跑通自动化基线，并用临时库真实数据在浏览器逐项验收本轮契约。
- **Details**：
  - 基线命令：`go test -count=1 ./...`、`go vet ./...`、`gofmt -l cmd internal`（无输出）、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`、`pnpm --dir web typecheck`、`pnpm --dir web build`（前端构建先于 Go 二进制）
  - 数据形态：临时库含 3 个可见模型 + 1 个隐藏模型，并构造一处「已评分且已跳过」（带历史分值）的维度，覆盖 TASK-001 的两处服务端计数与 TASK-002 的占位/加载一致性
  - 验收点：① 榜单顶部「已评分」在首屏占位与加载后同值，且不等于带综合分的行数（仅有跳过的模型不计入）；② 设置页模型行已评维度数与工作台「已评分」列、详情页「已评分维度」三处一致；③ 导出 JSON 的 `skips` 与库中跳过一致（含隐藏模型）；④ 明细抽屉关闭后重开同一组/另一组均落在首个维度；⑤ 导出 PNG 的冠军标记落在 rank 1 行，无排名场景不标记；⑥ 设置页行内新建组名的四态（点击他处提交、回车提交、空回车不改分组、Escape 取消）
- **Acceptance Criteria**：全部命令退出码 0；上述 6 项在浏览器逐项读回一致，结论写入 Tasks 与本轮归档
- **验证结论**：基线 7 条命令全部退出码 0（web 测试 78 通过）。浏览器验收 6/6 通过——① 榜单「已评分」占位与加载后同为 2、带综合分的可见行为 3；② Gamma 已评维度数在设置页 / 工作台 / 详情同为 0 / 5；③ 导出 `skips` = gamma/dim1、delta/dim2（含隐藏），空库为 `[]`；④ 抽屉关闭重开同一组与切到另一组均落首个维度，`role="tab"`/`tablist` 计数 0；⑤ 导出画布第 1 行采样到信号红 `#b92a20`、其余行为纸色（无排名不标记由单测覆盖）；⑥ 行内新建组名点击他处与回车各只发一次 PATCH、空回车不改分组、Escape 不提交。

### TASK-008：Project.md 同步

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Dependency**：TASK-001 … TASK-006
- **Description**：把本轮契约写入 Project.md，删除已失效的表述。
- **Details**：
  - 导出接口段：载荷列明 `skips`（模型 slug + 维度 id）；删除「不含跳过记录」
  - 跳过接口段：把 PUT 与 DELETE 的错误码契约分开陈述——PUT 沿用写入口径（未知模型/维度 404、归档与文字维度 422），DELETE 只校验模型存在、删除幂等、不校验维度
  - 排行段：顶部统计的「已评分」定义为「至少一个已评分维度的模型数，跳过不计入」
  - 模型可见性与生命周期段：模型完整度的分子改为「启用、权重 > 0 且未跳过」的维度，分母与「全部已存评分」总数的表述保持不变
  - 已知限制：删除「JSON 导出不含跳过记录」；在评分弹窗预览的基准偏差条目旁补记中位分同样取打开时快照值（前端不实现第二份 60% 分位计算）
  - 验证与归档段：追加 11-14-v1 的基线与浏览器验收结论，保留可复用项
- **Acceptance Criteria**：Project.md 描述与代码一致，无「不含跳过记录」等过期表述；`.docs/Project.md` 是唯一被修改的文档文件

## Phase 5：归档与提交

### TASK-009：归档 11-14-v1 并提交

- **Status**：TODO
- **Executor**：主线
- **Priority**：P0
- **Dependency**：TASK-007、TASK-008
- **Description**：把 Plan.md 与 Tasks.md 标注完成后归档到当天递增版本目录，并按仓库规范提交本轮改动。
- **Details**：
  - 归档前：Plan.md / Tasks.md 标注 `状态：DONE`、填写完成日期与回归测试结论
  - 归档目录：`.docs/11-14-v1/`（当天首个；跨天则按实际日期与既有同日前缀取最大 N 加 1）
  - 工作区状态：先确认 `web/dist/.gitkeep` 未被删除提交（`web/embed.go` 的 `//go:embed all:dist` 依赖它保持可编译，构建产物本身被 .gitignore 忽略），如仍为删除态则 `git checkout -- web/dist/.gitkeep`
  - 提交：Conventional Commits 英文类型前缀 + 中文描述，正文说明「为什么」；按主题拆分（口径与导出 / 交互与绘制 / 文档归档），不提交构建产物与临时文件
- **Acceptance Criteria**：`.docs/11-14-v1/` 同时含 Plan.md 与 Tasks.md、根目录无残留；`git log` 提交信息符合规范；`git status` 干净
