# tools-page-restyle 验收记录（2026-11-25）

基准：`docs/ui/Live-Artifact-5/proposal-c/tools.html`（用户已定稿）。视口 1600×1000。

## parity 量测（五步法第③⑤步）

量测脚本：本目录 `parity.cjs`（静态元素）/ `parity2.cjs`（状态态元素），双侧 `getComputedStyle` 逐属性对照。

### 静态元素（默认态 Lua 互转，18 组选择器 × 13 属性）

对照维度：font-size / font-weight / color / background-color / border-color / border-radius / line-height / letter-spacing / padding / 盒尺寸 / font-family。

**零差异**：rail-item-active / rail-item-idle / head-title / head-hint / btn-help / btn-clear / textarea（等宽字体链 `"JetBrains Mono", "IBM Plex Mono", "SF Mono", ui-monospace, Menlo, monospace` 两侧逐字一致）/ pane-label / mid-primary / mini / ph-lite 徽标。

### 状态态元素（注数据后量测）

| 元素 | 注入 | 结果 |
|---|---|---|
| tb-btn-ghost（当前时间） | timestamp 页 | 零差异 |
| tb-result 行 / rg-hl 主行 / rg-k 标签 | timestamp 输入 `1750000000` | 零差异 |
| tb-warn 警示条 | SM4 密钥 `abc123`（6 字节） | 零差异 |
| tb-warnline / tb-file-head / tb-fname | Keepalived VIP + 2 节点 | 零差异；warnline 缺席 = 默认密码恰 8 字符不触发黄字提醒（行为正确，设计样张因样例密码 10 字符而显示） |

## 截图

`01-lua.png`（默认态）/ `02-timestamp.png`（输入即算+结果格）/ `03-jwt.png`（解码块+exp 徽标）/ `04-sm4.png`（警示条+密钥行）/ `05-diff.png`（差异结果区）/ `06-ka.png`（表单生成器）；`design-page-full.png` 为设计稿全页对照。

## 测试与回归

- `pageHeaderActions.source.test.ts` + `mockupParity.source.test.ts`：284 passed（含新增 Tools 对与 tools 段 3 条红线，先 RED 后 GREEN）
- `Tools.test.ts` 39/39（选择器随类名同步：.nav-item→.tb-tool 等 12 组反转）、`ToolHelpDrawer.test.ts`、`toolHelp.source.test.ts` 全绿
- `npx vue-tsc -b` 0 error
- 全量 `npx vitest run --maxWorkers=4`：3469+ passed；两轮漂移失败（RouteList 排序翻页 → DbMigrationSummaryCard 入口导航）隔离复跑均绿，按 AGENTS #58 定性 CPU 争抢型波动，非回归
- 后端 `tests/test_user_manual_images.py` 4 passed（手册图片三向守卫不受影响）

## 手册核对（task 5.3 结论）

- **工具箱章节（24-tools.md）无截图**——磁盘上的 `24-*.png` 是历史编号，实际属于第 23 章（数据导入 24-new-01..05）与第 26 章（Ansible 主机清单 24-00..04），与工具箱视觉无关，无需重拍。
- 手册文字与实现冲突已修正：24-tools.md「13 件套」→「14 件」（表格补 Keepalived 配置生成行），与页头徽标「14 个工具」对齐。
