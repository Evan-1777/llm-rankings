# Tasks：分差百分比模式与维度强调色重构

**关联 Plan**：`Plan.md` —— 分差百分比模式与维度强调色重构 v1.0  
**状态**：DONE（2026-10-22）  
**日期**：2026-10-22  
**总计 Task**：10 个，均由主线执行

---

## Phase 1：显示契约与偏好

### TASK-001：重构评分显示纯函数并补齐测试

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：无
- **Description**：把评分范围、色阶与分差百分比合并到一个显示纯函数模块，删除旧墨色透明度实现。
- **Details**：
  - 保留 `web/src/lib/scoreEmphasis.ts` 与 `scoreEmphasis.test.ts` 文件名，不更新 `web/package.json` 测试白名单；只新增函数，避免跨文件改名扰动。
  - 保留并复用 `ScoreRange`、`ScoreRow`；新增通用 `scoreRange(values)`，仅接受有限且不小于 0 的分数，至少两个不同值才返回范围。
  - `dimensionScoreRanges` 改为调用 `scoreRange`，保持按维度 ID 输出与输入不变。
  - 新增 `gapPercentile(value, range)`：以 `1 + 99 × (max − value) / (max − min)` 直接计算，最高分 1、最低分 100；输入已限定有限非负，不额外缩放或提前返回；值域外夹到 1–100；无范围、缺失、负数、非有限值或零分差返回 `null`。
  - 新增 `formatGapPercentile(value, range)`：一位小数，整数不显示 `.0`；非极值舍入后不得等于 1 或 100（例如 1.04 显示 1.1%，99.96 显示 99.9%）；真实极值显示 1%/100%；无百分比、单值或零分差统一显示“—”，不新增第三个符号。
  - 用 `scoreEmphasisTone(value, range)` 替换 `scoreEmphasisAlpha` 与透明度常量：返回 `{ direction: "low" | "high", strength: 0..1 }` 或 `null`；中点容差内返回 `null`，其余 strength 使用 `0.18 + 0.82 × 距中点比例`，使中间值保留可辨底色；最低/最高端 strength 为 1；方向按实际得分位置而非百分比数字。
  - 更新测试：线性中间值、并列、零分差、单值、负值/非有限值、`Number.MAX_VALUE`、端点舍入保护、色阶方向/强度、维度重排不影响结果。
- **Acceptance Criteria**：`pnpm --dir web test` 通过；测试能证明 1 分差与 3 分差得到不同百分比、最高分恒为 1%、最低分恒为 100%；旧的 `scoreEmphasisAlpha` 与透明度常量全部移除；文件名与测试白名单保持不变；`typecheck` 通过。

### TASK-002：新增百分比模式偏好与存储测试

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-001
- **Description**：沿用现有浏览器显示偏好，增加独立、默认关闭的百分比模式。
- **Details**：
  - `web/src/preferences/preferenceStorage.ts`：新增键 `llmrank:score-percentage-mode`；`readScorePercentageMode` 只认字面量 `"true"`，其余（含缺失、异常、空存储）返回 `false`；`writeScorePercentageMode` 写入 `"true"/"false"`，异常返回 `false`。
  - `web/src/preferences/DisplayPreferences.tsx`：上下文新增 `scorePercentageMode: boolean` 与 `setScorePercentageMode`；写入失败沿用“显示设置仅在本次会话生效”toast，状态仍立即生效。
  - 不合并两个偏好的存储键；关闭百分比模式不得影响强调开关，反之亦然。
  - `web/src/preferences/preferenceStorage.test.ts`：覆盖默认关闭、`"true"`/`"false"`、空白/非法值、读写异常、null storage，以及两个键互不干扰。
- **Acceptance Criteria**：测试通过；刷新后百分比模式保持；非法值回退关闭；存储写入失败仍切换当前页面并提示；既有强调偏好行为不变。

### TASK-003：设置页加入双开关与图例

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-002
- **Description**：在设置“显示”分区并列呈现百分比模式与维度得分强调，并提供方向图例。
- **Details**：
  - `web/src/pages/Settings.tsx`：读取 `scorePercentageMode` 与 setter；在既有强调开关上方新增“百分比模式”checkbox 行，原生 checkbox 保证 Space 与键盘可用；状态文案继续用“开启/关闭”。
  - 每个偏好行改为“标签 + 辅助说明 + 开关”的布局：百分比模式说明为“1% = 最高分 · 100% = 最低分”；强调说明为两个色块加“低分红 → 高分蓝”。辅助说明是数据图例，不添加上手引导或功能自述。
  - `web/src/pages/Settings.module.css`：新增 `.preferenceCopy`、`.preferenceHint`、`.legendSwatch` 等样式；沿用 10px 等宽字、墨黑/次要色与 0 圆角；760px 下允许换行，不挤压开关。
  - 不改变设置页 Tab、数据、模型或维度区域。
- **Acceptance Criteria**：1440 与 390 下两个开关均可点击、Tab 聚焦与 Space 切换；图例颜色与表格实际色阶一致；切换立即影响当前浏览器会话；`typecheck` 通过。

---

## Phase 2：只读界面接入

### TASK-004：维度分组件支持百分比与红蓝色阶

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-001、TASK-002
- **Description**：让共享维度分单元格同时承载实际分/百分比格式与新色阶，不改变三个页面的调用方式。
- **Details**：
  - `web/src/components/DimensionScore.tsx`：读取 `dimensionScoreEmphasis` 与 `scorePercentageMode`；百分比模式显示 `formatGapPercentile(value, range)`，否则显示 `formatDimension(value)`；无值仍显示“—”。
  - 色阶使用 `scoreEmphasisTone(value, range)`，仅在强调开启且存在范围时设置行内 CSS 变量：`--tone-bg`、`--tone-mix`、`--tone-rule`。`--tone-mix` 必须写入百分比字符串（`Math.round(strength * 100) + "%"`），因为 `color-mix()` 权重只接受 `<percentage>`，写 `0.18` 这类数字会在 computed-value 阶段整条失效并静默丢掉底色。百分比模式不改变色阶依据，仍使用实际得分范围；色阶强度只表达得分位置，不表达分差百分比大小。
  - `web/src/components/DimensionScore.module.css`：底色用 `color-mix(in srgb, var(--tone-bg) var(--tone-mix), transparent)`，2px 内嵌下划线用 `var(--tone-rule)`；文字保持 `var(--ink)`；继续 `forced-colors` 与 `print` 清除；保留最小宽度、等宽数字与不换行。
  - `web/src/styles/global.css`：新增低分/高分端点与下划线 token，采用低分暖红 `#e89a8b`/`#8f1c14` 与高分冷蓝 `#9fcbd2`/`#174f5b`；只作为数据色，不替代信号红语义。可按实际对比度微调，但端点文字对比度不得低于 8:1。
  - 不对综合分单元格套用红蓝色阶；综合分保持排版层级。
- **Acceptance Criteria**：强调开启且有范围时最低分出现明显暖红、最高分出现明显冷蓝与下划线，中点接近纸白；浏览器中随机取一个强调单元格，其 computed `background-color` 不是 `rgba(0, 0, 0, 0)`；关闭强调全部底色与下划线消失；百分比模式显示百分比且底色仍按实际得分；`typecheck` 通过。

### TASK-005：综合排行接入百分比模式

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-004
- **Description**：排行页的综合分与维度分统一切换，并提供表头、说明与色阶图例。
- **Details**：
  - `web/src/pages/Rankings.tsx`：读取 `scorePercentageMode`；用 `scoreRange(models.map(model => model.score))` 计算综合分范围；综合分单元格按模式显示 `formatGapPercentile` 或 `formatScore`。
  - 表头“综合分”动态改为“综合差距”；`billIntro` 的说明在百分比模式改为“分差百分比 / 1% = 最高分”，否则保留“加权平均 / 全部模型”。
  - 强调开启时在榜单说明区加入“低分 [暖红块] → [冷蓝块] 高分”图例；百分比模式同时开启时，两种说明并列且可换行，不堆叠长句。
  - 移动端综合分百分比使用略小字号或紧凑字距，390px 下不挤压模型名、覆盖率与操作列；维度列仍按既有断点隐藏。
  - 不改排序状态、官方名次、覆盖率、对比选择、评分弹窗或新增模型流程。
- **Acceptance Criteria**：切换后行序与名次不变；最高综合分为 1%、最低为 100%，中间值不按名次等距；关闭恢复两位小数实际分；无综合分显示“—”；1440/390 无横向溢出。

### TASK-006：模型详情接入百分比模式

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-004
- **Description**：详情页大号综合分与维度表同步显示分差百分比，并保留相对条的真实分差含义。
- **Details**：
  - `web/src/pages/ModelDetail.tsx`：读取偏好；基于 `rankings.models` 计算综合分范围；大号数字按模式显示百分比或 `formatScore`。
  - 大号标签“综合分”动态改为“综合差距”；维度区标题说明在百分比模式改为“分差百分比 / 1% = 最高分，100% = 最低分”，否则保留“相对条按最高分归一 / 名次按同维度已评分模型”。
  - 强调开启时加入与排行一致的小图例；百分比模式下大号数字字号可适度收紧，避免三位数百分比在 390px 溢出。
  - 相对条仍按实际最高分归一，不因百分比模式改变宽度；维度名次、未评分破折号与私人备注保持不变。
- **Acceptance Criteria**：大号综合分与维度分同时切换；1%/100% 正确；相对条宽度与切换前一致；390px 下大号百分比不溢出；关闭恢复实际分与原文案。

### TASK-007：模型对比接入百分比模式

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-004
- **Description**：对比桌面表头与移动卡片共享综合分/维度分切换，并避免百分比被误读。
- **Details**：
  - `web/src/pages/Compare.tsx`：读取偏好；用全部模型综合分计算范围；桌面模型表头与移动卡片的大号分数按模式显示百分比或 `formatScore`。
  - 百分比模式在模型大号分数上方加短标签“综合差距”；实际分模式不渲染该标签，避免改变原布局。
  - 维度单元格继续复用 `DimensionScore`；工具栏计数旁在百分比模式加入“分差”提示，不新增说明段落。
  - `web/src/pages/Compare.module.css`：新增标签与百分比字号规则；桌面与 390px 移动卡片均不得溢出；不改模型选择、增删与上限逻辑。
- **Acceptance Criteria**：桌面表头、移动卡片、维度分三处同步切换；百分比模式下大号分数有“综合差距”标签；关闭标签和百分比消失；模型选择与对比上限不回归。

---

## Phase 3：验证与交付

### TASK-008：执行自动化检查与浏览器验收

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-003、TASK-005、TASK-006、TASK-007
- **Description**：验证显示契约、色彩可读性、持久化与响应式布局，无回归后进入文档。
- **Details**：
  - 运行 `pnpm --dir web test`、`pnpm --dir web typecheck`、`pnpm --dir web build`；运行 `go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server` 作为后端回归。Go 缓存若被沙箱拒绝，使用工作区缓存，不绕过权限。
  - 用临时数据库与临时管理员口令启动单一本地进程，构造至少 6 个模型、4 个维度、非均匀分差、一个并列分、一个未评分模型与一个零分差维度；通过 API 或界面写入，不碰用户真实数据库。
  - 浏览器覆盖 1440/900/760/390：切换两个开关；核对最高/最低 1%/100%、中间值反映实际分差而非名次；低分端为暖红、高分端为冷蓝；并列同百分比；零分差显示“—”；未评分不参与极值；关闭恢复实际分与色阶；刷新保持；localStorage 写入失败提示但当前会话生效。
  - 检查排行、详情、对比桌面与移动卡片；确认排序/名次/覆盖率/相对条/导出不变；确认工作台与评分弹窗仍显示实际分；确认无页面横向溢出、无脚本错误；色阶端点文字对比度用浏览器取色或脚本计算并记录。
  - 重点验证 `--tone-mix` 单位：强调开启且存在范围时，取任一强调单元格的 computed `background-color`，必须不是 `rgba(0, 0, 0, 0)`；若为透明，说明 `color-mix()` 权重写成了数字而非百分比。
  - 结束后关闭进程，删除临时数据库、日志与一次性构建文件，保留 `web/dist` 既有契约。
- **Acceptance Criteria**：全部命令退出 0；浏览器结论记录实际路径、视口与关键数值；所有边界场景通过；无遗留进程与临时数据；失败项先修复再进入 TASK-009。

### TASK-009：同步 Project.md

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1；依赖：TASK-008
- **Description**：把百分比模式、色阶、作用面与验证结论写回项目事实来源。
- **Details**：
  - 更新“当前增量”与“前端 > 显示偏好”：两个开关、两个 localStorage 键、默认值、作用面（排行/详情/对比）、工作台与评分弹窗例外。
  - 更新“视觉 > 维度色阶”：用红蓝端点、强度、2px 下划线、文字对比度与图例替换旧墨色 6%–18% 描述；记录百分比模式不改变相对条、覆盖率或排名。
  - 更新“交互细节/显示交互”：百分比模式切换、1%/100% 规则、零分差破折号、端点舍入保护、刷新持久化与存储失败回退。
  - 在“已知限制”记录：百分比模式只隐藏页面显示，`/api/rankings` 仍返回绝对分值；若需要接口层隐藏，另行评估服务端过滤或新增百分位字段。
  - 在“约束与决策”补公式、线性映射与色阶按实际得分而非百分比；在“测试与验收”记录本轮实际命令、浏览器视口、边界 fixture 与对比度结果；未执行项明确标注。
  - 不记录未验证项为通过，不改写无关历史结论。
- **Acceptance Criteria**：Project.md 与最终代码一致；旧“墨色透明度”描述不再作为现状；两个存储键、作用面与测试结论可检索。

### TASK-010：归档计划与任务并提交

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1；依赖：TASK-009
- **Description**：完成计划归档与中文 Conventional Commit。
- **Details**：
  - Plan.md 与 Tasks.md 标记 DONE、完成日期与回归测试结论；移入 `.docs/10-22-v6/`（若目录已存在则按当天递增规则取下一个），确认成对存在且根目录无残留。
  - 检查 `git status`、`git diff`、`git log`；仅暂存本轮相关文件，不提交密钥、数据库、构建产物或临时 Demo 以外的无关文件。
  - 提交信息使用英文类型 + 中文描述，聚焦“隐藏绝对分值并提升维度色阶可读性”的原因；不使用 `--amend`、不跳过钩子、不强推。
  - Demo 保留在 `temp/`，不作为生产资源提交；若项目既有约定不追踪 `temp/`，按现状处理。
- **Acceptance Criteria**：归档目录同时含 Plan.md 与 Tasks.md；根目录无已完成计划；提交成功且工作区干净；提交信息符合规范。

---

## 回归与验收结论

- **完成日期**：2026-10-22
- **自动化**：`pnpm --dir web test` 33/33 通过；`pnpm --dir web typecheck`、`pnpm --dir web build` 通过；`go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server` 通过。
- **浏览器**：1440 / 980 / 900 / 760 / 390；临时库 7 模型、4 维度（含并列分、零分差维度、未评分模型），数据经 API 写入，验收后删除。
- **显示契约**：综合分依次 1% / 6.5% / 12.9% / 25.6% / 53.2% / 100%；推理维度 1% / 6.8% / 18.5% / 24.3% / 50.5% / 100%；并列写作分同显示 5.9%；零分差维度与未评分模型显示“—”。
- **色阶**：强调单元格 computed `background-color` 为 `color(srgb …)`（非 `rgba(0, 0, 0, 0)`），最低分满强度暖红、最高分满强度冷蓝、中点透明；关闭强调后底色与图例消失且百分比保留。
- **不变项**：排序、官方名次、覆盖率、相对条宽度、导出 JSON、工作台与评分弹窗均为实际分值或原行为。
- **异常路径**：覆盖 `Storage.prototype.setItem` 后切换提示“显示设置仅在本次会话生效”，重载回到原值；无脚本错误。
- **对比度**：墨黑文字在低分暖红 8.34:1、高分冷蓝 10.57:1。
- **未覆盖**：Docker 镜像构建与 Compose 实际启动（本机无 Docker）。
