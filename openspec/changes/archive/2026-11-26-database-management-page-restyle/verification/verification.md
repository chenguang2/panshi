# 验证报告 · database-management-page-restyle

方法：AGENTS #82 五步法（同数据注入 → 逐元素量测 → 差异清单 → 批准后落地 → 复测）。验证时机 2026-11-26，开发环境常驻（后端 12344 / 前端 12345，admin/panshi123）。

## 1. 取证资产

| 文件 | 说明 |
|---|---|
| `db-parity.cjs` | 量测脚本：设计页（`file://…/proposal-c/database-management.html`）与实现页（`/database-management`，route 注入同一批样本数据）逐元素取 `getComputedStyle` + 盒尺寸；另跑 `pending_restart=true` 验证三处提示 |
| `design-page.png` | 设计页 1600×1000 基准截图 |
| `impl-page.png` | 实现页同数据截图（1600×1000） |
| `impl-pending.png` | 实现页待重启态截图（页头徽标 / 名称行徽标 / 警示条 + 判定胶囊转 warning） |

复跑：`node openspec/changes/database-management-page-restyle/verification/db-parity.cjs`（需 12345 存活、admin 可登录）。

## 2. 逐元素量测（1600×1000，同数据）

| 元素 | 设计 | 实现 | 结论 |
|---|---|---|---|
| 页头 `h1` | 21px / 600 / lh 31.5 | 同 | ✓ |
| 卡头（`.db-cardhead` ↔ `.dbm-cardhead`） | 44.5 高，padding 12px 16px | 同 | ✓ |
| hero（`.db-hero` ↔ `.dbm-hero`） | 105.3 高，padding 16px 20px 18px | 同 | ✓ |
| 判定胶囊 | 24 高 / 12px / 600 / 999px 圆角 / success token | 同 | ✓ |
| 表头 `th` | 高 35，padding 9px 12px，11px / 600，`--bg` 底 | 高 35.5，其余同 | 残余①(0.5px 边框舍入) |
| 表体 `td` | 高 45，padding 10px 12px，13px，lh 19.5 | 同 | ✓ |
| 统计格 label | 11px / 600 / `--muted` | 同 | ✓ |
| 统计格 value | 13px / lh 19.5，高 22 | 同 | ✓ |
| 摘要卡容器 | 高 314.8，8px 圆角，白底 | 同（同数据下高度逐像素相同） | ✓ |
| 页头主按钮 | 高 32.2，6px 14px，13px / 500，accent 底 | 同 | ✓ |

残余差异：

1. **表头高 35 vs 35.5**——实现首行 th 的 1px 下边框参与取整（设计 35），亚像素，接受。
2. **表体文字色**——设计 `oklch(20% 0.02 240)`（`--fg`），实现 antd `colorText: #1a1a2e`（`App.vue` themeConfig）。两者均为近黑深蓝（ΔR≈12/ΔB≈16，13px 下不可辨），属**全站 antd token 与设计 token 的既有关系**（ClickHouse / Edge 直连等已改版页同款），不在本变更范围；记录备查。

## 3. 九子域扫描

| 子域 | 结论 |
|---|---|
| 页头 | 标题 21/600、描述 13 muted、徽标两枚（首枚 accent）、唯一主操作在最右 ✓ |
| 工具条 | 本页无工具条（配置页）— N/A |
| 表头 | 非大写、11px/600、`--bg` 底、无竖分隔线、首末列圆角归零（见修复③）✓ |
| 单元格 | 45px 行高、10×12 内距、13px；名称/地址/用户名单行省略 + title ✓ |
| 组头 | 本页无分组 — N/A |
| 状态格 | 三态胶囊与设计同解剖（pill-run / pill-stop / pill-unknown，6px 色点）✓ |
| 操作列 | 测试 / 设为当前(`op-pub`) / 编辑 / 删除(红) 顺序与 24px 高度一致 ✓ |
| 动作菜单 | 本页无 ⋯ 菜单 — N/A |
| 分页条 | 连接为少量命名连接，`:pagination="false"` — N/A |

## 4. 真机发现并修复（复测通过）

1. **行高混排 56/57/77px**——真实数据的长用户名（`uapm_user`）与长路径在 74/158px 列内折行。修法：名称/地址/用户名改单行省略（`.cell-ellipsis` + `title`），并按真实数据重排列宽（合计 1072 = `:scroll.x`）。
2. **当前行底色被吃掉**——全局 `.table-container .ant-table-tbody > tr:not(...) > td` 以 `background: transparent !important`（0,3,2）压过 `.grid-table tbody tr.dbm-row-current > td`（0,2,3），只剩左缘条。修法：选择器提到 (0,3,3)（`.table-container .grid-table …`）并保留 `!important`。
3. **表头左上 8px 圆角缺口**——antd 给首末列 th 的 `border-start-start/end-radius: 8px`，但本页表头位于卡头之下（非卡顶）。修法：该页表头圆角归零。

## 5. 视口扫描（同数据）

| 视口 | 表格 scrollWidth / clientWidth | 单元格截断 | 页面级横向溢出 |
|---|---|---|---|
| 1600 | 1310 / 1310 | 0 | 无 |
| 1366 | 1076 / 1076 | 0 | 无 |
| 1280 | 1072 / 990（行内滚动，符合 #83 口径） | 0 | 无 |

## 6. 待重启三处提示（`pending_restart=true` 注入）

- 页头徽标：`3 条连接` + `1 待重启生效`（warn，压过验证失败计数）
- hero 判定：`待重启`（`pill pill-warn`）+ 名称行 `待重启生效`（`ph-lite lite-warn`）
- 警示条：`切换待重启生效：当前页面数据仍来自旧库。…`（含 `develop/linux/start.sh` / `sh stop.sh; sh start.sh`）
- 侧栏徽标同步显示 `（待重启）`（既有能力，未被本次改动影响）

## 7. 设计页同步修正（不新增页面、不改版式）

1. `#` 列 40 → 45（全站表格解剖标准）；2. 列宽按真实数据重排（合计 1072）；3. 待重启警示条删去 API 不具备的「旧库名」；4. 页头第二枚徽标的优先级注记（待重启 > 验证失败）；5. 空值占位 `—` → `-`（与实现/全站同口径）。
