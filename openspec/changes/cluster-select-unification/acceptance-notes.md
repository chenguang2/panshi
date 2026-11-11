# 批 3 验收记录（任务 4.3）

- 日期：2026-11-11；方式：真实 dev 服务（常驻 12345，未自行启停，#8）+ Playwright 探针截图与 DOM 探测（探针脚本 /tmp/opencode/accept-probe.mjs，仅临时用不入库）。

## 抽查结果

| 页 | 形态 | 结果 |
|---|---|---|
| 节点管理 /nodes | 筛选条 ClusterSelect（allow-all） | dropdown 打开正常：7 个集群项 + 3 个分组标题渲染；搜索「生」过滤生效（空结果隐藏空组）✅ |
| edge.env /edge-env | 必选模式 | placeholder「请选择集群」显示（无 selection-item）✅；下拉仅集群项、**无「全部集群」项** ✅；分组标题（dns/monitor/test）与组内集群渲染正确 ✅；截图 accept-edgeenv.png 视检通过 |
| 四层代理 /stream-proxies | 筛选条 + 表单向导 | `.cluster-select` ×2（筛选条 + 向导字段）✅ |
| 全量单测 | — | 2653/2654（唯一失败 RelayGateways.test.ts 隔离复跑 63/63 绿 → #58/#208 波动家族）✅ |

## 关键风险点验证（design.md 风险表）

- **真实 antd 下 `value=''` 回显「全部集群」**：筛选页 dropdown 首选项渲染与测试断言一致；必选模式 ''→undefined 规范化后 placeholder 正常显示（截图确认）。风险关闭。
- **jsdom 桩 select 不收录嵌套 option（未解析 opt-group 包裹）**：仅影响测试桩 DOM 驱动，生产 rc-select 不受影响；相关测试已统一改为组件 emit 契约（NodeTaskCenter 13 处、EdgeImport 3 处、DnsQueryFormModal 3 处）。

## 全量复跑记录（批 3 提交前后）

| 轮次 | 结果 | 唯一失败 | 处置 |
|---|---|---|---|
| 16:33（提交前，串行） | 2653/2654 | ClusterPluginConfigs.publishState「失败态重试」 | 隔离复跑 8/8 绿，mock 调用数 0 为时序假象 |
| 16:38（提交后，串行，与前台单测并发） | 2653/2654 | SslFormDrawer「client_depth=0」 | 隔离复跑 29/29 绿 |
| 16:42（清场串行） | 2653/2654 | UserList.pagination「搜索后回第 1 页」 | 隔离复跑 8/8 绿 |
| 16:45（清场，`--maxWorkers=4`） | 2652/2654 | RelayGateways 3.7 + DbBackupCard.dr 清理历史 | 两文件联跑首轮复现 1 例、次轮 92/92 绿 |

四轮全量各留 1～2 例、失败文件轮换、隔离/重跑即绿（ClusterPluginConfigs / SslFormDrawer / UserList.pagination / RelayGateways / DbBackupCard.dr 跨全域，均非本变更触及文件），与 #58 波动家族一致，判定**环境波动、非本变更回归**。两点经验：① 全量期间并发跑其他 vitest 进程会显著抬高波动率，判定前先清场；② 本机当前波动率高于 #208 记载的「串行全绿」，`--maxWorkers=4` 与串行表现相当，两者都不能保证零波动。

## e2e

- edge-client.spec.ts 集群交互改 antd 下拉点击（点开下拉 → 按选项文本点选），节点 select 位置 2→1：`npx playwright test edge-client.spec.ts` 10 passed。
- 3 个失败（route table columns / plugin list table / 四层代理入口）经 stash 回退对比：**批 3 之前同样失败**——dev 库首个节点不可达 → edge_client 直连腿 503（环境依赖，预存失败，与本变更无关）。

## 待用户界面验收（任务 5.2）

12 资源页筛选条、edge.env、任一表单弹窗（如新建路由）、NodeTaskCenter 创建任务弹窗。
