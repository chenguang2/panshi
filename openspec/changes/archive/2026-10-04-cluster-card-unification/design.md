# Design: cluster-card-unification

## 方案档位（用户拍板 C）

- A 字段对齐（治标）——不选：CSS 仍两份，漂移源还在
- B A + CSS 单点——不选：模板仍是三份
- **C 共享 ClusterCard.vue（选定）**——与 useClusterUtils #7/#11、useClusterResourceCore #24 的单实现治理哲学一致；三份拷贝正是历次演化漂移的根因

## 组件契约

- props：`cluster`（集群对象）+ `routeBadge`（`{label, cls} | null`）——徽章由**页面计算传入**，组件保持无请求纯展示；CentralList 用 watchEffect 惰性拉取 relay 状态（features 未加载短路）
- slots：`topbar`/`actions`/`footer`——页面差异经 slot 注入，不进组件
- 样式：`.cl-card*` 族唯一收敛点，页面不得重新内联

## 副标题语义（用户拍板：回退式二显）

`description` 优先；无 description 且存在 `display_name` 时回退「集群标识: {name}」；均无则不显示。两页走同一规则。

## CSS 漂移取舍

topbar/stats 面板/字号取 CentralList 较新版；desc line-clamp 取 ClusterList；节点圆点统一全局 `status-dot`。逐对截图对照（#98 精神）。

## 统计格行为变化

统一管理从 6 格 @click 最大化改为 7 格 router-link——主 spec `cluster-stat-links` 本就要求 7 链接（含静态资源），旧实现是落后于 spec；最大化入口保留在 topbar 按钮，无功能净损失。

## ID 尾注删除评估

用户工作流用名字（areatest/kjc）不用数字 id；「#2」是自解释失败的悬空数字且全 UI 唯一 id 露出面。删除 + 标题 tooltip 保底（hover 即得，平时零视觉噪音）。
