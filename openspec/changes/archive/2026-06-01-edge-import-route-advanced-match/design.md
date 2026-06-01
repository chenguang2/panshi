## Context

Edge 数据导入路由时，`convert_route()` 方法仅提取基础字段（uri、methods、hosts、priority、upstream_id、plugins），未处理 APISIX route 中的高级匹配字段 `vars`、`remote_addrs`。Route ORM 模型和前端表单已支持这些字段，但导入管道未覆盖。

涉及文件：
- `backend/app/services/edge_import_service.py` — import 转换与预览
- `backend/app/schemas/edge_import.py` — preview 响应模型

## Goals / Non-Goals

**Goals:**
- 导入路由时正确映射 `vars`（高级匹配表达式）、`remote_addrs`（客户端 IP 匹配）、`advanced_match_enabled`（启用标志）
- 预览界面展示 `vars` 和 `remote_addrs`
- 向后兼容：现有导入数据不受影响

**Non-Goals:**
- 不改变发布（route → Edge）方向的数据转换逻辑（`edge_client.py` 已支持 `vars_json`）
- 不改动前端 UI 展示逻辑

## Decisions

| 决策 | 选择 | 理由 |
|---|---|---|
| `advanced_match_enabled` 取值 | 当 `vars` 非空列表时设为 1，否则为 0 | 与前端表单行为一致（编辑时根据 vars 长度自动判定） |
| `vars` 格式 | 直接存入 JSON 字符串（`json.dumps`） | Route 模型 `vars` 字段为 `Text` 类型，存入 JSON 字符串；读取时由 `RouteResponse` schema 的 `convert_vars` validator 自动解析 |
| `remote_addrs` 格式 | APISIX 返回 list → join 为逗号分隔字符串 | 与 `hosts`、`methods` 处理方式一致，Route 模型 `remote_addrs` 为 `String(500)` |

## Risks / Trade-offs

- [兼容性] 已有导入记录不包含这些字段，属正常行为（导入时 missing 字段默认为 NULL/0）
- [APISIX 差异] 如果 Edge 返回的 `vars` 格式与预期不符（如非标准三元组），`json.dumps` 仍能存入，前端展示时不会崩溃（由 `convert_vars` validator 容错）
