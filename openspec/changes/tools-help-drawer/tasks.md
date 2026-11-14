# Tasks

## 1. 守卫先行（RED）

- [x] 1.1 写 `frontend/src/config/__tests__/toolHelp.source.test.ts`：源码扫描 `Tools.vue` 的 tools 数组提取全部 tool key，断言 `config/toolHelp.ts` 对每个 key 都有六段非空文档（what/why/when/how/example/cautions），并断言无多余 key——此时 toolHelp.ts 不存在，测试必须先红（TDD RED，验证失败输出）。验证：`npx vitest run src/config/__tests__/toolHelp.source.test.ts` 红。

## 2. 内容与组件（GREEN）

- [x] 2.1 建 `frontend/src/config/toolHelp.ts`：`ToolHelpDoc` 类型（what/why/when[]/how[]/example{input,output,note?}/cautions[]）+ 14 个工具的完整六段文案（lua/url/json/sm4/base64/yaml/diff/timestamp/jwt/convert/textdiff/ipcalc/hash/keepalived），示例值取 `dev-tools` spec 既有场景真实值，每条目注释标注依据出处。验证：1.1 守卫测试转绿。
- [x] 2.2 建 `frontend/src/components/ToolHelpDrawer.vue`：a-drawer（480px）渲染六段骨架（示例段 mono 输入→输出块、注意段警告块），props 为 `open` + `toolKey`，长文档抽屉内滚动。验证：组件测试 `ToolHelpDrawer.test.ts` 断言六段渲染与警告样式。
- [x] 2.3 `Tools.vue` 接线：挂载单个 `ToolHelpDrawer`，14 个 `tool-header` 在「清空」左侧各加一行「帮助」按钮（事件处理器提取为 script 函数，禁止模板内多语句，#25）。验证：`Tools` 相关组件测试绿 + `npx vue-tsc -b` 零错误。

## 3. 行为测试与回归

- [x] 3.1 扩展 Tools 组件测试：帮助按钮存在、点击开抽屉、抽屉打开时切换工具内容跟随 activeTool、关闭后回到原工具且输入不清空。验证：`npx vitest run src/views/__tests__/Tools*.test.ts src/components/__tests__/ToolHelpDrawer.test.ts --maxWorkers=4` 全绿。
- [x] 3.2 定向回归：`npx vitest run --maxWorkers=4`（至少覆盖 views/tools 与 config 相关文件，#58 波动先隔离复跑再定性）+ `npx vue-tsc -b`。验证：两者零新增失败。

## 4. 真实页面验收

- [x] 4.1 Playwright 连 `http://localhost:12345`（复用常驻服务，#8）在工具箱页实操：Lua 打开帮助→六段可见→切时间戳内容跟随→关闭输入仍在；Keepalived 帮助长文档抽屉内滚动不撑破布局；截图留档。验证：截图 + 操作录屏/步骤输出，用户页面确认。

## Workflow follow-up

- 用户在真实页面评审文案后，按反馈修订 toolHelp.ts（单点修改）。
- 视需要补用户手册第 24 章「帮助抽屉」一段（次要）。
- 归档变更（openspec archive）并同步主 spec `tools-help`。
