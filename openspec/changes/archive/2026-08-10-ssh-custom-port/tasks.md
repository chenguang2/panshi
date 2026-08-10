## 1. 后端数据模型与迁移（TDD）

- [x] 1.1 测试：`Node` ORM 模型含 `ssh_port` 列（可空）
- [x] 1.2 测试：`NodeBase`/`NodeCreate`/`NodeUpdate`/`NodeResponse` schema 含 `ssh_port: Optional[int]`（ge=1, le=65535）
- [x] 1.3 实现：模型 + schema 加 `ssh_port`；迁移 SQL（`ALTER TABLE ps_node ADD COLUMN ssh_port INTEGER`）

## 2. 直连 SSH 命令端口注入（TDD）

- [x] 2.1 测试：`_build_ssh_cmd(ip, user, cmd, port=1122)` 含 `-p 1122`；`port=None`/`22` 时不注入
- [x] 2.2 测试：`_build_ssh_cmd(..., password=..., port=1122)`（sshpass 路径）同样注入
- [x] 2.3 实现：`_build_ssh_cmd` 加 port 参数；`_run_ssh_with_fallback` 透传
- [x] 2.4 测试：`_ssh_run(ip, cmd, port=1122)` 透传端口（改签名加 port 参数）

## 3. 端口解析 helper（TDD）

- [x] 3.1 测试：`get_ssh_port(ip)` 从 inventory host 级 `ansible_port` 读取；无则 group vars；均无返回 None
- [x] 3.2 测试：`resolve_ssh_port(node)` 优先 node.ssh_port → `get_ssh_port(ip)` → 22
- [x] 3.3 实现：`get_ssh_port` + `resolve_ssh_port`（不缓存，每次读文件）

## 4. 直连调用点透传（TDD）

- [x] 4.1 测试：`_install_openresty_stream` 构造的免密/密码 ssh 命令含 `-p <node.ssh_port>`
- [x] 4.2 测试：`_ssh_run`（取消安装）调用方传入 `resolve_ssh_port(node)`
- [x] 4.3 测试：`node_task_service` 软件查询/命令执行透传端口
- [x] 4.4 实现：cluster_install.py（安装/取消）与 node_task_service.py 改用 `resolve_ssh_port`

## 5. Ansible 路径动态注入 inventory（TDD）

- [x] 5.1 测试：`run_playbook(ip, tag, ssh_port=1122)` 执行前更新 inventory 该主机 `ansible_port: 1122`，执行后恢复原值
- [x] 5.2 测试：`ssh_port=None` 且 inventory 无 `ansible_port` 时不修改 inventory
- [x] 5.3 测试：并发注入有文件锁（threading.Lock）；注入/恢复失败记录日志不阻断
- [x] 5.4 实现：`run_playbook` 加可选 `ssh_port` 参数 + inventory 临时注入/恢复（文件锁 + 每次重读）

## 6. 前端配置（TDD）

- [x] 6.1 测试：`useClusterNodes` `nodeForm` 含 `ssh_port`（默认 22）、编辑回填、提交 payload
- [x] 6.2 实现：节点编辑弹窗 SSH 端口输入 + 列配置（ClusterNodes.vue + NodeList.vue + api/nodes.ts）

## 7. 回归验证

- [x] 7.1 后端 pytest：SSH 相关测试全绿（含默认端口零变化断言）
- [x] 7.2 前端 vitest + vue-tsc + build 通过
- [x] 7.3 手动链路：配置 ssh_port=1122 节点 → 安装 OpenResty 日志显示 `-p 1122`；ansible 操作日志显示 ansible_port 注入；未配置节点命令无 `-p`
