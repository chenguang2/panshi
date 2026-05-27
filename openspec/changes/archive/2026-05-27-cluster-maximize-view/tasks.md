## 1. State & Functions

- [x] 1.1 添加 `maximizedClusterId` ref、`maximizeCluster()`、`restoreMaximize()`、`switchMaximizedCluster()` 函数
- [x] 1.2 `maximizeCluster()` 中自动收起其他展开集群，只保留当前集群

## 2. Template: 最大化按钮

- [x] 2.1 展开集群标题栏（expand-row）的 click-zone 后添加"最大化"按钮（含 SVG 图标 + 文字）
- [x] 2.2 最大化状态下按钮切换为"还原"按钮
- [x] 2.3 最大化集群的 card-expanded 添加 `card-maximized` class

## 3. Template: 紧凑集群顶栏

- [x] 3.1 在 header-section 与 cluster-grid 之间添加 `.cluster-mini-bar` 区域
- [x] 3.2 每项显示状态点 + 集群名称，当前最大化项高亮
- [x] 3.3 紧凑栏右侧显示"退出最大化"按钮
- [x] 3.4 点击紧凑栏条目调用 `switchMaximizedCluster()` 切换

## 4. Template: 条件渲染

- [x] 4.1 最大化模式下隐藏 `cluster-grid`，显示 `cluster-mini-bar`
- [x] 4.2 最大化模式下 `expanded-area` 只渲染 `maximizedClusterId` 对应的集群
- [x] 4.3 最大化模式下 `expanded-area` 的 `expandedIds` 过滤保持不变（之前已清空）

## 5. CSS 样式

- [x] 5.1 `.cluster-mini-bar` 样式：水平 flex 布局、圆角背景、可横向滚动
- [x] 5.2 `.mini-item` 样式：紧凑条目（小号字号、间距紧凑）
- [x] 5.3 `.mini-item.active` 高亮样式
- [x] 5.4 `.maximize-btn` 按钮样式（与 click-zone 风格统一）
- [x] 5.5 `.restore-btn` 退出最大化按钮样式
- [x] 5.6 `.card-maximized` 全宽模式样式

## 6. 验证

- [x] 6.1 vue-tsc --noEmit 无错误
- [x] 6.2 最大化→切换→还原 流程逻辑正确
