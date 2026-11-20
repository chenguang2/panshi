# Proposal

## Why

统一管理页（CentralList）是集群域两大入口之一，但其网格态外壳仍是改版前形态：搜索/分组/状态三组旧下拉 + 「共 N 个集群」计数 + 旧分组头（组头内嵌集群名小条点击直达最大化）+ 无分组|平铺切换，与已收敛的 14 张卡片页及刚完成改版的集群管理页（dashboard-cluster-parity，本工作树已完成待提交）视觉断层。设计页 `docs/ui/Live-Artifact-5/proposal-c/central.html` 已由用户逐轮批准，给出完整基线：**单面板卡片网格态 + 最大化面板两态模型**，具备直接落地的全部条件。

## What Changes

- **网格态换壳（对齐 central.html 状态一 + #85–#88 卡片页标准）**：
  - 单一 `.l5-card` 面板包含 工具条 → 状态 chips 行 → 卡片网格（同本轮已修复的集群管理三页包含解剖）；
  - 工具条 = 共享 `TableToolbar`（SearchInput 150 + 分组 select 104 + spacer + 「全部收起/展开」单按钮 + 分组|平铺 seg，`show-count=false`——总数归 chips）；
  - 状态筛选 = `.l5-chiprow` 带计数 chips（全部 N / 已启用 N / 已禁用 N，替代旧状态下拉，#85①）；
  - 分组 = `useCardClusterGrouping` + `ClusterBand`（组级次要指标「节点 N · 路由 N」组内聚合；分组/未分组双分支模板收敛为 renderGroups 单循环）；
  - 平铺模式 = band 隐藏、卡片本体即集群身份（与集群管理一致）；
  - 页头补 ph-lite 徽标（`N 集群` accent / `M 节点`，补充维度 #86②——总数由 chips「全部 N」承担，页头不再重复）。
- **旧外壳退场**：`.cl-header-actions`（搜索/分组/状态 select + 共 N 个 + 全部展开·收起双按钮）、组头 `.group-head` + `.cluster-name-item` 集群名小条（设计 band 不含此快捷方式；最大化入口保留统计格 + 卡头「最大化」两处）、CaretDown/Right 旧折叠图标语言。
- **最大化面板收口（对齐 central.html 状态二，行为契约不变）**：两态模型明确化——统计格/卡头「最大化」= 立即最大化并直达对应 Tab（openStatTab 语义）；mini-bar 原地切换集群保留当前 Tab；✕ 收起返回网格；同屏单集群。解剖类对齐设计页（`max-panel` 挂集群色相、`max-name-row`）；**不可达中间态死代码退场**：`toggleExpand`（无模板消费点）、`expanded-mini-row` 非最大化分支、双态并存的 `.expanded-area` 循环简化为最大化面板直渲染。
- **功能面不动**：新建/编辑/删除/连接测试/漂移检测/备份下载/从备份导入、七 Tab（节点/上游/路由/插件组/插件元数据/全局规则/静态资源）资源 CRUD 与发布、发布成功回调局部刷新（#203 CLUSTER_RUNTIME_KEYS）、ClusterFormModal 保存 → loadClusters 刷新链路（`ClusterEditRefresh.source.test.ts` 已钉）全部保留。
- **测试**：`CentralList.test.ts` / `CentralList.statTab.test.ts` 断言反转（旧外壳 → 新结构，#217 断言反转清单先行）；`mockupParity.source.test.ts` 新增统一管理同构红线段。

## Capabilities

### New Capabilities

- `central-management-page`：统一管理页信息架构与交互契约——两态模型（卡片网格 ⇄ 最大化面板）、网格态与卡片页标准同构（工具条/状态 chips/分组 band/单面板包含）、最大化面板 Tab 语义（openStatTab 直达、mini-bar 切换保 Tab、收起返回）。

### Modified Capabilities

- `cluster-maximize-view`：「展开集群标题栏显示最大化按钮」需求按两态模型改写（中间展开态不可达且壳退场，入口 = 统计格/卡头直达）；其余七条（切换集群/隐藏分组/收回/刷新保持/子表按需加载等）行为不变、不进 delta。

## Impact

- 前端：`views/CentralList.vue`（网格态模板与分组状态管理重写，脚本态/CRUD/发布编排保留）；`style.css`（如需 max-panel/max-name-row 解剖类，单点）；共享组件零改动（ClusterCard/ClusterBand/TableToolbar/ClusterFormModal 现契约）。
- 测试：`CentralList.test.ts`、`CentralList.statTab.test.ts`、`mockupParity.source.test.ts` 新段；守卫回归 `ClusterEditRefresh.source.test.ts`、`CardPagePanelContainment.source.test.ts`（统一管理纳入包含断言——见 design D1）。
- 后端：零改动（ph-lite 徽标数据复用 /clusters 列表聚合，无新端点）。
- 设计页：`central.html` 为既有批准基线，无需修改。
