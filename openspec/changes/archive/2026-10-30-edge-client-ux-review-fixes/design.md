# edge-client-ux-review-fixes 设计

## 证据清单（真实探测，2026-10-30）

| # | 问题 | 级别 | 证据 |
|---|---|---|---|
| 1 | 不可达节点「已连接」+空表 | P1 | 实测 `10.255.255.1:11999`：8 路 catch 静默（各 loadXxx 仅 console.error）；上轮「已连接:10.255.255.101:9180」+本轮 loadedNode 未设——行为不一致竞态；空态「请确认节点可达」与「已连接」同屏矛盾 |
| 2 | 未选节点点查询零反馈 | P1 | `loadAllData` `if (!node) return`（:1319）静默；实测 toast 空 |
| 3 | 长列表无分页 | P1 | 7 Tab `:pagination="false"`；上游 13 行全渲染截图；SSL 独有分页（不一致） |
| 4 | 手动输入 blur 依赖 | P1 | `@blur="onManualInput"`（:50）+ 查询读 selectedNode（cluster 模式中间态）；上轮旧值 101:9180 竞态实锤 |
| 5 | 编辑无绕过警示 | P2 | 删除确认有「此操作绕过同步流程」（:1537 等 6 处）；编辑弹窗（upstream/route/globalRule/pluginConfig/pluginMetadata/streamRoute）无 |
| 6 | spec 漂移 | P2 | 主 spec「SHALL NOT auto-load」「6 parallel」vs 代码选节点即查 + 8 路 |
| 7 | 空态三态同文案 | P2 | 8 处 `ec-empty-guide` 同文案 |
| 8 | placeholder 网段不符 | P2 | `192.168.100.235:11999` vs 实际 192.168.0.x |
| 9 | 🔍 emoji | P2 | search-input-wrap 8 处 |

## 关键设计决策

### D1 失败聚合反馈（待决 1，推荐 A）

```ts
interface LoadOutcome { ok: boolean; label: string }

const loadAllData = async (): Promise<LoadOutcome[]> => {
  const node = resolveNode()          // 批 1-3：manual 直读 manualNode，cluster 读 selectedNode
  if (!node) { message.warning('请先选择节点'); return [] }
  ...
  const results = await Promise.allSettled([
    loadUpstreams(ip, port), ..., loadSslCertificates(ip, port),
  ])
  const labels = ['上游','路由','全局规则','插件组','插件元数据','插件列表','四层代理','SSL 证书']
  const failed = labels.filter((_, i) => results[i].status === 'rejected' || /* 内部标记 */ ...)
}
```

- 各 `loadXxx` 改为**返回 boolean**（成功 true；失败 catch 里 `failedLabels` 收集后 return false）——保持单路吞错不炸 Promise.all，但把失败上抛给聚合层
- 全失败：`queryError.value = '节点不可达或端口错误（ip:port），请检查后重试'`；**不设 loadedNode**；清空全部列表
- 部分失败：`queryPartial.value = 'N 类配置获取失败：路由、SSL 证书'`（warning 横幅）；loadedNode 正常设置
- 全成功：清空两横幅（现状）
- 横幅渲染于 filter-bar 与 tabs 之间（a-alert error/warning，closable）

### D2 手动输入直读（批 1-3）

- 删除 `@blur="onManualInput"` 与中间态 `selectedNode` 依赖：`resolveNode()` = `inputMode==='manual' ? manualNode.value.trim() : selectedNode.value`
- manualNode 合法性校验：包含 `:` 且 ip 段非空——非法提示「请输入 ip:port 格式地址」

### D3 分页统一（待决 2，推荐 A）

- 7 个 Tab 的 `:pagination="false"` → `:pagination="paginationProps"`（`usePagination` 工厂，客户端分页——data-source 已是内存数组，行数超 PAGE_SIZE_TABLE=20 自动分页）
- SSL Tab 不动（已是 sslPagination）
- 序号列已是 `index+1`（客户端分页下公式一致，无需跨页公式）✓
- 搜索过滤与分页组合：filtered computed 已存在（upstreamSearch 等），分页作用于 filtered 结果——`paginationProps` 接内存数组即可

### D4 编辑弹窗警示（待决 3，推荐 A）

- 6 个编辑弹窗（upstream/route/globalRule/pluginConfig/pluginMetadata/streamRoute）body 顶部统一插：
  `<div class="debug-note"><InfoOutlined /> 调试模式：修改将直接写入边缘节点，绕过平台同步流程</div>`
- 单点实现：抽 `DebugModeNote` 局部模板片段（v-for 不可用于 modal——直接 6 处插同一组件式片段；EdgeClient 单文件内定义一次复用）
- 新建弹窗同样显示（新建也是直接写节点）

### D5 空态三态（批 2-7）

- `emptyGuide` 文案 computed 化：
  - `!loadedNode` → 「请先选择节点后查询」
  - `queryError` → 「节点不可达，请检查地址与端口」
  - 默认 → 「该节点上无此类配置」

### D6 spec 漂移修正

- MODIFIED Manual query trigger：保留「查询按钮」存在但语义改为手动刷新；新增「选择节点自动查询」场景（稳定标识符规则 #53：场景名保留原集合——Page loads without auto query 场景名必须保留！MODIFIED 场景名集合必须精确覆盖主 spec 现文：主 spec 该 requirement 下场景是 `Page loads without auto query`——行为反转时**保留原标题改写正文 + HTML 注释注明裁决**，勿删场景）
- 同理 `Click query loads data` 场景保留原名，正文改 8 路 + 聚合反馈

⚠ 实施注意（spec delta 已按此写）：`Page loads without auto query` 场景标题在 delta 中保留、正文反转。

## 文案对照表

| 位置 | 现文案 | 新文案 |
|---|---|---|
| 未选节点查询 | （无） | 请先选择节点 |
| 全部失败 | （已连接 + 空表） | 节点不可达或端口错误（ip:port），请检查后重试 |
| 部分失败 | （无） | N 类配置获取失败：路由、SSL 证书（其余已正常加载） |
| 编辑弹窗 | （无） | 调试模式：修改将直接写入边缘节点，绕过平台同步流程 |
| 空态-未连接 | 未查询到数据，请确认节点可达或更换节点后重试 | 请先选择节点后查询 |
| 空态-失败 | 同上 | 节点不可达，请检查地址与端口 |
| 空态-无数据 | 同上 | 该节点上无此类配置 |
| manual placeholder | 192.168.100.235:11999 | 192.168.0.14:16620 |

## 测试策略

- 组件测试（扩展现有文件或新建 EdgeClientUx.test.ts）：全失败不设 loadedNode + 横幅；部分失败 warning；未选节点 toast；manual 直读（不 blur 直接查询）；分页渲染（>20 行切页）；编辑弹窗警示存在
- 既有回归：EdgeClientRouteLabel.test.ts + EdgeClientSslPagination.test.ts 保持绿
- 真实 UI：不可达节点错误横幅截图；54 路由分页截图
