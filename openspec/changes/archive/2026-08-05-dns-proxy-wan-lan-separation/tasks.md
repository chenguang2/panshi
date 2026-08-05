## 1. 后端发布转换（TDD）

- [x] 1.1 新增/扩展 `backend/tests/test_dns_proxy_publish.py`：publish_dns_proxy 未启用 wan 时 plugins 仅含 dns_upstream（回归基线）
- [x] 1.2 新增测试：wan_enabled=true 时 plugins 含 dns_upstream-ww，hosts 复制内网配置 + export_nodes 按域名写入
- [x] 1.3 新增测试：export_nodes 值只填 IP 时，发布组装补上端口（从 key 提取）
- [x] 1.4 新增测试：wan_filter include/exclude 各生成一个条件（`["remote_addr","ip~",[ips]]` 与 `["remote_addr","!","ip~",[ips]]`），_meta.priority=2110
- [x] 1.5 新增测试：启用 wan 时存在无 export_nodes 的域名 → 发布拒绝并报错
- [x] 1.6 修改 `backend/app/services/dns_wan.py` build_dns_plugins：export_nodes 内联读取 + 端口拼接 + 校验；接入 publish_dns_proxy，运行测试 GREEN

## 2. 后端导入兼容（TDD）

- [x] 2.1 新增测试：edge 配置含 dns_upstream-ww 时 convert_stream_proxy 还原 wan_enabled + export_nodes 内联（去端口）
- [x] 2.2 新增测试：仅含 dns_upstream（无 ww）时 dns_config 无 wan_* 字段
- [x] 2.3 新增测试：dns_upstream-ww 的 hosts/nodes 不写入 dns_config.hosts 的 nodes
- [x] 2.4 新增测试：导入时 export_nodes key 不在 nodes 中 → 标记无效并在预览中提示
- [x] 2.5 修改 `backend/app/services/edge_import_service.py` convert_stream_proxy：export_nodes 内联还原（去端口）+ 校验，运行测试 GREEN

## 3. 前端页面重构（StreamProxyFormWizard）

- [x] 3.1 Step 1（端口选择页）新增「启用内外网分离」开关（DNS 代理时显示）
- [x] 3.2 Step 2 域名目标节点行新增「外网地址」列（仅开关开启时显示；只填 IP，端口复用）
- [x] 3.3 过滤区：包含/排除 tag 输入列表，IPv4/CIDR 校验（隔离时显示）
- [x] 3.4 前端校验：启用时每个域名至少一个节点填写外网地址；外网地址 IP 格式校验
- [x] 3.5 DNS 域名目标「客户端 CIDR」输入框默认隐藏（v-if），cidr 始终为空不写入 nodes
- [x] 3.6 `buildDnsConfig` 提交时组装 wan_enabled + 域名内联 export_nodes + wan_filter
- [x] 3.7 `parseDnsConfig`/编辑回填还原 wan_enabled、节点行外网地址、过滤列表
- [x] 3.8 `StreamProxyViewDrawer` 增加「内外网分离」状态徽标（wan_enabled 为 true 时显示）

## 4. 前端测试

- [x] 4.1 新增/扩展 StreamProxyFormWizard 单测：开关显隐外网地址列、提交组装 export_nodes
- [x] 4.2 校验测试：启用时无节点填写外网地址阻止保存；非法 IP 阻止保存
- [x] 4.3 编辑回填测试：已启用配置重新打开后开关/外网地址/过滤正确回显
- [x] 4.4 未启用配置提交不产生 wan_*/export_nodes 字段（兼容回归）
- [x] 4.5 详情徽标测试：wan_enabled=true/false 的展示

## 5. 验证

- [x] 5.1 后端全量 pytest（无新增失败）
- [x] 5.2 前端 vitest + `npm run build` 通过
- [x] 5.3 手动链路验证：创建 DNS 代理 → Step1 开启内外网 → 节点填外网地址 → 保存 → 发布（edge 配置含 dns_upstream-ww 且 export_nodes 带端口）→ 重新导入回读一致
- [x] 5.4 手动验证校验拦截：无外网地址域名 / 非法 IP 时的保存与发布报错
