# Tasks：厂商复用与维度得分强调

**关联 Plan**：[Plan.md](Plan.md) v1.1  
**状态**：DONE  
**日期**：2026-10-22  
**修订**：v1.1（吸收首轮审计；运行手册、测试载体、memo 位置、范围收敛）  
**总计 Task**：8 个，均由接手主线执行  
**完成日期**：2026-10-22  
**回归测试结论**：`pnpm --dir web test` 23/23、`typecheck`、`build` 通过；浏览器覆盖 1440/760/390、三处厂商入口、显示开关持久化与读写异常、匿名权限及既有排序/评分/对比路径；无页面横向溢出与脚本错误。  
**Demo**：`temp/vendor-score-emphasis.html`（仅本机临时参照；temp/ 被 Git 忽略，厂商为内存数据，偏好使用独立 demo key）。

## 交接输入与 Explore 证据

先读 [SCOPE.md](../SCOPE.md)、[Project.md](../Project.md) 与关联计划，再按 Task 重读源文件。沿用工程纪律、frontend-design、production-frontend；设计基准为既有 Apple HIG 交互与瑞士平面视觉，不加载 Fluent / Material 3、不升级依赖。

已查阅关键文件：

| 链路 | 已读文件与结论 |
|---|---|
| 模型表单 | [ModelDialog.tsx](../../web/src/components/ModelDialog.tsx)、[Field.tsx](../../web/src/components/Field.tsx)、[Dialog.tsx](../../web/src/components/Dialog.tsx)、[模型表单样式](../../web/src/components/ModelDialog.module.css)：共享弹窗负责全部模型创建与档案编辑，厂商为可空文本 |
| 模型入口 | [Rankings.tsx](../../web/src/pages/Rankings.tsx)、[Workbench.tsx](../../web/src/pages/Workbench.tsx)、[Settings.tsx](../../web/src/pages/Settings.tsx)：三处已有完整模型列表；统一保存回调重载 |
| 只读得分 | [Compare.tsx](../../web/src/pages/Compare.tsx)、[ModelDetail.tsx](../../web/src/pages/ModelDetail.tsx) 与排行页面：各有全榜数据；对比旧规则为所选模型最高分红字 |
| 样式 | [global.css](../../web/src/styles/global.css)、[ui.module.css](../../web/src/components/ui.module.css)、[Rankings.module.css](../../web/src/pages/Rankings.module.css)、[Compare.module.css](../../web/src/pages/Compare.module.css)、[ModelDetail.module.css](../../web/src/pages/ModelDetail.module.css)、[Settings.module.css](../../web/src/pages/Settings.module.css)：现成令牌、原生 select、checkbox、直角模态可复用 |
| 权限与入口 | [App.tsx](../../web/src/App.tsx)、[Header.tsx](../../web/src/components/Header.tsx)、[main.tsx](../../web/src/main.tsx)：设置整体受 RequireAdmin 保护；Header 设置链接仅管理员可见 |
| 评分与类型 | [ranking.ts](../../web/src/domain/ranking.ts)、[types.ts](../../web/src/api/types.ts)、[package.json](../../web/package.json)：分数无上限；详情条 dimensionMax 下限为 10，不能复用为色阶范围（该下限已于后续轮次移除，色阶仍不复用相对条）；现有 Node 原生测试可扩展 |

只读 explore 子任务另已核对 API、模型存储与排行计算：rankings 的 models 不因无维度、零权重或未评分而剔除；无需后端变更。主线接手须对照真实调用重读，不依赖子任务结论直接修改。

## Phase 1：复用已有厂商

### TASK-001：为共享模型表单接入已有厂商选择

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：无
- **Description**：扩展共享模型表单接收只依赖 vendor 的只读模型列表，并将三处父页已加载的 models 传入。
- **Details**：修改上表模型表单及三个入口文件；复用 Field 与 ui.select，不改 API types、会话或后端。候选 trim、去空、精确去重、中文 locale 排序；不合并大小写。编辑当前厂商包含在选项中，打开/切换模型时同步回填状态。原生 select 包含“不填写”、已有厂商、“新厂商…”；新厂商展开带标签、80 字符约束的文本框。无候选时直接文本输入。选项值用可区分的类型/前缀表达，不能让名为 new 的真实厂商碰撞控制项。厂商实际值保持一个提交源，不镜像维护两份 vendor；新建模式可以是独立 UI 状态。选择已有项、切换新厂商、清空只影响当前 vendor；更改选项不提交表单。
- **Acceptance Criteria**：排行/工作台/设置的主入口及空状态入口提供一致选择；设置档案编辑初值、slug 不可变与私人备注不回归；创建新厂商后重载可复用；删除最后一个使用厂商的模型后候选消失；空库、空厂商、重复、未评分、零权重、无维度均符合计划。桌面 select 实际选择成功，键盘 Tab/Esc 和焦点恢复正常，390px 无溢出。若提取非平凡候选函数，用一个 Node 原生小测试验证去空、去重、排序与输入不变，不新增测试框架。

## Phase 2：显示偏好与维度强调

### TASK-002：建立浏览器本地显示偏好源

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-001（共享页面同一写入者串行）
- **Description**：新增单一显示偏好上下文，提供 dimensionScoreEmphasis 布尔值及更新动作。
- **Details**：新增纯 TS 存储模块 `web/src/preferences/preferenceStorage.ts`，接口接收 `Storage`（或读写函数）；再新增 `web/src/preferences/DisplayPreferences.tsx`，只负责 React 上下文、状态与 Toast 接线。Node 原生测试只导入纯 `.ts`，不导入 `.tsx`：Node 24 的类型擦除不处理 JSX，现有测试也均为纯 `.ts`。在 [App.tsx](../../web/src/App.tsx) 内 ToastProvider 以下、RouterProvider 以上挂载，以复用反馈。localStorage key 固定为 `llmrank:dimension-score-emphasis`，仅字符串 `true`/`false` 有效；默认 true。初始化读取失败/未设置/无效值采用 true；写失败仍更新内存状态，并 Toast“显示设置仅在本次会话生效”。不跟随登录重置、不写 API、不随 JSON 导出、不要求跨标签同步。
- **Acceptance Criteria**：默认开、关后切页/刷新仍关、重新开后刷新仍开；无效存储采用默认；模拟读取/写入异常页面仍可用，写入失败有反馈；登出不改偏好；所有使用者消费同一源。新增 `preferenceStorage.test.ts`，注入假存储覆盖 true/false、无效值、读取异常、写入异常，并把文件加入 [package.json](../../web/package.json) 的现有 test 命令；typecheck 通过。

### TASK-003：在管理员设置中添加显示分区

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-002
- **Description**：在现有管理员设置页新增 display 分区，接通唯一复选开关，复用现有 tabs 与样式。
- **Details**：[Settings.tsx](../../web/src/pages/Settings.tsx) 的 `Tab` 与 `tabLabels` 增加 `display`，`resolveTab` 识别 `display`；在现有设置页内新增显示面板，复用现有 tabs、PageHeading、原生 checkbox 与纸白线框样式，仅显示“维度得分强调”、开启/关闭状态及“当前浏览器”作用域；不包含管理统计、删除提示或导出信息。不新增公开路由、不抽共享 `SettingsTabs`、不修改 [Header.tsx](../../web/src/components/Header.tsx)；`/settings` 整体仍由 [App.tsx](../../web/src/App.tsx) 的 RequireAdmin 保护，匿名访问 `?tab=display` 仍回登录。显示偏好来自 TASK-002，管理数据读取与拖动排序保持原状，不要把管理页数据读取上移。
- **Acceptance Criteria**：匿名访问 `/settings?tab=display` 仍按既有行为去登录；管理员可在显示分区切换开关，登录后原管理操作与拖动排序不回归；显示分区复用现有设置页加载/错误状态，不额外请求数据；Space 可切换、焦点可见、390px/760px 导航不溢出。

### TASK-004：建立无上限评分的维度色阶纯函数

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-002
- **Description**：添加展示专用的全榜维度范围计算与透明度映射，不修改评分计算函数。
- **Details**：建议新增 `web/src/lib/scoreEmphasis.ts` 及同名 Node 测试。输入采用只需要 scores 的窄类型和维度 ID；每个维度从全榜有效有限非负值计算 min/max。映射 0.06 + 0.12 × (value − min)/(max − min)，值处于端点时精确对应 0.06/0.18，范围内单调。空、单值、全相等、缺失值不强调；0 是有效值。不要复用 dimensionMax 的 floor=10，不改综合分/排名，不为色阶排序或写回原数组。
- **Acceptance Criteria**：测试覆盖低/中/高、并列、0 与 null 区别、12.5 与更大值、Number.MAX_VALUE、空/单值/全相等、维度重排、原数组不变；返回有限且不超 0.06–0.18；同值同色；非参与维度不被使用。把新测试加入 [package.json](../../web/package.json) 的现有 test 命令，typecheck 通过。

### TASK-005：将统一得分强调接入排行、详情与对比

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-002、TASK-004
- **Description**：新增共享得分显示构件，将相同全榜色阶用于三个只读表面与移动对比卡片。
- **Details**：建议新增 `web/src/components/DimensionScore.tsx` 及 CSS Module，输出格式化数字和可选局部背景；字形字号继承页面，统一 tabular-nums、矩形内边距与背景；透明度来自 TASK-004，开关来自 TASK-002。三个页面各从完整 rankings.models 一次计算范围（memo），单元格只取范围，不重复扫描。ModelDetail 的 memo 必须放在 loading/404/error 三个早返回之前，以 `data?.rankings.models` 为依赖；不得在解构 `data` 之后调用 Hooks。对比按全榜而非 selected；移除 maxByDimension、best/cardBest 的旧红字规则与无效最高屏幕阅读标签，清理对应样式。详情保留原有条长；排行维度列移动隐藏不改。不制作图例；开关关闭即全部新增背景消失。
- **Acceptance Criteria**：相同快照中同一个得分在排行、详情、桌面对比、移动卡片背景一致；对比增删模型、排序切换和维度重排不改色阶；关闭后新增背景全部消失，对比无遗留最高红字；综合分、覆盖率、排名和评分输入/预览不变。详情 loading/404/error 早返回路径无 Hooks 顺序问题。实际样式遵循纸白/墨黑/信号红、零圆角、无渐变阴影；hover 不吞色阶；所有背景下数字对比度 ≥4.5:1，缺失/同分均中性，长数值可读，forced-colors/打印数字可见。

## Phase 3：验收与交付

### TASK-006：运行检查并记录浏览器回归

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends on**：TASK-001 至 TASK-005
- **Description**：执行前端检查与实际业务浏览器路径；记录命令结果及手工结论。
- **Details**：
  1. 执行 `pnpm --dir web test`、`pnpm --dir web typecheck`、`pnpm --dir web build`，确认 `web/dist` 是本次构建产物。
  2. 在仓库根目录准备独立临时库与测试口令，用固定端口 8099 启动单一受管服务并记录 job id：
     ```bash
     mkdir -p "$PWD/temp"
     tmp=$(mktemp -d "$PWD/temp/review.XXXXXX")
     cat > "$tmp/hash.go" <<'GO'
     package main

     import (
       "fmt"
       "golang.org/x/crypto/bcrypt"
     )

     func main() {
       h, _ := bcrypt.GenerateFromPassword([]byte("verify-only"), 12)
       fmt.Print(string(h))
     }
     GO
     ADMIN_PASSWORD_HASH="$(go run "$tmp/hash.go")" \
     SESSION_SECRET="$(openssl rand -base64 48)" \
     DB_PATH="$tmp/llm-rank.db" PORT=8099 COOKIE_SECURE=false \
     go run ./cmd/server
     ```
     等待 `curl -fsS http://127.0.0.1:8099/api/health` 返回成功。
  3. 连接 9222 浏览器打开 `http://127.0.0.1:8099`；不连 Vite 5173，也不把 8080/3080 当本项目。验收后 `job_kill` 并删除 `$tmp`。
- **Acceptance Criteria**：全部命令退出 0；health 与页面在 8099 可访问；浏览器覆盖 1440/760/390，验证三处厂商创建、设置编辑、空/零权重/未评分、原生选择与自填/清空、保存失败反馈、排行/详情/对比三表面同分同色、开关刷新持久化/存储失败、匿名与管理员权限、键盘焦点及无页面横向溢出。既有拖动排序/评分保存/综合分预览/私人备注/对比选择不回归。失败先修复，不进入归档。

### TASK-007：同步项目事实与归档完成文档

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Depends on**：TASK-006
- **Description**：更新项目说明中的前端路由、个人偏好、厂商派生和得分显示规则，归档本阶段计划与任务。
- **Details**：更新 [Project.md](../Project.md) 当前增量、结构（新增 preferences 目录时同步）、路由（`/settings?tab=dimensions|models|data|display` 仍全部位于 RequireAdmin 下）、信息架构、显示偏好作用域及默认值（仅管理员可改，访客默认开启）、全榜相对色阶 6%–18%/等分不着色、不制作图例、关闭即无强调（含对比旧红字被替代）、验证结论；确认登录页“评分与设置仅对管理员开放”仍准确，若实现偏离则同步修正。不得把仍未验证项写成通过。清理本次无用临时文件与一次性产物；Demo 仅本机临时参照，temp 仍沿用 Git ignore，不强行提交。记录所有实际测试。完成后按现有归档格式查询当天最大版本，不能假定 v3 空闲。执行归档前核对源/目标绝对路径并确认目标不存在。计划/任务填写状态 DONE、完成日期与回归结论，移入 .docs/MM-DD-vN，确认二者均存在且根目录无已完成文件残留。
- **Acceptance Criteria**：项目资料与已实现事实一致；无新增依赖/API/数据库变动时明确无需同步这些契约；完成文档已成对归档、测试记录可追溯；下一项仅为 Git 提交收尾。

### TASK-008：检查差分并提交相关变更

- **Status**：DONE（纳入本次提交）
- **Executor**：主线
- **Priority**：P1
- **Depends on**：TASK-007
- **Description**：按现有规范检查并提交已验证的前端与归档文档。
- **Details**：执行 git status、git diff（含暂存/未暂存）与 git log；检查无用户改动混入、无密钥、数据库、构建输出。按相关文件显式暂存，创建 Conventional Commits 英文类型 + 中文描述提交，例如 `feat: 复用模型厂商并提供可关闭的维度得分强调`。不得跳过钩子、amend 或强推；本请求不授权 push。提交失败时修复后新提交。归档任务清单在提交前将本任务标记为“DONE（纳入本次提交）”，若提交失败即回填真实状态；最终以成功提交与工作区检查为准。
- **Acceptance Criteria**：新提交成功且范围仅本需求，给出提交号与测试结论；没有本阶段遗漏的未跟踪/未提交业务文件，任何无关改动保留并说明。

## 交付结果与验证记录

规划期只修改本计划、任务文档和静态 HTML。交付段完成厂商候选、显示偏好、维度色阶与三表面接入，并同步项目事实资料；无新增依赖、后端接口或数据库迁移。

- 2026-10-22：`pnpm --dir web test` 23/23 通过；新增 `scoreEmphasis` 与 `preferenceStorage` 测试。
- 2026-10-22：`pnpm --dir web typecheck`、`pnpm --dir web build` 通过；Go 服务以独立临时库与 8099 端口启动，验收后关闭并清理。
- 2026-10-22：浏览器 1440/760/390 通过：排行/工作台/设置三处厂商创建与复用、编辑回填、slug 只读、私人备注保留、重复 slug 反馈；显示分区点击/Space 切换、刷新持久化、读写异常回退、登出保持、匿名回登录；排行/详情/桌面对比/移动卡片同分同色，关闭后背景与旧最高红字全部移除；无横向溢出、无控制台错误；最深深色阶文字对比度约 11:1。
- 2026-10-22：既有维度键盘排序与恢复、评分预览与保存、对比增删模型路径回归通过。

以上 8 项均已完成；文档归档后由 Git 提交收尾。
