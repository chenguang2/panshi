## Context

Ansible 主机清单页面（`/ansible/inventory`）读取 `backend/ansible/inventory/host` 文件并解析为结构化数据。生产环境（kylin 服务器）中该文件由运维手工维护，编辑器常留下行尾制表符。PyYAML 严格拒绝行尾制表符（`found character '\t' that cannot start any token`），导致 `parse_inventory` 返回 `_fail()`（空 hosts），而 GET 接口不返回 `errors` 字段，前端静默空白。

现状链路：`_read_raw_text()` 读文件（缺失返回 `""`）→ `parse_inventory(raw)` 解析 → GET 返回 `raw_text/hosts/vars/unknown_keys/unmanaged_ips`（无 `errors`）。

## Goals / Non-Goals

**Goals:**
- 解析容忍行尾制表符（运维编辑器常见残留），不再因单个字符导致整个文件不可用
- 解析失败时前端展示真实错误（含行号），不再静默空白
- 文件不存在（全新部署）时保持原有空结构行为，不误报错误

**Non-Goals:**
- 不修改文件原文（`raw_text` 仍返回原始内容，源码视图保真）
- 不引入 YAML 结构校验的放宽（结构错误仍按原规则报错）
- 不处理其他 YAML 语法错误类型（仅针对行尾空白这一实际故障模式）

## Decisions

### 决策 1：解析前剥离行尾空白（`line.rstrip()`）而非仅制表符

- **选择**：`raw_text = "\n".join(line.rstrip() for line in raw_text.split("\n"))`
- **理由**：实测 PyYAML 对 `\t`、` \t`、`\t `、`\t \t` 等任意行尾制表符组合均拒绝；`rstrip("\t")` 无法处理 `\t `（制表符后跟空格）等混合场景。`rstrip()` 剥离全部行尾空白，覆盖所有组合
- **备选**：`rstrip("\t")` — 无法处理混合空白，放弃
- **安全性**：行尾空白对 YAML 无语义；引号内制表符不在行尾不受影响；不增删行故行号不变；`raw_text` 原文在 GET 层独立返回，不受影响

### 决策 2：GET 区分"文件不存在"与"解析失败"

- **选择**：`_read_raw_text()` 改为返回 `(text, exists)` 元组；`get_inventory` 中文件不存在时强制 `parsed["errors"] = []`
- **理由**：`parse_inventory("")` 对空串返回结构错误（`hosts 必须是映射`）。全新部署无文件时若透出该错误，前端会误报"清单文件解析失败"，破坏原有空状态 UX
- **备选**：直接透出结构错误 — 全新部署误报，放弃

### 决策 3：前端解析失败强制源码视图

- **选择**：`load()` 检测到 `errors` 非空时 `viewMode = 'source'`
- **理由**：文件解析失败时表格为空，若用户切到源码视图，`switchTo('source')` 会用空表格渲染出空骨架**覆盖** `sourceDraft` 中的真实文件内容。强制源码视图让用户直接看到并修复真实文件
- **备选**：仅展示错误条不强制切视图 — 用户切源码时仍会丢失原文，放弃

## Risks / Trade-offs

- [块标量（`|`/`>`）内容行尾空白被剥离] → inventory 文件不使用块标量，影响可忽略；且剥离仅发生在解析层，不写回文件
- [`errors` 字段为新增响应字段，旧前端不识别] → 旧前端忽略未知字段，无破坏；新前端依赖该字段，需前后端同步部署
- [强制源码视图改变默认交互] → 仅发生在文件解析失败时（异常态），正常态仍默认表格视图

## Migration Plan

1. 后端 + 前端同步部署（product 包重新生成）
2. 无需数据迁移；inventory 文件无需清理（修复后制表符自动容忍）
3. 回滚：还原代码即可，无持久化副作用

## Open Questions

无