# Proposal: stream-proxy-ux-review-fixes

## 背景

对「四层代理」模块（/stream-proxies：StreamProxyList + StreamProxyFormWizard + StreamProxyViewDrawer，后端 cluster_stream_proxies）完成一轮真实环境 UX 评审：代码走读 + Playwright 全流程走查（创建→编辑→发布→版本→删除→错误路径，34 张截图），全部结论已逐条对照源码核验（P0/P1/P2/P3 共 25+ 条，零收回）。test 集群实走，测试数据已清理。

## 主要问题（按严重度）

### P0（静默配置变异，随发布推送到 Edge）

- **P0-1 健康检查 checks 被静默注入/清除**：「高级配置」不勾选时表单仍无条件提交 checks——新建/编辑初始化把 checks 填成默认值（向导 :1405/:1362-1369），提交体恒带 `checks`（:1220）；对已有自定义 checks 取消勾选则直接置 null（:849-859）。实测：创建（checks=null）→ 仅改描述 → 保存发布后快照出现默认 `{"passive":{},"active":{"unhealthy":{}}}`；存量代理 id=343 已是化石证据。发布侧 `if proxy.checks` 非空即下发 Edge（cluster_stream_proxies.py:564-565）。

### P1（状态说谎 / 高危误解 / 风险不可见）

- **P1-1 无「待发布」态**：编辑已发布代理后仍显示「已发布 v2」，平台≠Edge 不可见。姊妹域（上游/路由/插件组/全局规则/SSL）均为四态；stream 后端 0 处 derive_pending_publish，模型无 last_publish_status 列。
- **P1-2 版本「恢复」是部分恢复但文案暗示完整回滚**：_restore 不恢复 checks/retries/retry_timeout/listen_port/description/dns_config（:618-627）——回滚后发布，实际生效配置与 v1 不一致（端口、健康检查都是当前的）。
- **P1-3 删除确认节点无在线标识、子集删除无后果说明、部分失败无清单无重试**；勾选离线节点删除必失败，终态仅「部分节点删除失败，请手动清理」。实测子集删除后未选节点边缘路由残留。
- **P1-4 向导「参考节点」含离线节点且无标识**；检测失败文案无解法（解法「手动输入端口」就在下方却未联动）。

### P2（可读性/一致性缺口）

P2-1 重复端口 409 文案过短无引导；P2-2 进度弹窗「取消」仅隐藏视图、任务后台继续且锁不释放；P2-3 查看抽屉缺健康检查/重试/DNS 域名映射渲染、时间粒度不一；P2-4 timeout/keepalive_pool/sni/remote_addr 抽屉可见但全站无编辑入口；P2-5 105 卡片无分组锚点/无排序；P2-6 发布确认未传 current-version 缺「将创建 v(N+1)」提示（RouteList 同病）；P2-7 空态不区分无数据/筛选无结果、图标为裸 Unicode；P2-8 端口占用卡 used_by 纯数字与端口号混淆；P2-9 删除确认无全选（发布确认有）；P2-10 高级配置展开无滚动定位。

### P3（小瑕疵）

P3-1 端口检测日志是客户端伪造剧本；P3-2 进度日志空行带孤立时间戳；P3-3 编辑强制重走第 1 步；P3-4 单按钮「代理类型」toggle 视觉噪音；P3-5 搜索防抖页面私有实现（RouteList 用共享 useDebouncedSearch）；P3-6 批量模式行内操作仍可点；P3-7 权重格式不一（卡片（100）vs 抽屉 :100）；P3-8 发布确认标题不带资源名；P3-9 退出批量管理双入口。

## 拟议变更（分 4 批，低风险先行）

1. **批 1·checks 保真（P0-1）**：勾选才提交；取消勾选清空已有非默认 checks 需确认；后端零改动（exclude_unset 已支持）。
2. **批 2·四态状态（P1-1 + P2-5 部分 + P2-6）**：模型加列 + COLUMN_MIGRATIONS + 列表/详情接 derive_pending_publish + PublishStatusTag 四态传参 + 状态 Tab 筛选 + 发布确认传版本。
3. **批 3·删除与回滚风险（P1-2/P1-3 + P2-9）**：恢复语义诚实化、删除确认节点标识/默认全选/后果行/部分失败重试。
4. **批 4·向导/抽屉/文案收口（P1-4 + P2-1/2/3/4/7/8/10 + P3 子集）**：检测失败联动、409 文案、抽屉重排、空态、toggle 移除、防抖统一等。

## 影响

- 后端：stream 模型加 1 列（须登记 COLUMN_MIGRATIONS）、列表/详情端点接四态、409 detail 带占用者名；其余零后端。
- 前端：向导/列表/抽屉/进度弹窗；跨域小同步（RouteList current-version、共享 useDebouncedSearch 复用）。
- 明确不做（本轮）：抽屉四字段的表单编辑入口（复杂 JSON 表单成本高、诉求低，记录为已接受缺口）；版本恢复扩全量字段（默认文案诚实化，是否扩全量见决策点）；批量发布。
