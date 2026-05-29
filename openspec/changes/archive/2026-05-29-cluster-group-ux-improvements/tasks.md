## 1. 分组字段改为必填

- [x] 1.1 `form.group_name` 初始值改为 `''`
- [x] 1.2 `showAddModal` 中显式重置 `group_name: ''`
- [x] 1.3 `editCluster` 中设置 `form.group_name = cluster.group_name || ''`
- [x] 1.4 Select 新增「未分类」选项（`value=""`），移除 `allow-clear`
- [x] 1.5 新建分组取消时设 `''` 而非 `undefined`

## 2. 内联新建分组

- [x] 2.1 Select 使用 `dropdownRender` 插槽嵌入输入框+添加按钮
- [x] 2.2 移除 `__new__` 的 `prompt()` 逻辑和 watch
- [x] 2.3 `pendingNewGroup` 确保新建分组立即出现在选项中

## 3. 未分组展开收起

- [x] 3.1 未分组标题行与命名分组一致的 toggle 逻辑
- [x] 3.2 内容区加 `v-if="expandedGroups['__ungrouped__'] !== false"`

## 4. 全部展开/收起

- [x] 4.1 `expandAll()` / `collapseAll()` 函数
- [x] 4.2 搜索栏右侧条件渲染按钮
