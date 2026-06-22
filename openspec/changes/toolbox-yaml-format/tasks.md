## 1. 工具函数实现

- [x] 1.1 创建 `frontend/src/utils/tools/yaml.ts`，实现 `format(input)` 导出函数
  - 使用已有的 `yaml` 库（`import { parse, stringify } from 'yaml'`），无需安装新依赖
  - 空输入或仅空白输入时返回 `"请输入 YAML 内容"`
  - 有效 YAML：`parse()` 解析 → `stringify(doc, { indent: 2, sortMapEntries: true })` 序列化
  - 解析异常时返回 `YAML 解析失败: ${具体错误消息}`
  - 正确处理纯标量输入（数字、布尔值、null 等）

## 2. 工具箱 UI 集成

- [x] 2.1 在 `frontend/src/views/Tools.vue` 中添加 YAML 格式化工具：
  - 导入 `SnippetsOutlined` 图标和 `@/utils/tools/yaml` 工具函数
  - 在 `tools` 数组中添加 `{ key: 'yaml', label: 'YAML 格式化', icon: SnippetsOutlined }`
  - 添加 `yamlInput` 和 `yamlOutput` 响应式变量
  - 添加 `v-if="activeTool === 'yaml'"` 面板（布局：输入 textarea → "格式化 ↓" 按钮 → readonly 输出 textarea）
  - 输出 textarea 设置 `readonly` 属性
  - 在面板标题或按钮附近添加注释丢失提示（如小号提示文字 "格式化工具有序 key 但会丢弃 YAML 注释"）

## 3. 单元测试

- [x] 3.1 创建 `frontend/src/utils/tools/yaml.test.ts`，覆盖：
  - 有效 YAML 格式化（含嵌套结构、列表、混合类型）
  - 空输入处理
  - 仅空白输入处理
  - 无效 YAML 报错（语法错误、制表符缩进等）
  - 纯标量输入（数字、布尔值、null）
