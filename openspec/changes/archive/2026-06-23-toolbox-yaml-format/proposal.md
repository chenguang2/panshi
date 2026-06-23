## Why

工具箱目前支持 Lua 互转、URL 编解码、JSON 格式化、SM4 加解密、Base64 编解码等工具，但缺乏 YAML 格式化能力。YAML 是网关配置（如 Edge 网关）的常用格式，运维人员在调试和编写配置时频繁需要格式化/验证 YAML 内容。添加 YAML 格式化工具可以提升日常运维效率。

## What Changes

- 无需新增依赖（`yaml` v2.9.0 已作为传递依赖存在于 `node_modules` 中）
- 新增 `frontend/src/utils/tools/yaml.ts` — YAML 格式化工具函数
- 在 `frontend/src/views/Tools.vue` 工具箱中新增 "YAML 格式化" 工具项，支持：
  - YAML → 格式化输出（2 空格缩进，保留原始 key 顺序）
  - 输入校验与中文错误提示
  - 空输入/仅空白输入时显示友好提示
  - 输出 textarea 设为 readonly
  - 界面提示"格式化会丢弃 YAML 注释"
- 新增 `frontend/src/utils/tools/yaml.test.ts` — YAML 工具函数单元测试

## Capabilities

### New Capabilities
- `yaml-formatter`: YAML 格式化工具，支持将 YAML 文本格式化为整齐缩进输出，集成在工具箱页面中

### Modified Capabilities

无

## Impact

- 无需新增前端依赖（`yaml` 已在 `node_modules` 中）
- 新增一个工具文件 `yaml.ts`，部分遵循现有 `json.ts` 的模式
- 在 `Tools.vue` 中新增一个工具项和对应的面板 `v-if` 块
- 不需要修改路由、侧边栏、布局等文件
