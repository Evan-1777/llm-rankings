# Tasks：详情显示口径修正与评审遗留收口

**关联 Plan**：`Plan.md` —— 详情显示口径修正与评审遗留收口 v1.0  
**状态**：DONE  
**日期**：2026-10-22  
**总计 Task**：8 个，均由主线执行

---

### TASK-001：百分比模式相对条与“差距”列同口径

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：无
- **Description**：详情页开启百分比模式时，相对条宽度改用 `gapPercentile` 的分差百分比，使最低分 100% 填满、最高分 1% 近零；实际分值模式保持按最高分归一。
- **Details**：
  - `web/src/pages/ModelDetail.tsx`：从 `../lib/scoreEmphasis` 引入 `gapPercentile`；在维度行内计算该维度 range 与 gap；`barFill` 宽度按 `scorePercentageMode ? gap ?? 0 : barWidth(dimension.value, max)` 输出。
  - 同一文件：百分比模式的说明文字补“相对条同比例”，实际分值模式文案不变。
  - 不改 `barWidth`、`dimensionMax`、`gapPercentile` 的既有实现与导出；不改移动端隐藏相对条的规则。
- **Acceptance Criteria**：
  - 末位（gap 100%）相对条为满格；最高分（gap 1%）为 1% 宽度；中间值宽度与显示的百分比一致（允许亚像素差）。
  - 关闭百分比模式后，相对条仍按 `value / max` 填充，最高分满格。
  - 未评分维度零宽；全 0 维度不出现满格。
  - `pnpm --dir web typecheck` 通过；浏览器无脚本错误。

### TASK-002：分值下划线跟随文字宽度

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：无
- **Description**：把 `DimensionScore` 色块底部的 2px 内嵌下划线从“整块内边距宽度”改为“分值文字宽度”，消除横线左右各超出数字约 9px 的错位。
- **Details**：
  - `web/src/components/DimensionScore.module.css`：删除 `.tone` 的 `box-shadow`；改为 `text-decoration: underline`、`text-decoration-color: var(--tone-rule)`、`text-decoration-thickness: 2px`、`text-underline-offset: 4px`、`text-decoration-skip-ink: none`。
  - 保留色块背景、`min-width`、文字墨色与两端色阶；`forced-colors` 与 `print` 增加 `text-decoration: none !important`。
  - 不新增 DOM 节点，不改 `DimensionScore.tsx` 的取值或百分比逻辑。
- **Acceptance Criteria**：
  - 下划线起止与分值文字（含 `%`）对齐，不覆盖左右内边距。
  - 低分暖红、高分冷蓝、中点无色块的既有色阶不变；forced-colors/打印下无下划线。
  - 99%、100%、0.0 等不同长度分值下划线均不超出色块。
  - `pnpm --dir web typecheck` 通过；浏览器对比截图可复核。

### TASK-003：收口工作台保存态与退出语义

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：无
- **Description**：删除“完成编辑”的提交歧义；保存中禁用模式开关；保存态离开确认说明请求继续；组件卸载后不再 toast 或回写状态。
- **Details**：
  - `web/src/pages/Workbench.tsx`：
    - 开关文案固定为“快捷编辑”，继续用 `aria-pressed={editing}` 表示状态；删除 `editing ? "完成编辑" : "快捷编辑"`。
    - 开关增加 `disabled={saving}`；`requestExit` 保存中直接返回的既有守卫保留。
    - 离开确认：`saving` 为真时 body 改为“正在保存评分。已发出的请求仍会继续，剩余项不会再提交。”，确认按钮改为“仍要离开”；非保存态保持现有放弃文案；`useEffect` 依赖加入 `saving`。
    - 新增 `aliveRef`（挂载置 true，卸载置 false）；保存成功分支在 `toast`/`leaveEditing`/`refreshAll` 前检查，失败分支在 `setBaseline`/`setSavedCount`/`setSaveError` 前检查；请求循环不中止。
  - 不修改 `beforeunload` 的注册条件（仍由 `dirty` 驱动）；不修改保存顺序、差分、baseline 推进、失败文案。
  - 在途请求不中止；卸载后循环在下一项前停止，剩余项不再提交，与确认文案一致。
- **Acceptance Criteria**：
  - 编辑态开关文案始终为“快捷编辑”，按下态可见；点击后仍先确认再退出。
  - 保存中开关不可点击；保存中点击模型链接/页头导航，确认框说明“已发出的请求仍会继续”，取消后留在原页、保存继续。
  - 确认离开后，在途请求完成、剩余项不再提交，新页面不出现“评分已保存”toast；返回工作台后已提交项可见。
  - 普通未保存退出仍显示“有 n 项修改尚未提交，放弃后不会保存。”与“放弃并退出”。
  - `pnpm --dir web typecheck` 通过。

### TASK-004：合并评分 UPSERT 为单条语句

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1；依赖：无
- **Description**：消除 `UpsertScore` 为 note 两种语义复制的两条 INSERT，改为单条语句以可空参数绑定 note 两次。
- **Details**：
  - `internal/store/scores.go`：删除 `query`/`args` 的双分支；使用
    `INSERT INTO scores (...) VALUES (?, ?, ?, COALESCE(?, ''), ?) ON CONFLICT(model_id, dimension_id) DO UPDATE SET value = excluded.value, note = COALESCE(?, scores.note), updated_at = excluded.updated_at RETURNING note`。
  - `note` 为 `*string`：非 nil 传字符串，nil 传 nil（SQL NULL）；参数顺序 `modelID, dimensionID, value, noteArg, now, noteArg`。
  - 保留前置的模型/维度/归档校验、四舍五入、外键错误映射与返回值结构。
- **Acceptance Criteria**：
  - 省略 note 改值后备注保留；显式空串清空；新记录备注为空。
  - `go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server` 通过。
  - 文件内只剩一条 INSERT 语句。

### TASK-005：收口“未评分参与排序”的键判定

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1；依赖：无
- **Description**：把工作台包装里的重复键判定删除，只由 `sortRows` 按键收敛 `keepUnscored`。
- **Details**：
  - `web/src/domain/ranking.ts`：`sortWorkbenchRows` 改为 `return sortRows(rows, key, dir, { keepUnscored: true });`；`sortRows` 内部保留 `options.keepUnscored === true && (key === "model" || key === "coverage")` 单一判定。
  - 更新 `SortOptions` 与包装函数注释，说明跳过键会被 `sortRows` 忽略，不再承诺调用方负责筛选。
  - 不改比较器、方向、并列规则与排行页默认行为。
- **Acceptance Criteria**：
  - `sortWorkbenchRows` 对 model/coverage 保留未评分，对 score/rank/dim-* 仍置底。
  - 新增第三个可参与键时只需改 `sortRows` 一处。
  - `pnpm --dir web test`、`pnpm --dir web typecheck` 通过。

### TASK-006：同步 Project.md、v8 复审补记与任务记录

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1；依赖：TASK-001、TASK-002、TASK-003、TASK-004、TASK-005
- **Description**：把本轮的口径、保存态范围、移动端规则与验收结果写回单一事实来源，并在 v8 Tasks 的 TASK-006 下补一条带日期的复审说明。
- **Details**：
  - `.docs/Project.md`：
    - “当前增量”补本轮两项显示修正与评审收口。
    - “视觉”移动端表格规则限定到排行/详情/对比；工作台明确桌面矩阵、仅容器横向滚动。
    - “维度色阶”的 2px 下划线改为“跟随分值文字宽度”。
    - “工作台快捷编辑”补：开关文案固定、保存中禁用开关与操作条、保存态离开文案、卸载后不回写；明确表头排序为只读视图操作。
    - “约束与决策”改写“详情相对条按实际最高分归一”为双口径；补“保存中禁用范围”与“下划线跟随文字”；移动端决策限定范围。
    - “测试与验收”追加本轮自动化与浏览器结果。
  - `.docs/10-22-v8/Tasks.md`：TASK-006 下补“2026-10-22 复审补记”，说明开关禁用/离开文案/卸载提示由本轮修复，`操作` 口径限定为底部操作条与模式开关；不修改原 Status 与历史验收文字。
  - 不新增长期文档；根目录 Plan.md/Tasks.md 在归档阶段移入 `.docs/10-22-v9/`。
- **Acceptance Criteria**：
  - Project.md 中移动端表格规则不再覆盖工作台；相对条、下划线、保存态描述与实现一致。
  - v8 Tasks 的补记日期、范围与链接准确，不改写历史结论。
  - 无残留的“完成编辑”或“相对条恒按最高分归一”表述。

### TASK-007：自动化与浏览器验收

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-001、TASK-002、TASK-003、TASK-004、TASK-005
- **Description**：运行全部自动化命令，并用临时库在浏览器验收详情条、下划线与工作台保存态。
- **Details**：
  - 命令：`go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`、`pnpm --dir web typecheck`、`pnpm --dir web build`。
  - 详情验收（1440/1878 桌面）：百分比模式 100% 行满格、1% 行近零、中间行与显示百分比一致；关闭百分比后最高分满格；下划线不超出文字；390px 仍隐藏相对条、无页面横向溢出。
  - 工作台验收：进入编辑改一格；用 CDP 延迟/暂停评分 PUT，点击保存，确认开关 `disabled`、点击模型链接出现保存态文案；取消后保存继续；确认离开后新页面无保存 toast；普通未保存退出文案不变。
  - 备注回归：带备注评分 → 快捷编辑改值 → 详情备注仍在；API 直接验证省略 note 保留、空串清空。
  - 记录实际命令结果、测试数量、视口与临时库数据规模；清理临时数据库、服务进程与构建产物。
- **Acceptance Criteria**：
  - 全部命令通过；失败则修复后重跑，不进入归档。
  - 浏览器验收结论逐项可复核，包含百分比条、下划线、保存态开关/离开/无 toast、备注保留。
  - `web/dist`、临时库、Cookie 与后台进程清理完毕。

### TASK-008：归档 10-22-v9 并按主题提交

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1；依赖：TASK-006、TASK-007
- **Description**：标记完成、归档本轮文档，按主题提交代码与文档。
- **Details**：
  - Plan.md/Tasks.md 标记 DONE，补完成日期与回归结论；.docs/10-22-v9/ 成对归档，根目录无残留。
  - `git status`、`git diff`、`git log` 检查；提交建议：
    - `fix(web): 修正详情相对条与分值下划线的显示口径`
    - `fix(web): 收口工作台保存期间的退出语义`
    - `refactor: 合并评分 upsert 并收口排序键判定`
    - 归档文档与 Project.md 的对应章节随各主题提交；若耦合严重可合并，但一个提交只覆盖一个主题。
  - 不提交数据库、构建产物、临时截图、Cookie 或密钥。
- **Acceptance Criteria**：
  - 归档目录同时含 Plan.md 与 Tasks.md，根目录无残留；工作区干净。
  - 提交信息为中文描述 + 英文 Conventional Commits 类型；无 `--no-verify`、`--amend` 或破坏性操作。
  - 最后一次提交后 `git status --short` 为空。

---

## 回归与验收结论

- **完成日期**：2026-10-22
- **自动化**：`go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server` 通过；`pnpm --dir web test` 44/44 通过，`typecheck`、`build` 通过。
- **详情验收**：1436 / 390 视口，临时库 13 模型 × 8 维度。百分比模式末位 100% 满格、最高分 1% 为 1%、70.7% 与 81.7% 行条宽与数字一致；关闭百分比后按最高分归一；下划线跟随分值文字，forced-colors 与打印移除；390px 隐藏相对条，页面无横向溢出。
- **工作台验收**（CDP 暂停评分 PUT）：保存中模式开关 `disabled` 且文案仍为“快捷编辑”；保存态离开确认显示“已发出的请求会完成，剩余项不再提交。”；取消后保存继续并出现成功提示；确认离开后首个请求完成、第二个请求未发出、新页面无“评分已保存”toast；普通未保存退出仍显示“有 1 项修改尚未提交，放弃后不会保存。”。
- **备注回归**：省略 note 保留、显式空串清空、新记录为空由 store/API 回归覆盖。
- **清理**：临时数据库、服务进程、CDP 脚本、截图与 `web/dist` 构建产物已删除；`web/dist/.gitkeep` 保留。
