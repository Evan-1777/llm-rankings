# Plan：Review 报告吸收与残留修复

**状态**：DONE  
**日期**：2026-10-24  
**完成日期**：2026-10-24  
**版本**：v1.0  
**工作流**：Quick（无独立规划阶段，本文件为执行记录）  
**上游**：2026-10-24 排行榜 Markdown 备注交付的只读 Review（90/100）  
**回归测试结论**：`pnpm --dir web test`（54/54）、`typecheck`、`build`、`go test ./...`、`go vet ./...` 通过；三项修复均未改变接口与数据契约。

## 1. 背景与目标

Review 给出 5 条问题：备注正文长 token 不换行、保存请求期间离开保护失效、字段错误对开关调用方静默、saveRankingNotes 依赖漏项、初次读取与重试两套实现。本轮逐条核对，只修具备实际风险且成本相称的问题。

## 2. 采纳与驳回

采纳：

- 换行规则上移到 .notes 根作用域：裸 URL 与行内长 token 与链接同等换行；pre 保留 white-space 与横向滚动。
- 备注保存进行中继续保持离开保护：新增局部 notesSaving，与 notesDirty 共同参与 blocker 与 beforeunload。
- 合并初次读取与重试为单一 loadSettings，消除重复的 apply/错误映射，重试复用同一套 AbortError 语义。

驳回：

- 字段错误对所有调用方静默：422 只能由备注长度产生，开关调用方提交的是已校验快照；补齐需要调用方逐个判错或重复提示，属于为不可达路径增加防御分支，维持现状。
- saveRankingNotes 依赖漏项：该回调未引用 rankingNotes，且 saveSiteSettings 已随 rankingNotes 重建身份，补一个未使用依赖会误导后续维护；不改。

## 3. 交付与验证

- 前端样式与两个组件状态路径调整，不涉及后端、接口与数据契约。
- 验证：typecheck、build、前端 54 项测试、go test ./...、go vet ./...。
- 交互改动无组件测试基础设施，浏览器行为沿用上一轮验收结论，本轮不新增手工验收。
