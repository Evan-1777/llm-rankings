# Tasks：排行榜 Markdown 备注区域

**关联 Plan**：[Plan.md](<Plan.md>) v1.1  
**状态**：DONE  
**日期**：2026-10-24  
**完成日期**：2026-10-24  
**总计 Task**：7 个（全部 DONE；执行主体均为主线）  
**回归测试结论**：`go test ./...`、`go vet ./...`、前端 54/54、typecheck、build 与最终静态 Go 二进制构建全部通过；浏览器主路径、失败路径、离开保护与四档视口验收完成。

## 执行前上下文

先读 [.docs/SCOPE.md](<.docs/SCOPE.md>)、[.docs/Project.md](<.docs/Project.md>) 和关联计划。遵循 engineering-discipline、frontend-design、production-frontend；沿用 Apple HIG 交互基准和瑞士编辑式视觉，不切换设计系统。规划阶段已确认工作区除本轮 Plan/Tasks 外无用户未提交改动。

已查阅的关键文件：

- [.docs/SCOPE.md](<.docs/SCOPE.md>)、[.docs/Project.md](<.docs/Project.md>)、[AGENTS.md](<AGENTS.md>)、[Plan 模板](<.docs/Plan.example.md>)、[Tasks 模板](<.docs/Tasks.example.md>)。
- [前端依赖](<web/package.json>)、[API 类型](<web/src/api/types.ts>)、[API 客户端](<web/src/api/client.ts>)、[显示设置上下文](<web/src/preferences/DisplayPreferences.tsx>)、[应用入口](<web/src/App.tsx>)、[工作台离开保护](<web/src/pages/Workbench.tsx>)。
- [排行榜](<web/src/pages/Rankings.tsx>)、[排行榜样式](<web/src/pages/Rankings.module.css>)、[设置页](<web/src/pages/Settings.tsx>)、[设置样式](<web/src/pages/Settings.module.css>)、[共用表单](<web/src/components/Field.tsx>)、[评分表单](<web/src/components/ScoreDialog.tsx>)、[全局样式](<web/src/styles/global.css>)。
- [设置存储](<internal/store/display.go>)、[数据库迁移机制](<internal/store/db.go>)、[存储测试](<internal/store/store_test.go>)、[设置 API](<internal/api/handlers_display.go>)、[API 测试](<internal/api/api_test.go>)、[JSON 边界](<internal/api/encoding.go>)、[导出接口](<internal/api/handlers_export.go>)。
- [显示设置建表](<migrations/003_display_settings.sql>)、[维护模式迁移](<migrations/004_maintenance_mode.sql>)；已确认迁移目录当前最大序号为 008。

## Review 吸收结论

采纳：

- TASK-003 补未保存草稿离开保护、读取失败独立重试、长度错误回填与设置页导出文案收口。
- TASK-004 锁定 react-markdown 10.1.0，明确 section 语义与 pre 键盘可达。
- TASK-006 前端构建先于 Go 构建，并明确用 CDP 按 method 注入失败。

不采纳：

- 不增加 GFM 表格/任务列表/数学公式与额外 Markdown 插件；CommonMark 是本轮边界。
- 不扩展 JSON 导出结构；仅修正设置页文案，完整备份仍以数据卷为准。
- 不新增表、路由、Subagent；保持现有单例与串行链路。

## Phase 1：站点设置契约

### TASK-001：追加备注列并扩展存储读写与迁移测试

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends On**：无
- **Description**：新增 migrations/009_ranking_notes.sql，扩展 internal/store/display.go 和 internal/store/store_test.go。
- **Details**：
  - 在 display_settings 追加 ranking_notes TEXT NOT NULL DEFAULT ''；不改历史迁移，不插入单例行或种子内容。
  - Store.DisplaySettings 增加 RankingNotes string；SELECT/Scan、INSERT/upsert 全部包含新列；无单例行仍返回零值。
  - 在 TestDisplaySettingsDefaultsAndPersists 中覆盖多行正文写入、清空、重启保留，以及开关与正文同时持久化。
  - 检查 store_test.go 中迁移 fixture；增加从迁移 008 状态升级的断言，包含已存在 id=1 行及三开关值，升级后旧值保留且备注为空。
- **Acceptance Criteria**：go test ./internal/store 通过；新库无种子行，旧库升级不丢开关；Markdown 原文与换行往返一致；重新打开数据库读出已保存正文。

### TASK-002：扩展公开设置 API 与完整 PUT 校验

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends On**：TASK-001
- **Description**：扩展 internal/api/handlers_display.go 的输入与响应，在 internal/api/api_test.go 添加备注契约断言并更新全部显示设置请求 helper。
- **Details**：
  - JSON 名称 rankingNotes；响应总是输出字符串，包括空字符串；输入使用 *string 区分缺失/null 与显式清空，继续要求三个开关齐全。
  - 服务端使用 utf8.RuneCountInString 检查不超过 20,000 个 Unicode 码点，超限以 rankingNotes 字段返回 422；不 trim 或改写 Markdown 原文。
  - 沿用已有路由、鉴权、Origin 校验、no-store、1MiB JSON 请求限制和未知字段拒绝，不新增接口。
  - 检索所有 /api/display-settings PUT，更新正常请求（含维护模式测试中的 helper），保留故意缺字段的反例；新校验失败不得改变已保存设置。
- **Acceptance Criteria**：go test ./internal/api 通过；匿名 GET 可读/匿名 PUT 为 401；缺失/null/超长字段失败且不落库；正常正文、20,000 码点边界、换行、清空均可往返；既有维护模式、Origin 与三个开关用例不回归。

## Phase 2：编辑与阅读

### TASK-003：接入共享已保存状态与设置页本地草稿

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends On**：TASK-002
- **Description**：同步 web/src/api/types.ts、web/src/preferences/DisplayPreferences.tsx、web/src/pages/Settings.tsx 和 web/src/pages/Settings.module.css，接通备注编辑与完整保存。
- **Details**：
  - DisplaySettings 新增 rankingNotes: string；client.ts 已用该完整类型传参，除必要适配外不改 fetch 封装。
  - Provider 初始读取、每个开关 setter、完整快照、成功回写及失败回滚都含已保存正文，所有依赖数组覆盖新状态；不把编辑草稿放进 provider。
  - 保留原开关失败 toast 与回滚行为；新增正文保存返回明确成功/失败结果，便于设置页只在成功时提示“已保存”，失败不清空草稿。
  - 处理初始设置读取失败：暴露最小读取错误/重试状态，设置页显示可重试的功能性错误并禁用备注输入与站点保存，禁止拿默认空值覆盖服务端；重试使用独立 retrying 状态，不复用全局 loading，不卸载设置页。公开页面仍可按既有降级显示。
  - 显示分区末尾复用 TextAreaField，标签“排行榜备注（Markdown）”，空白初值、无 placeholder/示例/说明；下方显式“保存”按钮。输入区约 8 行、可纵向调整，沿用现有 textarea/Button 样式。
  - 草稿初次以已读取正文初始化；状态放在 Settings 组件层，不随显示 tab 卸载。不要因其他开关响应而重置用户编辑中的草稿。保存前不发布；切换开关携带已保存正文而非草稿。
  - provider loading/saving 或读取失败时禁用相关站点写入；保存期间正文编辑与提交禁用。未变化时禁用保存；失败保留草稿供重试；读取失败恢复前不创建可合并的草稿。
  - draft 与已保存正文不一致时，用 useBlocker 仅拦截 pathname 变化，并以 beforeunload 拦截刷新/关闭；设置页内部 tab 切换不拦截。保存成功后清除 dirty。
  - 服务端长度以 Unicode 码点为准；保存返回字段错误时，把 rankingNotes 的错误传给 TextAreaField 的 error，并在继续编辑时清除；不设置 HTML maxLength，避免 UTF-16 单位导致 emoji 被提前截断。不增加字符计数器或额外控制项。
  - 设置页数据分区 meta 从“完整 JSON 导出”改为“模型与评分 JSON 导出”，说明改为“可直接解析；完整备份以数据卷为准”，不改导出结构。
- **Acceptance Criteria**：pnpm --dir web typecheck 与现有 pnpm --dir web test 通过；可编辑、保存、清空；开关切换不丢正文也不发布草稿；失败保留草稿并能重试；未保存离开有确认且内部 tab 切换不误拦；读取失败时不能覆盖设置，重试不卸载页面且成功后恢复；超长字段错误显示在输入区；原开关行为不变。

### TASK-004：新增局部 Markdown 阅读组件及可运行断言

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends On**：TASK-003
- **Description**：新增前端 Markdown 文本阅读能力和最小原生 Node 渲染测试，更新 web/package.json 与 web/pnpm-lock.yaml。
- **Details**：
  - 已核实 react-markdown 10.1.0 的 peer 为 react >=18，与当前 React 19.3.1 兼容；锁定 10.1.0 为一个直接依赖，保留其他现有依赖版本，不增加 UI、GFM、代码高亮或 raw HTML 插件。
  - 新建 web/src/components/RankingNotes.ts，采用 React.createElement 组合 Markdown 与简单外壳，不用 JSX，便于现有 Node 原生 TypeScript 测试直接导入；不导入 CSS，由调用者传入 className。
  - 接收原始 content 和 className；content.trim() 为空返回 null，否则展示原始 content。外壳使用带 aria-label="排行榜备注" 的 section（或 role="region"），不渲染固定标题。
  - 使用 skipHtml、组件默认安全 URL 转换与 img 空渲染（纯文字需求）；给 pre 增加 tabIndex=0，使横向滚动可由键盘进入，沿用全局 focus-visible；不重写 URL 规则，不使用 dangerouslySetInnerHTML，不开放原始 HTML，不主动新窗口打开链接。
  - 新建同目录 RankingNotes.test.ts，通过 React.createElement + react-dom/server.renderToStaticMarkup 检查真实阅读组件，加入现有 node --test 脚本，不新增测试框架或临时转译工具链。
- **Acceptance Criteria**：新增测试覆盖空/空白返回空输出，非空外壳带 aria-label，pre 带 tabindex；段落/标题/强调/有序与无序列表/引用/代码/安全链接产生对应语义结构；script/原始事件属性/危险协议不成为可执行节点，Markdown 图片不输出 img；测试由 pnpm --dir web test 运行，typecheck 与 build 通过。

### TASK-005：把备注接到排行榜并恢复 Markdown 局部排版

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Depends On**：TASK-004
- **Description**：修改 web/src/pages/Rankings.tsx 与 web/src/pages/Rankings.module.css，在主体内容后呈现已保存的备注。
- **Details**：
  - 从同一个 DisplayPreferencesProvider 读取 rankingNotes；在现有 {content} 后、对比浮动条前插入组件，不放进 tableWrap 或横向滚动表格内。
  - 数据首次加载与请求错误时不新增备注替代反馈；排行榜成功加载（含现有各类空态）后，有非空配置即可展示；不依赖模型数量。
  - 正文 14px/1.75、ink-3、宽度 min(100%, 80ch)、与表脚约 24px 距离；不加卡片背景、阴影、固定标题、装饰图标或额外编辑入口。
  - 局部恢复列表标记/缩进，控制段落与标题间距，标题最大约 18px；引用细线、链接下划线，链接保留可见焦点。长文本可换行，pre 内部可横向滚动且可键盘聚焦。
  - 保留作者输入的 Markdown 正文与层次，不把写入的内容用全局固定标题替代；不改全局 reset、排行公式、表脚、排序或对比行为。
- **Acceptance Criteria**：空配置没有可见区域或空白占位；空榜单也能读规则；正文位于完整榜单之后；360/390/768/1440px 视口无页面级横向溢出；对比浮条不遮挡末尾正文；长代码块可用键盘横向滚动；类型和构建检查通过。

## Phase 3：验证与收尾

### TASK-006：执行自动回归与浏览器场景验收

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Depends On**：TASK-005
- **Description**：执行项目验证基线，并在实际项目页面核验设置保存和榜单阅读行为，将结果记录到本任务。
- **Details**：
  - 运行 go test ./...、go vet ./...、pnpm --dir web test、pnpm --dir web typecheck、pnpm --dir web build、CGO_ENABLED=0 go build -o <临时位置> ./cmd/server。前端构建必须先于 Go 二进制构建，确保 embed 的 dist 是本次产物；检查所有退出码，不留下二进制、测试数据库或额外常驻服务。
  - 浏览器使用用户准备的 9222 实例；确认目标是 LLM Rank 项目页面而不是 DSH GUI，不替换 DSH 服务。需要项目服务时，若启动服务则使用上一步的最终二进制；仅保留一个必要服务并在验收后关闭本轮启动的进程。
  - 验证首次空值、管理员保存多行 Markdown、匿名刷新读取、重新进入设置、清空、页面空榜单、有对比浮条、移动长链接与代码块。输入草稿后点击站内导航与刷新，确认出现放弃确认；设置页内部 tab 切换不出现确认且草稿保留。
  - 用 CDP Fetch 按 method 过滤制造读取失败（仅 GET）和保存失败（仅 PUT），确认错误可见、读取失败禁止默认值写入且重试不卸载页面、保存失败草稿保留且可重试；草稿编辑后切换既有开关，确认未发布正文也未丢草稿；其他开关保存仍携带旧正文。
  - 测试内容只写入临时验收数据库，不改用户实际站点备注。记录通过/失败、验证命令与视口；无法实际验证的项目明确写未验证，不以源码推断冒充浏览器结果。
- **Acceptance Criteria**：全部自动基线通过，最终二进制在前端构建之后产生；浏览器主路径、失败路径、离开保护、四档视口及匿名阅读完成，未改用户数据；发现问题回到对应任务修正后重跑，不提前标记完成。
- **验证记录（2026-10-24）**：
  - 自动基线：`go test ./...`、`go vet ./...`、`pnpm --dir web test`（54/54）、`typecheck`、`build`、`CGO_ENABLED=0 go build` 全部通过；前端构建先于最终二进制。
  - 主路径：临时验收库与 8080 服务，用户 9222 实例。空库无备注区域；保存多行 Markdown 后匿名隔离上下文可读；重新进入设置回填已保存正文；清空后榜单无区域；有对比浮条时不遮挡末尾正文。
  - 失败路径：页面 initScript 按 method 拦截 fetch。GET 失败显示可重试错误并禁用备注与开关，重试成功后页面未卸载且草稿以已保存正文初始化；PUT 网络失败 toast 并保留草稿，422 字段错误回填文本框并标 `aria-invalid`，重试保存成功。
  - 草稿保护：编辑后切换既有开关，服务端正文保持旧值且草稿未丢；站内跳转与 reload 触发离开确认，内部 tab 切换无确认且草稿保留；放弃后榜单展示旧正文。
  - 视口：360/390/768/1440 无页面级横向溢出；移动长链接换行、代码块内部横向滚动。发现对比浮条与末尾备注有 5px 重叠，移动端 `.pageWithBar` 底部留白由 96px 调至 116px 后复测无重叠。
  - 未验证：真实触屏手势与跨设备同步延迟；未改动用户实际站点备注与数据。

### TASK-007：同步当前事实、归档并提交本轮交付

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Depends On**：TASK-006
- **Description**：更新 .docs/Project.md，完成 Plan.md/Tasks.md 记录与归档，检查差异后提交。
- **Details**：
  - 在 Project 当前事实中同步新迁移、rankingNotes JSON 必填字段与长度、阅读组件、react-markdown 依赖、安全渲染边界、设置草稿/显式保存/离开保护、读取失败重试和空内容隐藏规则；在验证基线注明确保前端构建先于 Go 二进制构建。
  - 保留实际限制：JSON 导出不含显示设置，其他设备刷新后生效，正文纯文本 Markdown（无图片/GFM/HTML）；不要把未实现方案或测试日志塞入 Project。
  - 将 Plan/Tasks 状态标 DONE，填实际完成日期和回归结果。归档前确认根目录两个文件确为本轮计划并读取；按当前日期查询 .docs/ 同日前缀版本，选择递增 MM-DD-vN 目录，将两文件移入并确认根目录无残留。
  - git status、git diff 与 git diff --cached 检查本轮相关改动，git log 核实风格；只暂存相关源码/依赖锁/文档，不提交数据库、密钥、构建产物或 temp 目录。
  - 使用 Conventional Commits 英文前缀 + 中文描述创建提交；不跳钩子、不 amend、不 push；失败则修复后创建新提交。
- **Acceptance Criteria**：Project 与实现一致；归档同时包含两个 DONE 文档、实际验证结果和完成日期；相关提交成功且不含敏感内容/构建产物，未混入其他用户改动；交付消息区分已验证和未验证项。
- **归档**：`.docs/10-24-v1/`（Plan.md 与 Tasks.md 同步移入）。
