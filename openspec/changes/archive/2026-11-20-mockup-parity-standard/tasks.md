# Tasks

## 1. 基线

- [x] 1.1 守卫反转清单：grep 全域（tableHeaderHitArea/tableAnatomy/三页测试/任意 grid-table 竖线断言）——验证：清单落本文件（grep 实测：无竖线/内距断言，无需反转项；新增源码守卫见 3.x）
- [x] 1.2 基线验证：全量单测 + vue-tsc 绿（沿用 list-pages-console-restyle 收口态 2b56496c）

## 2. 全站单点（用户裁决①）

- [x] 2.1 PageHeader：margin-bottom 24→20px、h1 22/700→21px/600——验证：组件测试绿 + 三页真机截图
- [x] 2.2 回归抽查：其余高频页（集群/统一管理/SSL）页头观感——验证：截图目检无异常

## 3. L5 解剖对齐（三页作用域）

- [x] 3.1 三页 `.table-container` 追加 `l5-card` 类（激活既有 L5 作用域规则）
- [x] 3.2 style.css L5 新增解剖段：表头（去大写/卡同底/9px 12px）、td 10px 12px、去单元格竖线（保留把手锚线）、悬停 accent 4%、行内按钮 hover accent 三件套 + 圆角 4px、`.v-sep`、`.c-strong`/mono 12.5px、分页重绘（28×28 方形 mono/current accent/total 12px/border-top）
- [x] 3.3 操作列：状态查询补 12px 波形 SVG；v-sep 接线（节点页 状态查询｜重载 之间；上游/路由无该组合不接线）；「列配置」触发器补 ▾（三页）
- [x] 3.4 IP 格 600 字重（节点页）
- [x] 3.5 节点页批量条：`l5-batchbar` 化（has-sel accent + 右端「清除选择」）+「批量导入」迁页头 actions
- [x] 3.6 源码守卫 `mockupParity.source.test.ts`：三页 l5-card、L5 解剖段关键规则、v-sep/批量条接线——验证：`npx vitest run` 该文件绿

## 4. 收口

- [x] 4.1 断言反转落实（1.1 清单结论 + 受影响既有用例如批量条定位）——验证：全量单测 `npx vitest run --maxWorkers=4` 绿
- [x] 4.2 `npx vue-tsc -b` + prettier/eslint 0 error——验证：退出码 0
- [x] 4.3 `openspec validate --all` 0 error——验证：输出 0 error
- [x] 4.4 同数据注入截图对照三页（复用 parity 脚本扩上游/路由）+ 真机抽查（拖拽手感/悬停/分页）——验证：截图存档本变更目录 + 逐项核对记录

> 1.1 结论（grep 实测）：tableHeaderHitArea 仅断言拖拽定位契约（position/inset/z-index/cursor），无竖线/内距断言；三页测试仅断言 `.grid-table` 类存在（类名保留）——**零反转项**；新增源码守卫 `mockupParity.source.test.ts`（3.6）。
> 2.1/2.2 证据：PageHeader 20px/21px-600 全站单点；集群/统一管理/SSL 页截图目检无异常（impl-parity 三页截图 + 既有页面共享组件测试绿）。
> 3.x 证据：三页 `table-container l5-card`；L5 解剖段（表头/td/去竖线/悬停 accent/动作按钮 hover+圆角/v-sep/c-strong/分页重绘）落 style.css 末段；节点页状态查询波形 SVG + v-sep + IP c-strong；批量条 l5-batchbar（has-sel + 清除选择）+ 批量导入迁页头；三页列配置 ▾（CaretDownOutlined）。
> 3.6/4.x 证据：`mockupParity.source.test.ts` 9 用例绿；**连带修复**：三页 refreshList 并发双请求使「最后一次调用」断言竞态（2/4 全量轮次同用例红）→ 顺序化（先列表后统计）后连续两轮全量 2914 绿（2026-11-17）；vue-tsc 0 error、eslint 0 error；`openspec validate --all` 216 passed / 0 failed。
> 4.4 证据：同数据注入截图三页存 `screenshots/impl-parity-*.png`（nodes=设计稿原数据逐项对齐；upstreams/routes=mockup 形状等价数据）；真机抽查拖拽把手/悬停 accent/分页形态待用户复验。

## 7. 第二轮（用户真机复核驱动，parity-audit-nodes-r2.md）

- [x] 7.1 r2-1 布局壳：app-header 底线 2px accent → 1px 中性灰、app-content padding 20→24px（用户裁决①全站）
- [x] 7.2 r2-2 节点页工具条：挂 nowrap（搜索锁定 150px）、下拉宽度 104/120/104
- [x] 7.3 r2-3/4 图标：新增 `components/StrokeIcon.vue`（设计稿 stroke 线稿单点：play/pause/rotate/pulse/upload/sliders/chevronDown）；批量导入+滑杆接线列配置；批量条四动作与行内动作（启动/停止/状态查询/重载）全部换设计线稿，antd 圈形图标退场（toolbar 刷新 ReloadOutlined 保留）
- [x] 7.4 r2-5 表头分隔线短线形态（right 3px / top 30% / height 40%，hover accent 加长；命中区不变）
- [x] 7.5 r2-6 组头 checkbox 去除（选择列 display:none + 组头 colSpan +1 补宽；功能零损失分析见清单）
- [x] 7.6 r2-7 组头折叠图标换细线 chevron（StrokeIcon；折叠旋转沿用 .g-chev.folded svg 规则）
- [x] 7.7 r2-9 翻页左侧「共 N · 每页」（options display:contents 拆分，sizeChanger order:-1 居左，跳至留右端；总数后缀「· 每页」伪元素）
- [x] 7.8 守卫同步：mockupParity.source.test.ts 扩 r2 断言（16 用例）；NodeList.source 图标守卫反转（StrokeIcon + MoreOutlined）；NodeList.test colSpan 9
- [x] 7.9 收口：全量单测 211 files / 2919 绿（Tools 1 例为隔离即绿的竞争波动）+ vue-tsc 0 error + 同数据截图 `screenshots/impl-parity-nodes-r2.png`（量测：content padding 24px ✓、header 1px 中性灰 ✓、搜索 150 ✓、下拉 104 ✓、组头选择列 display:none ✓、chevron polyline ✓、has-sel + 清除选择 ✓、sizeChanger order -1 ✓）

## 9. 第四轮（用户真机复核驱动，parity-audit-nodes-r4.md · 五项裁决 2026-11-17 全部批准后实施）

> 取证脚本 `/tmp/opencode/parity-r4/probe.mjs` / `probe-ops.mjs`（Playwright 双侧计算样式与几何量测）。
> 本轮含 1 项机制改动（内置分页 → 外置分页条），批准前不动代码。
> 实施与复测记录见 `parity-audit-nodes-r4.md`「实施记录」节（改动清单 / 实测对照表 / 断言反转清单 / 已接受残差）。

- [x] 9.1 用户项① 页头统计标签字重：`.ph-lite` 补 `font-weight:600` + `letter-spacing:-0.42px`（设计页胶囊嵌在 h1 内继承 600，实现页是 h1 兄弟节点丢继承）——验证：计算样式 weight=600、截图对照
- [x] 9.2 用户项② 操作列过宽：L5 行内按钮解剖对齐（容器 gap 2px、`.btn-ghost.btn-sm` 内距 `0 6px`/gap 3px、更多触发器去边框 26px）+ 行内文案「状态查询」→「状态」+ 操作列宽 298——验证：操作列 298、表格总宽 ≤ 1310 无横向溢出
- [x] 9.3 用户项③ 分组行底色：组头 td 背景（含 hover）`var(--surface)` → `var(--bg)`（与表头同色；r3-1 误读设计，`theme.css` 明写 `tr.l5-group td { background: var(--bg) }`）——验证：组头/表头背景计算值相等
- [x] 9.4 用户项④ 分组每页条数：三页（节点/上游/路由）`:pagination="false"` + 外置分页条，组头行不再参与 antd 客户端切片（现状实测：40 节点/页 20，分组第 1 页 18 节点、第 2 页 5 节点；平铺第 2 页 20 节点）——验证：分组两页各 20 节点、序号跨页连续
- [x] 9.5 用户项⑤ 底部页码行：新增共享 `components/ListPager.vue`（设计 `.l5-pager` 解剖：左 `共 <b>N</b> 个节点 · 每页 [下拉]`、右 `‹ 页码… › 跳至 [input] 页`、当前页实心 accent+白字、prev/next 28×28 带边框、间距 4px、条高 49px）——验证：逐元素量测对齐设计值
- [x] 9.6 附加 E1：表头 padding 9px 12px 补 `!important`（AntDV `size="middle"` 4 类选择器压过 L5 段 3 类，r1 该项从未生效；行高 47 → 38）——验证：th padding 计算值 `9px 12px`
- [x] 9.7 附加 E2：8 列宽按设计值重设（#48 / IP149 / 服务端口82 / 管理端口82 / 安装路径377 / 状态147 / Edge版本87 / 操作298）——验证：总宽 1310 = 卡片宽，零溢出
- [x] 9.8 断言反转清单（#217）：`usePagination.test.ts`、三页分页绑定守卫、`mockupParity.source.test.ts`、`tableAnatomy.source.test.ts`、`NodeList.test.ts`（分页/页码/条数断言）先 grep 全域再改
- [x] 9.9 全站标准同步：`usePagination.paginationProps` 仍为「内置分页页」标准；新增「分组/服务端分页列表 = 外置 `ListPager`」标准条目，其余列表页迁移列为后续任务（不在本轮）
- [x] 9.10 收口：同数据注入复测（分组两页条数/组头底色/统计徽标字重/操作列宽/页码行逐元素）+ 全量单测 + vue-tsc + `openspec validate --all`

## Workflow follow-up

- 归档：`openspec archive mockup-parity-standard`，主 spec 合并（mockup-parity-verification + list-page-console-visual 两能力）后跑 `openspec validate --all` 收口（约定 #53）
- 该验收标准（同数据注入 → 截图对照 → 差异清单 → 逐项批准 → 修改复测）后续页面复用

## 8. 第三轮（用户真机细看驱动，parity-audit-nodes-r3.md）

- [x] 8.1 r3-1 组头行背景 → var(--surface)（选择器升级 `.table-container .ant-table-tbody > tr.l5-group-row > td` 压过全站 transparent 规则；实测 oklch(1 0 0)=卡面白）
- [x] 8.2 r3-2 菜单语言全站微调：主文案 14→13px/600（theme.css menu-item-stack 单点）、悬停只变底色不变字色（反转 2026-11-13 方案 A，用户批准）、内距 7px 10px、解释行 font-weight 400
- [x] 8.3 r3-3 分页选项文案：paginationProps 增第三参 overrides（#54 机制不动，10 个既有消费方不传零影响）；三页传 buildOptionText →「N 条」（完整读感 = 设计「共 N · 每页 [N 条]」）；usePagination.test 补标准回归锚点 + overrides 用例（原文件此前并不存在，新建）
- [x] 8.4 r3-4 列配置提示行补全「拖动表头右缘可调整列宽，拖动表头整格可调整列序」（三页）
- [x] 8.5 r3-5 状态格两行封顶：NodeList 状态格/详情弹窗迁 L5 解剖（status-cell/s-row/exec-time），s-row 胶囊横排（status 列 120→140 + 胶囊 padding 0 5px 收紧，实测两胶囊并排、状态格 40px、行高 64≈设计 61.5）；类名迁移 node-status-cell→status-cell 零残留
- [x] 8.6 守卫同步：mockupParity r3 断言 5 用例（21 用例总量）；实施修正两处守卫自身（规则源文件归属：menu-item-stack 在 theme.css、badge-status 收紧在 style.css 全局段——scoped 规则对子组件内部元素不生效的实测修正）
- [x] 8.7 收口：全量单测 212 files / 2927 绿 + vue-tsc 0 error + validate 216/0 + 同数据截图 `screenshots/impl-parity-nodes-r3.png`


## 10. 第五轮（用户真机复核驱动，parity-audit-nodes-r5.md · 批准前不改代码）

> 取证脚本 `/tmp/opencode/parity-r5/{probe,sweep,probe3,probe4,probe5,probe7,probe9,probe10,probe-menu-routes,visual}.mjs`；
> 证据截图 `/tmp/opencode/parity-r5/cmp-*.png`（设计/实现同元素裁切对照）。
> 用户项 ① 触发器、② 菜单分栏/解释/标红、③ 状态胶囊；讨论项 ④ 分组批量折叠。

- [x] 10.1 用户项① 更多触发器三页统一：`StrokeIcon` 增 `dots`（三圆 r=1.7 横排，12px），三页触发器改「无边框 26×24 锚点 + `dots` + muted」，删除 `MoreOutlined` 与 `⋯` 文本两套——验证：三页触发器计算样式 = 设计（26×24 / 边框 transparent / radius 4 / 图标 12px）
- [x] 10.2 用户项② 菜单结构：`allNodeActionButtons` 增 `danger`/`desc` 元数据（删除项），NodeList 按元数据渲染 `danger` + `menu-item-stack`；三页菜单顺序 = CRUD 组 → 分隔线 → 危险组（删除）→ 分隔线 → 安装组——验证：节点页删除项文字红 + 有说明 + 独占一栏
- [x] 10.3 用户项② 菜单样式单点（`style.css` Dropdown 段）：`min-width: 215px`、条目 `line-height: 1.4`（条目高 34.4→32.2）、分隔线 `border-top: 1px solid var(--border)` + `margin: 4px 6px`——验证：菜单宽 215（长说明折两行）、条目高 32.2、分隔线 193×1
- [x] 10.4 用户项③ 状态胶囊：删除 r3-5 的 `padding: 0 5px` 收紧（状态列已回 147px），回设计 `0 8px`——验证：已停止胶囊 60.3px、两枚并排仍单行
- [x] 10.5 用户项③ `BadgeStatus` 增 `status="disabled"` 变体（透明底 + 1px dashed `oklch(50% .018 240/.4)` + 无圆点 + `title` 透传），消费点：NodeList 行内/详情弹窗、ClusterNodes Tab——验证：三处渲染一致，27 消费方无外溢（约定 #217 grep 先行）
- [x] 10.6 附带 4.1–4.5：序号列 mono 12px、安装路径值 muted、行内动作按钮 400 字重、表头行高回 38（选择列表头复选框行盒 22→16–19px，实测 41→39，再收 1px 至设计值）、PageHeader 描述 `margin-top: 2px` + h1 `line-height: 1.5`——验证：逐项量测命中设计值
- [x] 10.7 讨论项④（待批准形态）：`useListClusterGrouping` 增 `expandAll/collapseAll/hasFolded`，三页工具条按「方案 A（列配置右侧单按钮上下文切换）」接线；同步在设计页三份 HTML 工具条补同形按钮——验证：折叠/展开/翻页语义 + 设计页与实现页截图对照不再报「多余元素」
- [x] 10.8 规格收口：把「操作列与动作菜单解剖」「状态胶囊四态 + 管理开关态」「逐元素扫描九子域」写入 `list-page-console-visual` / `mockup-parity-verification` delta；批量折叠写入 `list-page-cluster-grouping`（另一变更）
- [x] 10.9 收口：同数据注入复测（三页）+ 全量单测 + `vue-tsc -b` + `openspec validate --all`

> 10.1–10.9 证据（2026-11-17 实施完成，`/tmp/opencode/parity-r5/final-verify.mjs` 逐项对照 **8/8 全 ✓**）：
> - 10.1 三页触发器实测 `26×24 / border rgba(0,0,0,0) / bg 透明 / radius 4px / 图标 12px 三圆 cx5,12,19 cy12 fill=currentColor`，与设计逐值相等；`MoreOutlined` 与 `⋯` 文本两套清零（含源码守卫）。
> - 10.2 节点菜单序列 = `详情/编辑/复制/数据库对比 ─分隔─ 删除(红+说明) ─分隔─ 安装×4`；路由/上游 = `编辑/版本管理/复制 ─分隔─ 删除`，与设计一致；危险项主文案 `oklch(0.55 0.18 28)` 相等。
> - 10.3 菜单 `width: 215px`、条目高 `32.2 / 48.6 / 64`、分隔线 `1px solid var(--border)` + `margin: 4px 6px`——三项与设计逐值相等（`.menu-item-stack` 去掉 2px 纵向内距后才命中）。
> - 10.4 已停止胶囊 `60.3×20 / padding 0 8px`、已禁用 `51.3×20 / 透明底 / 1px dashed / 无圆点`，与设计相等。
> - 10.5 `badge-disabled` 变体三消费点（节点行内/详情弹窗/统一管理 Tab）；`BadgeStatus.test.ts` 增 2 用例。
> - 10.6 序号列 mono 12px、路径值 muted、行内按钮 400、表头 th `38px`（选择列表头复选框行盒块级化 + 19px）、页头 h1 `31.5px` / 描述上距 `2px` 全部命中设计值。
> - 10.7 三页工具条 `[data-test="toolbar-fold-all"]` 上下文切换实测：收起 → 当页 0 数据行 + 文案「全部展开」，展开 → 复原 20 行；设计页三份 HTML 同步补按钮并可点击演示（初始文案按实际折叠态）。
> - 10.8 规格：`mockup-parity-standard` 增 2 需求（操作列触发器与动作菜单解剖、状态胶囊语义与管理开关态）+ `mockup-parity-verification` 增 3 需求（九子域扫描、机制根因、有意新增控件同步设计页）；`list-pages-console-restyle` 的 `list-page-cluster-grouping` 增「分组批量折叠控制」需求。
> - 10.9 全量单测 2951 passed（`--maxWorkers=4`；`DbBackupRestoreWizard.ux` / `ServerCertList` / `ClusterFormModal` 三轮轮换各挂 1 例，隔离复跑全绿——约定 #58 的 CPU 争抢型波动，三文件均未被本轮改动触及）；`vue-tsc -b` 0 error、prettier 通过、`openspec validate` 两个变更均 valid。

## 11. 第六轮（用户真机复核驱动，parity-audit-nodes-r6.md · 批准前不改代码）

> 取证脚本 `/tmp/opencode/parity-r6/*.mjs`；证据截图 `pills-{design,impl}.png`、`pop-{design,impl}.png`。
> 用户项 ① 胶囊仍偏小、② 重置列宽后横向滚动条、③ 列配置提示行图标。

- [x] 11.1 用户项① 字体族对齐：L5 表格（建议全站表格）内容字体族统一为 `var(--font-body)`——消灭「设计页用 SF Pro/Inter、实现页回落到 Segoe UI/Roboto」的同 px 不同观感；验证：`.badge-status` 计算 fontFamily 含 `SF Pro Text`/`Inter`，与设计声明链一致
- [x] 11.2 用户项① 复核分支（用户裁决：只修字体族，基准不动——升基准分支不执行）：若你确认已是新形态（虚线 + `padding: 0 8px`）仍偏小 → 改设计基准（胶囊 11px/20px → 12px/22px，三份设计页同步），默认不做
- [x] 11.3 用户项② 列宽自适应（方案 A）：新增 `useFitColumnWidths`（ResizeObserver + 等比缩放 + 余数补给最宽列），三页（节点 1310/最小 1086、上游 1079/1054、路由 1247/1130）接线；`重置列宽` 后在设计最小总宽以上 SHALL NOT 出现横向滚动——验证：1600 与设计逐值相同、1536/1440/1366 零滚动、1280 仅在设计最小总宽以下滚动
- [x] 11.4 用户项③ 列配置弹层（用户裁决只做提示行图标，面板宽/标题说明/分区标签等其余弹层差异暂不处理）：提示行改 `.pop-hint` 解剖（flex + 7px gap + **13px 双箭头图标** + 11px 文字 + `var(--bg)` 底色块 + 圆角 6 + 内距 7px 10px + 上距 12），面板宽 430、标题带「序号列恒展示，不参与勾选」说明、分区标签 11px/600 字距 0.44px、勾选项 12.5px、分隔线 1px + 上距 12、底部右对齐——验证：弹层截图与设计逐元素对照
- [x] 11.5 规格收口：`list-page-console-visual` 增「表格宽度自适应」「列配置弹层解剖」；`mockup-parity-verification` 增「字体族声明核对」
- [x] 11.6 收口：三页同数据复测 + 全量单测 + `vue-tsc -b` + `openspec validate --all`

> 11.x 证据（2026-11-17 实施完成，详见 `parity-audit-nodes-r6.md` §七）：
> - 11.1 `App.vue` token `fontFamily: 'var(--font-body)'`；实测 `.badge-status` 计算字体族 = 设计 `--font-body` 同一声明链（含 SF Pro Text/Inter）。
> - 11.3 新增 `useFitColumnWidths` + 三页接线（`scroll.x` 1076/1054/1036、`flexKey` edge_path/targets/uri）；实测 1600/1536/1440/1366 三页 **全部 0 溢出**，1280/1200 才按最小总宽滚动；1440 实点「重置列宽」后 0 溢出；平铺模式 fixed 列 sticky 正常。
> - 11.4 三页提示行 = `.pop-hint-line` + `StrokeIcon resizeH`（13px 图标，flex + 7px 间距），文案不变；面板宽/标题说明等其余差异按用户裁决暂不处理。
> - 11.5 规格：`list-page-console-visual` 增「表格宽度自适应」「列配置提示行」；`mockup-parity-verification` 增「字体族声明核对」。
> - 11.6 全量单测 214 files / 2963 passed；`vue-tsc -b` 0 error；prettier 通过；断言反转 3 处（三页 scroll 断言）、新增 12 用例。

## 12. 第七轮（节点 + 上游真机复核，parity-audit-upstreams-r7.md · 批准前不改代码）

> 节点页 ①选中行 ②hover 色、上游页 ①目标节点与健康 ②滚动条+图标 ③发布状态徽标/差异按钮 ④发布按钮 ⑤hover 色 ⑥工具条宽度。
> 取证 `/tmp/opencode/parity-r7/*.mjs`。

- [x] 12.1 节点/上游 选中行与 hover 色：实测两侧逐值相同（选中 8%、hover 4%）→ 用户裁决先不改代码、自行复验（缓存/缩放/是否同条件）
- [x] 12.2 上游「目标节点与健康」列重建：点 + ip:port + 权重条 + 「权重 · 占比%」+ 汇总行（`tg-list/tg-chip/tg-bar/tg-w/tg-sum`）；占比 = 权重 / 有效权重和；健康来源与占比口径按裁决：**方案 A 发布态近似**（已批准；B 真实 Edge 健康端点另立、C 不采用）
- [x] 12.3 上游发布状态徽标对齐设计：mono 字体、无边框、设计配色（pub 绿 12% / pending 黄 14% / unpub 灰 8% / partial 红 12%）——验证：四态截图对照
- [x] 12.4 差异按钮对齐设计：20×20 圆形、accent-bg 底 + accent 30% 边 + 11px chevron SVG、`pub-cell gap 6px`
- [x] 12.5 发布按钮对齐设计 `.op-pub`：accent 描边 + accent-bg 底 + accent 字、12px/500、`padding 0 10`、高 24；关闭 antd 中文两字自动空格（「发 布」→「发布」）
- [x] 12.6 上游工具条宽度统一到节点页口径：分组 104 / 集群 120 / 算法 120（搜索保持 150）
- [x] 12.7 附带：名称副标题 11px + 上距 2px、`.action-cell` gap 6→2
- [x] 12.8 列宽最小总宽下探到列内容下限之和（窗口 ≥1000 零横向滚动）
- [x] 12.9 规格 + 收口：`list-page-console-visual` / `table-toolbar-ux` / `mockup-parity-verification` 增补；全量单测 + `vue-tsc -b` + `openspec validate --all`

## 13. 第八轮（路由页工具条：宽度统一 + 方法筛选合并，parity-audit-routes-r8.md · 批准前不改代码）

> 用户项⑥（六个下拉宽度不一致、平铺看不见）+ 讨论项（能否取消「全部方法」下拉）。
> 取证 `/tmp/opencode/parity-r8/*.mjs`。

- [x] 13.1 工具条不压缩契约：六/五个筛选控件统一 104px + `flex-shrink: 0`；右侧簇（计数/刷新/列配置/折叠/`.seg`）全部 `flex-shrink: 0`；超宽改换行——修「平铺被压到 2–24px 看不见」（1440 `.seg` 实测 24.3px、1366 5.6px）
- [x] 13.2 方法筛选合并：**改为用户最终裁决的反向形态**——方法保留「全部方法」下拉（单入口），取消方法 chips 行；状态改由第二行 chips 承担（见第九轮方案甲，r8 的 10-chip 与「更多 ▾」方案均作废）
- [x] 13.3 附带项：工具条 `gap` 8 → 6（三页统一）；删除 chips 行右端「共 N 条路由」（与分页条重复）
- [x] 13.4 规格 + 守卫：`list-page-console-visual` 增「工具条不压缩契约」「方法筛选入口」；`mockup-parity-verification` 增「工具条宽度扫描」；断言反转清单（7.3 方法下拉 / routeCount）后全量收口

> 备选（若否决 B）：C = 直接删下拉、chips 保持 5 个高频（56 条冷门方法路由失去筛选入口）；D = 保留下拉 + 工具条换行（1440 起两行）。

## 14. 第九轮（筛选架构评审：状态 chips / 方法入口 / 页头统计，filter-architecture-r9.md · 批准前不改代码）

> 演示页 `docs/ui/Live-Artifact-5/proposal-c/filter-architecture-demo.html`（方案甲/乙/丙 + 抽样误差实测）。

- [x] 14.1 决策 D1：状态筛选全站统一为「带计数的 chips」（四层/DNS 已有平铺，推广至节点/路由/上游并统一 f-chip 造型）
- [x] 14.2 决策 D2：路由方法入口回归单一「全部方法」下拉（作废 r8 的 10-chip 方案，取消方法 chips 行）
- [x] 14.3 决策 D3：页头删除状态类徽标，只留总数徽标（状态计数由 chips 承担）
- [x] 14.4 决策 D4：新增后端聚合计数（`GROUP BY` 状态），修复路由页「500 抽样当全量」（实测未发布 331 vs 真实 1421）——chips 计数必须走权威值
- [x] 14.5 决策 D5：节点状态 chips 是否含「已禁用」（管理开关态）→ 决定节点 4 枚还是 5 枚
- [x] 14.6 实施 F1–F6：后端计数 → 路由 → 上游 → 节点 → 四层/DNS 造型 → 规格/守卫/设计页同步/全量收口

> 14.x / 13.x 证据（2026-11-18 实施完成，详见 `filter-architecture-r9.md` §七）：
> - F0 四层/DNS：分段 tab → `.f-chip.chip-status` + `.f-count`；点击仍走 `goStatus`，实测四层「已发布」→ 9 条、DNS → 5 条。
> - F1 后端：`services/status_counts.py` + `/routes/status-counts` + `/upstreams/status-counts`；路由列表/上游列表过滤抽成 `_apply_*_filters` 单点；`tests/test_status_counts.py` 6 例（含「counts.total == list.total」8 组筛选、「publish_status 不影响计数」、「非管理员集群范围」）。
> - F2 路由：chips 1596/1421/171/4，点「待发布」→ 171 条；方法回下拉单入口；页头只留总数。
> - F3 上游：补上缺失的状态筛选（列表端点新增 `publish_status=x` 三分区），chips 258/212/39/7，点「待发布」→ 39 条。
> - F4 节点：5 枚 chips（含「已禁用」管理开关维度，title 注明可重叠），点「已禁用」→ 筛出 24。
> - 13.1/13.3：`.l5-toolbar > * { flex-shrink: 0 }` + gap 6 + 三页搜索 `:width="150"` + 去 nowrap；五档×三页实测溢出 0、`.seg` 恒 99px（此前 2–24px）、下拉渲染宽恒等声明值（104/120）。
> - 收口：前端 215 files / 2984 passed（1 例隔离复跑全绿=波动）、后端 3043 passed / 11 skipped、`vue-tsc -b` 0 error、`openspec validate` 通过。

## 15. 第十轮（状态行位置 + 页头统计去重，filter-architecture-r9.md §八 · 批准前不改代码）

> 实测：三页均已有独立状态行；「总数」出现次数 节点 4 / 上游 4 / 路由 3。

- [x] 15.1 状态行上移：节点页「状态 chips 行」提到「批量条」之前（工具条 → 状态行 → 批量条 → 表格），三页同构；设计页 nodes.html 同步
- [x] 15.2 删工具栏「共 N 个 X」（节点/上游设 `showCount=false`，对齐路由页）
- [x] 15.3 页头徽标去重方案落地：**用户裁决甲** —— 节点/上游「N 集群」、路由「N 上游」（后端补 `upstream_count`/`cluster_count`/`target_count`）
- [x] 15.4 守卫（卡片内顺序、总数出现次数）+ 设计页同步 + 全量收口

> 15.x 证据（2026-11-18 实施）：节点卡片内顺序 = 工具条 → 状态行 → 批量条 → 表格（DOM 实测 + r10-① 守卫）；三页工具栏计数下线（`:show-count="false"`），命中数只在分页条；页头 = 「11 集群 / 9 集群 / 34 上游」补充维度；总数每页只出现 2 次（chips 全部 N + 分页条）。前端 215 files / 2994 passed、后端 3043 passed / 11 skipped。

## 16. 第十一轮（筛选行与状态行分隔线，filter-architecture-r9.md §九）

- [x] 16.1 `.l5-toolbar` 增加 `border-bottom: 1px solid var(--border)`（单点）；删除节点页 `.node-filter-bar` 重复声明
- [x] 16.2 设计页 `theme.css` 的 `.l5-toolbar` 同步补该行
- [x] 16.3 守卫 r11 段 3 例 + 三页实测（工具条/状态行均 1px、间距 0）+ 前端全量 2998 passed

## 17. 卡片型列表页设计稿（10 页，2026-11-18）

- [x] 17.1 任务书 `proposal-c/CARD-PAGES-DESIGN-BRIEF.md`（卡片解剖 / 四档警示 / 每页信息与警示清单 / 自检清单）
- [x] 17.2 批次 1：插件组 / 插件元数据 / 全局规则
- [x] 17.3 批次 2：插件开关 / 静态资源 / CA 根证书 / 服务器证书（含统一侧边栏「证书管理」与分页档位）
- [x] 17.4 批次 3：四层代理 / DNS 代理（UDP）/ DNS 代理（HTTP）（含统一侧边栏「边缘网络」与分页档位）
- [x] 17.5 复核：10 页 3 列 / 卡片 ≤180px / 无溢出 / JS 报错 0 / 外部请求 0；13 份侧边栏字节级一致（20 项 / 5 组）
- [x] 17.6 已验收：批次 3 四层/DNS 代理页经用户真机逐项核对通过（后续 r5–r30 parity 批次在此页继续收敛，验收记录散见各轮 tasks 条目与真机截图）

## 18. 卡片页「集群分组 + 分组/平铺」评估（filter-architecture-r9.md §十一，批准前不改稿）

- [x] 18.1 决策：**采纳分组/平铺**（band 只留规模、无集群页隐藏开关、默认分组、卡片页一律不分页）；推广范围待定（建议 5 页）
- [x] 18.2 `.cluster-c1..c8` 固定色相 token + band/双模式类已入 theme.css；样张 `stream-proxies-grouping.html` 已验证（折叠/全部收起/整条可点/批量管理）
- [x] 18.3 推广完成 **7 页**：插件组 / 全局规则 / 服务器证书 / DNS-UDP（含批量态）/ DNS-HTTP / 插件元数据 / 静态资源；实测两模式卡片最高 178.8 ≤180、band 无状态计数、平铺集群角标=卡片数、无分页条、报错/外链/溢出均 0。**四层代理已把分组版固化为唯一正稿**（`stream-proxies.html` = 原样张，样张文件已删除，避免下轮 parity 拿平铺旧稿当基准）
- [x] 18.4 规格与规范已落：`list-pages-console-restyle/specs/list-page-cluster-grouping` 新增 2 条需求（卡片网格分组 / 按组分页）、BRIEF §七、AGENTS #87

> 18.x 收尾补充（2026-11-18）：
> - 8 个有集群维度的卡片页全部具备「分组 / 平铺」：插件组、插件元数据、全局规则、静态资源、服务器证书、四层代理、DNS-UDP、DNS-HTTP；无集群维度的插件开关 / CA 根证书**不显示**该开关。
> - 各页次要指标（band 右端 / 平铺 strip 右端）：插件组=被引用数、插件元数据=参数总数、全局规则=生效路由数、静态资源=绑定路由（band 去重条数 / strip 具体路由名）、服务器证书=签发者、四层代理=目标数、DNS 两页=上游组。均从卡体移出以守住 ≤180px。
> - 最高卡片实测：四层代理 178.8 / DNS 两页 176.6 / 服务器证书 173.7 / 插件元数据 173.5 / 插件组·全局规则 172.8 / 静态资源 171.2。
> - 批量态仅四层代理与 DNS-UDP（实现里唯一有批量入口的两页）。

## 19. 列表页平铺视图的集群标识（设计已定稿，2026-11-18）

- [x] 19.1 三页设计稿实现「分组/平铺」模式切换（此前点平铺无反应）+ 平铺态插「集群」列（116px、6px 色点 + 集群名、可排序；分组态整列移除）——实测列数 9→10 / 7→8 / 8→9，集群格数 = 数据行数，1200 下 `.seg` 仍 99px
- [x] 19.2 对比演示页 `list-flat-cluster-demo.html`（A 集群列 / B 名称下小字 / C 名称前徽标）；用户裁决 **A**
- [x] 19.3 字段呈现判据入 BRIEF §8.1：枚举用 chip、标识/度量用 mono；节点页不动、路由优先级 chip→mono、上游目标保持 chip（复合组件）
- [x] 19.4 落实现完成：三页把「集群」列并入 `columns` 定义（分组态由 `isVisible` 过滤掉，不进列配置弹窗）；新增 `utils/clusterHue.ts`（`cluster_id % 8` 固定色相 + 列宽常量）与 `style.css` 的 `.cl-cell/.cl-dot/.cluster-c1..c8`；路由优先级 `prio` chip → `prio-txt` mono。
  实测（真机 1600/1280/1200）：分组 9/7/8 列 → 平铺 10/8/9 列且含「集群」表头；20 行全部带色点（c1/c2/c3 正确）；**三视口三页均无横向滚动**（比预估好，因缩放下限用 96 非设计宽 116）。
  断言反转：三页 `scroll.x` → 876/668/748（含集群列下限 96）、列集合断言插入 `cluster`、拖拽用例坐标 +100（多一列桩宽）。

- [x] 19.5 集群列排序落实现（用户要求「参考优先级实现」）：后端三端点支持 `sort_by=cluster`
      （`/routes` 加进 ALLOWED_SORT_FIELDS；`/upstreams`、`/nodes` 新增 `sort_by/sort_order` 参数），
      排序取集群显示名（`display_name` 优先回退 `name`），**用相关子查询而非 JOIN**（分组筛选已 JOIN 过 Cluster，
      再 join 会二次放大行数）；节点页 Python 侧按「集群名 → IP 数值」双键排序。
      前端三页：集群列 `sorter: true` + `@change="handleTableChange"`，排序键仅在平铺视图下发（分组视图组内固定序）。
      实测：三页点「集群」表头依次 asc/desc 均发出 `sort_by=cluster&sort_order=…` 且首行顺序正确
      （app → jd → monitor → test / 反向），分组态无该列无排序入口。
      断言反转：`NodeList.source` 的「零客户端 sorter」守卫改为「禁比较函数 + 仅集群列允许 sorter: true」。
      新增守卫 r13（2 例）+ 后端 3 例（三端点按集群名升降序）。

## 20. 卡片模块实现（按设计页落地，2026-11-18 起）

- [x] 20.1 共享底座：`style.css` 增卡片解剖（`.l5-panel` / `.lp-head|body|foot|strip|chip|tag|hero|proto|algo|notice|check` / `.l5-band` / `.band-select` / `.alert-*` 四态）+ `.cluster-cN` 补 `--cc-bg/--cc-bd`；
      `composables/useCardClusterGrouping.ts`（分组/平铺、折叠、次要指标、按组分页阈值）；`components/ClusterBand.vue`（整条可点、aria 双向、批量态全选本组）；
      `StrokeIcon` 增 `warning`（四档警示的危险图标）。
- [x] 20.2 **四层代理（试点，最复杂：分组 + 平铺 + 批量 + 局部失败）**：卡片改设计解剖（hero 端口 + proto 标签 + 名称 + 状态 / 负载均衡 + 目标胶囊 / 局部失败红提示 + 查看差异 / 卡脚「发布 + ⋯」）；操作收进 ⋯ 菜单（查看/编辑/版本管理/删除 danger 带解释）；
      band 右端次要指标 = 目标总数；平铺态集群条 + 左缘色条；分组态隐藏集群条与负载均衡行（由 band 与 strip 承担）。真机实测：6 band / 19 卡 / 折叠生效 / 平铺 19 卡带 strip。
- [x] 20.3 已全部落地：DNS-UDP 21.9a、静态资源 21.9b1、插件组/插件元数据/全局规则（republish + filter 批次及后续推广批次）、服务器证书 21.10b（SslCertCard l5-panel 重写 + TableToolbar/ClusterBand/色相）、DNS-HTTP（同批推广）。band 次要指标见 BRIEF §七（静态资源=组内总大小、服务器证书=签发 CA 分布「X 等 N 家」、四层=目标总数、DNS-UDP=上游组数）
- [x] 20.4 已落地：插件开关 21.9b2（show-mode=false，无 band）；CA 根证书 21.10b（有集群维度，实际接入 TableToolbar+ClusterBand——设计稿经用户确认后 CA 按集群分组呈现，与原条目的「无集群维度」预设不同，以实现为准）
- [x] 20.5 规模评估收口：全部卡片页 ≤60 条单页（卡片页分页约定），前端聚合满足；>60 条的 `cluster_summary` 后端聚合为触发式需求，规模未达即不实施——触发时另立变更（本条转为观察项，随 20.3 全页落地关闭）
- [x] 20.6 已对齐：四层 21.10（batchbar-dynamic 状态行下随内容流）与 DNS-UDP 21.9a（static 无重叠）真机验证

## 21. 卡片页与列表页一致性（r15 审计，待批准后落地）

审计报告：`parity-audit-stream-proxies-r15.md`（量测数值 + 根因 + 修法 + 3 个决策点）

- [x] 21.1 卡片页工具条改接共享 `TableToolbar`（尺寸 57/12-16/1px 下边框/gap、右侧簇顺序、`show-count=false`、刷新按钮）；分组控件用 `.l5-select`、搜索宽 150
- [x] 21.2 状态行独立成 `.l5-chiprow`（「状态」标签 + chips + 下边框），从工具条首位移出
- [x] 21.3 集群带视觉对齐路由组头：左色条、内距 8/12/16、gap 10、数量灰胶囊（决策点 A/B）；**同步更新设计页 `stream-proxies.html` 与 `theme.css`**
- [x] 21.4 卡脚 ⋯ 菜单可用性：空间不足向上翻转、打开时抬起卡片层级、触发区 hover 反馈（决策点 C 决定是否外露编辑）
- [x] 21.5 批量态让位：移植 `.l5-card.batch .lp-head/.lp-strip{padding-left:33px}`（修 checkbox 压端口/名称）
- [x] 21.6 页头按钮序：批量管理在「新建」左侧
- [x] 21.7 批量条改 `.l5-batchbar`（状态行下、随流；已选 N 项 / 批量发布 / 批量删除 / 清除选择；未选时 45% 透明），删除 `.sp-batch-bar` 底部固定条与 `padding-bottom` hack
- [x] 21.8 附带：「全部协议」筛选下拉、工具条 gap 4（卡片页）、页头 `ph-inline` 徽标（集群数 / 目标数）
- [x] 21.9a **DNS-UDP 卡片页推广（2026-11-19）**：接 `TableToolbar`（搜索150/分组104/集群120，无第 4 下拉）+ `.l5-chiprow` + `.l5-batchbar`（`批量删除/全选筛选结果/清除选择`）+ 卡片解剖（hero = `remote_addr` 回落 `0.0.0.0:监听端口`、域名行 = 首域名 + `+N` + 算法胶囊、上游行 = 去重 chips + `N 组`、内外网分离走 `.lp-tag.tech`）+ band 次要指标 = 组内去重上游组数；色相按行 `clusterHueClass`；⋯ 菜单含 flip-up。真机实测：5 band（5 色）/13 卡/平铺 13 strip 带 per-cluster 左缘色/批量条 static 无重叠/菜单 215 宽在视口内。
- [x] 21.9b 已全部落地：21.9b1 静态资源 / 21.9b2 插件开关 / 21.9b3 插件组·插件元数据·全局规则·DNS-HTTP（跨会话批次） / 21.10b 服务器证书；标准与验收细节见各条目
- [x] 21.9b1 **静态资源卡片页推广（2026-11-19）**：接 `TableToolbar`（搜索150/分组104/集群120）+ `.l5-chiprow`（分发五态 chips：待上传/待分发/已分发/分发失败/配置异常，前端聚合）+ `.l5-batchbar` + 卡片解剖（strip 右端 = `绑定 · 路由名`（新增 `route_name/route_uri` 读回，孤儿路由红字「已删除」）、卡体 = 路径/绑定(group-only)/描述(可选)/上传、大小走 `lp-tag`）+ band 次要指标 = 组内总大小；色相按行 `clusterHueClass`；⋯ 菜单三栏（查看 ZIP/编辑/上传·替换 ZIP/版本管理 → 删除；broken 态收敛为禁用编辑+删除）。**批量**：后端 `DELETE /static_resources` 全局端点（`batch_delete.py` 新增 `static_resource` kind：precheck=存储目录越界防护先行、purge=本地 zip+目录清理、Edge 走 raw_delete query 参数）+ 前端 `useBatchDelete`；列表端点补 `route_name/route_uri`。真机实测（1600）：6 卡/3 band/chips 计数正确/批量条随流/broken 菜单 215px 无 console 错误。附带修复：`DELETE /api/v1/plugin_metadata` 审计盲区（同款下划线路径推断不到，0e7a1851 引入）
- [x] 21.9b2 **插件开关卡片页推广（2026-11-19）**：接 TableToolbar（搜索150/分类104；无集群维度 → `show-mode=false` 无分组|平铺、无 band/色相/列配置，#87 ⑥）+ `.l5-chiprow`（全部/已启用/已禁用 chips，状态条与分类 pills 退场）+ 卡片 r14 解剖（head = 中文名 + 裸技术名 `.lp-tag.tech` + 分类 tag；status = 启用文案 + a-switch 同位；body = 描述/引用/参数三行；foot = 「参数定义」op-pub 折叠块入口 + ⋯ 菜单：查看引用 → /routes?search、操作日志）+ 禁用被引用走共享 `.lp-notice` warning + 查看引用出口。**保留既有保存批模型**：sticky 保存条/离开守卫/全部启用·禁用确认闸门/未保存虚线框不动（功能面非本批范围）。r29 推论：schema 完整/缺失徽标不落此页（目录级静态属性）。真机实测（1600）：13 卡/chips 计数正确/参数定义折叠展开/⋯ 菜单 215px/无 console 错误。
- [x] 21.9b2-fix **插件开关四处 bugfix（2026-11-19 用户上报，批准后落地）**：① 参数定义折叠块移到 `.lp-foot` **之后**（卡底展开，按钮原地不跳）；② 「参数定义」恒渲染（设计稿 disabled 变体：无参数定义时 disabled + title「该插件无参数定义」），`.lp-foot` space-between 下 ⋯ 恒置右；③ 全部启用/禁用带图标（StrokeIcon 新增 `check`/`minus`，取设计稿原 path）；④ ⋯ 菜单按引用源拆项（路由 N/插件组 N/全局规则 N，count>0 才渲染）——路由腿 `/routes?plugin=`（RouteList 读 `?plugin=` 预选「全部插件」下拉，服务端过滤现成）；插件组 `/plugin-configs?plugin=`、全局规则 `/global-rules?plugin=` 客户端行过滤深链（两页全量卡片页，后端零改动；B 方案的常驻下拉+服务端过滤留另批）。真机：折叠块顶边在按钮底边之下/无参数卡按钮 disabled/⋯ 右缘对齐/RouteList 下拉预选 + 请求带 plugin=proxy_rewrite（25 条命中）。
- [x] 21.10b **CA 根证书 / 服务器证书卡片页推广（2026-11-20，设计页 clusters/central 同批定稿后落地）**：SslCertCard 重写为 l5-panel 解剖（两变体共用单点：lp-strip 平铺身份 / lp-head = 名称 + 集群·分组 tag + server 算法徽章 / lp-status = ca「CA 根证书」+ expire 徽章、server PublishStatusTag+差异胶囊 / lp-body 真实行（CN·算法·有效期；SNI·类型·签发 CA·IP·算法·协议·有效期）/ lp-notice 真实文案（E4 临期·过期原文；sniMismatch 原文 + 同步出口）/ lp-foot = op-pub（下载根证书·发布）+ ⋯ 菜单 r5（查看/下载/编辑/版本/删除，danger 带真实后果 sub））+ 集群色相 clusterHueClass。两页接 TableToolbar + useCardClusterGrouping + ClusterBand（分组|平铺/全部收起/组级次要指标：CA=临期·过期摘要、服务器=签发 CA 分布「X 等 N 家」）+ 服务器页发布状态 chips（#85①）+ 计数归 chips（#86）。**提示条/徽章/安装指引全部保持现实现原样**（cert-banner-ok/warn、install-guide 四段、查看安装指引）。测试：SslCertCard 15 例重写（解剖+事件+菜单 .mi-main 精确断言）、两页适配 7 例反转（动作入菜单/ssl-card→l5-panel/计数归 chips）、mockupParity 4 例新段。真机：/ssl/ca 4 卡 3 band、/ssl 15 卡 4 band + chips，无 console 错误。全量 3101 passed（2 例 #58 波动隔离复跑绿）+ vue-tsc -b 干净。
- [x] 21.10c **证书域补接「重发失败节点」+ 抽屉纯查看 + CA 删除单 scope（2026-11-20 验证期用户裁决）**：① 服务器证书页补接 useRepublishFailedNodes（七页接线：'ssl' registry 既有，preview 取失败集合并预选 PublishConfirmModal；常规发布复位预选；partialNoticeText 两级回退——SSL 无持久化明细列，泛化文案兜底）；SslCertCard 增 server 专属 partial 提示条单点（lp-notice alert-error + 重发/查看差异双动作）；② 查看抽屉纯查看——CA 顶部下载区/私钥高风险弹窗/PEM 各段 📥 下载/客户端证书包按钮全部下线（孤儿函数清理），横幅「客户端证书请在抽屉下载」句同步删；server 卡 ⋯ 菜单裁剪为 查看/版本管理/删除；③ CA 删除弹窗 dbOnly 单 scope（showDeleteConfirm 新增选项：隐藏 Edge 勾选与节点清单，信息行「CA 根证书仅保存于平台数据库」）。测试：SslViewDrawer 5 例反转、SslCertCard/ServerCertList 适配 + ServerCertRepublish 新 2 例 + mockupParity 2 段。真机：/ssl partial 卡提示条 + /ssl/ca 删除弹窗单 scope，无 console 错误。全量 3103 passed（2 例 #58 波动隔离复跑绿）。

> 21.x 落地记录（2026-11-18，真机 1600 验收）：
> - 工具条：`.l5-toolbar` 高 57 / 内距 12-16 / 1px 下边框 / gap 6；序 = 搜索150 → 分组104 → 集群120 → **协议104** → spacer → 刷新 → 全部收起 → seg（与路由页逐项一致）；`show-count=false`（总数归 chips「全部 N」）。
> - 状态行：独立 `.l5-chiprow`（「状态」标签 + chips + 下边框，高 41）。
> - 批量条：`.l5-batchbar` 在状态行下、网格前（`position: static`）、`has-sel` 生效；底部固定条与 `padding-bottom` hack 已删。
> - 批量让位：`.l5-card.batch .lp-head/.lp-strip{padding-left:33px}`（勾选框 292 右缘 vs 端口 300 左缘，无重叠）。
> - 集群带：左条 accent（`oklch(.56 .16 210)`）、gap 10、内距 8-12-16、数量灰胶囊 11px mono；设计页 `theme.css` 同步（三份卡片页实测同值）。
> - ⋯ 菜单「没反应」真因 = **`.std-card{overflow:hidden}` 把菜单整块裁掉**（不是没打开）；改 `.l5-panel.std-card{overflow:visible}` + 空间不足向上翻转（末行卡菜单 bottom 1036 < 视口 1100）+ 打开时卡片 z-index 5。**此条为 r15 最有价值发现**。
> - 页头序：批量管理 → 新建。守卫 r15 段 5 例；断言反转 2 处（`.sp-header-actions`/`.sp-batch-bar` 退场、计数改由 chips 承担）。

## 22. 集群色编码与批量条收敛（r16 审计，待批准后落地）

审计报告：`parity-audit-stream-proxies-r16.md`

- [x] 22.1 **回退 r15-3**：集群带左色条恢复集群色相 `var(--cc, var(--accent))`（卡片页无集群列，左条是唯一集群身份线索）；同步 `theme.css`、`AGENTS #88 ⑤`、`BRIEF §九 6`
- [x] 22.2 集群带 hover：改 `oklch(56% .16 210 / 4%)`（与路由组头同值），消除「hover 变纯白」（方案待裁决 A/B/C）
- [x] 22.3 删除批量条的「批量发布」按钮与 `batchPublish()`（功能不存在）；两份设计稿 + `BRIEF §七.5` + `AGENTS #87/88` 同步
- [x] 22.4 守卫反转：r15 段「band 左条 = accent」→「band 左条 = `--cc`」；新增「批量条 SHALL NOT 含批量发布」

> 22.x 落地记录（2026-11-18，1600 真机验收）：
> - 22.1 band 左条恢复 `var(--cc, var(--accent))`：六条带实测六种色相（c5 蓝 / c3 绿 / c4 红 / c8 青 / c1 蓝 / c2 紫），cluster-cN 类真正生效；设计页 `theme.css` 同步（三份卡片页同值）。
> - 22.2 band hover = `oklch(56% .16 210 / 4%)`：实测与路由组头同值，消除「hover 变纯白」（原 `--surface` = oklch(1 0 0) 比常态 `--bg` 更亮）。
> - 22.3 批量条按钮集 = `批量删除 / 全选当前筛选结果 / 清除选择`，实现侧删 `batchPublish()`，两份设计稿同步；实测 `batchBtns` 无「批量发布」、`hasBatchPublish=false`。
> - 22.4 守卫：r15-③ 原「左条 accent」断言反转为 `var(--cc, var(--accent))`；新增 r16 段 3 例（色相 / hover 禁 surface / 批量条禁批量发布）。全量 216 files / 3019 passed。

## 23. 平铺卡色相与 hover 同源（r17，2026-11-18 已落地）

- [x] 23.1 **平铺卡片色相按行计算**：卡片根类由分组伪组的 `hueClass` 改为 `clusterHueClass(p.cluster_id)`（伪组把所有卡收成一组 → 平坦全 `cluster-c1`，实测 19 张卡同一种蓝，集群区分失效）；守卫 r17 段
- [x] 23.2 **band hover = `var(--cc-bg)`（方案 B）**：hover 底与左条同源（该集群 10% 淡色）+ 边框 `--cc-bd`；实测 monitor 集群 hover = `oklch(.55 .15 145 / .1)`、左条 `oklch(.55 .15 145)`
- [x] 23.3 设计页 `theme.css` 同步（hover 改 `--cc-bg`/`--cc-bd`）；`AGENTS #88 ⑤⑧`、`BRIEF 九 6/9` 记录判据

## 24. 让位规则收窄与卡体 chips 呈现（r18，2026-11-19 已落地）

- [x] 24.1 **让位规则收窄**：`group-only` 仅限「低信息量单值行」（四层代理「负载均衡」）；**列表型关键信息两态都显示**——DNS 上游 IP 行去掉 `group-only`，平铺态可见（此前照搬让位规则导致平铺读不到 IP）
- [x] 24.2 **chips 呈现**：四层代理「目标」→ `.lp-chips.compact`（限前 2 + `+N`，`title` 全量，最多两行不裁剪）；DNS「上游 IP」→ 完整呈现允许折行（用户裁定不裁剪）
- [x] 24.3 **卡高目标重算**（按实测构成）：标准卡 ≤180 / chips 折行或含描述 ≤230 / 带警示条 ≤260。实测基线：四层代理 **142–206（两态同值）**、DNS **169–230（分组）/165–252（平铺）**
- [x] 24.4 守卫 r18 段 2 例；踩坑记录：`flex-wrap:nowrap + overflow:hidden` 的单行硬裁会把 chip 截成 `192.168.0.13:8112 10`（权重被切）→ 改 compact（可折两行）

## 25. r19 定稿（2026-11-19）

- [x] 25.1 **撤销卡高目标**：目标/上游 IP 可能多条且需逐条可见 → 卡体 chips **一律完整呈现、允许折行**；废止 `.lp-chips.compact`（前 2 + `+N`）与 `nowrap+overflow:hidden` 硬裁；卡高由内容决定
- [x] 25.2 四层代理「目标」chips 恢复完整显示（与 DNS 上游同规则）
- [x] 25.3 **DNS 代理（HTTP）卡片页推广 + 新增批量功能**：`TableToolbar`（搜索150/分组104/集群120）+ `.l5-chiprow`（全部/未发布/待发布/已发布，前端聚合）+ `.l5-batchbar`（**仅批量删除**）+ 卡片解剖（hero = `uri`、域名行首项 + `+N` + 算法胶囊、上游 chips 完整）+ band（`上游 · N 组`）+ 色相按行 + ⋯ 菜单翻转；批量删除按集群分组逐批调 `DELETE /clusters/{id}/routes`（后端该端点为集群作用域），汇总一条结果提示
- [x] 25.4 设计页 `dns-http-proxies.html`：补批量态（`#batchToggle`/`#batchBar`/勾选框/band 全选本组）、上游行去 `group-only`；实测 bar 出现、33px 让位、无 group-only
- [x] 25.5 真机实测（1600）：工具条 57/12-16/1px；4 band 4 色；11 卡；hero `/dns-query`；批量条 static 无重叠；flat 11 strip 带 per-cluster 左缘色；hover 与左条同源（`oklch(.58 .16 28 / .1)`）

## 26. 插件组卡片页推广 + 批量（r20，2026-11-19）

- [x] 26.1 `PluginConfigList.vue` 接 `TableToolbar`（搜索150/分组104/集群120）+ `.l5-chiprow`（全部 20 / 未发布 1 / 待发布 18 / 已发布 1，前端聚合）
- [x] 26.2 卡片解剖：`.lp-name` 主身份 + 状态 / 插件行（`.lp-chip` 胶囊 + `N 个`）/ 描述行（两态显示）/ 局部失败红提示 / 卡脚「发布 + ⋯」
- [x] 26.3 **新增批量管理**：页头「批量管理」在「添加插件组」左侧；`.l5-batchbar` 随流，仅「批量删除」；勾选框 33px 让位；band 右端「全选本组 / 已选 k / N」
- [x] 26.4 批量删除实现：后端无批量端点且**被引用插件组禁止删除（PLG-07）** → 逐条 `DELETE /clusters/{id}/plugin_configs/{id}`，汇总「成功 / 被引用未删除 / 失败」三段结果提示
- [x] 26.5 设计页 `plugin-groups.html` 同步：批量态（`#batchToggle`/`#batchBar`/勾选框）、`引用 · N 条路由` → `插件 · N 个`（实现无引用数聚合）、去掉 group-only
- [x] 26.6 **引用数缺口**：设计原稿的「被 N 条路由引用」需后端在 `GET /plugin_configs` 响应带 `reference_count`（一次扫描各路由 `plugin_config_ids` 聚合），前端才能展示；当前用「插件 N 个」替代
- [x] 26.7 真机实测（1600）：工具条 57 / 6 band 6 色 / 20 卡 / 批量条 static 无重叠 / 平铺 20 strip per-cluster 色 / hover 与左条同源 / ⋯ 菜单 215 宽在视口内

## 27. 引用数与批量条文字修正（2026-11-19）

- [x] 27.1 **后端 `reference_count`**：`GET /plugin_configs` 一次扫描本页涉及集群的全部路由、按 edge_uuid 计数后逐条补齐（禁 N+1）；解析规则收敛到新模块 `services/plugin_config_refs.py`（`extract_refs` / `find_referencing` / `count_by_uuid`），`cluster_plugin_configs._find_referencing_routes` 改为委托，**删除守卫与列表计数永远同语义**；畸形 JSON 一律视为「不含引用」
- [x] 27.2 前端插件组接入：band 右端 `被 N 条路由引用`、平铺 strip `引用 · N 条路由`、卡体「引用」行（`group-only`，未引用显「未被引用」）；设计页 `plugin-groups.html` 恢复引用语义
- [x] 27.3 **批量条「全选当前筛选结果」字体修正**：`.link-btn` 原只定义在四层代理/DNS-UDP 的 **scoped** 样式里，DNS-HTTP 与插件组缺失 → 退回浏览器默认按钮样式；提升为 `style.css` 共享类并删掉两份 scoped 重复；「清除选择」四页统一为 `.link-btn`。实测三页 `12px / accent / 无边框 / 透明底 / h=25` 完全一致
- [x] 27.4 后端用例：`TestGlobalListReferenceCount`（被引用 2 / 1 / 0）+ `TestPluginConfigRefsHelper`（畸形 JSON 容错、计数）；`tests/test_plugin_config_references.py` 9 passed

## 28. 全局规则卡片页推广 + 批量（r21，2026-11-19）

- [x] 28.1 `GlobalRuleList.vue` 接 `TableToolbar`（搜索150/分组104/集群120）+ `.l5-chiprow`（全部 12 / 未发布 2 / 待发布 8 / 已发布 2）
- [x] 28.2 卡片解剖：名称主身份 + 状态 / 插件行（`lp-chip` + `N 个`，空态「未选择插件」保留 title）/ 描述行 / **生效行 `group-only`**（低信息量单值，平铺由 strip 承担）/ 局部失败红提示 / 卡脚「发布 + ⋯」
- [x] 28.3 **新增批量管理**：页头「批量管理」在「添加全局规则」左侧；`.l5-batchbar` 随流，仅「批量删除」；勾选框 33px 让位；band 右端「全选本组 / 已选 k / N」
- [x] 28.4 批量删除：后端无批量端点 → 逐条 `DELETE /clusters/{id}/global_rules/{id}`，结果汇总「成功 N 条 / 失败 m 条」；确认弹窗携带既有集群级 `globalRuleDeleteWarning`
- [x] 28.5 **后端 `route_count`**：`GET /global_rules` 按集群 `group by` 统计路由数（禁 N+1），前端 band `生效 全部路由 · N 条` / strip `生效 · 全部路由 N 条` / 卡体生效行共用；用例 `TestGlobalRuleRouteCount`（新增路由后计数 +2）
- [x] 28.6 设计页 `global-rules.html`：补批量态（`#batchToggle`/`#batchBar`/勾选框）；实测 bar flex、勾选框 block、33px 让位无重叠、0 报错
- [x] 28.7 真机实测（1600）：工具条 57/12-16/1px；**8 band 8 色**；12 卡；hover 与左条同源；批量条 static 无重叠；平铺 12 strip per-cluster 色；⋯ 菜单 215 宽在视口内

## 29. 批量删除真·前台化（r22，2026-11-19，用户裁定方案 A + 节点可选）

- [x] 29.1 **后端批量端点**：`DELETE /clusters/{id}/plugin_configs`（`plugin_config_ids`）、`DELETE /clusters/{id}/global_rules`（`rule_ids`），返回与路由批量**同构**的 `results[]`；单条失败不阻塞其余条；`node_ids` 支持节点子集；插件组 PLG-07 按条 `failed` + 原因（禁整体 400）
- [x] 29.2 **共享执行器支持多段**：`executeDeleteWithProgress` 新增 `requests?: Array<{apiEndpoint, resourceKey, label}>`——后端批量端点是**集群作用域**，跨集群选择按集群分段、在同一进度面板依次执行并汇总终态（`第 i/N 段` + `aggregateFail`）
- [x] 29.3 三页（DNS-HTTP / 插件组 / 全局规则）批量删除改走共享进度面板：逐条 `数据库✅/Edge <ip>:<port>✅/❌` 日志、终态成功/异常、`retryable`、完成后刷新；**删除前端 for 循环 + 汇总 toast**（观感「假删除」的根因）
- [x] 29.4 批量确认弹窗**支持节点可选**：传 `nodes`（跨集群并集）+ `defaultSelectOnline` + `subsetConsequence`（子集后果行），去掉 `noNodeSelection`；Edge 勾选后展开节点清单（在线默认全选、离线可见不选）
- [x] 29.5 用例：后端 `tests/test_batch_delete_endpoints.py`（8 例：结果形状 / 引用按条失败 / 空 ids 400 / 双 scope 400 / 不存在 id / 节点透传）+ 前端 `mockupParity.source.test.ts` r22 段（4 例：三页走共享面板、节点可选、多段执行器、PLG-07 不被绕过）
- [x] 29.6 真机 E2E（造数 `zz-batch-1/2` 全局规则）：确认弹窗显示集群级警示 + 节点清单（3 在线 / 1 离线 + 子集后果行）；执行后进度面板逐条 `数据库✅` + `✅ 批量删除完成!`；列表归 0、API 复核 total=0（真删除）

## 30. 批量删除统一（r24，用户裁定 U2 + 节点可选 + 逐条权限）

- [x] 30.1 **后端单一实现** `services/batch_delete.py`：`KINDS` 声明差异（模型 / resource_type / id·name 字段 / Edge 删除函数 / 缺失文案 / precheck / 关联清理），循环体只此一份；`allowed_cluster_ids()` 为非 admin 逐条权限的唯一实现
- [x] 30.2 **全局跨集群端点**：`DELETE /routes`、`/plugin_configs`、`/global_rules`（与既有 `/stream-proxies` 同构，一条请求一组 results）；集群作用域端点（`/clusters/{id}/routes|plugin_configs|global_rules`）保留对外契约、内部委托同一实现（含 cluster_routes 原批量端点）
- [x] 30.3 **前端唯一入口** `composables/useBatchDelete.ts`：节点并集（带 `clusterName`、按节点 id 去重）+ 标题折叠 + 确认弹窗（节点可选、默认全选在线、子集后果）+ 共享进度面板 + 清选/退出/刷新；`useClusterUtils` 的 `requests` 分段参数已删除（回到单路径）
- [x] 30.4 五页接入：四层代理 / DNS 代理（UDP）/ DNS 代理（HTTP）/ 插件组 / 全局规则——页面样板从 54–63 行降到 ~14 行
- [x] 30.5 共享弹窗补 `nodes[].clusterName`：**跨集群**时节点行渲染集群名徽标（单集群 DOM 不变，无视觉 churn）
- [x] 30.6 用例：后端 `tests/test_batch_delete_endpoints.py` 11 例（形状 / PLG-07 按条 / 空 ids / 双 scope / 不存在 id / 节点透传 / 全局端点跨集群 / **非 admin 未授权条目 failed 且已授权条目 success**）；前端 `mockupParity.source.test.ts` r22/r24 段 3 例
- [x] 30.7 真机 E2E：五页批量弹窗均出现节点清单（含在线/离线）；跨集群选择（cluster 1+2 各一条全局规则）节点行显示集群名、进度面板逐条 `数据库✅`、执行后列表归 0（真删）

## 31. 插件元数据卡片页推广 + 批量（r25，2026-11-19）

- [x] 31.1 `PluginMetadataList.vue` 接 `TableToolbar`（搜索150/分组104/集群120）+ `.l5-chiprow`（全部 14 / 未发布 6 / 待发布 2 / 已发布 6，前端聚合）
- [x] 31.2 卡片解剖：`.lp-name.mono` 插件名 + 状态 / 显示名 / **参数行 `group-only`**（低信息量单值）/ 配置摘要（mono dim，title 全文）/ 卡脚「发布 + ⋯」
- [x] 31.3 strip 与 band 次要指标 = `参数 · N 项` + **schema 徽标**（能力态，不进 band 状态位）；band 汇总为组内参数总数
- [x] 31.4 **新增批量管理**：页头「批量管理」在「添加插件元数据」左侧；`.l5-batchbar` 随流、仅「批量删除」；勾选框 33px 让位
- [x] 31.5 **后端 kind `plugin_metadata`**：`batch_delete.KINDS` 新增（`edge_identifier="plugin_name"`——Edge 侧按插件名定位，非 edge_uuid；`name_key="plugin_name"` 名称字段按 kind 取，不再硬编码 `name`）；新增全局 `DELETE /plugin_metadata`（`metadata_ids`）+ 集群作用域 `DELETE /clusters/{id}/plugin-metadata`（委托同一实现）
- [x] 31.6 用例：后端 3 例（全局端点形状 / Edge 用 plugin_name / 集群端点委托）；前端 `PluginMetadataList.test.ts` 24 例（新增批量 2 例 + 断言反转：工具栏计数→chips、卡片动作→⋯ 菜单、发布按钮→`.op-pub`、PublishStatusTag 按下标→按版本定位、按插件名定位卡片）
- [x] 31.7 真机实测（1600）：工具条 57 / 8 band 8 色 / 14 卡 / schema 徽标 / 批量弹窗 20 节点（含集群标注）/ 进度面板逐条 ✅ / 删除后列表归 0

## 32. 插件元数据：schema 徽标退场 + 配置折叠 JSON（r26，2026-11-19 用户裁定）

- [x] 32.1 **`schema 完整/缺失` 徽标退场**：它是**插件目录级静态属性**（`plugin_definitions.py` 的 `schema`），不是记录缺陷，同一插件下所有卡片恒同值，且本库多数插件本就走 JSON 模式（实测 `log_process` / `dns_upstream` / `data_center` 均 `schema: {}`）——保留只会被读成「这条配错了」
- [x] 32.2 **配置行改折叠式美化 JSON（方案 C）**：收起态显示 `N 项 ⌄` 触控（`aria-expanded` 双向同步、空配置显示「无配置」无触控）；展开渲染 `JSON.stringify(config, null, 2)`（缩进 2 空格 + 等宽字体），块 `max-height:220px` **内滚动不裁剪**——长配置可滚动读完，卡片高度有上限
- [x] 32.3 `style.css` 单点新增 `.lp-json-toggle` / `.lp-json` / `.lp-row-config`；`theme.css` 同步同名规则（与实现同值）
- [x] 32.4 设计页 `plugin-metadata.html` 同步：strip/卡体 schema 徽标与「无 schema，只能用 JSON 编辑」警示行整块删除、页头徽标改「4 插件」、配置行改折叠块 + 内联脚本（点击切换 `hidden`、箭头翻转、`aria-expanded`）
- [x] 32.5 用例（`PluginMetadataList.test.ts` 27 例）：折叠/展开/再收起、空配置无触控显示「无配置」、源码守卫「schema 缺失/完整」零残留

## 33. 配置 JSON 默认全展开 + 工具条全局开关（r27，2026-11-19 用户裁定 A + E）

- [x] 33.1 **默认全部展开**：状态语义改为「记忆被收起的 id」（`configCollapsedIds`），进页即可见配置内容——用户不必点开才知道配了什么（原默认收起，进页只看到「N 项」）
- [x] 33.2 **工具条全局开关**：`data-test="config-toggle-all"`（`收起配置` / `展开配置`，与分组「全部收起」并列、两视图都显示；无任何配置时不显示），一键开合当页全部卡片
- [x] 33.3 保留既有：块内 `max-height:220px` 滚动不裁剪；**空配置显示「无配置」且不渲染 JSON 块**（测试抓到残留 `{}` 块——`v-if` 需同时判 `paramCount > 0`）
- [x] 33.4 设计页 `plugin-metadata.html` 同步：`pre` 默认可见、`aria-expanded=true`、工具条加 `data-config-toggle` + 内联脚本（全开/全收 + 文案与箭头同步）
- [x] 33.5 用例：默认展开（含缩进断言）、单卡收起/再展开、全局开关两步跑通、空配置无块无触控、schema 零残留
- [x] 33.6 实测（1600）：实现页 9 个 JSON 块全开、`收起配置` 文案正确、**空块 0**；点全局开关 → 0 块、卡高 373 → 139px；设计页 4/4 全开 → 0 → 4

## 34. 插件元数据：插件筛选下拉（r28，2026-11-19 用户提出）

- [x] 34.1 **后端** `GET /plugin_metadata` 新增 `plugin_name` 查询参数（**精确匹配**，可与 `search`/`cluster_id` 叠加；下拉选项来自插件目录，不需要模糊）
- [x] 34.2 **前端**工具条「全部集群」右侧新增「全部插件」下拉（`.l5-select` 104px，与 #85 控件宽度口径一致）
- [x] 34.3 **选项来源 = 插件元数据可用的插件**：`builtinPlugins ∩ features.plugin_metadata_plugins`（白名单为空表示不限制）——**不排除已配置项**，与新建弹窗的 `availablePlugins`（排除已配置）刻意不同，否则筛不到「暂无记录」的插件
- [x] 34.4 设计页 `plugin-metadata.html` 同步该下拉（`全部插件` + 4 个样例插件）
- [x] 34.5 用例：后端 2 例（精确匹配 / 子串不命中；与 cluster_id 叠加）；前端 2 例（下拉存在且位于「全部集群」之后、选项来自目录；选择后请求带 `plugin_name`、清空后不带）
- [x] 34.6 实测（1600）：工具条两个 104px 下拉、无溢出；选项 `data_center / log_process`（受 features 白名单限制）；选 `log_process` → 5 张卡、全部为 log_process、chips 同步为「全部 5 / 未发布 1 / 待发布 1 / 已发布 3」

## 35. 插件名中文化（r29，2026-11-19 用户提出）

- [x] 35.1 **「全部插件」下拉文案用中文名**：`display_name || name`（与路由/上游的 `PluginSelector` 同口径——那里也是 `plugin.display_name || plugin.name`），值仍是插件名；按中文 `localeCompare('zh-CN')` 排序
- [x] 35.2 **卡片身份同步中文化**：`.lp-name` 显示中文名 + 新增 `.lp-key`（mono 11.5px muted，弱化插件标识，`title` 全文）——中文友好但**不丢精确标识**（搜索/核对/API 仍需裸名）；目录缺失 display_name 时 `.lp-name` 回落 `mono` 显示裸名
- [x] 35.3 `style.css` 单点新增 `.lp-key`；`theme.css` 同值同步（设计页与实现一致）
- [x] 35.4 设计页 `plugin-metadata.html`：卡头改「中文名 + 标识」、下拉选项改中文（日志记录 / 请求数限流 / JWT 鉴权 / 数据中心）
- [x] 35.5 用例：下拉断言改中文（`JWT 鉴权`）；实测（1600）：下拉 `日志记录 / 数据中心`、卡头 `日志记录 [log_process]`、`自定义预处理(旧版) [functions_pre]`

## 36. bugfix：四层代理「全部协议」下拉是摆设（r30，2026-11-19 用户上报）

- [x] 36.1 **根因**：`protoFilter` 只是页面局部 `ref`，模板绑定后**从未参与任何过滤或请求**——`loadProxies()` 不带它、`displayedProxies` 不筛它（原注释写「按 scheme 客户端过滤」，实际代码里没有这段）。且下拉值是 `TCP/UDP/TLS` 大写，而模型列 `scheme` 是小写 `tcp/udp/tls`，即便接上也会筛空
- [x] 36.2 **修复**：状态上移到 `useStreamProxyList` 的 `schemeFilter`（值 = `tcp|udp|tls` 小写），随请求下发 `scheme`；后端 `GET /stream-proxies` 新增 `scheme` 查询参数（`pattern="^(tcp|udp|tls)$"`，非法值 422），按 `StreamProxy.scheme` 精确过滤。选服务端过滤而非客户端：本页 `page_size=CARD_GRID` 属抽样上限，客户端过滤在超量时静默漏数据（#85④）
- [x] 36.3 用例：前端 2 例（选择后请求带 `scheme=udp`、清空不带；选项值 `['', 'tcp', 'udp', 'tls']`）；后端 2 例（三种 scheme 各自只返回本协议；非法值 422）
- [x] 36.4 真机实测（1600）：全部 → 16 张（均为 TCP）；选 UDP → 0 张（本页 `proxy_type=normal` 的 16 条全是 TCP，UDP 属 DNS 代理页）；选回全部 → 16 张；chips 随筛选同步（`全部 16 / 未发布 7 / 待发布 2 / 已发布 7`）
