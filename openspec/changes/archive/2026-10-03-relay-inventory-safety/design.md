# Design: relay-inventory-safety

## Context

- ansible 对同一主机出现在多个组时会**合并**各组的主机变量；清单文件中同 IP 多块时，行级凭据注入若只覆盖首个块，未注入块的 `ansible_user` 变量会在合并中胜出——sshd-setup 需要写 `/etc/ssh/sshd_config`，以 jboss 身份连接必然失败（实测 `/etc/ssh/sshd_config not readable`，socket 取证实锤身份错位）。
- ansible 对空匹配（主机组不存在/为空）以 rc=0 退出——「no hosts matched」假成功是 AGENTS 约定 #21② 的已知陷阱，判定前必须扫描输出标记。
- `kjc` 的 `http_base_url` 带前导空格入库，URL 拼接后 nginx 探测静默失败——脏值必须在入口拦截。

## Decisions

- **D1 多块感知注入**：`_host_blocks` 返回该 IP 的**全部** `(起始行, 块结束)` 区间；注入倒序改写（块内插入会使后续行位移，先改后面的块可保持前面块的索引有效）；备份结构与块升序一一对应。
- **D2 块内锚定还原**：还原在当前清单的该 IP 各块内定位注入行（尾部配对 + 倒序还原：块内删除只影响尾部已处理块的位移）；清单在注入后被手工增删块时，多出的块不动（未注入）、缺失的块跳过（无从还原），且 SHALL NOT 触及该 IP 主机块以外的任何行——替换旧「全文件扫首个 `ansible_user` 行」的实现，消除 root 凭据残留隐患。
- **D3 解析收敛单一实现**：`relay_push.gateway_hosts` 为清单解析唯一入口，`relay_sshd` 委派之；init 前置校验、push 前置校验、列表漂移标记同源，避免多份解析漂移（`inventory_path` 参数化以便测试互不串扰）。
- **D4 防呆三层**：① 前置组存在校验在 SSE 流开始前以 HTTP 503 返回（错误可被前端 toast 呈现），文案附可照抄 YAML 片段（`ssh_jump` 解析出账号/地址时预填）；② 流内 `fail_on_empty_hosts`（opt-in，仅 relay init/push 启用）扫输出标记改判 failed；③ 列表 `inventory_group_missing` 让漂移在发起前就可见，与 ①② 形成「事前可见 → 发起拦截 → 流内兜底」链。
- **D5 strip 在 schema 校验器层**：`RelayGatewayCreate`/`RelayGatewayUpdate` 的 `field_validator` 对三个路径字段去首尾空白、空串归 None——入口单点拦截，服务层与存储层无需重复防御。

## Risks / Trade-offs

- 多块注入对「块边界」的判定依赖缩进启发式（与既有 `_host_block` 同一算法的多块扩展）；畸形清单（缩进不一致）仍按逐块缩进解析，最坏退化为注入失败并返回 False（不写半截）。
- `fail_on_empty_hosts` 仅 opt-in 给 relay init/push，不全局开启——其他空匹配合法的 playbook 场景（如显式 limit 单机）不受影响。
