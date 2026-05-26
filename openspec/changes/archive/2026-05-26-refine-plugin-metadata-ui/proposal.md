## Why

插件元数据的可用插件列表样式简陋，名称和介绍挤在一行，且无边距和分类，与插件选择器的风格不一致。

## What Changes

- 左侧可用插件改为树形分类结构（同 PluginSelector）
- 每个插件显示为卡片，名称和介绍分两行
- 卡片左侧带分类色条，树线连接
- 添加按钮改为 primary 样式，hover 放大
- 布局改为 4:6 比例（左40% 右60%）
- 字体大小统一为 14px

## Impact

- `frontend/src/components/PluginMetadata.vue` — 模板、脚本、CSS 全面更新
