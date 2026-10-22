# Tasks：评分工作台快捷编辑与站点级百分比模式

**关联 Plan**：`Plan.md` —— 评分工作台快捷编辑与站点级百分比模式 v2.2  
**状态**：DONE  
**日期**：2026-10-22  
**总计 Task**：12 个，均由主线执行  
**Demo**：`temp/quick-edit-mode.html`（仅本机临时参照；`temp/` 被 Git 忽略；内存数据与模拟保存，不作为接口或持久化验收）。

---

### TASK-001：支持省略备注的评分写入

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：无
- **Description**：扩展评分 PUT 契约，使 `note` 可省略；省略时保留已有备注，显式空字符串才清空。
- **Details**：
  - `internal/api/handlers_scores.go`：`scoreInput.Note` 改为 `*string`；仅在提供时校验长度；省略时走保留备注的写入路径。
  - `internal/store/scores.go`：增加或复用一条冲突时只更新分值与更新时间的写入路径；新记录备注为空；返回实际存储的备注。
  - 现有评分弹窗始终提交备注，行为不变；新评分、负值、NaN、归档维度与未知模型的错误语义保持原样。
  - `internal/api/api_test.go`：新增用例——带备注写入 → 仅提交分值 → 管理端详情备注仍在 → 显式提交空备注 → 备注清空；缺失备注不再被当作空字符串覆盖。
- **Acceptance Criteria**：
  - 省略 `note` 改值后备注保留；显式空字符串清空备注。
  - 现有评分写入与校验回归全部通过；`go test ./...`、`go vet ./...` 通过。

### TASK-002：抽取共享评分输入解析

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：无
- **Description**：把评分弹窗内的解析与舍入逻辑抽为共享纯函数，供快捷编辑复用。
- **Details**：
  - 新增 `web/src/domain/scoreInput.ts`：空串返回空值；非有限或负数返回同一条错误文案；有效值四舍五入到一位小数。
  - `web/src/components/ScoreDialog.tsx` 改为引用共享函数，删除本地重复实现，弹窗行为与文案不变。
  - 新增 `web/src/domain/scoreInput.test.ts`，覆盖空串、空白、0、负数、NaN、Infinity、多位小数舍入与普通整数。
  - `web/package.json` 的 `test` 脚本登记新测试文件。
- **Acceptance Criteria**：
  - 评分弹窗行为不变；新增解析测试通过；`pnpm --dir web typecheck` 通过。

### TASK-003：建立快捷编辑草稿、baseline 与差分纯函数

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-002
- **Description**：新增快捷编辑的纯数据模型，负责从排行快照建立草稿与 baseline、收集改动与校验错误，并支持逐项推进已提交基线。
- **Details**：
  - 新增 `web/src/domain/quickEdit.ts`：
    - 草稿构建：按模型与维度填充字符串值；已有分值用 `formatDimension` 预填一位小数（如 `9.0`），缺失为空串；保留分值 0。
    - baseline：每格保存当前服务端值（或最近一次成功提交值）；初始与草稿值分离。
    - 差分收集：按模型 slug 字典序、维度 id 升序稳定遍历，不随表头排序变化；空值且 baseline 有值 → 删除；有效新值与 baseline 不同 → 写入；相同 → 跳过；无效输入单独归入错误。
    - 提交推进：`commit(draft, modelSlug, dimensionId, value)` 把该格 baseline 指向已提交值，后续差分不再包含它；返回已提交/未提交计数所需数据。
    - 返回结果包含改动列表、错误列表与未保存数量，供界面与保存流程直接消费。
  - 新增 `web/src/domain/quickEdit.test.ts`，覆盖预填一位小数、新增、改值、清空、未变化、无效输入、0 分、顺序稳定性，以及“提交一项后只剩余项 dirty”。
  - `web/package.json` 的 `test` 脚本登记新测试文件。
- **Acceptance Criteria**：
  - 四类改动与无效输入分类正确；未变化不产生请求；已提交项不再计入 dirty；测试可独立运行且通过；类型检查通过。

### TASK-004：扩展共享 sortRows，复用工作台排序

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：无
- **Description**：在现有共享排序函数上增加排名键与“未评分按 0/参与名称排序”的选项，工作台只加薄包装，不新建重复排序模块。
- **Details**：
  - `web/src/domain/ranking.ts`：
    - `sortRows` 增加 `rank` 键：返回 `row.rank`，缺失置底；并列按名称、slug。
    - 覆盖率取值改为 `row.coverage`（未评分是 0，不是 null）；默认仍保持“未评分置底”，排行页行为不变。
    - 增加选项（例如 `keepUnscored`）：关闭“未评分强制置底”时，模型按名称参与，覆盖率按 0 参与；其余键仍把无分/缺失行置底。
    - 增加薄包装 `sortWorkbenchRows(rows, key, dir)`：模型与覆盖率键保留未评分参与，综合分/排名/维度键置底；键类型含 `model|score|rank|coverage|dim-<id>`。
  - 工作台首次点击方向：模型 asc、排名 asc、覆盖率 asc、综合分 desc、维度 desc；初始 `coverage asc`；同一键再次点击反转。方向选择放在工作台视图层，不写死进共享比较器。
  - 在 `web/src/domain/ranking.test.ts` 增加用例：排名 asc、覆盖率升序未评分在前/降序在后、模型排序未评分按名称、维度缺失置底、并列 tie-break；保留现有“未评分置底”用例，证明排行页契约未变。
- **Acceptance Criteria**：
  - 排名首次点击从第 1 名开始；覆盖率升序未评分在前、降序在后；缺失维度/综合分恒置底；模型排序包含未评分。
  - 排行页 `sortRows` 默认行为与现有测试不变；工作台无重复比较器；测试通过；类型检查通过。

### TASK-005：工作台语义表格、常驻维度与表头排序

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-004
- **Description**：把工作台改为语义表格，复用排行页排序按钮，完成正常态维度矩阵与表头排序。
- **Details**：
  - 从 `web/src/pages/Rankings.tsx` 抽出排序按钮/箭头/权重为共享 `SortButton`；排行页保留自己的 `<th>`、`aria-sort`、URL `sort`/`dir` 与视觉；工作台使用自己的 `<th scope="col">` 包裹同一按钮。
  - `web/src/pages/Workbench.tsx` 改为 `<table>`（`<thead>/<tbody>/<th>/<td>`），列顺序：模型｜参与排行的维度（权重 > 0）｜综合分｜排名｜覆盖率（含 `n/N`）｜操作；删除独立“已评分”列。
  - 维度表头显示名称与权重；单元格用 `formatDimension`，缺失“—”；综合分/排名/覆盖率沿用现有格式。数据直接来自 `/api/rankings`，不额外请求维度接口。
  - `web/src/components/Coverage.tsx` 增加可选的已评分数/维度总数参数：分子为有分且权重 > 0 的维度数，分母为参与排行的维度数，与覆盖率同口径；排行页不传，显示不变。
  - 工作台排序状态驱动 `sortWorkbenchRows`；首次方向按 TASK-004 的契约；`<th aria-sort>` 与箭头同步；排序只重排，不 reload、不重算。
  - `web/src/pages/Workbench.module.css` 重写为表格样式：外层横向滚动、首列吸附、纸白底、固定列宽；删除现有 `.listHead/.row` 的 div 网格、`@media (max-width:980px)` 网格与 `@media (max-width:760px)` 卡片规则，不保留移动端替代布局。
  - 普通态行内“编辑评分”仍打开 `ScoreDialog`；本 Task 不加入快捷编辑。
- **Acceptance Criteria**：
  - 1440 桌面下所有参与排行的维度列可见；表格语义与 `aria-sort` 有效；桌面窗口变窄时只在表格容器内滚动，不承担移动端布局。
  - 模型/综合分/排名/覆盖率/各维度表头可排序，首次方向与契约一致；综合分、排名不因排序重算。
  - 排行页排序行为/视觉无回归；旧工作台移动端规则被删除；`pnpm --dir web typecheck` 通过。

### TASK-006：实现无框内联快捷编辑、部分保存基线与刷新

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-001、TASK-002、TASK-003、TASK-005
- **Description**：在常驻表格上加入快捷编辑；同一单元格改为无边框输入，完成冻结、逐项 baseline、差分保存与刷新。
- **Details**：
  - `web/src/pages/Workbench.tsx`：
    - 工具栏新增“快捷编辑”开关，`aria-pressed` 表示状态；仅在数据可用且存在模型、参与排行的维度、正权重时渲染。
    - 进入时用 `quickEdit` 建立草稿与 baseline；隐藏“维度设置”“新增模型”和行内“编辑评分”；表头排序仍可用。
    - 维度 `<td>` 普通态为文本，编辑态为同尺寸无边框 `input`；预填一位小数，空值占位；无新增行、无重复标签、不改变行高；`aria-label` 含模型与维度。
    - 输入接受有限、非负任意精度；保存时四舍五入到一位（8.75 → 8.8），不拒绝多位小数。焦点/改动用背景与 2px 下划线；无效输入用信号红文字/下划线/浅底，`aria-invalid`；不在单元格周围画框。
    - 编辑不触发 reload，不计算综合分、名次、覆盖率预览，不重排；综合分、排名、覆盖率降低视觉权重。表头点击排序时只重排视图，草稿按 slug 保留。
    - 固定操作条显示有效改动数量、“保存后刷新排行”、第一处错误与取消/保存；模式内增加底部留白；保存中禁用输入与操作。
    - 保存按模型 slug 字典序、维度 id 升序串行提交，不随视图排序；写值调用不带 `note` 的 PUT，清空 DELETE，未变化不请求。
    - 每成功一项调用 `commit` 推进该格 baseline 并从 dirty 移除；失败即停止，剩余项保留 dirty。部分失败显示“已保存 n 项 / 剩余 m 项未提交（其中 1 项失败）”，可再次保存补齐；派生值继续冻结。
    - 全部成功：提示、退出、`reload()` 与 `session.refresh()`，按当前排序重排。部分成功后取消/离开：确认只针对剩余未提交项；退出后 reload/session 对齐，已提交项在普通态可见，未提交项不落库。
    - 取消或再次点击开关时，有未提交改动或错误先用确认对话框确认放弃；若已提交过部分项，文案明确“已保存 n 项，放弃剩余 m 项”。
  - `web/src/pages/Workbench.module.css`：表格单元格无边框输入、冻结态、固定条、横向滚动与吸附列；不引入阴影、渐变、圆角或移动端布局。
  - `web/src/api/client.ts`：`putScore` 的备注参数改为可选，未提供时请求体不带 `note`；评分弹窗继续传备注。
  - 生产复用现有 Button、Confirm、Toast 与真实接口，不复制 Demo 的内存保存或行内入口捷径。
- **Acceptance Criteria**：
  - 编辑态无新增行/无边框输入，行高与普通态一致；所有参与排行的维度可见、可改。
  - 综合分、名次、覆盖率与行顺序在编辑期间不变（显式表头排序除外）；保存成功后刷新并按当前排序重排。
  - 空值删除、改值写入、未变化不请求；无效输入阻止保存；备注在快捷编辑改值后保留。
  - 部分失败后已提交项不再计入 dirty；取消只放弃剩余项；退出后已提交项保留、未提交项不落库；固定条不遮挡最后一行；1440 桌面无页面级横向溢出。

- **复审补记（2026-10-22，v9）**：TASK-006 原验收中的“保存中禁用输入与操作”未覆盖模式开关与导航；该缺口由 [`../10-22-v9/Tasks.md`](../10-22-v9/Tasks.md) 的 TASK-003 修复。此处“操作”限定为底部操作条与模式开关；表头排序为只读视图操作，不纳入禁用。

### TASK-007：补齐未保存防护与焦点恢复

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1；依赖：TASK-006
- **Description**：在有未提交改动时拦截站内跳转与浏览器离开，并在退出或保存后恢复焦点。
- **Details**：
  - `web/src/pages/Workbench.tsx`：
    - 未提交改动或错误非空且处于编辑模式时使用路由 blocker；确认后执行跳转，取消则留在当前页，避免与退出确认重复弹窗。
    - 同一条件下注册 `beforeunload`，保存成功或退出后移除。
    - 退出确认、跳转确认与取消确认复用现有确认对话框与统一文案；已有部分提交时文案只提剩余未提交项。
    - 退出或保存成功后，把焦点还给“快捷编辑”开关；无改动退出不触发确认。
  - 不改变评分弹窗自身的离开拦截。
- **Acceptance Criteria**：
  - 有未提交改动时站内跳转、刷新或关闭页面会提示；无改动或保存成功后不提示。
  - 确认离开后不残留草稿；取消后仍停留在编辑模式与当前草稿。
  - 退出与保存后键盘焦点回到模式开关；无重复确认弹窗。

### TASK-008：新增零种子 display_settings 表与存储

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：无
- **Description**：新增单例 display_settings 迁移与 store 读写，遵守零种子约定，并明确缺行读取语义。
- **Details**：
  - 新增 `migrations/003_display_settings.sql`：单例表 `display_settings(id INTEGER PRIMARY KEY CHECK (id = 1), score_percentage_mode INTEGER NOT NULL DEFAULT 0 CHECK (score_percentage_mode IN (0,1)))`；**只建表，不插入默认行**。
  - 新增 `internal/store/display.go`：
    - `DisplaySettings(ctx) (bool, error)`：查询单例行；`sql.ErrNoRows` 视为默认 `false`，不是错误；其他读错误照常返回。
    - `UpdateDisplaySettings(ctx, enabled bool) error`：使用 upsert（`INSERT ... ON CONFLICT(id) DO UPDATE`），首次写入时创建单例行，不依赖迁移 seed。
  - 新增 store 测试：空表读取 false、首次更新插入、开启后重读、关闭、重复更新、数据库重开后仍在。
  - 迁移嵌入沿用现有 `migrations/embed.go`；不新增依赖。
- **Acceptance Criteria**：
  - 新库迁移后表为空且读取 false；首次更新后读回一致；缺行不是错误；旧库迁移可执行；`go test ./...` 通过。

### TASK-009：新增 display-settings HTTP 接口

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-008
- **Description**：提供公共读取与管理员整对象写入的站点百分比设置接口。
- **Details**：
  - `internal/api/handlers_display.go`：响应 `{ "scorePercentageMode": boolean }`；GET 公共，PUT 经 `s.admin`；PUT 输入用 `*bool`，缺失字段返回 422 字段错误，未知字段/非法 JSON 返回 400。
  - `internal/api/server.go`：注册 `GET /api/display-settings` 与 `PUT /api/display-settings`；路由顺序不影响现有。
  - GET/PUT 设置 `Cache-Control: no-store`；store 错误走现有 `internalError`。
  - API 测试：匿名 GET 默认关闭、200、no-store；匿名 PUT 401；管理员 PUT true 后匿名 GET 为 true；PUT 缺失字段 422；未知字段 400；跨站 PUT 403（沿用现有 origin 测试方式）。
- **Acceptance Criteria**：
  - 公共读、管理员写、匿名不可写；缺行时 GET 默认 false；响应/错误语义稳定；`go test ./...`、`go vet ./...` 通过。

### TASK-010：前端接入站点百分比并保留本地维度强调

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-009
- **Description**：把百分比从 localStorage 改为服务端站点设置；维度强调继续按浏览器保存，并在设置页标注作用域。
- **Details**：
  - `web/src/api/types.ts` 增加 `DisplaySettings { scorePercentageMode: boolean }`；`web/src/api/client.ts` 增加 `displaySettings(signal?)` 与 `updateDisplaySettings(input)`。
  - `web/src/preferences/DisplayPreferences.tsx`：挂载时 GET 站点设置；百分比 setter 乐观更新 → PUT → 失败回滚并 `toast(errorMessage(...), "error")`；暴露 `loading`/`saving`；GET 失败保留默认（实际分）不阻断页面。
  - `web/src/preferences/preferenceStorage.ts`：删除百分比键、读取/写入函数；保留维度强调键、读写与 `browserStorage`；Provider 只从本地读取/写入强调。
  - `web/src/preferences/preferenceStorage.test.ts`：删除百分比用例，保留强调的默认、往返、异常回退与键名断言。
  - `web/src/pages/Settings.tsx`：显示面板 meta 改为“显示偏好”；百分比行标“所有设备”，强调行标“当前浏览器”；百分比开关在 `loading || saving` 时禁用；百分比 onChange 用 `void setScorePercentageMode(...)`；强调保持同步本地写入。
  - 排行、详情、对比与 `DimensionScore` 继续消费同一 Provider，不改调用点；工作台与评分弹窗不使用百分比模式。
  - 不迁移旧浏览器百分比键；升级后站点默认关闭，需要在设置页重新开启一次；强调键不受影响。
- **Acceptance Criteria**：
  - 管理员在一台浏览器开启百分比后，另一隔离浏览器刷新可见；匿名可读；无 localStorage 百分比依赖。
  - 写入失败回滚并提示；加载/保存期间百分比开关禁用；维度强调仍只影响当前浏览器。
  - 设置页作用域标注准确；`pnpm --dir web test`、`pnpm --dir web typecheck` 通过。

### TASK-011：自动化验证、桌面浏览器验收与文档同步

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-006、TASK-007、TASK-010
- **Description**：验证快捷编辑与站点百分比全链路，并把新增契约、作用域与交互同步到项目事实来源，改写被推翻的旧决策。
- **Details**：
  - 运行 `go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`、`pnpm --dir web typecheck`、`pnpm --dir web build`。
  - 使用临时数据库准备多模型、多维度数据：包含已有备注、未评分、0 分、并列分与长维度名。
  - 工作台桌面验收（1440，不包含移动端布局/断点）：语义 table 与 `aria-sort`；正常态维度完整；表头各键排序与方向（排名 asc、覆盖率未评分 0、缺失置底）；编辑态无新增行/无边框、行高不变；编辑中排序草稿保留；综合分/名次/覆盖率冻结；保存后刷新并按当前排序重排；空值删除；无效输入阻止；备注保留；取消/站内跳转/刷新提示；保存失败与重试；无脚本错误。
  - 部分保存验收：模拟第 1 项成功、第 2 项失败（断网/停服务）；确认已成功项从 dirty 移除，取消只放弃剩余项；刷新后已成功项保留、失败项未落库。
  - 百分比双浏览器验收：管理员在浏览器 A 开启；浏览器 B（隔离上下文/清空存储）刷新看到百分比；匿名 GET 可读、匿名 PUT 401；维度强调在 A/B 可不同；设置页作用域标注；旧百分比 localStorage 键不再影响显示。
  - 对照 `temp/quick-edit-mode.html` 检查矩阵密度、无框输入、冻结态与保存条；Demo 的 div 网格、内存保存、行内入口捷径与静态统计不作为语义表格、接口、持久化或刷新逻辑的验收依据。
  - 逐项改写 `.docs/Project.md` 的旧决策，而不是只在末尾追加新段落：
    - “当前增量”中的“显示偏好只存当前浏览器”改为百分比站点级、维度强调本地、工作台快捷编辑。
    - “数据模型”补 `display_settings`；API 面补 `GET/PUT /api/display-settings`。
    - “信息架构”中的“评分只通过共享评分弹窗”改为“单条评分弹窗 + 工作台快捷编辑”，并补工作台矩阵/排序。
    - “显示偏好”“显示交互”改为百分比站点级、维度强调本地；删除百分比 localStorage 键描述，保留强调键。
    - “约束与决策”中的“显示偏好不用服务端”改写为站点百分比例外；补零种子单例表、缺行读 false、部分保存 baseline、语义表格决策。
    - 评分 PUT 备注可省略、快捷编辑不改备注的语义同步到评分相关段落。
  - 清理临时数据库、服务进程与构建产物。
- **Acceptance Criteria**：
  - 全部自动化命令通过，并在 Tasks 末尾记录实际结果与测试数量。
  - 工作台 1440 桌面验收、部分保存验收与百分比双浏览器验收结论可复核；不包含移动端验收。
  - Project.md 与实际实现一致，上述旧条目已被点名改写，无并存矛盾。

### TASK-012：归档并提交

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1；依赖：TASK-011
- **Description**：标记完成、归档本轮文档并提交全部交付。
- **Details**：
  - 在 Plan.md 与 Tasks.md 标记 DONE、完成日期与回归测试结论。
  - 按当天最大序号创建归档目录（规划时为 `10-22-v8`），确认目录内 Plan.md 与 Tasks.md 成对且根目录无残留。
  - `git status`、`git diff`、`git log` 检查变更与提交风格；按主题分别提交：
    - `feat(web): 新增评分工作台快捷编辑与表头排序`
    - `fix(web): 将百分比模式改为站点级显示设置`
    归档文档随第二次提交；若变更耦合严重，允许一个覆盖两主题的提交。
  - 不提交数据库、构建产物、临时文件或密钥；`temp/` Demo 按既有 `.gitignore` 保留本机，不作为生产资源提交。
- **Acceptance Criteria**：
  - 归档成对存在，根目录无 Plan.md、Tasks.md 残留。
  - 提交成功且工作区干净；提交信息准确覆盖快捷编辑与站点百分比修复。

---

## 回归与验收结论

- **完成日期**：2026-10-22
- **自动化**：`go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server` 通过；`pnpm --dir web test` 44/44 通过，`typecheck`、`build` 通过。
- **工作台桌面验收（1440）**：临时库 6 模型 × 8 维度（含长维度名、未评分、0 分、部分覆盖与并列分）。语义表格与 `aria-sort` 有效，维度列完整；1100 宽时仅表格容器横向滚动，页面无溢出。模型/综合分/排名/覆盖率/维度排序方向正确；覆盖率升序未评分在前，综合分与缺失维度置底；编辑中排序保留草稿；编辑态无新增行，行高与普通态同为 64px；综合分/名次/覆盖率冻结；8.75 舍入为 8.8、清空删除、省略备注保留原备注；备注 `长上下文实测 128k，稳定` 在改值后仍在。
- **部分保存**：故障注入代理令第 2 个 PUT 返回 500。首次保存后显示“模拟保存失败；已保存 1 项 / 剩余 2 项未提交（其中 1 项失败）”，仅第 1 项落库；取消确认文案为“已保存 1 项，放弃剩余 2 项未提交的修改？”，退出后已保存项保留；再次保存补齐剩余两项。零提交失败（停服务）保留完整草稿与原因，可重试。
- **防护**：有未提交改动时，取消、站内跳转与 `beforeunload` 均触发确认；取消确认后保留草稿；无改动退出不提示；退出后焦点回到“快捷编辑”开关。
- **双浏览器百分比**：管理端开启后，隔离上下文匿名浏览器刷新显示分差百分比（1% / 5.7% / … / 100%），旧 `llmrank:score-percentage-mode` 本地键不再生效；匿名 GET 可读、匿名 PUT 401；关闭后另一浏览器刷新回到实际分值。维度强调保持浏览器级差异（A 关闭、B 仍显示色阶）。
- **清理**：临时数据库、验证服务、故障注入代理、Go/前端构建缓存与 `web/dist` 构建产物已删除；`web/dist/.gitkeep` 保留。
