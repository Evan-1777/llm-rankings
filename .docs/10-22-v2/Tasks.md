# Tasks：维度手动拖动排序

状态：DONE
日期：2026-10-22
关联 Plan：[Plan.md](<Plan.md>) v1.3
工作流：Main-hybrid(Frontend)
前端参考：[维度排序 Demo（仅本机存在）](<../../temp/dimension-order.html>)；已加载 frontend-design、production-frontend，沿用 Apple HIG 交互与可访问性基准 + 瑞士平面视觉。Demo 使用独立演示数据与本地存储，不是已接入后端的产品实现。
总计 Task：6 个，全部 DONE；完成日期 2026-10-22。

## Explore 结论与已查阅文件
- 范围与风格：[SCOPE](<../SCOPE.md>)、[Project](<../Project.md>)；沿用瑞士平面风格，不新增依赖。
- 数据源：[维度存储](<../../internal/store/dimensions.go>) 当前按 ID 排序；[迁移入口](<../../internal/store/db.go>) 按文件名执行追加迁移；[初始表](<../../migrations/001_init.sql>) 无位置字段。
- HTTP：[路由](<../../internal/api/server.go>)、[维度处理器](<../../internal/api/handlers_dimensions.go>)、[排名快照](<../../internal/api/rankings.go>)；bootstrap、排行及导出共用维度列表入口。
- 前端：[设置页](<../../web/src/pages/Settings.tsx>)、[样式](<../../web/src/pages/Settings.module.css>)、[API 客户端](<../../web/src/api/client.ts>)、[异步数据 hook](<../../web/src/hooks/useAsyncData.ts>)、[图标](<../../web/src/components/Icons.tsx>)、[按钮](<../../web/src/components/Button.tsx>)。
- 评分：[Go 算法](<../../internal/domain/ranking.go>)、[前端算法](<../../web/src/domain/ranking.ts>) 当前按传入维度顺序累加，需要隔离展示顺序。
- 测试：[存储测试](<../../internal/store/store_test.go>)、[HTTP 测试](<../../internal/api/api_test.go>)、[前端评分测试](<../../web/src/domain/ranking.test.ts>)；[前端脚本](<../../web/package.json>) 使用 Node 原生测试。

## TASK-001：持久化维度展示顺序
- Status：DONE
- Executor：主线
- Priority：P0；依赖：无；Phase：1
- Description：追加 `migrations/002_dimension_order.sql`，修改维度存储查询与新建行为。
- Details：新增 position 整数字段，历史值按 ID 初始化；ListDimensions 按 position/id 排序；CreateDimension 在同一 INSERT 中读取最大位置后追加；不修改初始迁移或归档/恢复逻辑。
- Acceptance Criteria：存储测试覆盖旧结构升级、原顺序保留、重启保留、新建置尾（含删除后）、归档及恢复位置；现有测试通过。

## TASK-002：固定评分计算顺序
- Status：DONE
- Executor：主线
- Priority：P0；依赖：TASK-001；Phase：1
- Description：修改 Go Compute 与前端 composite，使累加按维度 ID 升序进行。
- Details：对局部副本排序，不修改调用方的展示数组；保留权重、归一化、覆盖率与排名规则。
- Details：固定 fixture 为维度 ID 1/2/3、weight 均为 1，模型 Alpha 的评分依次为 0.1/0.1/0.4；比较展示顺序 [1,2,3] 与 [1,3,2]。按现有归一化公式逐项累加，未排序的原始和分别为 0.2 与 0.19999999999999998（已用现有 TS composite 验证），覆盖率均为 1。测试内用运行时循环复现原始和并先断言两者不等，不对最终结果做格式化或近似比较。
- Details：增加模型 Zeta，三项评分均为 0.2。规范 ID 顺序下两者得分均为 0.2，Alpha 按名称排第 1、Zeta 第 2；未固定累加顺序时 Alpha 在 [1,3,2] 下会落到第 2。前端用 previewRanking 检查排名，Go 用 Compute 检查整表。
- Acceptance Criteria：Go/前端各留一个可运行回归；两种展示排列的原始和必须不等，修复后的综合分、覆盖率及排名严格一致，输入数组内容及顺序不变；移除生产中的 ID 排序后该回归应失败。

## TASK-003：添加管理员原子重排接口
- Status：DONE
- Executor：主线
- Priority：P0；依赖：TASK-002；Phase：1
- Description：在维度存储实现 ReorderDimensions，并添加 `PUT /api/dimensions/order`。
- Details：请求 `{ids: number[]}` 必须为全部维度（含归档项）的完整排列。复用管理员、JSON 与同源保护；JSON/类型解析失败返回 400；ids 缺失/null、重复、非正 ID 返回 422，错误沿用现有 `{error:{code,message,fields:{ids:"..."}}}` 结构。先做载荷本身的校验，再判断集合完整性，确保重复 ID 即使长度不匹配仍为 422。
- Details：在同一事务内读取当前维度集合，合法正整数序列的数量或成员与当前库不一致返回 409，含不存在的正整数 ID；它可能来自并发删除，现有载荷无法区分来源，不增加快照版本或历史 ID 协议。完整排列原子更新位置，失败回滚，成功返回 204。空库接受空数组，非空库收到空数组返回 409。
- Acceptance Criteria：测试合法重排；缺失/null、重复、非正 ID 的 422 与 fields.ids；类型错误 400；数量/成员不一致（含未知正整数、新增/删除后的旧载荷）409；各失败路径位置及 updated_at 不变；空库、未认证 401、跨源拒绝。检查 bootstrap、dimensions、rankings、模型详情、export 的维度顺序及既有字段不变。

## TASK-004：添加原生拖动手柄和键盘排序
- Status：DONE
- Executor：主线
- Priority：P0；依赖：TASK-003；Phase：2
- Description：修改设置页、对应 CSS、API 客户端和图标；必要时新增最小的可见 ID 排列纯函数及测试，不新增依赖。
- Details：以交接 Demo 的手柄、源行与目标红线为视觉基线，保留生产页已有的新增/编辑/归档/删除操作；不使用 Demo 的 localStorage 保存方式。维度表头和行的首列 >900px 为 60px、≤900px 为 44px，手柄分别为 52×44px、44×48px；grip 与序号合并在首列，移动端上下排列。复用 IconButton，以设置页 CSS 局部覆盖尺寸，不修改全站 iconBtn；≤760px 的 index 网格区域同步适配，模型列表布局不变。
- Details：手柄具备中文 aria-label、focus 态与方向键快捷键；Pointer Events 捕获指针，反馈源行与目标位置；ArrowUp/ArrowDown 移动一个可见位置，重绘后焦点回到该维度的手柄。仅重排可见项，映射回完整列表时保持隐藏归档槽位。
- Details：指针在视口上下 48px 区域时启动单个 requestAnimationFrame 循环，持续滚动页面并按最新指针坐标重算目标；指针静止仍持续，离开边缘/到达滚动边界时停止。释放、取消、Escape、丢失捕获、列表数据或筛选变化、组件卸载均清理帧循环与拖动状态。只在手柄设置 touch-action，普通行保持滚动。Demo 仅 pointermove 触发 scrollBy，不能直接视为已满足此项。
- Details：释放到有效目标时固定完整 ID 载荷并发送一次请求；同位置、边界键、取消、列表外释放不保存。排序请求及其成功/冲突重载期间仅禁用手柄和再次排序，CRUD、归档筛选保持可用，不把 saving 状态传入其他操作。筛选或维度数据变化时取消尚未释放的拖动；已发送载荷保持不变。沿用异步 hook 的取消旧加载机制，避免较早响应覆盖新数据。
- Details：成功调用现有 reload/session.refresh 并通知。409 自动 reload 最新服务端维度并提示“维度列表已变化，已重新加载”，不自动重发旧载荷；其他错误通知并保留最近加载的数据，“不变”指不应用本次未保存排列，而非覆盖其他 CRUD 成果。重载失败走现有错误重试入口，不展示已重载成功的提示；重新取数完成前不再排序。无需增加乐观排列镜像或请求队列。
- Acceptance Criteria：纯函数测试覆盖上下移动、首尾、无效移动、隐藏归档槽位及输入不变；拖动与键盘共用保存路径。1440/900/760/390px 检查实际手柄尺寸、首列容纳、名称和生产操作列不重叠且页面无溢出。15 项以上验证持续边缘滚动、离开停止与取消清理；请求未完成时重复排序无请求，CRUD/筛选可操作，409 只触发一次重载并允许随后重试。

## TASK-005：执行完整回归与浏览器验收
- Status：DONE
- Executor：主线
- Priority：P0；依赖：TASK-004；Phase：3
- Description：运行 Go 与前端检查，验收排序及展示传播。
- Details：运行 `go test ./...`、`go vet ./...`、`pnpm --dir web test`、`pnpm --dir web typecheck`、`pnpm --dir web build`；新增测试须纳入 package test 脚本。Go 若被沙箱拒绝编译缓存写入，按工具要求申请原命令重试，不绕过权限。
- Details：使用提供的 9222 浏览器实例与独立测试数据；覆盖 1440/900/760/390px、15 项以上长列表、鼠标拖动、键盘、取消、普通保存失败、409 自动重载及重载失败、刷新持久化、归档过滤、首尾移动、零/单项、各页面与评分弹窗顺序。保存中新增/删除制造集合冲突并检查重载，归档/筛选不要求禁用。不得修改用户真实数据；不启动替代 DSH GUI。
- Details：自动验收的触摸相关范围为移动视口布局、手柄 touch-action、合成 pointerType=touch 的 down/move/up/cancel 生命周期及清理。真实触屏手势独立列为人工验收项；有设备及授权则记录实际结果，否则明确“未执行：当前工具不提供真实触屏设备”，不以合成事件宣称真实手势通过，不将设备缺失作为阻塞自动交付的条件。
- Acceptance Criteria：命令与可自动执行检查全通过；记录真实执行方式、结果及人工触摸未执行原因；清理测试服务与一次性构建产物，保留已跟踪占位文件。

## TASK-006：维护项目文档、归档与提交
- Status：DONE
- Executor：主线
- Priority：P1；依赖：TASK-005；Phase：3
- Description：同步项目文档中的迁移、接口、全局排序行为与测试结果，归档后创建中文 Conventional Commit。
- Details：交付完成后删除或替换 [Project 当前规划注记](<../Project.md>) 中“规划交接阶段、尚未接入产品代码”的段落；在数据模型表补 position，在 API 表补 `PUT /api/dimensions/order` 及 400/422/409 语义，记录手柄局部尺寸、稳定计分和真实触摸验收状态；保留 Apple HIG + 瑞士平面基准，不将 Demo 本地保存方式写成产品行为。
- Details：任务完成即标记 DONE；全部完成后计划和任务标注 DONE、完成日期与回归结论，按当天递增目录归档；检查 git status/diff/log，仅提交本次相关文件，不提交密钥、数据库或构建产物。
- Acceptance Criteria：项目文档与代码一致，归档含 Plan/Tasks 且根目录无已完成文件；提交成功。
## 回归与验收结论
- 2026-10-22：`go test ./...`、`go vet ./...` 通过；覆盖旧库迁移保序、新建置尾、归档/恢复保留位置、原子重排失败回滚、稳定计分与接口状态码。
- 2026-10-22：`pnpm --dir web test` 14/14 通过；`pnpm --dir web typecheck`、`pnpm --dir web build` 通过。
- 2026-10-22：浏览器验收通过：1440/900/760/390 无横向溢出，手柄 52×44 / 44×48px；16 项列表持续边缘滚动至边界；鼠标拖动、键盘排序、合成触摸重排；同位置/取消/首尾边界不产生请求；保存失败保留顺序；409 自动重载；重载失败显示重试并恢复；刷新持久化；归档隐藏槽位；零/单项状态。
- 未执行：真实触屏手势（当前环境无触屏设备）；不据此宣称真实触摸通过。
