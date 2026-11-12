# Tasks：维度组 · 榜单图片导出 · 跳过维度（Skip）

**关联 Plan**：Plan.md —— 维度组 / 导出 / 跳过维度 v1.4  
**状态**：DONE  
**完成日期**：2026-11-12  
**总计 Task**：21 个  
**执行主体**：规划段（主线），交付段按本节 Executor 标注执行  
**回归测试结论**：`go test ./...`（64 个测试函数全绿）、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`（70/70）、`pnpm --dir web typecheck`、`pnpm --dir web build` 全部通过；`internal/` 与 `web/src/` 无 coverage / provisional / 「暂定」残留。浏览器在 1440 / 768 / 390 三视口完成逐项验收：组列与维度列排序、明细抽屉、Skip 预览与保存一致、设置批量分组与部分失败回执、导出 PNG 无裁切均通过，页面级无横向溢出  
**评审约束**：工作台与榜单不做结构改动；分组是维度属性（选维度 → 起组名），无独立组实体与批量端点；榜单不出现 ★ 与组外 Skip 计数；组值为组内参与计算维度的加权平均（与综合分同一分母口径）；维度设置只做增量分组能力；界面与计算侧都不再保留 coverage/provisional；点击列头排序的行为逐项保留，组列与维度列列头结构一致；跳过中位分由服务端下发，前端只消费

---

## Phase 1：数据模型与接口层

### TASK-001：新增维度组名与跳过表迁移

- **Status**：DONE
- **Executor**：主线
- **Description**：新增 011_dimension_group_name.sql 与 012_score_skips.sql。
- **Details**：
  - ALTER TABLE dimensions ADD COLUMN group_name TEXT（可空，默认 NULL）
  - score_skips(model_id, dimension_id) 复合主键 + created_at TEXT NOT NULL，两个外键 ON DELETE CASCADE
  - 不建组实体表、不插种子数据；不改 001–010
- **Acceptance Criteria**：全新库与含 010 数据的库均迁移成功；删除模型/维度后跳过记录级联删除

### TASK-002：维度 groupName 读写与 store 契约

- **Status**：DONE
- **Executor**：主线
- **Description**：维度创建/更新接受可空 groupName，列表/bootstrap/导出返回 groupName；批量成组复用既有 PATCH。
- **Details**：
  - 名称 trim 后 1–20 字符；空串与 null 等价为不分组；超长或非法类型返回字段级 422
  - 部分更新省略该字段保持原值；显式 null 或空串清空组名（拆组）
  - 批量成组与整组重命名不新增端点：前端按维度 id 串行提交 N 次 PATCH /api/dimensions/{id}，回执「已提交 x/y，失败项可重试」
  - 组内维度顺序仍由 dimensions.position 决定；组集合只取启用、非文字、权重 > 0 的维度（见 TASK-004）
- **Acceptance Criteria**：集成测试覆盖新建入组、改名、清空拆组、超长 422、省略保持；批量路径以 N 次 PATCH 完成且部分失败可重试

### TASK-003：实现评分跳过读写接口

- **Status**：DONE
- **Executor**：主线
- **Description**：新增 PUT /api/models/{slug}/skips/{dimensionId} 与 DELETE 同路径（管理员）。
- **Details**：
  - PUT 幂等写入，DELETE 幂等删除，无需请求体
  - 守卫沿用既有评分写入（store/scores.go UpsertScore）：未知模型/维度 404，归档维度与文字维度 422，权重 0 维度允许写入（对综合分无影响）
  - 排行与详情响应的模型对象新增 skips: number[]；维度对象新增 skipMedian（金额单位：换算分百分比）与既有 effectiveBaselineMax 并列
- **Acceptance Criteria**：集成测试覆盖写入→读取→删除→再删除；文字维度被拒；归档维度被拒；权重 0 维度写入成功；未登录 401

---

## Phase 2：领域计算与契约对齐

### TASK-004：由 groupName 派生组元数据与组值（仅 TS 侧）

- **Status**：DONE
- **Executor**：主线
- **Description**：在 web/src/domain 实现按组名归并的组元数据与组值计算；Go 无渲染消费方，不实现组值。
- **Details**：
  - 组集合 = 启用、非文字、权重 > 0 的维度中 groupName 非空者按名归并；组顺序取组内最小 position；未成组维度按 position 排在其后
  - 组值 = Σ(维度权重 × 换算分) ÷ Σ(组内参与计算维度权重)；参与 = 该维度有有效分值或已跳过；组内无参与维度返回缺失
  - 组色：TS 常量 6 色（#2F6B4F / #1F5C8B / #8A5A16 / #6B4A8B / #8B3A52 / #3F6B6B），按组顺序稳定分配
  - 组不参与综合分与名次
- **Acceptance Criteria**：纯函数对夹具一致（组内缺分、组内跳过、改名后归并变化、全部未成组四种情形）；断言 Σ(列参与权重 × 列值) ÷ Σ 参与权重 = 综合分；每个组都有色且同一组稳定同色

### TASK-005：服务端计算跳过维度的 60% 中位分并接入两侧综合分

- **Status**：DONE
- **Executor**：主线
- **Description**：Go 侧按维度计算 60% 中位分并在综合分中替换跳过维度的换算分；TS 侧消费响应常量。
- **Details**：
  - Go 中位分：候选 = 快照内全部模型（含隐藏）中未跳过该维度的有效分值（有限且 ≥0），按该维度生效基准换算后升序取第 ⌊n×0.6⌋ 位，越界取末位；n=0 取 0
  - Go Compute：跳过维度的换算分替换为该中位分，仍计入综合分权重分母，不计入「已评分维度」计数；同分次序改为「综合分 → 名称 → slug」
  - API：rankings 与 model detail 的维度对象下发 skipMedian（与 effectiveBaselineMax 并列，无候选时为 null）
  - TS：composite 与 previewRanking 接收 skips 与 skipMedian 常量，不再自行实现中位分算法；previewRanking 比较器同步为「综合分 → 名称 → slug」
- **Acceptance Criteria**：go test 断言固定夹具的取位（n=1/2/5/9 → 第 0/1/3/5 位）与越界钳制；跳过改变综合分且已评分计数减一；无跳过且无缺失时与旧实现逐位一致

### TASK-006：Go/TS 契约测试同步

- **Status**：DONE
- **Executor**：Subagent: executor
- **Description**：以同一夹具补齐 internal/domain/ranking_test.go 与 web/src/domain/ranking.test.ts 的组与跳过用例。
- **Details**：夹具覆盖两组 + 未成组维度、组内跳过、全部跳过、跳过者持有该维度最高分、隐藏模型决定中位分；两侧期望值来自同一张手算表
- **Acceptance Criteria**：新增用例全绿；两侧综合分、已评分计数、排序键、组值与「列参与权重还原综合分」断言一致

---

## Phase 3：前端榜单、评分台与设置

### TASK-007：维度设置增量分组能力

- **Status**：DONE
- **Executor**：主线
- **Description**：在既有设置页维度列表上增量增加分组能力，不重构面板结构。
- **Details**：
  - 保留既有面板头（计数、显示已归档、新增维度）与行结构；列表新增「维度组」列（下拉：不分组 / 已有组名 / 新建组名…，附组色示意）
  - 行首复选框 + 选中工具条：已选维度名、分配到组、移出分组、清除选择；未选择时不执行批量写入
  - 写入复用 PATCH /api/dimensions/{id}，多选按 id 串行提交，回执「已提交 x/y，失败项可重试」；整组重命名 = 选中该组成员后分配新组名；「不分组」只影响该维度
  - 不做分段筛选、行内权重编辑与面板脚重构；权重编辑仍走既有维度弹窗
  - 文字维度与权重 0 维度不显示组控件
- **Acceptance Criteria**：多选成组、整组重命名、单维度拆组三条路径走真实接口成功；部分失败回执可见；既有拖动/键盘排序与归档行为不回归；1440/768/390 三视口无横向溢出

### TASK-008：维度弹窗增加所属分组

- **Status**：DONE
- **Executor**：主线
- **Description**：在 DimensionDialog 增加「所属分组」输入与已有组名候选。
- **Details**：
  - 原生 input + datalist 提供已有组名候选，允许输入新组名，留空不分组
  - 提交时 groupName 允许为 null；文字维度不显示该字段
- **Acceptance Criteria**：新建维度入组、编辑移出组、输入新组名三条路径持久化成功；文字维度不出现该字段

### TASK-009：榜单成组列与列头排序/明细同构

- **Status**：DONE
- **Executor**：主线
- **Description**：Rankings.tsx 把同组维度合并为一列，列值按 TASK-004 的组值计算；未成组维度列保持现状；移除覆盖率列。
- **Details**：
  - 列顺序：综合排名 / 模型 / 综合分 / 组列（按组顺序）/ 未成组维度列（按 position）/ 操作
  - 列头结构（组与维度同构）：名称按钮承担排序（组排序键 group-<组名>，取组值 2 位小数；维度排序键 dim-<id>，取原始分），下排小字为「n 项 · 权重 w」或「权重 w」，明细入口为列头右缘外侧的无边框小箭头（10px 图标、16×16 热区、绝对定位在列间隙）
  - 组列不显示 Skip 或 ★；组内跳过只影响组值数值
  - 未成组维度列的排序、权重标注、色阶与移动端隐藏策略与改动前完全一致（回归对照）
- **Acceptance Criteria**：默认列数 = 4 + 组数 + 未成组维度数 + 操作列；未成组维度列排序行为与改动前逐项一致；组值可由列参与权重还原综合分；列头名称与小字的右对齐边缘一致、列宽与箭头出现前后一致

### TASK-010：明细抽屉（组与单维度共用）

- **Status**：DONE
- **Executor**：主线
- **Description**：新增明细抽屉组件，由列头右缘小箭头触发，组与单维度共用同一组件。
- **Details**：
  - 组：标题为组名，顶部维度切换带组色标记，脚注说明组值取综合分公式的组内部分；单维度：标题为维度名，只展示该维度名次
  - 下方为该维度名次 / 模型 / 相对条 / 分值；跳过行以弱色 Skip 标注并排在末尾
  - 打开后焦点进入抽屉，Esc 与关闭按钮关闭并把焦点还给触发按钮；Layer 3 遮罩 + 1px 描边
  - 不改动榜单表格结构与排序状态
- **Acceptance Criteria**：组与单维度入口行为一致；切换维度即时更新；键盘可关闭；窄视口抽屉占满宽度且不横向溢出

### TASK-011：Skip 展示（榜单 / 详情 / 对比）与详情对比清理

- **Status**：DONE
- **Executor**：主线
- **Description**：跳过维度在这三处统一显示弱色文本 Skip；同时移除详情页与对比页的覆盖率与「暂定」。
- **Details**：
  - 不显示数值、不显示 ★；文本使用 --ink-3 与等宽小字号，不引入底色
  - 详情与对比的维度表在脚注说明 Skip 口径；无量值时同样显示 Skip
  - 删除 ModelDetail.tsx、Compare.tsx 的覆盖率行、覆盖率对比与「暂定」标记，以及其引用的格式化函数
- **Acceptance Criteria**：三处均显示 Skip 且不出现 ★ 或数值；取消跳过后恢复常规样式；详情与对比不再出现覆盖率与「暂定」

### TASK-012：评分弹窗未评分置顶、组色框与 Skip 切换

- **Status**：DONE
- **Executor**：主线
- **Description**：ScoreDialog 内未评分维度组上移，组内维度用组色左框线标出，并新增 Skip 切换与实时预览。
- **Details**：
  - 排序：含未评分且未跳过维度的组整体上移，组内未评分维度在前并带「未评分」标记
  - 组头：组色圆点 + 组名 + 「组内权重占比 x%」；组内每个维度行左框线为该组色，行内仍是独立数值输入与独立 Skip 按钮
  - Skip 按钮 aria-pressed 表达状态；选中后数值输入位替换为「Skip · 60% 中位分」，取消后恢复原值
  - 保存：跳过与分值删除分别差分提交（PUT/DELETE skips、DELETE scores）；失败保留草稿并说明已提交数量
  - 预览使用响应下发的 skipMedian 与 effectiveBaselineMax 常量，不新增前端中位分算法
- **Acceptance Criteria**：同一组内所有维度行左框线同色、不同组不同色；同一快照常量下标记/取消跳过的预览综合分与名次与保存后服务端一致；未评分维度出现在弹窗顶部

### TASK-013：工作台排序口径与 Skip 单元格（最小改动）

- **Status**：DONE
- **Executor**：主线
- **Description**：工作台调整默认排序与「已评分」列，渲染 Skip 单元格，不做布局改动。
- **Details**：
  - 默认排序键由覆盖率升序改为「已评分」计数升序；综合分为空的行在任何排序方向下置于可见行之前（未评分置顶）；隐藏模型仍排在可见行之后；分列排序与方向切换保留
  - 原覆盖率进度条位置显示「已评分 x / 维度数」文本计数（无进度条、无「暂定」标记）
  - 分值单元格对跳过维度渲染弱色 Skip；快捷编辑输入 Skip（不区分大小写）映射为跳过接口、不计入数值评分；quickEdit.ts 的值模型（区分数值与跳过）与 scoreInput.ts 的解析及两者测试同步扩展
- **Acceptance Criteria**：工作台列数与布局与改动前一致；综合分为空的行位于首行且在任何排序方向下仍置顶；界面无覆盖率与「暂定」；快捷编辑的数值路径与跳过路径均可保存且不回归

---

## Phase 4：导出榜单图片

### TASK-014：画布导出模块

- **Status**：DONE
- **Executor**：主线（与 TASK-009 并行时 Subagent: executor）
- **Description**：新增 web/src/lib/exportImage.ts，从已加载排行数据绘制榜单 PNG。
- **Details**：
  - 输入 Rankings + 组元数据；2x 像素密度；绘制标题、统计口径、列头、全部模型行；列集合为全部启用列（组列 + 未成组维度列），不随视口隐藏列变化
  - 列集合、坐标与宽度由纯函数计算，另附最小断言；组值带组色标记；跳过单元格绘制为 Skip
  - 颜色字体取自设计令牌常量；无外部依赖
- **Acceptance Criteria**：导出图含全部行与全部启用列；1200/1440 宽度无裁切；布局纯函数的断言通过；happy path 与失败路径均有反馈

### TASK-015：榜单导出入口

- **Status**：DONE
- **Executor**：主线
- **Description**：榜单 billHead 增加小尺寸导出按钮并接通导出模块。
- **Details**：复用 Button compact 变体 + Icon name="download"，文案「导出图片」，aria-label 完整；导出中禁用并显示进行中状态；成功/失败走既有 toast
- **Acceptance Criteria**：点击一次得到可打开的 PNG；导出不改变排序、对比选择与滚动位置

---

## Phase 5：验证与文档

### TASK-016：回归测试与构建基线

- **Status**：DONE
- **Executor**：主线
- **Description**：跑通验证基线并记录结论。
- **Details**：go test ./...、go vet ./...、CGO_ENABLED=0 go build ./cmd/server、pnpm --dir web test、pnpm --dir web typecheck、pnpm --dir web build；另检查 internal/ 与 web/src/ 中无 coverage/provisional 残留
- **Acceptance Criteria**：全部命令退出码 0；残留引用为 0；失败项修复后重跑，未验证结论不入文档

### TASK-017：浏览器验收

- **Status**：DONE
- **Executor**：主线
- **Description**：按 Demo 覆盖的交互在 1440/768/390 三视口逐项验收。
- **Details**：
  - 设置：多选成组/拆组/整组重命名、部分失败回执、拖动与键盘排序、归档不回归
  - 榜单：组列与维度列均可列头排序、各自明细抽屉可打开、无覆盖率列、未成组维度列排序与改动前一致
  - 评分：弹窗未评分置顶、组色框一致、Skip 预览与保存一致；工作台未评分首行且任意排序下置顶、已评分计数与 Skip 单元格
  - 详情与对比：无覆盖率与「暂定」，跳过单元格为 Skip
  - 导出：导出图片无裁切、含全部启用列、跳过单元格为 Skip
- **Acceptance Criteria**：每项给出通过/偏差结论与视口；偏差回填修正或记入已知限制

### TASK-018：Project.md 同步

- **Status**：DONE
- **Executor**：Subagent: executor
- **Description**：更新 .docs/Project.md 的数据模型（group_name、score_skips）、API、评分排名口径、前端页面结构、显示口径与已知限制。
- **Details**：新增段落：维度组名（同名即组、仅作展示、组值为参与权重加权平均、组列可排序、组集合排除文字与权重 0 维度）、跳过维度（服务端 60% 中位分并随响应下发、仍计入权重分母、Skip 展示）、导出图片、设置面板的增量分组、列头排序与明细按钮的交互约定；删除覆盖率与「暂定」的全部表述；回填本轮验证结论
- **Acceptance Criteria**：Project.md 与代码库一致；不遗留过期描述（独立组实体、批量端点、组内 Skip 计数、覆盖率与「暂定」）

### TASK-019：归档

- **Status**：DONE
- **Executor**：主线
- **Description**：按 Archive 流程把 Plan.md 与 Tasks.md 移入 .docs/11-12-v1/。
- **Details**：归档前确认两份文件已标注完成与回归测试结论
- **Acceptance Criteria**：归档目录同时含 Plan.md 与 Tasks.md；根目录无残留

### TASK-020：Git 提交

- **Status**：DONE
- **Executor**：主线
- **Description**：按 Conventional Commits（英文类型 + 中文描述）提交本轮变更。
- **Details**：分组提交：数据与接口、领域与前端、导出与文档；不提交密钥、数据库与构建产物
- **Acceptance Criteria**：git status 干净；提交信息符合项目规范

---

## 跨阶段清理

### TASK-021：删除 coverage / provisional 全链路

- **Status**：DONE
- **Executor**：主线（与 TASK-005 同期，Phase 3 收尾）
- **Description**：删除两侧域层、API 响应、类型、组件与测试中的覆盖率与「暂定」。
- **Details**：
  - Go：Row.Coverage / Row.Provisional、ProvisionalThreshold、rankingsResponse 与 modelDetailResponse 的 coverage/provisional 字段、sortRows 的覆盖率比较分支及相关测试断言
  - TS：RankRow / Composite / Preview 的对应字段、truncatePercent / formatPercent、rowValue 与比较器的覆盖率分支、web/src/api/types.ts 字段
  - UI：删除 Coverage.tsx 与 ui.module.css 的覆盖率样式；榜单、工作台、评分弹窗、详情、对比移除列、进度条与「暂定」标记
  - 导出模块不绘制覆盖率列
- **Acceptance Criteria**：internal/ 与 web/src/ 中无 coverage / provisional 残留（含注释与测试）；TASK-016 基线全绿
