# Proxy-Rewrite Headers 瀑布流编辑器 - 任务清单

## 1. 单字段行内布局（通用）

- [x] 1.1 修改字段渲染模板，采用行内布局
- [x] 1.2 字段名大字体醒目显示
- [x] 1.3 描述文字次要显示
- [x] 1.4 示例值突出显示（背景色）
- [x] 1.5 提示信息带图标显示

## 2. 修改 PluginEditorDrawer.vue 手风琴渲染

- [x] 2.1 检测 object 类型字段中是否包含 `set`/`add`/`remove` 子属性
- [x] 2.2 若是 headers 字段，渲染为手风琴布局而非普通嵌套表单
- [x] 2.3 实现 AccordionHeader 组件：展开/折叠箭头 + 标题 + 数量徽章
- [x] 2.4 实现 AccordionContent 组件：Key-Value 行列表 + 添加按钮

## 3. 实现 Headers 数据管理

- [x] 3.1 定义 headersData 响应式数据结构
- [x] 3.2 实现 addRow() 函数（支持 set/add/remove）
- [x] 3.3 实现 removeRow() 函数（支持 set/add/remove）
- [x] 3.4 实现 serializeHeaders() 序列化函数
- [x] 3.5 实现 deserializeHeaders() 反序列化函数

## 4. 实现 Remove Section 特殊布局

- [x] 4.1 Remove Section 仅显示 Key 列，无 Value 列
- [x] 4.2 Remove Section 使用不同的边框颜色（红色）

## 5. 数据同步

- [x] 5.1 抽屉打开时，正确解析 headers JSON 为手风琴数据
- [x] 5.2 切换到 JSON 模式时，正确序列化手风琴数据为 headers JSON
- [x] 5.3 保存时，确保 headers 数据正确保存

## 6. 样式和交互

- [x] 6.1 单字段行内布局样式（字段名、描述、示例、提示）
- [x] 6.2 Accordion 容器样式（背景、边框、圆角）
- [x] 6.3 AccordionHeader 样式（左侧彩色边框、hover 效果）
- [x] 6.4 Key-Value 行样式（flex 布局、删除按钮）
- [x] 6.5 展开/折叠动画效果

## 7. 集成测试

- [ ] 7.1 测试单字段行内布局显示
- [ ] 7.2 测试 Set Section：添加/编辑/删除 Header
- [ ] 7.3 测试 Add Section：添加/编辑/删除 Header
- [ ] 7.4 测试 Remove Section：添加/删除 Header Key
- [ ] 7.5 测试展开/折叠状态持久化
- [ ] 7.6 测试表单 ↔ JSON 模式切换数据同步