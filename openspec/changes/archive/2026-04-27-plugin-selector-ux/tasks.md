## 1. Plugin Hover Tooltip

- [x] 1.1 在 `plugin-item` 外层包裹 `a-tooltip`
- [x] 1.2 设置 `:title="plugin.description"`, `placement="top"`, `:auto-adjust-overflow="true"`
- [x] 1.3 添加 CSS 确保 tooltip 在密集列表中不遮挡其他元素

## 2. Plugin Toggle Remove

- [x] 2.1 在 `.selected-item` 上增加 `@click="handleRemoveWithAnimation(index)"`
- [x] 2.2 在 `.drag-handle` 上增加 `@click.stop` 阻止冒泡
- [x] 2.3 修改 `handleRemove` 函数：添加 `removing` class，300ms 后再 splice
- [x] 2.4 添加 CSS `.selected-item.removing` 红色闪烁动画
- [x] 2.5 修改 `.selected-item:hover` 样式：红色边框 + 红色阴影

## 3. Testing

- [x] 3.1 手动测试 hover tooltip 显示完整描述
- [x] 3.2 手动测试点击移除 + 动画反馈
- [x] 3.3 手动测试拖拽排序不受影响（TwoColumnPlugin）
- [x] 3.4 手动测试删除图标操作正常