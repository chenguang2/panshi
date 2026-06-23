## Context

工具箱页面 (`frontend/src/views/Tools.vue`) 目前提供 5 种工具：Lua 互转、URL 编解码、JSON 格式化、SM4 加解密、Base64 编解码。每个工具遵循统一的双面板布局（输入/输出 textarea + 中间操作按钮）。新增工具只需在该组件中追加一个工具项和对应的面板。

YAML 是网关配置文件的常用格式，运维人员需要频繁格式化/验证 YAML 内容。`yaml` v2.9.0（Eemeli Aro）已作为 `json-editor-vue` 的传递依赖存在于 `node_modules/` 中。

## Goals / Non-Goals

**Goals:**
- 在工具箱中新增 "YAML 格式化" 工具项，入口图标位于左侧图标栏
   - 支持 YAML 字符串格式化为整齐缩进输出（2 空格缩进，保留原始 key 顺序）
- 输入无效 YAML、空输入、仅空白输入时给出合适的中文反馈
- 输出 textarea 设为 readonly，与 JSON 工具保持一致
- 界面提示用户"格式化会丢弃 YAML 注释"
- 遵循现有工具的双面板交互模式（左侧输入 → 格式化按钮 → 右侧结果）

**Non-Goals:**
- 不支持 YAML 压缩（YAML 没有标准单行紧凑形式，与 JSON 不同）
- 不改动工具箱页面布局、路由、侧边栏、功能开关等已有结构
- 不需要后端支持，纯前端功能
- 不作 YAML 转 JSON 或其他格式互转
- 不支持保留注释（YAML round-trip 固有限制）

## Decisions

1. **依赖选择：使用已有的 `yaml` 库**
   - `yaml` v2.9.0（Eemeli Aro）已存在于 `node_modules/`（`json-editor-vue` 的传递依赖）
   - 提供 `parse()` / `stringify()` API，支持 ESM 导入，Vite 兼容
   - 不需要安装 `js-yaml`，零新依赖
   - 替代方案 `js-yaml`：需要额外安装，且社区已逐渐迁移到 `yaml` 库

2. **仅支持格式化，不支持压缩**
   - JSON 压缩：去除空白后仍是合法 JSON（结构不变）
   - YAML 无标准紧凑形式：`stringify()` 即使设 `lineWidth: 0` 仍输出多行
   - `collectionStyle: 'flow'` 可产生 flow-style 输出（如 `{a: 1, b: 2}`），但这改变了 YAML 的表示风格，不是"压缩"
   - 结论：只保留格式化按钮，去掉压缩按钮

3. **空输入/仅空白输入时显示友好提示**
   - `yaml.parse('')` 返回 `null`（而非抛出异常），与 JSON 行为不同
   - 特殊判断：输入为空或仅空白时，输出显示"请输入 YAML 内容"

4. **输出 textarea 设为 readonly**
   - 与 JSON 工具输出 readonly 保持一致
   - 程序生成的结果不应直接编辑

5. **注释丢失为已知限制，UI 上提示用户**
   - `yaml.parse()` + `yaml.stringify()` 会丢弃所有注释
   - 在工具标题或操作区域附近添加提示文字

6. **工具函数：`format(input)` 单函数**
   - 使用 `yaml.parse()` 解析 → `yaml.stringify(doc, { indent: 2 })` 重新序列化
   - 保留 YAML 文档中 key 的原始顺序（不排序，因为 YAML 配置中上下顺序有意义）
   - 异常时返回 `YAML 解析失败: ${具体错误消息}`（与 JSON 的动态错误消息模式对齐）

7. **UI 图标：使用 `SnippetsOutlined`**
   - `@ant-design/icons-vue` 已有该图标，适合表示文件/代码格式

8. **无需修改 Sidebar/Router**
   - 工具箱已通过 feature flag 动态注册路由，新增工具不会影响这些基础设施

## Risks / Trade-offs

- 注释丢失：用户粘贴含注释的 YAML 配置（如 `equivalence_rules.yaml`）后，格式化输出将不保留注释。已在 UI 提示
- `yaml` 库默认不支持 YAML 1.2 的全部特性（如重复键检测、某些标签）。但工具箱场景为运维人员手动输入 YAML 片段，影响可控
- 超大 YAML 输入可能导致 textarea 性能问题，但现有工具均无大小限制，保持一致
