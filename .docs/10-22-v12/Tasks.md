# Tasks：维护模式

**关联 Plan**：`Plan.md` —— 维护模式 v1.0
**状态**：DONE
**日期**：2026-10-22
**完成日期**：2026-10-22
**总计 Task**：8 个
**回归测试结论**：`go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server` 通过；`pnpm --dir web test` 44/44、`typecheck`、`build` 通过；浏览器验收覆盖 1440/390，维护页、管理员访问、登出与关闭维护后恢复均符合预期。

---

## Phase 1：设置数据与接口契约

### TASK-001：追加维护模式迁移与存储读写

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `migrations/` 新增 `004_maintenance_mode.sql`，为 `display_settings` 追加 `maintenance_mode` 列；在 `internal/store/display.go` 以结构体返回两个站点开关，并同步写入两者。
- **Details**：
  - 迁移使用 `ALTER TABLE ... ADD COLUMN`，默认 0，带 0/1 约束
  - `DisplaySettings` 返回 `ScorePercentageMode` 与 `MaintenanceMode`
  - `UpdateDisplaySettings` 接收完整设置并 upsert 两列
- **Acceptance Criteria**：
  - 旧库升级后两开关均可读，维护模式默认关闭
  - 存储测试可同时断言两开关独立持久化
- **依赖**：无
- **优先级**：P0

### TASK-002：扩展显示设置接口为双开关

- **Status**：DONE
- **Executor**：主线
- **Description**：修改 `internal/api/handlers_display.go`，GET 返回 `maintenanceMode`，PUT 要求两个字段齐全并返回保存后的完整设置。
- **Details**：
  - 响应结构同时包含 `scorePercentageMode` 与 `maintenanceMode`
  - 缺任一字段返回 422，字段级错误指向缺失项
  - 保留 `Cache-Control: no-store` 与管理员写权限
- **Acceptance Criteria**：
  - 匿名 GET 可见两开关
  - 缺字段 422、未知字段 400、跨源 403、匿名 PUT 401
  - 管理员 PUT 后 GET 立即读到新值
- **依赖**：TASK-001
- **优先级**：P0

---

## Phase 2：后端维护门禁

### TASK-003：新增 API 维护门禁中间件

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `internal/api/middleware.go` 新增维护门禁，并在 `internal/api/server.go` 接入中间件链。
- **Details**：
  - 仅作用于 `/api` 与 `/api/` 路径
  - 豁免 `GET /api/health`、`POST /api/auth/login`、`POST /api/auth/logout`、`/api/display-settings`
  - 开启维护且未认证时返回 503 `maintenance`；已认证管理员与关闭状态直接放行
  - 非 API 路径与静态资源不受影响
- **Acceptance Criteria**：
  - 维护期间匿名排行、详情、模型、导出均 503
  - 匿名登录、健康检查、显示设置读取正常
  - 管理员读写与关闭维护后的匿名访问均正常
- **依赖**：TASK-001
- **优先级**：P0

---

## Phase 3：前端维护页与路由拦截

### TASK-004：扩展前端显示偏好为双开关

- **Status**：DONE
- **Executor**：主线
- **Description**：修改 `web/src/api/types.ts`、`web/src/preferences/DisplayPreferences.tsx`，加载与保存两个站点开关。
- **Details**：
  - `DisplaySettings` 类型增加 `maintenanceMode`
  - Provider 暴露 `maintenanceMode` 与 `setMaintenanceMode`
  - 两个 setter 均提交完整设置，失败回滚并 toast
- **Acceptance Criteria**：
  - 初始读取回填两开关
  - 任一开关切换均保留另一个值
  - 保存失败时两个值回到保存前
- **依赖**：TASK-002
- **优先级**：P0

### TASK-005：新增维护页组件

- **Status**：DONE
- **Executor**：主线
- **Description**：新增 `web/src/pages/Maintenance.tsx` 与 `Maintenance.module.css`，居中展示品牌 Logo、维护标题、简短说明与登录入口。
- **Details**：
  - 页面自适应视口垂直居中，无页头
  - Logo 使用现有 `/brand-icon.png`，提供替代文本
  - 登录入口指向 `/login`
  - 设置文档标题为「维护中」
  - 视觉沿用纸白/墨黑/信号红、0 圆角、1px 分隔线
- **Acceptance Criteria**：
  - 1440 与 390 宽度下 Logo 与文字居中、无横向溢出
  - 登录入口可点击并进入登录页
  - 无解释性噪声文案
- **依赖**：TASK-004
- **优先级**：P0

### TASK-006：全局路由拦截维护状态

- **Status**：DONE
- **Executor**：主线
- **Description**：修改 `web/src/App.tsx` 的 `RootLayout`，维护开启且未登录时仅渲染维护页；登录路径保持正常布局；加载阶段不闪现站点内容。
- **Details**：
  - 维护状态来自显示偏好，登录态来自会话
  - 非登录路径等待显示设置与会话判定后再渲染
  - 已登录管理员访问任意路径不受影响
- **Acceptance Criteria**：
  - 匿名访问 `/`、`/models/:slug`、`/settings` 等均只看到维护页
  - 匿名访问 `/login` 仍显示登录表单
  - 管理员登录后恢复页面；登出后回到维护页
- **依赖**：TASK-004、TASK-005
- **优先级**：P0

### TASK-007：修正维护期间登出的本地会话状态

- **Status**：DONE
- **Executor**：主线
- **Description**：修改 `web/src/session/SessionProvider.tsx`，登出成功后先置为未登录再刷新会话。
- **Details**：
  - `api.logout()` 成功后立即 `setAuthenticated(false)`
  - 后续 `refresh()` 失败不回退为已登录
- **Acceptance Criteria**：
  - 维护期间登出立即显示维护页，不残留管理员标识
- **依赖**：TASK-006
- **优先级**：P1

---

## Phase 4：设置入口与验收

### TASK-008：新增设置开关并完成测试与文档

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `web/src/pages/Settings.tsx` 的「显示」分区新增维护模式开关；更新 Go/前端测试；执行完整验证；同步 `Project.md` 并归档。
- **Details**：
  - 开关说明标注「所有设备」，与百分比模式并列
  - 读取或保存期间禁用
  - 更新 `internal/api/api_test.go`、`internal/store/store_test.go`
  - 运行 `go test ./...`、`go vet ./...`、前端 test/typecheck/build、`CGO_ENABLED=0 go build ./cmd/server`
  - 浏览器验收维护页、登录、登出与恢复
- **Acceptance Criteria**：
  - 设置页可开启/关闭维护模式且状态持久化
  - 全部测试与构建通过
  - `Project.md` 记录新设置、门禁与维护页
  - Plan/Tasks 归档至当日新版本目录
- **依赖**：TASK-002、TASK-003、TASK-006、TASK-007
- **优先级**：P0
