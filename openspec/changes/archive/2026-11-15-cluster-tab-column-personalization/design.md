# Design

## Context

- 列宽/列顺序能力已共享化：`composables/useColumnDragColumns.ts`（手势与 FLIP）+ `composables/useColumnConfig.ts`（按用户的显隐/宽度/顺序持久化），消费方为 `NodeList.vue`、`UpstreamList.vue`、`RouteList.vue` 三个独立列表页；三页表体解剖为 `class="node-table grid-table"` + `:scroll="{ x: 'max-content' }"` + `:table-layout="'fixed'"` + `#headerCell` 槽（wrap 类 + 右缘手柄）。
- 统一管理页 `views/CentralList.vue` 用 `v-for` 渲染 `expandedClusters`，每张展开卡片内嵌 `views/clusters/ClusterNodes|ClusterUpstreams|ClusterRoutes.vue`，三组件各自消费 `useColumnConfig('node'|'upstream'|'route')`，已有列显隐 popover 与操作按钮勾选，但表体只有 `class="node-table"`：无 `scroll`、无 `table-layout`、无 `#headerCell`，`columnWidths`/`columnOrder` 从未被消费。
- 共享 composable 的几何采集是**全文档作用域**（`document.querySelectorAll(\`${tableSelector} thead th, …\`)`，并以「表头文字 → 列键」建立矩形 Map）。单表页面安全；统一管理页同屏可同时展开多张卡片，页面上会存在多张同类表格，同一列键在 Map 中被后一张表覆盖，落点判定与 FLIP 会跨表串扰。
- 仓库约定：拖拽手势逻辑与竖线样式必须共享单点（关键约定 #44/#24 精神），不逐页复制；验收必须落在用户实际操作页面（关键约定 #51）；真机几何不能靠 jsdom 桩断言（关键约定 #43）。

## Goals / Non-Goals

**Goals:**

- 三张 Tab 子表获得与独立列表页同构的列个性化，且手势/样式零复制。
- 共享 composable 的几何作用域收紧为「被拖拽的那张表」，既有三页行为不变。
- 列重排与宽度覆盖的粘合逻辑对新消费方提供单一实现，避免第 4/5/6 份复制。

**Non-Goals:**

- 不合并 Tab 与独立列表页的列偏好存储键（两处各自独立，见 D4）。
- 不给 Tab 子表补 `#` 序号列、不引入 sticky 固定列（见 D5，后续另行立项）。
- 不改动列显隐 popover 的既有信息架构（仅追加「重置列宽」入口）。
- 不重构三个独立列表页接管新 helper（保持本次回归面收敛，见 D3）。

## Decisions

**D1 表体解剖对齐（fixed layout + scroll.x + 共享竖线）**：三张 Tab 子表补 `:scroll="{ x: 'max-content' }"`、`:table-layout="'fixed'"`、`class="node-table grid-table"` 与 `#headerCell` 槽。
理由：`table-layout: auto` 下表头宽度只是建议值，内容会撑开列宽，用户拖拽后表现为"拖了没用/回弹"；竖线（`.grid-table`）与手柄样式是既有共享单点，直接挂类即可，不新增样式族。
备选：只做列移动不引入 fixed layout（视觉零变更）——被否决，用户要的是"调整列宽"能力本身；自建 Tab 专属样式——被否决，破坏单点。

**D2 共享拖拽实现按元素作用域**：`startColumnMove` 以 `e.currentTarget.closest('.ant-table-wrapper')` 解析本次拖拽的表格根，矩形采集、FLIP、收尾清理全部限定在该根内；`tableSelector` 降级为「解析不到根时的兜底选择器」。
理由：这是 Tab 子表接入的前置条件——不改则多卡片并存时落点与动画跨表串扰（真实 bug，非理论风险）。对既有三页：指针起点本就位于该表内，`closest` 得到同一根，行为零变化。
备选：给每张表加唯一 id / 每实例一个选择器——被否决，需要把 cluster id 透传进 composable 参数并在多实例共享状态下维护，且旧调用方也要改；`closest` 是零参数方案。

**D3 列重排/宽度覆盖的共享 helper**：把「按存储顺序重排全量列（未知 key 剔除、新列补位）」+「按 `columnWidths` 覆盖列宽」抽为 `useColumnConfig.ts` 导出的纯函数，供三张 Tab 子表消费；独立列表页本期不改接（`NodeList` 已有等价内联实现且被 66 用例钉住）。
理由：新消费方 3 处若各自内联就是第 4/5/6 份复制；抽纯函数成本低、无行为风险。后续可让独立页改接，作为低优先级收尾。
备选：直接内联 3 份——被否决（#24 精神）；一次性重构全部 6 处——被否决，扩大本次回归面。

**D4 存储键保持隔离**：Tab 子表继续 `key: 'node' | 'upstream' | 'route'`，独立列表页 `*_standalone`。
理由：两处列集合与用途不同（独立页含 `#` 与「所属集群」列、Tab 页签更密），用户对"全站视图"和"集群内视图"的偏好诉求不同；合并会让一次调整在两处互相覆盖，且顺序序列需要跨集合合并，风险大于收益。语义上「同一偏好作用于同页多张同类表」= 多张展开卡片的子表列宽/顺序一致，这与"跨页共享"不同。

**D5 不补 `#` 序号列、不引入 sticky 固定列**：Tab 子表保持现有列集合（操作列也不固定）。
理由：固定列会覆盖其下内容的指针事件（关键约定 #37 记录的 antd 固有形态），与表头拖拽手势在同一水平带竞争；`#` 序号列属于全站表格解剖收敛（#59）范畴，需要单独定默认宽度档与固定选型，混入本次会放大视觉回归面。已记入 Open Questions 之外的后续项（design 的 Non-Goals 已列）。

**D6 默认列宽档**：为三张 Tab 子表的每一列补默认像素宽度（含当前无 `width` 的中间列），取值按内容形态定档（长文本列从宽、状态/标签列从窄），保证展开卡片常规宽度下核心列完整可见。
理由：`table-layout: fixed` 下无宽度的列按剩余空间均分，长内容列会被压到不可读；独立页的"默认列宽档"需求即为此。

**D7 不可移动列（fixedKeys）**：节点 `['ip', 'actions']`；上游 `['name', 'actions']`；路由 `['name', 'actions']`。
理由：身份列与操作列是扫描锚点，与独立页语义一致；其余列可自由移动。

**D8 「重置列宽」入口**：三张 Tab 子表的既有列配置 popover 内追加「重置列宽」按钮（位于列选择/操作按钮/搜索三组之后，分隔线分隔），行为 = 清空本 key 的 `widths` 并关闭 popover，提示文案与独立页一致。
理由：独立页已有该入口，缺它会让用户在 Tab 内"拖坏了没法复位"。

**D9 测试策略**：组件单测钉住「列顺序与宽度覆盖生效」「重置清空且不影响其它 key」「fixedKeys 不外露拖拽」「headerCell 槽已接入」；多表作用域以源码守卫 + 组件级断言（拖拽起点由表内元素解析）钉住；真机 Playwright 在统一管理页双形态（展开卡片 / 最大化）截图验收拖拽、持久化、Esc、重置。
理由：jsdom 无布局引擎，几何与落点不可靠（#43/#38）；而"多表串扰"恰恰是几何问题，必须真机验证。

## Risks / Trade-offs

- [Tab 表体解剖改变观感：竖线密度更紧、加宽后卡片内出现横向滚动条] → 真机双形态截图确认；滚动条只在用户加宽后出现（默认档总宽控制在卡片宽内）。
- [共享 composable 作用域收紧波及既有三页] → 既有页面用例（NodeList/UpstreamList/RouteList 组件测试）与 `useColumnDragColumns` 相关断言全跑；`closest` 在同表内解析到同一根，预期零差异。
- [路由/上游子表表头带 `sorter`，拖拽移动可能误触发排序] → 沿用既有「位移后抑制一次补发 click」机制（D4/首期已交付），Tab 侧补一条回归断言。
- [展开卡片带 TransitionGroup 动画，动画中拖拽可能取到中间态几何] → 拖拽起点的矩形在 `startColumnMove` 一次性冻结，动画中不重新采集；真机验收包含"卡片刚展开立即拖"的场景。
- [多张同类型 Tab 表共享同一偏好，用户可能预期"每张卡独立"] → 与"同一资源一个偏好"的直觉一致（独立列表页也是同一资源一处偏好），且规格已明写；不做按实例隔离（否则无法持久化）。
- [`.grid-table` 手柄与 antd `size="small"` 行高混排] → 真机确认手柄可见性与可点性（8px 宽、纵向延伸 8px）。

## Migration Plan

纯前端增量，无数据迁移。上线即生效；用户旧存储（`node`/`upstream`/`route` 键下已有 `columns`/`actions`/`searchVisible`）继续可用，`widths`/`order` 缺失按空档兼容。回滚 = 还原三组件表体 diff + composable 作用域 diff（共享层改动对既有页面无行为差异，可单独回滚）。
