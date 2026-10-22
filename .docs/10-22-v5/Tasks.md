# Tasks：移除主页可见登录入口

**关联 Plan**：`Plan.md` —— 移除主页可见登录入口 v1.0  
**状态**：DONE  
**完成日期**：2026-10-22  
**总计 Task**：5 个，均由主线执行

---

## Phase 1：移除可见入口

### TASK-001：删除页头登录链接

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：无
- **Description**：移除全局页头在未登录状态下渲染的登录链接，并清理对应样式。
- **Details**：
  - `web/src/components/Header.tsx`：会话区域的未登录分支改为不渲染内容；保留加载占位与已登录的“管理员/退出”状态；`Link` 仍用于品牌链接，其他导航不变。
  - `web/src/components/Header.module.css`：删除不再使用的 `.login` 与 `.login:hover` 规则。
  - 不修改 `SessionProvider`、路由表或认证接口。
- **Acceptance Criteria**：未登录时页头不存在“登录”文本或指向 `/login` 的链接；加载占位与已登录状态仍正常；`pnpm --dir web typecheck` 通过。

### TASK-002：删除排行空态的登录按钮

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-001
- **Description**：排行页三处匿名空态不再提供登录 CTA，只保留管理员已登录时的操作。
- **Details**：
  - `web/src/pages/Rankings.tsx`：删除 `openLogin` 回调；三处 `!session.authenticated` 分支的“登录”按钮改为不渲染操作区；保留空态标题与管理员配置说明。
  - 已登录时的“前往维度设置 / 设置权重 / 新增模型”分支保持不变；`useNavigate` 继续服务于设置与对比跳转。
- **Acceptance Criteria**：排行页在无维度、无权重、无模型三种空态下均不出现登录按钮；已登录操作仍可用；类型检查通过。

---

## Phase 2：验证与交付

### TASK-003：执行自动化检查与浏览器验收

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0；依赖：TASK-001、TASK-002
- **Description**：确认没有残留的可见登录入口，并验证登录 URL 与受保护页重定向仍可用。
- **Details**：
  - 检索 `web/src` 中所有 `/login` 引用，确认仅剩路由注册与 `RequireAdmin` 重定向，不存在用户可见链接或按钮。
  - 运行 `pnpm --dir web test`、`pnpm --dir web typecheck`、`pnpm --dir web build`；运行 `go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server` 检查无回归。
  - 使用临时数据库与临时口令启动单一本地进程，在 1440 与 390 视口验收：主页无“登录”入口、直接访问 `/login` 显示表单、未登录访问 `/settings` 跳转 `/login?next=%2Fsettings`、登录后页头显示管理员状态与退出。
  - 结束后停止进程并清理临时数据库与构建产物中的一次性文件。
- **Acceptance Criteria**：全部命令退出 0；浏览器结论记录实际路径与视口；主页与空态无登录入口；`/login` 与受保护页重定向可用；无遗留进程。

### TASK-004：同步 Project.md

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1；依赖：TASK-003
- **Description**：把登录入口策略与验证结论写回项目事实来源。
- **Details**：
  - 更新“当前增量”及前端路由/认证相关描述，说明登录页仅通过直接 URL 访问，页头与排行空态不提供入口。
  - 在“约束与决策”补充本次决策与理由；在“测试与验收”记录实际命令与浏览器结果。
  - 不改写无关章节，不记录未执行项为通过。
- **Acceptance Criteria**：Project.md 与最终代码一致；无“页头提供登录入口”等过期描述。

### TASK-005：归档并提交

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1；依赖：TASK-004
- **Description**：完成计划归档与中文 Conventional Commit。
- **Details**：
  - Plan.md 与 Tasks.md 标记 DONE、完成日期与回归测试结论，移入 `.docs/10-22-v5/`；确认根目录无残留。
  - 检查 `git status`、`git diff`、`git log`；仅暂存本轮相关文件，不提交密钥、数据库或构建产物。
  - 提交信息使用英文类型 + 中文描述，聚焦用户可见行为变化；不使用 `--amend`、不跳过钩子、不强推。
- **Acceptance Criteria**：归档目录同时含 Plan.md 与 Tasks.md；根目录无已完成计划；提交成功且工作区干净；提交信息符合规范。

---

## 回归与验收结论

- 2026-10-22：`pnpm --dir web test` 25/25 通过，`typecheck`、`build` 通过。
- 2026-10-22：`go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server` 通过；沙箱默认 GOCACHE 只读，改用工作区缓存，验证后清理。
- 2026-10-22：全项目检索仅剩 `/login` 路由注册与 `RequireAdmin` 重定向，无用户可见登录链接或按钮。
- 2026-10-22：浏览器验收 1440/390；主页页头与无维度、无模型空态均无登录入口；直接访问 `/login` 显示表单；未登录访问 `/settings?tab=display` 跳转 `/login?next=%2Fsettings%3Ftab%3Ddisplay`；登录后页头显示管理员与退出，登出恢复匿名页头；无页面横向溢出。
