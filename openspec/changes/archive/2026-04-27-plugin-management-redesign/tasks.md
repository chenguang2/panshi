# 插件管理重构任务清单

## 1. 实现 PluginSelector 分类树 + 网格布局

- [x] 1.1 定义插件分类常量（CATEGORIES）
- [x] 1.2 实现分类树展开/收起状态管理
- [x] 1.3 实现分类树组件模板
- [x] 1.4 实现插件网格卡片布局
- [x] 1.5 实现搜索过滤功能
- [x] 1.6 实现已选插件列表
- [x] 1.7 实现添加/移除插件功能
- [x] 1.8 实现编辑插件事件

## 2. 重构 PluginEditorDrawer 通用 Schema 表单

- [x] 2.1 移除硬编码的 proxy-rewrite 字段
- [x] 2.2 实现 Schema 类型映射到表单控件
- [x] 2.3 实现 string/number/boolean/array 类型渲染
- [x] 2.4 实现 object 类型递归渲染
- [x] 2.5 实现表单/JSON 双模式切换
- [x] 2.6 实现表单 ←→ JSON 同步
- [x] 2.7 实现保存功能

## 3. 添加插件字段中文注释（description, examples, hints）

- [x] 3.1 更新后端 plugins.py - 为所有插件字段添加中文 description
- [x] 3.2 添加 examples 示例值
- [x] 3.3 添加 hints 配置提示
- [x] 3.4 更新前端 PluginEditorDrawer.vue - 渲染字段帮助信息

## 4. 调整 ClusterList.vue

- [x] 4.1 引入新的 PluginSelector 组件
- [x] 4.2 调整插件管理 Tab 布局

## 5. 测试验证

- [ ] 5.1 分类展开/收起正常
- [ ] 5.2 插件搜索过滤正常
- [ ] 5.3 插件选择/移除正常
- [ ] 5.4 插件编辑抽屉正常打开
- [ ] 5.5 表单模式配置保存正常
- [ ] 5.6 JSON 模式配置保存正常
- [ ] 5.7 表单/JSON 切换同步正常
- [ ] 5.8 字段中文注释正常显示
- [ ] 5.9 字段示例值正常显示
- [ ] 5.10 字段配置提示正常显示
