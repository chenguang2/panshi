## Context

- 现有实现（inventory_service.py）：`_CRED_KEYS = ("ansible_ssh_user", "ansible_ssh_pass")` 用于 unknown_keys 判定；parse/render 已全保真（未知键保存不丢）；表格视图仅渲染 IP + 两个凭据输入框。
- 前端 AnsibleInventory.vue：a-table 行内编辑；unknown_keys 有"含自定义字段"标签提示。

## Goals / Non-Goals

**Goals:** 常用连接变量表格化编辑；字段级校验；unknown_keys 判定收窄到真正冷门的键。

**Non-Goals:** 不做多分组/嵌套/ranges；不改 parse/render 全保真逻辑；不做 host_vars/group_vars 目录管理。

## Decisions

### D1. 已知键清单

`KNOWN_HOST_KEYS = ("ip", "ansible_ssh_user", "ansible_ssh_pass", "ansible_port", "ansible_host", "ansible_connection", "ansible_python_interpreter", "ansible_become", "ansible_become_user", "ansible_become_pass", "ansible_ssh_private_key_file", "ansible_ssh_common_args")`

- `unknown_keys` 只收录清单外的键；已知键不再触发"含自定义字段"标签
- 清单是唯一事实来源，前后端各自维护一份常量（后端用于 unknown 判定，前端用于高级设置表单渲染）

### D2. 字段校验与类型规范化（服务端 PUT 时执行，评审确认"宽容+规范化"）

- `ansible_port`：接受 int 或纯数字字符串，**规范化为 int**；范围 1-65535，越界 400
- `ansible_become`：接受布尔或 yes/no/true/false 字符串（大小写不敏感），**规范化为布尔**
- `ansible_connection`：**不做枚举强校验**（ansible 连接插件远不止常用 6 种）；前端下拉提供 smart/ssh/paramiko_ssh/local/docker/podman 常用项并允许自定义输入
- 其余：自由文本；空字符串视为删除该键（不写入 YAML）

### D3. 表格交互

- 主行保持简洁：IP / SSH 用户 / SSH 密码 / 自定义字段标记
- 行展开（a-table expandedRowRender）呈现"高级设置"表单；有高级字段值的行显示展开图标高亮
- 保存载荷结构不变（hosts 数组带全字段），后端按 D2 校验

## Risks / Trade-offs

- become_pass 明文展示与 ssh_pass 同策略（管理员限定，已确认接受）
- 键清单前后端双份维护——以本设计文档为准绳，漂移风险低
