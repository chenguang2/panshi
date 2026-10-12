# Tasks: node-management-ux-batch2

## 1. 运行态三态与配置态徽章（P1-2）

- [x] 1.1 RED：`nginxState(node)` 三元判定单测（running/stopped/unchecked；无 status_detail → unchecked，不回退 status===1）→ GREEN：实现于 NodeList，替换 `nginxRunning` 全部调用点（状态列/详情/筛选）
- [x] 1.2 RED：状态列与详情弹窗徽章接入 `BadgeStatus` 三态（running=online 运行中 / stopped=offline 已停止 / unchecked=neutral 未检测），三态互斥渲染；详情弹窗「节点状态」区补管理开关（启用/禁用）展示 → GREEN；Tab（ClusterNodes）状态列同步接入三态
- [x] 1.3 「已禁用」配置徽章换 `BadgeStatus neutral`（中性灰，SHALL NOT 危险红），与运行态徽章并排保留（源码守卫「表格状态列可见节点禁用态」窗口同步放宽）
- [x] 1.4 Tab 表单 a-select（ClusterNodes.vue:264-265）与批量导入 select（:390-391）「正常/禁用」→「启用/禁用」，纳入措辞源码守卫（新增 `ClusterNodes.source.test.ts`）

## 2. 检测时效与刷新（P1-3）

- [x] 2.1 `utils/format.ts` 新增 `formatRelativeTime`（<1min 刚刚 / N 分钟前 / N 小时前 / N 天前 / 更早回落日期；**负差值钳为「刚刚」**）+ 单测（8 用例 RED→GREEN）
- [x] 2.2 RED：运行态徽章下方展示「N 分钟前检测」（数据源 `status_detail.last_execution`，无则不渲染）→ GREEN；Tab（ClusterNodes）同款时效
- [x] 2.3 RED：刷新按钮点击调列表重载 → GREEN——**独立页**（筛选栏「刷新」→ `loadNodes()`）与 **Tab**（「刷新」→ 局部 `loadNodes(cluster)`，不经 `emit('refresh')` 避开 `loadClusters` 全量刷新地雷）两入口；顺带删 Tab `onRefresh` 死代码（emit 声明一并移除；`useClusterNodes` 的 `onRefresh` 参数改可选，CentralList 侧传入不受影响）

## 3. 筛选与排序（P2-7 + 三态筛选）

- [x] 3.1 RED：状态筛选选项含「未检测」，过滤按 `nginxState()` → GREEN（沿用 statusFilter 时 `loadAll` 全量客户端过滤机制——≤100 节点已知边界，不后端化；存量「双计数」用例 mock 补 nginx 真实形状后按 `running` 值断言）
- [x] 3.2 移除全部列客户端 `sorter`（含 IP localeCompare），相关测试断言更新（新增 NodeList.source「零客户端 sorter」守卫）

## 4. 确认弹窗收敛（P2-9）

- [x] 4.1 `useOverlayModal` 新增 `okLoading`：onOk 为 Promise 期间禁用确定钮并显示「处理中…」，异常恢复可点（单测 3 用例 RED 2 failed → GREEN）
- [x] 4.2 RED：动作确认（启动/停止/reload/取消安装）走 `showOverlayModal`（危险色语义与按钮文案保持）→ GREEN；删除 `confirmState`/`executeConfirm`/手写确认模板（源码守卫钉死零残留 + 行为回归锚点）

## 5. 进度不确定态（P2-10）

- [x] 5.1 RED：`NodeExecutionResultDrawer` 支持 `progress.indeterminate`（执行中动画条+已耗时，无百分比数字；**收到首个带 percent 的服务端事件自动切换真实百分比**；终态回落 success/exception）→ GREEN（4 用例：起始形态/percent>0 自动切换/终态回落/未传行为不变）
- [x] 5.2 NodeList 动作流（含取消安装）置 indeterminate；删除 elapsed/200s 假模型（RED 2 failed → GREEN；安装流保留服务端真实百分比，既有安装流测试回归通过）
- [x] 5.3 Tab（useClusterNodes）删除每 2s +5 脉冲，动作流同款 indeterminate（含 Tab 侧 200s 外推假模型清除：安装流保留真实百分比、关联/版本包/取消安装走不确定态；composable 行为+源码守卫 3 用例 RED→GREEN）

## 6. 详情归属标注（P2-6）

- [x] 6.1 详情弹窗集群统计卡片标题标注「（集群级）」（区块标题「所在集群统计（集群级）」+ 组件测试断言）

## 7. 验证

- [x] 7.1 `npx vue-tsc -b` 零错误；vitest 全量（并行失败按 #196 协议串行复跑判定）——vue-tsc exit 0；并行 40 失败全为资源竞争超时，串行复跑 1603/1603 全绿（其中一次单例 flake 为 UserList.pagination 既有时序抖动，本批未触碰该文件，隔离复跑 3/3 绿）
- [x] 7.2 实页验收：三态徽章（含未检测灰/已禁用中性灰并排）、检测时效文字、刷新按钮、筛选「未检测」、动作执行不确定态进度、详情「（集群级）」标注；截图留人工复核
