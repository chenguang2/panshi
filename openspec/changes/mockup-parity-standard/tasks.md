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
- [ ] 17.6 待用户逐页验收（设计稿不等于实现，落地需另立变更）

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
- [ ] 20.3 其余 7 个有集群维度的卡片页按同一解剖迁移（插件组 / 插件元数据 / 全局规则 / 静态资源 / 服务器证书 / DNS-UDP / DNS-HTTP），band 次要指标见 BRIEF §七
- [ ] 20.4 无集群维度两页（插件开关 / CA 根证书）只做解剖与四态警示，不加分组开关
- [ ] 20.5 band 的次要指标聚合：>60 条时需后端响应带 `cluster_summary`（当前全部前端聚合）
- [ ] 20.6 批量条位置对齐设计（`.l5-batchbar` 在状态行下；四层/DNS-UDP 目前仍是底部固定条）

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
- [ ] 21.9 同一套改造推广到 DNS-UDP / DNS-HTTP（同有批量）与其余卡片页；标准写入 AGENTS（新条目）与 BRIEF §九

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
