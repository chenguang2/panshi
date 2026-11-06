# relay-gateway-management Specification

## Purpose
TBD - created by archiving change relay-gateway-inventory-ui. Update Purpose after archive.

## Requirements

### Requirement: 网关注册含 SSH 连接配置

网关注册 SHALL 支持 ssh_user（必填）、ssh_password（可选，空=密钥认证）、ssh_port（默认 22）、ansible_python_interpreter（可选）、ssh_common_args（可选）字段，随中继区域管理表单编辑。

#### Scenario: 表单字段校验

* WHEN ssh_password 为空且未配置密钥认证前提
* THEN 保存成功但该网关执行 ansible 时依赖平台默认身份（对齐 #29 跳板密钥为建议的既有语义）
