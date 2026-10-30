# edge-import-ux-review-fixes 设计

## 证据清单（真实探测，2026-10-30）

| # | 问题 | 级别 | 证据 |
|---|---|---|---|
| 1 | 连接测试 42-43s 且零过程反馈 | P1 | Playwright 实测：13 节点 44s、14 节点 43.4s（alert「响应时间: 43398ms」）；MutationObserver 全程 `toasts: []`；根因 `edge_import_service.py:134-210` 同步串行 9 次 HTTP |
| 2 | 「下一步」disabled 无解释 | P1 | EdgeImport.vue:86 `:disabled="!connectionTested"` 无 tooltip；截图 ei-1 |
| 3 | 导入无二次确认 | P1 | :453「确认导入」直接 `executeImport` 写库 |
| 4 | 跳过明细丢失 | P1 | :740 仅显示总数；后端响应 `skipped_counts`（schemas/edge_import.py:174）未消费 |
| 5 | 预览详情默认全收起 | P2 | expandedSections 全 false（:513-521）；预览步骤价值削弱 |
| 6 | 无全选/全不选 | P2 | 7 个 checkbox 逐一 |
| 7 | 0 项 section 占屏 | P2 | section-list 无条件渲染全部 7 卡 |
| 8 | 错误文案裸拼英文 detail | P2 | :623 `'加载节点列表失败: ' + detail` |
| 9 | 「上一步」回 step0 全清 | P2 | goToStep(0) 清集群+节点+连接+adminKey（:667-675）——换节点需重选集群 |
| 10 | 取消无确认 | P2 | :703 handleCancel 直接清全部 |
| 11 | adminKey 语义不清 | P2 | placeholder「输入节点 Admin Key...」；可空回退节点配置未说明 |
| 12 | 成功收尾单一 | P3 | 仅「查看集群详情 →」，无「继续导入」 |
| 13 | 冲突表 rowKey=resource | P3 | 同 resource 多冲突撞 key（:182） |

已正确不改的：三步向导骨架、连接成功 alert 的节点概要信息（全 route 标注）、冲突自动展开（有冲突时 showConflicts=true ✓ :688）、审计与写锁约定（#29 commit 已做）、preview warnings/plugin_summary 展示。

## 关键设计决策

### D1 连接测试并行化（待决 1，推荐 A）

`test_connection`（同步方法，经 to_thread 卸载）内部 9 次取数改 `ThreadPoolExecutor(max_workers=9)` 并行：

```python
def test_connection(self) -> dict:
    def probe(fn, default=0):
        try:
            return fn()
        except Exception:
            return default

    with ThreadPoolExecutor(max_workers=9) as pool:
        f_routes = pool.submit(probe, lambda: self._count_list(self.client.list_routes()))
        f_up = pool.submit(probe, lambda: len(self._unwrap_panshi_items(self._parse_resource_list(self.client.list_upstreams()))))
        ...  # plugins/plugin_configs/global_rules/plugin_metadata/stream/ssl/version 各一路
        route_count = f_routes.result()
        ...
```

- EdgeClient._request 每次调用 `httpx.get/post` 函数式新建连接（edge_client.py:238-249），无共享会话 → 线程安全 ✓
- 每路独立 probe() try/catch——「单类失败不阻塞」语义与现状逐路 try/except 完全一致
- 预期耗时：max(单请求) ≈ 5s（现状 43s = 9 × ~4.7s 串行和）
- `fetch_edge_data`（preview/execute 取数）同款并行（待决 2 推荐 A）

### D2 过程反馈（批 1 前端）

- 测试连接 loading 期间，adminKey 表单项下方渲染 info alert：「正在连接节点并统计配置数据，约需数秒至 1 分钟（视节点网络而定）……」——静态提示即可（后端无进度事件；43s→5s 后实际体验 5s 级，提示文字按保守值写）
- 完成后沿用现有 success/error alert

### D3 导入确认弹窗（待决 3，推荐 A）

- 用 `useOverlayModal`（#25 共享弹窗约定，非 AppModal 流程弹窗）：
  标题「确认导入」；正文按 selections 汇总「上游 12 个、路由 54 条……；冲突项将自动跳过」；okText「确认导入」danger=false
- 确认后方调 executeImport

### D4 跳过明细

- `showImportResult` 成功分支消费 `result.skipped_counts`（已存在）：有值的类逐行「上游跳过 3 个」；全 0 则保持现状总数行
- 上游数据 + 链接「查看导入日志」待查——主 spec 有「查看导入日志的链接」，现状结果弹窗无此链接，日志页在哪？（spec「导入日志」requirement 有查看场景——查现有页面：ps_import_log 有无 UI）。快速 grep import_log 页面——若无 UI 页则加链接落空，改为弹窗内说明「导入日志已记录（ID: N）」。

### D5 状态保持

- goToStep(0) 分支：保留 selectedClusterId 与 clusters（不清）——重选节点直接可用；nodes 保留（集群没变不必重拉）——仅清 selectedNodeId/连接态/adminKey/previewData
- handleCancel 前加确认弹窗（overlay modal）

### D6 预览默认展开与空折叠

- 进入 step2 预览数据就绪后：`expandedSections[k] = (previewData[k]?.length > 0)` 批量设置
- 模板：`v-if="count > 0"` 渲染卡片；count=0 渲染单行 muted 提示（四层代理：0 个——保持「数据已探查」的语义而不是隐藏）
- 全选/全不选：section-list 头部两链接按钮，作用 selections 全键

### D7 下一步 disabled 说明

- a-tooltip 包裹 disabled 按钮（antd 惯例：disabled 元素不触发鼠标事件，需包 span）——tooltip「请先完成连接测试」

## 文案对照表

| 位置 | 现文案 | 新文案 |
|---|---|---|
| adminKey placeholder | 输入节点 Admin Key... | 留空则使用节点已配置的 Admin Key |
| 测试连接过程 | （无） | 正在连接节点并统计配置数据，约需数秒至 1 分钟（视节点网络而定）…… |
| 下一步 disabled | （无 tooltip） | 请先完成连接测试 |
| 导入确认 | （无弹窗） | 确认导入？（正文：将导入 …；冲突项将自动跳过） |
| 取消确认 | （无弹窗） | 取消将丢弃已选配置与预览数据，确定取消？ |
| 节点加载失败 | 加载节点列表失败: <detail> | 获取节点列表失败，请刷新重试（<detail>） |
| 预览失败 | 获取预览数据失败: <detail> | 获取预览数据失败：该节点的部分配置无法读取（<detail>），可返回上一步重试 |
| 跳过明细 | 跳过：N 项（冲突） | 总数行 + 分类明细行（上游跳过 X 个……） |

## 测试策略

- 后端：`test_edge_import_service` 并行化回归——mock client 各方法断言结果一致性 + 单路异常不影响整体（保持现语义）；响应时间断言可选（mock sleep 验证并行 < 串行）
- 前端组件测试 `EdgeImport.test.ts`（新建）：确认弹窗/跳过明细/tooltip/全选/空折叠/取消确认/上一步保留集群
- 真实 UI：test 集群 14 节点实测连接耗时（预期 <10s）与过程提示可见
