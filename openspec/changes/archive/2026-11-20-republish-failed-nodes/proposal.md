# Proposal

## Why

静态资源卡片页在「部分分发失败」时能直接显示失败节点（IP + 原因）并提供一键「重发失败节点」；而四层代理 / DNS 代理（UDP）/ 插件组 / 全局规则四张卡片页在同样状态下只有泛化文案「发布未完全生效，请查看发布差异」——用户看不到哪个节点失败、失败原因，重发需要跨两个弹窗手动四步（查差异 → 找节点 → 关弹窗 → 发布时手动取消健康节点）。DNS 代理（HTTP）/ 插件元数据两页连该提示条都没有。同一类失败状态在六张卡片页呈现三种能力水平，应收敛到静态资源页已验证的形态。

## What Changes

- 四张已有「部分失败」提示条（`.lp-notice`）的卡片页（四层代理 / DNS-UDP / 插件组 / 全局规则）：泛化文案升级为「N 个节点分发失败（首个节点 + 原因）」，新增「重发失败节点」主动作（打开发布确认弹窗并预选失败节点），保留「查看差异」次动作
- 两张缺失页（DNS-HTTP / 插件元数据）：补齐同款「部分失败」提示条（文案 + 重发 + 查看差异），与其他卡片页同构
- 失败节点集合取自**已有的发布差异预览接口**的逐节点状态（落后 / 不可达 / 缺失节点），不新增任何后端持久化（方案 A，用户裁决 2026-11-19）
- 「重发失败节点」点按 → 拉取该资源预览取失败节点集合 → 经 IP→节点 id 映射 → 打开共享 `PublishConfirmModal`（`preselectedNodeIds` 预选，仅在线节点）
- 静态资源卡片页保持现状不动：它有真正的持久化 failed_nodes（zip 分发语义），文案取库不取预览，比方案 A 更精确
- 列表页（路由 / 上游 / 节点 / SSL）不涉及：走表格行 + PublishDiffButton 既有形态

## Capabilities

### New Capabilities

- `partial-publish-recovery`: 卡片页「部分发布失败」提示与一键重发——失败节点集合经发布差异预览取得（落后/不可达/缺失 = 失败集合），notice 文案给出节点与原因，「重发失败节点」直接预选失败节点进入发布确认

### Modified Capabilities

（无——六张卡片页的既有发布状态规格（stream-proxy-publish-status 等）描述的是状态判定与徽标，不涉及提示条动作；本变更为新增共享能力，不改既有需求的场景集）

## Impact

- 改动文件：6 张卡片页视图 + 1 个共享取数/映射函数（新建）+ `PublishConfirmModal`（零改动，仅消费既有 `preselectedNodeIds`）
- 后端零改动（复用 `GET /clusters/{id}/publish-preview/{type}/{id}`）；预览接口为只读幂等
- 风险点：预览响应的节点标识是 IP，需一次 IP→node id 映射（复用 `fetchAllClusterNodes`）；预览拉取失败时回退为现状泛化文案，不阻塞页面
- 设计稿与 demo：`docs/ui/Live-Artifact-5/proposal-c/republish-failed-nodes-demo.html`（用户已批准方向 A）
