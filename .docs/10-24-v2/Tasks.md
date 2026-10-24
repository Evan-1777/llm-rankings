# Tasks：Review 报告吸收与残留修复

**关联 Plan**：`Plan.md`（Quick 执行记录）  
**状态**：DONE  
**日期**：2026-10-24  
**完成日期**：2026-10-24  
**总计 Task**：4 个（全部 DONE；执行主体均为主线）  
**上游**：2026-10-24 排行榜 Markdown 备注交付的只读 Review（90/100）  
**回归测试结论**：`pnpm --dir web test`（54/54）、`typecheck`、`build` 与 `go test ./...`、`go vet ./...` 通过。

## 吸收结论

采纳：备注根作用域换行、保存中保持离开保护、合并设置读取路径。

驳回：字段错误静默（不可达路径，补防御分支不划算）、saveRankingNotes 依赖（未引用且身份已随上游重建）。

---

### TASK-001：将长文本换行规则上移到备注根作用域

- **Status**：DONE
- **Executor**：主线
- **Priority**：P2
- **Depends On**：无
- **Description**：在 web/src/pages/Rankings.module.css 的 .notes 增加 overflow-wrap，并移除 .notes a 中的重复声明。
- **Details**：
  - CommonMark 不自动链接裸 URL，原规则只覆盖 a 元素，正文段落与行内 code 仍可能横向溢出。
  - overflow-wrap 可继承，放到 .notes 覆盖段落、列表、标题、行内代码；.notes pre 的 white-space: pre 保持代码块横向滚动，不受影响。
- **Acceptance Criteria**：.notes 含 overflow-wrap: anywhere；.notes a 不再重复声明；pnpm --dir web build 通过。

### TASK-002：备注保存期间继续拦截离开

- **Status**：DONE
- **Executor**：主线
- **Priority**：P3
- **Depends On**：无
- **Description**：在 web/src/pages/Settings.tsx 增加 notesSaving 局部状态，与 notesDirty 共同参与路径拦截与 beforeunload。
- **Details**：
  - 保存时 Provider 乐观写入 rankingNotes，notesDirty 会短暂变 false；请求失败则回滚，若此时已导航则草稿丢失且无提示。
  - saveNotes 在请求前后维护 notesSaving；拦截条件改为 notesDirty || notesSaving，提示文案不变。
- **Acceptance Criteria**：保存进行中导航会触发离开确认；保存成功后拦截解除；失败后草稿保留且仍为 dirty；typecheck 通过。

### TASK-003：合并设置读取与重试路径

- **Status**：DONE
- **Executor**：主线
- **Priority**：P3
- **Depends On**：无
- **Description**：在 web/src/preferences/DisplayPreferences.tsx 提取 loadSettings，初次加载与 retryRead 共用。
- **Details**：
  - 统一 applySettings、AbortError 忽略与 readError 写入；初次加载仍只在未 abort 时结束 loading。
  - retryRead 保留 retrying 状态与重复点击防护；不改变 Provider 对外契约。
- **Acceptance Criteria**：两处读取只保留一份实现；AbortError 不产生 readError；typecheck 与 build 通过。

### TASK-004：验证、文档核对、归档与提交

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Depends On**：TASK-001、TASK-002、TASK-003
- **Description**：执行回归，核对 Project.md 是否需要同步，归档本轮文档并提交。
- **Details**：
  - 运行 pnpm --dir web test、typecheck、build，go test ./...、go vet ./...，Go 使用可写临时 GOCACHE。
  - 改动不涉及接口、数据或架构，Project.md 仅在事实变化时更新。
  - Plan.md/Tasks.md 标 DONE 并记录验证结论，移入 .docs/10-24-v2/，确认根目录无残留。
  - 只暂存源码与文档，提交信息使用 Conventional Commits 英文前缀与中文描述。
- **Acceptance Criteria**：全部检查通过；归档目录含 Plan.md 与 Tasks.md；提交不含构建产物、缓存或无关改动。
