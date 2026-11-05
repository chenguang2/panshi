# Tasks

> 执行约定：TDD（#16）；共享语义变更先 grep 全域消费方与既有断言（#217）；形态类 mock 必须取自 Edge GET 实测响应（#43）；触 PG 冒烟强制项（#103）；全量收口 pytest + 前端串行 vitest（#208）。

## 1. 快照实发载荷留痕

- [ ] 1.1 RED：`tests/test_config_version_edge_payload.py`——发布路由/上游后最新 ConfigVersion 行 `edge_payload` 非空且 JSON 等于实发 edge_data；未发布的资源无行；既有版本语义（version 递增/config 不变）不受影响
- [ ] 1.2 GREEN：ConfigVersion 加 `edge_payload TEXT` 列（models/cluster.py）+ COLUMN_MIGRATIONS 注册（migrate.py，#118）；`publish_resource` 落快照处序列化 edge_data（isinstance dict/list 守卫，#48 TEXT-JSON 铁律）
- [ ] 1.3 守卫核对：`test_publish_response.py` 源码守卫随函数体变更同步（#18）；跑 PG 方言冒烟 `TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q`（#103）
- [ ] 1.4 既有发布域回归：`pytest -k "publish"`（#51 同域回归纪律）

## 2. 字段级 diff 纯函数

- [ ] 2.1 RED：`tests/test_drift_diff.py`——added/removed/changed 三类差异、嵌套 dict/list 路径（点号+下标）、白名单剔除（id/时间戳/上游健康动态子树等按类型注册表）、数值-字符串类型归一（Edge 回传字符串端口 vs 基线数值）、双侧等价 → 空 diff、敏感字段脱敏输出（私钥等占位符）
- [ ] 2.2 GREEN：`services/drift_detection.py` 实现 `diff_edge_payload(baseline, actual, whitelist, mask_fields)` 纯函数；白名单/脱敏清单按类型集中在注册表单处（实施前抓 dev Edge 真实响应钉形状，#43）
- [ ] 2.3 类型注册表：grep publish_resource 全部调用方钉死类型清单（#51 纪律），每类登记 edge_resource 路径/匹配键/白名单/脱敏字段；不经编排的资源（静态资源 zip/节点部署）固定进未纳入提示区

## 3. 检测编排与端点

- [ ] 3.1 RED：`tests/test_drift_detection.py` 编排矩阵（mock EdgeClient，形状取实测）——一致；字段漂移（changed/added/removed 各一）；Edge 缺失基线资源（「Edge 已删除」）；Edge 多出旁路资源；未发布资源（无法评估·未发布）；旧快照无 edge_payload（无法评估·基线缺失）；Edge 读取异常（单资源降级不中断整批）；路由/上游/插件组/全局规则/SSL/流代理六类各一例冒烟；范围外资源类型列入 out_of_scope_types
- [ ] 3.2 GREEN：`services/drift_detection.py` 编排（活跃节点抽样 1 个建 EdgeClient；按注册表匹配键定位运行态；复用 max(version) 最新快照查询形态）；`api/v1/cluster_drift.py` 只读端点 `GET /clusters/{cluster_id}/drift`（router 级 get_current_user，#19；注册 main.py）
- [ ] 3.3 安全采样：`tests/test_security_guard.py` UNAUTHENTICATED_SAMPLES 补 `GET /clusters/{id}/drift`；兜底路由语义确认（#34：新路由注册在兜底之前）
- [ ] 3.4 后端域回归 + 全量收口：`pytest -k "drift or publish or relay"` → 全量 `uv run pytest`（0 failed）

## 4. 前端

- [ ] 4.1 `api/clusters.ts` 加 `getClusterDrift`；类型定义（三态/summary/diff 条目）
- [ ] 4.2 结果抽屉组件 `ClusterDriftDrawer.vue`：summary 计数条、按类型分组、漂移项展开 diff 三列表格（字段路径/基线值/运行态值）、无法评估项展示原因、「重新检测」复检按钮；组件测试三态渲染 + 复检触发（a-table 用 aTableStub，#54）
- [ ] 4.3 ClusterList 行操作「漂移检测」接线（loading 态防重复触发；触达点用真实页面验证，#51）；组件测试覆盖入口
- [ ] 4.4 前端收口：`npx vue-tsc -b` 0 error；`npx vitest run --no-file-parallelism` 全绿（#208）

## 5. 真链路验收与归档

- [ ] 5.1 dev 实例真链路验收：对某集群发布路由 → 改平台对象不发布 → 检测报一致（基线语义验证）；再经 Edge 直改运行态 → 检测报漂移且 diff 正确；还原现场（#35 文件探针核对新代码生效）
- [ ] 5.2 `openspec validate --all` 0 error 收口（#53）
- [ ] 5.3 归档合并：主 spec 增 `config-drift-detection`（MODIFIED 块取主 spec 现文，#53）
- [ ] 5.4 提交推送 + 交付报告（含「旁路修改复现 → 检测发现」验收脚本）
