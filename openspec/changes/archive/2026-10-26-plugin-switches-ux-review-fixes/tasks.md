# tasks: plugin-switches-ux-review-fixes

## 批 1 · 保存模型与风险闸门（P1-1/4、P1-2、P2-8、P3-11）

- [x] 1.1 RED：sticky 保存条（未保存计数/放弃更改/保存配置）组件级用例；放弃=还原快照零请求；beforeunload 守卫；离开守卫三动作（保存并离开复用保存流程）
- [x] 1.2 GREEN：保存条实现（fixed 定位、hasUnsavedChanges 驱动）；放弃=深拷贝 originalPlugins 回写；beforeunload 挂载/卸载；守卫弹窗加「保存并离开」（requestLeave defineExpose 供路由守卫与测试共用）
- [x] 1.3 RED→GREEN：全部禁用确认弹窗（列影响 + 需保存生效语义）、全部启用轻确认；批量后停留未保存态断言
- [x] 1.4 保存成功降 toast（message.success）；仅引用警告保留模态；既有「保存成功弹窗」断言反转（#217 清单）；message mock 注入
- [x] 1.5 自定义 toggle → a-switch（size small）统一，删除第三种开关样式 CSS；受影响选择器断言同步（.mock-switch role=switch）

## 批 2 · 引用感知前移（P1-3、决策点 2）

- [x] 1.6 后端 RED：`_count_plugin_refs(all_names, db)` 单实现抽取；GET /plugin-switches 响应每项带 `refs`（refs 映射覆盖全部内置名）；与 PUT warnings 同源守卫用例
- [x] 1.7 后端 GREEN（19/19）；PG 方言冒烟不触发——纯 GET 读路径 + 扫描函数重构，无 schema/写库路径变更（#103 触发式评估记录）
- [x] 1.8 前端 RED→GREEN：卡片「被引用 路由 2」徽标（refs 全 0 不显示）；禁用被引用插件行内警示文案（后果语义）；警告弹窗升级（后果解释 + 逐插件计数 + 查看引用跳转 + 还原被引用插件）
- [x] 1.9 前端类型与 api 层 refs 字段贯通；空态/全零回归
- [x] 1.10 RouteList 接线 `?search=` 深链（查看引用落点：预填搜索框随首屏过滤）

## 批 3 · 文案与一致性（P2-5/6/7/9/10、P3-12/13）

- [x] 2.1 面包屑修复——根因深于单页：navMeta.ts sectionMap 整表停留批 9 前（「综合」残留/插件开关/ClickHouse/中继错位，面包屑+全局搜索同源漂移）；整表对齐六组 + 同源守卫用例（词表相等断言）
- [x] 2.2 文案对照表落地（design D4 全表）：header 描述、⚙ 配置结构、技术名标签、警告标题/正文、保存条文案
- [x] 2.3 禁用态样式：标题行微淡 + 未保存虚线框标识；断言区分已存/未存（unsaved-disabled）
- [x] 2.4 双计数合并（删过滤条「共 N 个」）；空 schema 卡「无参数」占位；PageHeader actions「操作日志」链接
- [x] 2.5 PluginSwitches.test.ts 全量反转清点复核（#217）：26/26（既有 10 例中 8 例按新行为反转/选择器更新）

## 收口

- [x] 3.1 `npx vitest run --no-file-parallelism` 全量串行绿（1970/1970）；`npx vue-tsc -b` 0 error
- [x] 3.2 真页 Playwright 走查 9 项（面包屑/文案/徽标/sticky 浮现+放弃/全部禁用确认/警告弹窗动作/还原链路）全过；实验后现场还原 13/13
- [x] 3.3 `openspec validate --all` 0 error；经验沉淀评估：navMeta「新增页面登记两映射」已有注释警示仍漂移——补同源词表守卫（已含 2.1），AGENTS.md 无需新增约定

