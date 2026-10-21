# SSL 证书模块 UX 评审报告（2026-10-20）

- **评审对象**：`/ssl` 全局证书页（`frontend/src/views/SslList.vue`）+ 6 个弹层组件 + 后端 `cluster_ssl.py` / `schemas/ssl.py`
- **方法**：@designer 实机走查（Playwright 截图 9 张，1600×900，test 集群造数）+ 逐条代码核验
- **核验结论**：21/21 条全部证实，零收回；另发现 1 处 spec 与代码分歧（见附注 A）
- **基线**：commit 25e026e3（2026-10-04 ux-review-fixes M1-M9）之后版本；到期徽章、发布时间回填、CA 私钥掩码等已落地项不复报
- **产出**：openspec 变更 `openspec/changes/ssl-ux-review-fixes/`（批 1 前端为主 / 批 2 含后端契约）

## 一、问题清单（21 项，全部核验证实）

### P0（失真）

| # | 现象 | 证据 | 判定 |
|---|---|---|---|
| P0-1 | 生成证书弹窗一打开即显示红色「该集群没有 CA 根证书，请先创建 CA」——此时尚未选择集群，陈述未经证实的事实 | `SslGenerateDialog.vue:77-80` 条件缺 `form.cluster_id` 前置；`loadCaCerts()` 未选集群时清空列表恰好命中；截图 05 实证 | ✅ 证实 |

### P1（明显摩擦）

| # | 现象 | 证据 | 判定 |
|---|---|---|---|
| P1-1 | 查看抽屉无「有效期」「算法」——详情信息量低于列表卡（数据 `expire_at/expire_days/algorithm` 响应里现成） | `SslViewDrawer.vue:65-82`（SSL 视图）、`:13-28`（CA 视图）；截图 06 实证 | ✅ 证实 |
| P1-2 | 编辑已发布证书保存后卡片仍「已发布」——平台与 Edge 配置漂移被掩盖 | 更新端点不产生新版本（`cluster_ssl.py:241-250`）；`SslList.vue:83-84` 只传 `version/published-at`，`PublishStatusTag` 的 `pending` 能力未接线；全站已有单点推导 `edge_sync.derive_pending_publish`（routes/upstreams/plugin 系已接） | ✅ 证实 |
| P1-3 | 技术原值直出：协议 `["TLSv1.2","TLSv1.3"]`、类型裸 `server` | `SslList.vue:128`、`:103`；`SslViewDrawer.vue:67-70`；截图 01/06 实证；中文释义在 `SslFormDrawer.vue:95-103` 已有但未共享 | ✅ 证实 |
| P1-4 | POST `/clusters/{id}/ssl` body 强制 `cluster_id` 却被 URL 覆盖（必填但无效），422 不指明字段 | `schemas/ssl.py:22`；`cluster_ssl.py:241-243` model_dump 后覆盖；实测 422「Field required」复现 | ✅ 证实 |
| P1-5 | 证书/私钥上传为原生 file input，选完零反馈 | `SslFormDrawer.vue:139-146/175-182`；`onCertFileChange:599-607` 静默读入；截图 04 实证 | ✅ 证实 |
| P1-6 | 私钥保护双标：CA 私钥掩码+高风险确认下载，server 私钥随列表接口全量下发、查看一键明文、编辑抽屉回填明文 | `schemas/ssl.py:128-133` 仅掩 is_ca；`SslViewDrawer.vue:39-60`（CA 确认）vs `:125-139`（server 直出）；`SslFormDrawer.vue:543-544` 回填 | ✅ 证实 |

### P2（打磨项）

| # | 现象 | 证据 | 判定 |
|---|---|---|---|
| P2-1 | 有效期带时分（`formatDateTime as formatDate` 别名混乱，`format.ts:23-41` 实为 dash+HH:mm）；「已过期」徽章丢天数 | `SslList.vue:226`、`:311-314`；截图 07「2027-07-30 15:49」实证 | ✅ 证实 |
| P2-2 | 已发布卡片双徽章冗余（「● 已发布」+ vX 时间戳） | `SslList.vue:77-85`；截图 07 uapm2 实证 | ✅ 证实 |
| P2-3 | 下载弹窗对 RSA 证书显示「加密证书/加密私钥」（国密概念误用）；无敏感提示 | `SslCertDownloadDialog.vue:47-50` 固定文案；截图 07 实证 | ✅ 证实 |
| P2-4 | CA 卡显示「SNI=CN 值」「类型 server」语义错位（后端 CA 创建 `sni=cn, cert_type="server"`） | `cluster_ssl.py:127,130`；截图 02 实证 | ✅ 证实 |
| P2-5 | CA Tab 下生成成功后新证书「凭空消失」（生成的是 server 证书，CA Tab 过滤 `is_ca`；`onCaCreateSuccess` 有切 Tab、`onGenerateSuccess` 没有） | `SslList.vue:334,377-393` | ✅ 证实 |
| P2-6 | CA 必选校验双标：`canGenerate` 仅 SM2 禁按钮，RSA/ECC 可点、点了才 toast；后端实际全算法要求 CA（`cluster_ssl.py:513-529`） | `SslGenerateDialog.vue:430-437,461-464` | ✅ 证实（扩展见附注 A） |
| P2-7 | client 证书卡片保留「版本管理」入口，但 client 永不发布、版本列表恒空 | `SslList.vue:160-162` 仅排 `is_ca`；发布 `:154` 已排 client；后端 `cluster_ssl.py:341-342` 拒绝 | ✅ 证实 |
| P2-8 | 搜索/分组/集群三过滤叠加后空态仍「暂无 SSL 证书」，无「清除筛选」出口 | `SslList.vue:42-45` | ✅ 证实 |
| P2-9 | 开发者文案泄漏：400 报错含 API 路径；schema description「默认 CUN/BB」与实际默认 EMBRACE/EDGE 不符（UI 占位是对的） | `cluster_ssl.py:528`；`schemas/ssl.py:172-173` vs `cert_generator.py`（org="EMBRACE"/ou="EDGE" 五处）；截图 04/05 占位实证 | ✅ 证实 |
| P2-10 | SNI 标签输入双标：生成弹窗支持逗号拆分（`splitSniTags`），表单抽屉整标签入栈 | `SslGenerateDialog.vue` vs `SslFormDrawer.vue:412-421` | ✅ 证实 |

## 二、附注 A：核验中的额外发现（spec 与代码分歧）

`openspec/specs/ssl-certificate-generation/spec.md`「生成端点参数」写 `ca_cert_id`（**SM2 时必填，RSA/ECC 忽略**），但后端 `cluster_ssl.py:513-529` 现状是**全算法强制要求 CA**（`ca_cert_id is None` 即 400）。P2-6 的前端双标正是这段历史演进的残留（前端 `canGenerate` 匹配旧 spec，后端已演进）。本轮变更同步修正 spec 文本；前端对齐后端。

## 三、信息架构 / 布局 / 交互 / 状态建议（摘要，细节见 proposal/design）

1. **健康度过滤链**：卡片已产出「未发布/临期/已过期」三类高价值状态，筛选行只有搜索/分组/集群——建议加可点击统计 chips（`未发布 2 · 30 天内到期 1 · 已过期 1`），「哪些证书快到期」不再靠肉眼扫全网格。
2. **卡片操作分层**：单卡 7 动作全平铺、删除红色与常规并排；建议一级保留 查看/发布/编辑，下载/版本管理收「⋯」，删除右置。
3. **CA 归属可视化**：`ca_cert_id` 数据已有，证书卡显示「签发 CA」，CA 删除预警前置。
4. **生成弹窗字段重排**：签发（算法/集群/CA）→ 主体（名称/CN/组织）→ 覆盖范围（SAN/有效期 + 到期日即时预览）→「高级选项」默认折叠（mTLS、同时生成客户端证书）——mTLS 不再打断主线。
5. **表单抽屉三区**：基本信息 / 证书内容（上传-粘贴 Tab 化）/ 高级；编辑态顶部加当前版本+到期日摘要行。
6. **查看抽屉动作**：footer 只有「关闭」，补「编辑」「发布」省一次往返。
7. **状态体系**：四态发布标签接线（未发布/待发布/已发布/部分失败——SSL 侧本次接 pending 三态，partial 数据源不足不接）；有效期解析失败（国密双证 `expire_at=None`）降级显示「—（无法解析）」而非整行隐藏；私钥👁 留痕。
8. **删除后果对称**：勾选 Edge 后缺对应后果行（未勾选时已有「Edge 将继续运行该证书」提示，`useClusterUtils.ts:150-151`），补「将从所选节点移除该证书…」。

## 四、待补充项（不阻塞批 1，批 2 设计前澄清）

1. **角色权限矩阵**：`/ssl` 挂 `ssl_cert`、cluster 级操作挂 `clusters`——持 `ssl_cert` 无 `clusters` 的用户会看到按钮但操作 403；需确认实际非 admin 角色再决定按权限隐藏动作。
2. **私钥随列表下发的合规预期**（P1-6）：是否存在离线工具依赖列表接口取私钥的既有用法。
3. **国密双证有效期解析失败比例**（`derive_expiry` 降级频率），决定「—（无法解析）」态的出现频率是否可接受。
4. `BUNDLED_OPENSSL_FIX` 常量内容是否为运维可执行指引（本轮未触发该路径）。
5. VersionManagementModal 对从未发布证书的空态文案（未实测）。
6. `{name}-client` 客户端证书的发放对象与导入指引是否需要界面内说明。

## 五、评审造数与截图

- 造数（test 集群，id 4）：`review-临时20天`（id 14）/`review-正常365天`（id 15）/`review-已过期100天`（id 16）/`review-测试CA`（id 13）——实施完成后清理归零
- 截图：`/tmp/opencode/ssl-review/01-09*.png`（列表/CA Tab/CA 创建/添加抽屉/生成弹窗/查看/下载/发布确认/删除确认）
- 截图脚本：`/tmp/opencode/ssl-shots.mjs`（Playwright 直连 12345，admin 登录）
