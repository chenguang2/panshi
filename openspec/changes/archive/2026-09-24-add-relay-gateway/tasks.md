## 1. 数据模型与区域注册表

- [x] 1.1 新增 `relay_gateways` 模型（code/name/http_base_url/ssh_jump/status）与 `Cluster.region_code` 列（SQLite/PG 双方言）
- [x] 1.2 TDD RED：建表与字段断言测试（`isolated_session` 直连验证列存在），验证失败
- [x] 1.3 最小实现建表，GREEN；补充 `TEST_DB_BACKEND=pg` 冒烟用例（新表 + region_code 写读 round-trip，防 TEXT/类型方言坑）
- [x] 1.4 区域 CRUD service + 端点（`require_permission` 门控；code 唯一/格式 `^[a-z][a-z0-9-]{1,31}$` 校验、创建后不可改、删除挂接约束；启停切换）
- [x] 1.5 `tests/test_security_guard.py` UNAUTHENTICATED_SAMPLES 补新端点采样
- [x] 1.6 审计：新 mutating 端点接入 `ROUTE_MAP`（或确认词汇推断覆盖），启动无 `validate_route_map` 告警

## 2. 寻址核心（总开关默认关，存量行为不变）

- [x] 2.1 TDD RED：总开关关闭时 `_build_ssh_cmd` 不含 `-J`、`EdgeClient` URL 为现状直连、inventory 不含 `ansible_ssh_common_args`——先验证失败
- [x] 2.2 区域路由解析函数：node → cluster.region_code → relay_gateways（含 enabled 判断、路由为空=直连、区域不存在回退直连+告警日志）；实现为进程内注册快照（TTL+CRUD 失效，同步零 IO 读取）
- [x] 2.3 `resolve_relay_jump(ip)` 实现（快照解析；同 ip 多节点区域不一致 → 歧义回退直连+告警）
- [x] 2.4 GREEN：总开关关闭回归测试通过
- [x] 2.5 `EdgeClient` 网关模式：`edge_url` 指向区域 `http_base_url` + 请求头 `X-Edge-Target: {ip}:{management_port}`；SM4/KEY 端到端不变；网关 403 映射为白名单下发提示；TDD 用例覆盖开/关两态与 403 映射
- [x] 2.6 `_build_ssh_cmd` 加 `-J`（跳板 + 专用密钥），前端命令回显与实际一致；TDD 用例覆盖跳板/直连两态
- [x] 2.7 ansible 运行期注入：`_inventory_inject_relay`/`_inventory_restore_relay`（镜像 `_inventory_inject_port` 先例）+ `run_playbook` 注入/finally 恢复；TDD 用例覆盖注入/恢复 round-trip、`ansible_ssh_pass` 原样保留（红线 #10）、跨区域批量不注入
- [x] 2.8 （档 1）`_run_ssh_with_fallback` 连接类失败立即重试一次；TDD 用例覆盖重试成功按成功处理、关闭时无额外重试
- [x] 2.9 禁用/未生效路由的直连失败错误信息附加"中继已禁用"提示；TDD 用例覆盖 HTTP/SSH 两腿

## 3. 设置页前端（区域管理）

- [x] 3.1 区域管理块：列表/新增/编辑/启停/删除（删除前校验无集群挂接），文案中文内联（红线 #9）
- [x] 3.2 区域连通性测试按钮（调区域测试端点，分段结果展示）
- [x] 3.3 集群表单新增区域选择（`region_code`），默认"直连"
- [x] 3.4 `npx vue-tsc -b` 通过 + 新增交互的 vitest 组件测试（URL 感知 mock，红线 #43）

## 4. 网关配置下发

- [x] 4.1 TDD RED：渲染器按区域产出 nginx map / sshd PermitOpen，仅含本局节点——先验证失败
- [x] 4.2 渲染器实现并 GREEN（白名单仅由节点表投影，map/PermitOpen 端口字段与节点管理端口/SSH 端口对应）
- [x] 4.3 fleet 推送 playbook（独立 `inventory/gateways/` 清单按局分组，不混入 edge_cluster）：该局全部网关机双写，逐台 `nginx -t`/`sshd -t` + reload，全部成功才算成功；单机失败标记该局失败并告警，支持幂等重跑整局
- [x] 4.4 下发动作端点（权限门控 + 审计）与下发结果回报
- [x] 4.5 TDD 用例：节点换 IP 后重渲染反映新值；漂移场景（节点不在白名单）由体检显式暴露（与 5.x 联动用例）

## 5. 链路体检

- [x] 5.1 三段探测实现：段 1 网关 HTTP 腿（TCP+TLS 握手判定，不依赖 HTTP 响应码）、段 2 跳板 22、段 3 抽样节点两腿经中继路径探活（管理腿经网关 HTTP + X-Edge-Target；SSH 腿经跳板 ssh -W stdio 转发，免节点凭据）；段级独立成败与耗时，段级超时 10s、单区域总预算 60s
- [x] 5.2 `?region=` 单区域与全量巡检（区域间互不阻塞）；抽样策略：超上限时每集群一台
- [x] 5.3 端点 `GET /api/v1/relay/health-check`（只读语义、权限门控、security_guard 采样；GET 规避迁移期写锁 #32）
- [x] 5.4 TDD 用例：三段全绿 / 段 2 失败级联段 3 失败、失败段可定位 / 单区域与全量两种返回形态

## 6. 验证与收尾

- [x] 6.1 全量 `cd backend && uv run pytest`（全局隔离库，红线 #30）0 failed
- [x] 6.2 `TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q` 全绿（新表用例并入，红线 #31）
- [x] 6.3 前端 `npx vue-tsc -b` + `npx vitest run` 通过
- [ ] 6.4 灰度验证清单核对（阻塞：待 D1 基础设施就绪——网关机/防火墙/VIP；到货后按设计文档 D3 三腿验证执行）（对照设计文档 D3：HTTP 腿发布路由 / 裸 SSH 自启动 / Ansible 脚本任务 + SSE 日志三腿各验一集群）
- [x] 6.5 `openspec validate add-relay-gateway` 通过，任务逐项打勾，更新 `docs/design/relay-gateway.md` 实施进度（如需）

## 7. 路径可见性补齐与缺陷修复（2026-09-24）

- [x] 7.1 Edge 直连 8 个查询端点经 `mark_route` 携带 route/relay_via；数据导入 service/schema/三端点同款（失败响应也带）
- [x] 7.2 自启动 SSE 首事件附 route/relay_via（SSH 腿语义，直连不含 relay_via）；`useInstallStream` 增 `onMeta` 一次性接收
- [x] 7.3 三页面展示「（经中继）/（直连）」：已连接行 / 连接成功提示行 / 抽屉标题
- [x] 7.4 `ssh_relay_note`（与 `-J` 注入同源、含自跳守卫）：cmd_exec 脚本模式、software_check 降级、install_openresty 第二阶段日志标注
- [x] 7.5 software_check 降级文案按实际路由（经中继/直连），修正硬编码「直连」的误导
- [x] 7.6 software_check/cmd_exec/distribute_file 透传展示用 command（含 `# [中继]` 标记）到 `item.command`，前端命令 tab 恢复可见
- [x] 7.7 edge-pack-list 同名版本去重（current 取并集，`_parse_pack_versions`）+ 响应附 route/relay_via；目标版本标签旁显示标注
- [x] 7.8 修复目标版本下拉误用集群节点表首节点（网关机）：改查第一个勾选节点
- [x] 7.9 回归：pytest（test_cluster_install 26、节点任务+中继域 236）、vitest（NodeTaskCenter 29 等）、vue-tsc 全绿
