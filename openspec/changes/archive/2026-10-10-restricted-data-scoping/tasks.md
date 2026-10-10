# Tasks: restricted-data-scoping

> 全程 TDD（约定 #16）：先写失败测试并验证失败，再最小实现。批次顺序：1 → 2 → 3。批次 1（后端）与批次 2（前端）文件零交集，可并行开工。

## 1. 后端：dashboard 端点分配可见性（契约补齐，零模型变更）

- [x] 1.1 （RED）`test_dashboard.py` 扩展受限用户夹具（role=user + UserCluster 分配控制）三对照：① 零分配 → stats 全部集群域计数为 0、recent-routes 空、users 仍全局值；② 部分分配（建 A/B/C 三集群各带路由与节点，仅分配 A/B）→ stats 与 recent-routes 均不含 C 的数据；③ 管理员 → 全量口径不变（既有 3 用例原样绿 = 无回归守卫）
- [x] 1.2 实现：`dashboard.py` 增 `_visible_cluster_ids(db, user)`（admin → None 不过滤；非 admin → 分配 id 列表，空集合法；判定用 `role != 'admin'` 与既有 9 处实现同款，评审确认 B），stats 十项集群域计数与 recent-routes 查询套用同一 helper；**零分配短路**直接返回全 0 / 空表（对齐 nodes.py 空集先例，评审确认 B）；users 计数保持全局（注释注明有意行为）
- [x] 1.3 回归：`uv run pytest -k "dashboard" -q` 全绿；`uv run pytest tests/test_security_guard.py -q`（/dashboard/* 匿名 401 采样不受影响；无新路由不需补采样，约定 #19）

## 2. 前端：空态文案角色区分

- [x] 2.1 （RED）`Dashboard.test.ts`：非管理员空数据区 → 「暂无可见{资源}，前往{资源}管理 →」（SHALL NOT 出现「去创建」）；管理员空数据区 → 保持「还没有{资源}，去创建 →」；集群/节点/路由三卡同模式
- [x] 2.2 实现：`Dashboard.vue` 空态文案按 `authStore.user?.role === 'admin'` 区分（与侧边栏/概览权限过滤同源判定）；两角色 CTA 均保留链接
- [x] 2.3 （RED）受限口径一致断言：mock 分配口径数据（stats 与明细同源同值），断言统计卡数字与明细卡数据一致（消费批次 1 契约的形状，形状以 curl 实测为准，约定 #43）

## 3. 回归与验收

- [x] 3.1 `npx vue-tsc -b` + `npx vitest run` 全绿（时序失败先单文件重跑判定环境 flake，约束 #196）
- [x] 3.2 后端 `uv run pytest -k "dashboard" -q` 全绿
- [x] 3.3 实机受限复查（约定 #51②，复用 ux_accept_tmp）：① 零分配 → 全空一致、无「统计卡 vs 明细卡」矛盾；② 经用户管理分配部分集群 → 统计卡 = 明细卡；③ 管理员视角抽查无变化；④ 验收后临时账号处置由用户决定；截图入 task 结果不落仓库
- [x] 3.4 tasks.md 逐项打勾，准备归档（归档时同步主 specs：cluster-visibility-scoping 新建、platform-overview-page MODIFIED 合并）
