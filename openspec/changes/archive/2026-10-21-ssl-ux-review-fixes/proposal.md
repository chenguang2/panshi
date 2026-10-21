# Proposal: ssl-ux-review-fixes

## Why

SSL 证书模块 UX 评审（@designer 实机走查 + 主代理逐条代码核验：21 项结论 21/21 证实，报告见 `docs/refactoring/ssl-ux-review-2026-10-20.md`）。核心缺陷：**P0「生成弹窗开屏误报」**（未选集群即红色「该集群没有 CA 根证书」）；6 项 P1（查看抽屉缺有效期/算法、编辑已发布证书后仍显示「已发布」的静默漂移、协议/类型技术原值直出、创建契约 body cluster_id 必填但无效且 422 不可读、上传证书零反馈、私钥保护双标——CA 重兵把守而 server 私钥随列表全量下发）；10 项 P2 打散（到期格式带时分、双徽章冗余、下载弹窗国密概念误用于 RSA、CA 卡字段语义错位、生成成功后 Tab 不归位、CA 校验前端双标、client 卡残留版本管理入口、空态无清除筛选出口、API 路径泄漏到报错文案、SNI 粘贴行为不一致）。另发现 1 处 spec 与代码分歧（`ca_cert_id`「RSA/ECC 忽略」已与代码「全算法强制」相悖，随批 1 修正）。

## What Changes

按执行顺序两个批次：

**批 1（前端为主 + 三处后端小改：400 文案、pending_publish 字段、schema description，低风险）**

1. **生成弹窗 CA 提示与校验一致**（P0-1/P2-6/P2-9a）：未选集群显示灰色「请先选择集群…」而非红色报错（`v-else-if` 加 `form.cluster_id` 前置）；`canGenerate` 去算法豁免、全算法统一「未选 CA 即禁用+指引」（对齐后端既有强制）；400 文案去 API 路径；CA 列表**加载失败**显示「加载失败 + 重试」第三态（不再误报「没有 CA」）
2. **发布状态四态接线**（P1-2/P2-2）：两个 SSL 列表端点 + 详情端点经 `edge_sync.derive_pending_publish` 单点补 `pending_publish` 字段（routes/upstreams 同款，禁止前端时间戳自行推导）；`SslList` 卡片传 `:pending` 接入 `PublishStatusTag`「配置已修改，发布后生效」；去掉「● 已发布」双徽章冗余；编辑已发布证书保存 toast 改「已更新（平台侧），重新发布后 Edge 生效」
3. **查看抽屉补关键属性**（P1-1）：SSL 视图加「有效期」（仅日期 + 复用到期徽章语义；解析失败降级「—（无法解析）」）与「算法」行；CA 视图补有效期、「状态」行语义修正（改「类型」或签发计数）
4. **技术原值中文化**（P1-3/P2-4）：新增共享 `certTypeLabel` 映射（server→服务端/client→客户端，SslList/SslViewDrawer/SslFormDrawer 共用）；协议 JSON 数组渲染为 `TLSv1.2 / TLSv1.3`；CA 卡隐藏「SNI/类型」行改显示「CN」；查看抽屉 SNI 标签化
5. **表单反馈**（P1-5a/P2-10/P1-4a）：选择文件后显示「已读取 {文件名}」；SNI 输入复用 `splitSniTags` 支持逗号/粘贴拆分（与生成弹窗一致）；提交失败 message 对 422 detail 数组逐条拼接（「保存失败：{原因}」，替换裸「操作失败」）
6. **P2 收敛批次**：有效期改 `formatDateOnly`、过期徽章「已过期 N 天」（P2-1）；下载弹窗非国密显示「证书/私钥」、国密保留加密/签名前缀 + 底部敏感数据提示行（P2-3）；生成成功后若在 CA Tab 自动切回全部证书（P2-5）；client 卡隐藏「版本管理」（P2-7）；激活筛选时空态「未找到匹配的证书」+「清除筛选」（P2-8）；打开生成/添加弹窗预选当前集群筛选（IA）；CA Tab 空态主语、编辑抽屉集群禁用 hint、SNI 提示统一、mTLS 隐藏灰字、schema description 修正为 EMBRACE/EDGE（P2-9b）
7. **删除确认 Edge 后果对称**（共享 `useClusterUtils` 可选文案）：勾选 Edge 节点后显示「将从所选节点移除该证书，使用它的 HTTPS 域名将无法建立 TLS 连接」

**批 2（涉后端契约/接口行为，先设计后动手——设计已落 design.md D4-D7）**

8. **创建契约修正**（P1-4b）：`SslCertificateCreate.cluster_id` 改 Optional（URL path 为归属唯一事实源），body 与 URL 不一致时报 422 指明字段
9. **私钥保护对齐**（P1-6，接口行为变更）：列表/详情响应私钥统一掩码（泛化 + **同盖国密 `sign_key`**）；响应加 `has_private_key`/`has_sign_key` 布尔，下载弹窗/查看抽屉改按布尔判定私钥有无；**单一**按需端点 `GET /clusters/{id}/ssl/{cert_id}/key`（全证书类型生效、国密返回双私钥、前端确认弹窗 + 审计留痕），`/ca-key` 迁移调用方后删除；编辑抽屉私钥留空=不修改（前端省略空值 + 后端仅对 `private_key` 跳过 `None/""` 双防 + 逐字节回归）
10. **PEM 即时预览**（P1-5b）：新增 `POST /clusters/{id}/ssl/preview`（分字段响应：`cert`/`key` 各带解析状态与详情，`key_match` 仅双解析成功时返回），前端文件选择或粘贴后展示预览行，把「贴错 PEM/不配对」拦在提交前
11. **生成弹窗信息架构重排**（纯前端）：签发 → 主体 → 覆盖范围（有效期旁即时显示推算到期日）→「高级选项」默认折叠（mTLS、同时生成客户端证书移出主流程）

## Impact

- **Specs**: `ssl-certificate-management`（MODIFIED 列表展示：四态/到期格式/中文枚举/CA 卡/空态；上传表单：文件回显/SNI 拆分/错误可读/编辑提示；生成对话框：提示门控/CA 必选一致/成功归位/预选集群；ADDED 查看抽屉关键属性、私钥按需获取与掩码）、`ssl-certificate-generation`（MODIFIED 生成端点参数：ca_cert_id 全算法必填 + 400 文案）、`card-certificate-download`（MODIFIED 文件选择对话框：中文命名/敏感提示）
- **Code**: 前端 `SslList.vue`、`SslViewDrawer.vue`、`SslFormDrawer.vue`、`SslGenerateDialog.vue`、`SslCertDownloadDialog.vue`、新增 `utils/sslLabel.ts`；后端 `cluster_ssl.py`（pending_publish、400 文案、统一 key 按需端点（替代 `/ca-key`）、preview）、`ssl.py` 全局列表（pending_publish）、`schemas/ssl.py`（cluster_id Optional、description、has_* 字段）、`composables/useClusterUtils.ts`（删除弹窗可选文案，共享改动回归各域）
- **风险**: 批 2 组 9 触及写路径（PUT 跳过 None）与响应契约（掩码）→ 合入前跑 PG 方言冒烟（#31）；掩码为破坏性响应变更，前后端同仓同发无版本碎片，但需回归「下载 ZIP」「查看👁」「编辑回填」三条私钥消费链；`useClusterUtils` 删除弹窗为跨域共享，改动用可选文案向后兼容并回归各域删除用例（#51④）
- **Out of scope**: 健康度统计 chips 过滤链、卡片操作「⋯」分层、CA 归属可视化、按到期日排序、按权限隐藏动作（待角色矩阵澄清后另立项）、partial 发布态接线（SSL 侧数据源不足）、审计「查看/下载私钥」事件细分（依赖 9 落地后评估）
