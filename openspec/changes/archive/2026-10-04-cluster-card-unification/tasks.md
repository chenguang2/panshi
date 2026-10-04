# Tasks: cluster-card-unification

> 派 @designer（des-2）执行组件化收敛，编排者持验证权；已完成（commits 88ea4dc8 / 532f56c5）。

## 1. 组件契约与两页接线

- [x] 1.1 新建 `ClusterCard.vue`：props cluster/routeBadge + slots topbar/actions/footer + `.cl-card*` 样式收敛
- [x] 1.2 ClusterList 接线（1005→806 行，死代码 maximizeAndSwitchTab 删除）
- [x] 1.3 CentralList 分组/未分组两处接线（2499→2223 行）+ 路径徽章补齐（watchEffect 惰性拉取）+ 统计格 7 格 router-link
- [x] 1.4 CSS 漂移逐条取舍（topbar/stats/字号取 CentralList，line-clamp 取 ClusterList，status-dot 全局统一）

## 2. 测试与验证

- [x] 2.1 挂载测试 19 例 + 源码守卫 5 例（两页 import、route-badge 接线、不再内联解剖、两份拷贝收敛、inline style 清除）
- [x] 2.2 受影响 8 文件 59/59；全量 24 红三重定性为机器负载假象（失败集漂移/涉事文件无关/HEAD stash 基线同败）
- [x] 2.3 编排者独立复核：接线/回退规则/零残留/`vue-tsc -b` 全过
- [x] 2.4 AGENTS.md 关键约定 #52 落档（解剖唯一实现）

## 3. #id 尾注删除 + tooltip 保底

- [x] 3.1 （TDD）RED 3/3：两份守卫文件 + 挂载测试（tooltip 两形态：有展示名/回退 name）
- [x] 3.2 GREEN：统一管理两处卡片删「#id」尾注连同死 CSS；标题 tooltip `集群名: xxx · ID: N`
- [x] 3.3 源码守卫钉死「CentralList 永不再出现 cl-card-id」；邻域回归 49/49 + `vue-tsc -b` 干净
