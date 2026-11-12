# Tasks：榜单组列取值统一与表头对齐

**关联工作流**：Quick（Explore → Formulate Tasks → Execute → Document Maintenance → Archive → Git Commit）
**状态**：DONE
**开始日期**：2026-11-12
**完成日期**：2026-11-12
**总计 Task**：5 个
**执行主体**：全部主线
**回归测试结论**：自动化基线全绿 —— `go test ./...`（64 个测试函数全绿）、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`（73/73，新增「导出图组列取值按维度格式绘制并复用同一右锚点」断言）、`pnpm --dir web typecheck`、`pnpm --dir web build`、`gofmt -l cmd internal` 无输出。浏览器用临时库真实数据（1873 视口对齐用户截图：9 维度含 1 个 2 维组、19 模型、百分比最高分占比、含 Skip 与缺失值）读回：组列取值改走 `DimensionScore` 后带百分比与色阶底色/下划线，实际分值模式下与维度列同为一位小数（组列 61.4 / 维度列 6.4），首行取值右缘与列头右缘逐列同值 794.6 / 903.3 / 1011.9 / 1120.5 / 1229.1 / 1337.8 / 1446.4 / 1555；组列副行「2 项」消失、各评分列副行同为 10px 空占位；表头标签中心与表头行中心偏差 0.25px（390 下 0.5px）、标签包围盒顶收敛为单值 349、与右侧明细箭头中心线相差 0.5px；1873 / 1440 / 390 页面级无横向溢出。

**需求来源**：`temp/PixPin_2026-11-12_19-36-33.png` 的四条批注

| 批注 | 落点（像素证据） | 本轮处理 |
|---|---|---|
| 格式不一样且无%、无颜色，请与其他统一 | 组列取值框（x 909-1057 / y 325-399 与 x 924-1044 / y 414-885）对照维度列取值框（x 849-925 / y 330-386） | TASK-001 |
| 不展示 | 组列表头副行「2 项」框（x 978-1016 / y 293-311） | TASK-002 |
| 上下居中，目前偏上 | 表头行框（x 620-1594 / y 263-318），标签墨迹中心比行中心高 6.5px | TASK-003 |
| 未对齐 | 箭头尾端落在组列第 1 行取值框右缘（x 1057 / y 352） | TASK-001（组列与维度列同构后取值框与下划线一并归位） |

---

## Phase 1：组列取值与维度列统一

### TASK-001：组列取值改走维度列同一显示路径

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `web/src/pages/Rankings.tsx` 让组列取值通过与维度列相同的 `DimensionScore` 渲染，显示口径（百分比模式、最高分占比、红蓝色阶）与小数位与维度列一致。
- **Details**：
  - 现状：组列单独走 `formatScore`（固定两位小数换算分），既无百分比后缀也无色阶底色与下划线
  - 改法：按组名预计算盘面上各组取值的 `scoreRange` / `scoreMax`（复用既有 `groupValue`、`scoreRange`、`scoreMax` 纯函数），组列单元格改用 `<DimensionScore>`，取值、区间与最大值与维度列同源
  - 副作用清理：删除随之失去引用的 `formatScore` 导入（`noUnusedLocals` 生效）
  - 排序与组明细抽屉不受影响（排序键仍取 `groupValue`）
- **Acceptance Criteria**：浏览器读回组列取值带百分比或与维度列同位小数、带色阶底色与下划线；组列与维度列取值框右缘、下划线位置一致；综合分与名次不变

## Phase 2：表头

### TASK-002：移除组列表头副行「n 项」

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `web/src/pages/Rankings.tsx` 去掉组列表头副行的「n 项」，并删除因此不再需要的 `ColumnHead` 的 `sub` 参数；在工作台仍使用副行的前提下更新 `SortButton` 的 `sub` 注释。
- **Details**：
  - 保留 `SortButton` 内部的副行占位（10px），表头首行基线与「综合排名」表头的占位块保持不变
  - `sub` 参数仅榜单列头使用，删除后不再有调用方传空串；工作台的「权重 N」副行不受影响
- **Acceptance Criteria**：榜单表头无「n 项」文本；表头首行墨迹顶与排序切换后的列头位置不变；工作台表头仍显示「权重 N」

### TASK-003：表头文字垂直居中

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `web/src/pages/Rankings.module.css` 调整表头单元格的上下内边距，让表头标签落在表头行的垂直中心线上。
- **Details**：
  - 现状：内容块（标签 + 3px 间距 + 10px 副行占位）在内容盒内已居中，但标签位于块顶，标签中心比行中心高 6.5px；右侧明细箭头按行居中
  - 改法：`.th` 上下内边距由 14/13 调整为 20/7（移动端 10/11 → 16/16 保持行高不变），内容仍顶端对齐，故换行标签的首行基线不变量保持
  - 首行基线不变量：所有列头内容块等结构等内边距，标签首行仍落在同一 y
- **Acceptance Criteria**：浏览器读回表头标签包围盒中心与表头行中心偏差 ≤1px；首行墨迹顶收敛为单值；列头文字右缘仍压在列内数字右缘上

## Phase 3：导出、验证与归档

### TASK-004：导出图组列取值与维度列同格式

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `web/src/lib/exportImage.ts` 把组列取值由 `formatScore`（两位小数）改为 `formatDimension`（一位小数），与同图维度列统一。
- **Details**：
  - 导出图按实际分值绘制、不带百分比与色阶，故只需统一小数位
  - 右锚点计算方式不变，列锚点断言不受影响
- **Acceptance Criteria**：`pnpm --dir web test` 全绿；导出图组列取值与维度列同为一位小数且右缘锚点不变

### TASK-005：回归基线、浏览器验收、文档同步与归档提交

- **Status**：DONE
- **Executor**：主线
- **Description**：跑通验证基线，用临时库真实数据在浏览器按用户截图同场景（1873 视口、百分比最高分占比、1 组 9 列、19 模型、含 Skip 与缺失值）验收，更新 `.docs/Project.md`，归档并提交。
- **Details**：
  - 基线：`go test ./...`、`go vet ./...`、`CGO_ENABLED=0 go build ./cmd/server`、`pnpm --dir web test`、`pnpm --dir web typecheck`、`pnpm --dir web build`、`gofmt -l cmd internal`
  - 浏览器：读回组列取值格式/色阶/右缘锚点、表头标签中心与行中心、首行墨迹顶、评分列宽、页面无横向溢出；1440 与 390 复核
  - 文档：Project.md 排行、导出图片与验证归档段落同步
  - 归档：`Tasks.md` 移入 `.docs/11-12-v7/`
- **Acceptance Criteria**：全部命令退出码 0；`git status` 干净；归档目录含 Tasks.md；提交信息符合项目规范
