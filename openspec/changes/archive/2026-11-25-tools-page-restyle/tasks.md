# Tasks

## 1. 守卫先行（RED）

- [x] 1.1 `pageHeaderActions.source.test.ts` PAGES 清单加 `['Tools.vue', 'tools.html']`，运行 `npx vitest run src/views/__tests__/pageHeaderActions.source.test.ts`：预期徽标一致性断言转红（设计有 `.ph-inline` / 实现无 `PageStatBadges`）、页头动作断言「空 ↔ 空」通过；若断言形态不兼容在本步解决（不放宽既有断言）
- [x] 1.2 `mockupParity.source.test.ts` 增 tools 段三条红线（Tools.vue 模板禁 `a-layout-sider` / 必含 `PageStatBadges` / 「当前时间」用 `tb-btn-ghost` 且「清空」用 `tb-btn-clear` 两类名分离），运行该测试确认对现状 RED

## 2. 页头接入（GREEN-1）

- [x] 2.1 Tools.vue 接入 `PageHeader`（标题「工具箱」+ 描述行）+ `#stats` 槽 `PageStatBadges`（items：`{ value: tools.length, label: '个工具' }` 首枚 accent、`{ value: 0, label: '外发请求' }`；无 `#actions` 槽），验证 1.1 测试转绿

## 3. 工作台外壳与工具栏（GREEN-2）

- [x] 3.1 `a-layout`/`a-layout-sider` 退场，改为单卡 flex 结构（`.tb-workbench` = `.tb-rail` + `.tb-stage`），scoped 样式按设计页 `tb-*` 值迁移；14 个工具项图标换内联 SVG（与设计页逐字一致），`.tb-tool` 激活 accent 实底白字 / 悬停 accent 弱底；清理 `@ant-design/icons-vue` 退场的图标 import（含帮助按钮问号图标），验证 1.2 mockupParity tools 段转绿
- [x] 3.2 浏览器 1600×1000 截图对照设计页外壳段（工具栏解剖：`--bg` 底 + 右描边、单层卡片、高亮态），差异归零后进入下一组

## 4. 工具面板解剖（GREEN-3，按五类样张分组验收）

- [x] 4.1 面板头规范：`.tb-head`（标题 15px/600 + 用途提示灰字 + spacer + 帮助/清空），三按钮类分离（`.tb-btn-help` accent 弱底 / `.tb-btn-ghost` 中性 / `.tb-btn-clear` 危险色 hover），「当前时间」换挂 `.tb-btn-ghost`；验证：类名守卫保持绿 + 截图对照
- [x] 4.2 双栏对转类（Lua/URL/JSON/SM4/Base64/YAML/YAML↔JSON）：`.tb-dual/.tb-pane/.tb-ta`（mono 12.5px、行高 1.7、聚焦 accent 环）+ `.tb-copyrow` mini 按钮 + 中部动作按钮布局；验证：截图对照设计页主视图
- [x] 4.3 输入即算类（时间戳/IP·CIDR/哈希/JWT）：`.tb-result` 结果格容器 + 主行 `.rg-hl` accent 强调 + JWT exp 徽标（绿「剩余 N 分钟」/红「已过期」）；验证：截图对照样张「输入即算 + 结果格」与「解码块 + exp 行」
- [x] 4.4 差异结果区（JSON 对比/文本 Diff）：`.tb-diffsum` 摘要行 + `.tb-difflines` token 配色（del 红 / add 绿 / ctx muted），语义不变；验证：截图对照样张「双栏 + 差异结果区」
- [x] 4.5 SM4 专用：警示条硬编码色值（`#fffbeb/#fde68a/#92400e`）迁 `--warning` 同族 token + `.tb-keyrow` 密钥行解剖；验证：短密钥态截图对照样张「密钥行 + 双栏」
- [x] 4.6 Keepalived 专用：表单字段/三列高级参数网格（`.tb-grid3`）/组标题/文件卡片（灰底头 + mono 文件名 + 复制/下载）/节点折叠行样式对齐设计页，`a-collapse` 交互行为保留；验证：生成态截图对照样张「表单生成器」

## 5. 回归收口

- [x] 5.1 `npx vue-tsc -b` 通过 + 全量 `npx vitest run --maxWorkers=4` 全绿（含 `toolHelp.source.test.ts` 等工具域既有用例无回归）
- [x] 5.2 parity 五步法收口（#82）：双侧同数据截图 + 逐元素量测五类解剖（面板头/双栏/结果格/差异区/表单生成器九要素：字号/字重/颜色/内距/边框/圆角/行高/盒尺寸/图标），差异清单复核全 ✓，量测脚本与截图存档至本变更目录
- [x] 5.3 重拍手册工具箱截图：先查 `frontend/scripts/manual-screenshots.mjs` SHOTS 清单确定工具箱组名（`--only` 为精确匹配，#63），重拍并核对 `docs/user-manual/24-tools.md` 文字描述与新版视觉无冲突

## Workflow follow-up

- 实施完成后：按 #53 以主 spec `openspec/specs/dev-tools/spec.md` 现文为基准备归档合并（MODIFIED「工具箱页面布局」全块替换 + ADDED「工具箱页头」），`openspec validate --all` 收口
- 归档后 git commit + push（提交信息对照 `git diff --cached` 实际内容，AGENTS Git 规则）
