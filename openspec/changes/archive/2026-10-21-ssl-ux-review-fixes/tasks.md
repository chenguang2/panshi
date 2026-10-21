# Tasks: ssl-ux-review-fixes

> 批 1 = 组 1-7（前端为主 + 三处后端小改），批 2 = 组 8-12（含后端契约/写路径，PG 冒烟强制）。
> 报告：`docs/refactoring/ssl-ux-review-2026-10-20.md`；设计：同变更目录 design.md（D1-D7）。

## 1. 批1·生成弹窗 CA 提示与校验一致（P0-1 / P2-6 / P2-9a）

- [x] 1.1 RED：`SslGenerateDialog` 组件测试——未选集群打开弹窗 SHALL 显示灰色「请先选择集群，将列出该集群可用的 CA 根证书」且 SHALL NOT 出现红色「该集群没有 CA 根证书」（当前开屏即红，必红）→ GREEN：`:77-80` 条件前置 `form.cluster_id &&`，新增灰色 hint 分支（设计 D2）
- [x] 1.2 RED：已选集群且该集群确无 CA 时 SHALL 显示红色提示且文案不含 API 路径 → GREEN：后端 `cluster_ssl.py:528` detail 去 `(POST /clusters/{id}/ssl/ca)` 改「请先在「CA 根证书」页签创建」；前端同文案
- [x] 1.3 RED：RSA/ECC 未选 CA 时「生成并保存」SHALL disabled 且带指引 title（当前可点击、点了才 toast，必红）→ GREEN：`canGenerate` 去算法豁免；删除 `validate` 死路径 toast（`:461-464`）
- [x] 1.4 spec 同步：`ssl-certificate-generation`「生成端点参数」`ca_cert_id` 描述改「所有算法必填」（附注 A 分歧修正，随 1.3 提交）
- [x] 1.5 RED：CA 列表加载失败（mock reject）SHALL 显示「CA 根证书列表加载失败」+ 重试按钮，SHALL NOT 显示「没有 CA」红字 → GREEN：`caCertsError` 状态 + 模板失败分支（评审问题 8）

## 2. 批1·发布状态四态接线（P1-2 / P2-2）

- [x] 2.1 RED：后端测试——编辑已发布证书后列表/详情响应 `pending_publish` SHALL 为 true，发布后回 false，未发布恒 false；推导 SHALL 经 `edge_sync.derive_pending_publish` 单点（当前字段缺失必红）→ GREEN：`SslCertificateResponse` 加 `pending_publish=False`；cluster_ssl 列表/详情 + 全局 ssl 列表三处在 publish-map 回填处接线（设计 D1）；断言钉住前提（评审问题 5）：真实编辑→true、空保存（无列变更）→false 不变、恢复版本→true（依赖 `updated_at onupdate`，被改即红）
- [x] 2.2 RED：`SslList` 卡片——编辑后徽章 SHALL 为「配置已修改，发布后生效」（当前恒「已发布」，必红）→ GREEN：`:83-84` 传 `:pending="cert.pending_publish"`
- [x] 2.3 RED：已发布卡片 SHALL NOT 同时渲染「● 已发布」徽章与 `PublishStatusTag`（双徽章冗余）→ GREEN：`:77-85` 去独立徽章
- [x] 2.4 RED：编辑已发布证书保存 toast SHALL 为「已更新（平台侧），重新发布后 Edge 生效」→ GREEN（`SslFormDrawer.vue:672`；未发布证书保持「已更新」）
- [x] 2.5 回归：`PublishStatusTag` 既有各域用例不回归；`pytest -k "ssl"` 全绿

## 3. 批1·查看抽屉关键属性（P1-1）

- [x] 3.1 RED：SSL 视图 descriptions SHALL 含「有效期」（`formatDateOnly` + 到期徽章语义）与「算法」行；`expire_at=null` SHALL 显示「—（无法解析）」而非整行隐藏（当前缺失必红）→ GREEN（`SslViewDrawer.vue:65-82`）
- [x] 3.2 RED：CA 视图 SHALL 含「有效期」行；「状态：CA 根证书」行 SHALL 改「类型：CA 根证书」→ GREEN（`:13-28`）

## 4. 批1·技术原值中文化（P1-3 / P2-4）

- [x] 4.1 RED：`certTypeLabel` 工具单测（server→服务端/client→客户端/未知回退原值）→ GREEN：新增 `frontend/src/utils/sslLabel.ts`，SslList/SslViewDrawer/SslFormDrawer 三处共用（勿复制映射）
- [x] 4.2 RED：卡片/查看抽屉「协议」SHALL 渲染 `TLSv1.2 / TLSv1.3` 形态（无引号方括号；非法 JSON 原样回退）→ GREEN（`SslList.vue:128`、`SslViewDrawer.vue:69`）
- [x] 4.3 RED：CA 卡片 SHALL 隐藏「SNI/类型」行、显示「CN」行 → GREEN（`SslList.vue` 卡片模板）
- [x] 4.4 RED：查看抽屉 SNI SHALL 标签化（复用卡片 `splitSniString`）、类型 SHALL 中文 → GREEN

## 5. 批1·表单反馈（P1-5a / P2-10 / P1-4a）

- [x] 5.1 RED：选择文件后 SHALL 显示「已读取 {文件名}」并可一键切粘贴模式查看内容（当前零反馈，必红）→ GREEN：`onCertFileChange/onKeyFileChange`（`:599+`）记录文件名 + 提示行
- [x] 5.2 RED：SNI 输入粘贴 `a.com,b.com` SHALL 拆为两标签（当前整标签入栈，必红）→ GREEN：`addSniTag`（`:412-421`）复用生成弹窗 `splitSniTags`；两处提示统一「Enter 或逗号添加，支持粘贴多个」
- [x] 5.3 RED：提交失败 message SHALL 为「保存失败：{原因}」，422 detail 数组逐条拼接（当前数组直出/裸「操作失败」，必红）→ GREEN：`SslFormDrawer.vue:679`（生成/CA 弹窗已有防御，仅表单抽屉补）

## 6. 批1·P2 收敛

- [x] 6.1 RED：卡片有效期 SHALL 仅日期（`formatDateOnly`）；过期徽章 SHALL「已过期 N 天」→ GREEN：`:226` 别名修正（`formatDateTime as formatDate` 误用清理）、`:311-314`；`grep 'as formatDate' SslList.vue` 归零
- [x] 6.2 RED：下载弹窗非国密 SHALL 显示「证书 (cert.pem)/私钥 (key.pem)」、国密保留加密/签名前缀；底部 SHALL 有「ZIP 内含私钥，属敏感数据，请妥善保管」灰字 → GREEN（`SslCertDownloadDialog.vue:47-50`）
- [x] 6.3 RED：CA Tab 下生成成功 SHALL 自动切回「全部证书」→ GREEN：`onGenerateSuccess`（`:377-388`）补 `activeTab` 处理（对齐 `onCaCreateSuccess` 反向）
- [x] 6.4 RED：client 证书卡片 SHALL 隐藏「版本管理」→ GREEN：`:160-162` 条件补 `cert_type !== 'client'`
- [x] 6.5 RED：激活筛选（搜索/分组/集群任一）时空态 SHALL「未找到匹配的证书」+「清除筛选」按钮（点击重置三过滤）→ GREEN（`:42-45`）
- [x] 6.6 RED：`clusterFilter` 非空时打开生成/添加弹窗 SHALL 预选该集群 → GREEN（`openGenerateDialog` / SslFormDrawer open 初值）
- [x] 6.7 文案批：CA Tab 空态「当前范围还没有 CA 根证书」；编辑抽屉集群禁用补 hint「证书归属集群创建后不可更改」；mTLS 隐藏处灰字「双向认证仅支持国密 SM2 证书」；`schemas/ssl.py:172-173` description CUN/BB → EMBRACE/EDGE
- [x] 6.8 RED：删除确认弹窗勾选「Edge 节点」后 SHALL 显示后果行（SSL 传「将从所选节点移除该证书，使用它的 HTTPS 域名将无法建立 TLS 连接」；其它域 DOM 无此行）→ GREEN：`useClusterUtils` 删除弹窗加可选 `edgeConsequenceHint`（设计 D6，跨域共享——回归各域删除用例，#51④）

## 7. 批1·回归与实页验收

- [x] 7.1 前端三连：触碰文件 `npx vitest run --no-file-parallelism` → `npx vue-tsc -b` → 全量 `npx vitest run --maxWorkers=4`（#58）
- [x] 7.2 后端：`cd backend && uv run pytest -k "ssl" -q` 全绿
- [x] 7.3 实页验收（test 集群，`review-*` 造数在位，#222）：生成弹窗开屏灰提示（P0-1）、四态闭环（编辑已发布→待发布→发布→已发布）、查看抽屉有效期/算法、下载弹窗中文命名+敏感行、CA 卡 CN 行、空态清除筛选、client 卡无版本管理；截图落真实页面（#51②；已核集群详情页无第二套 SSL 渲染，仅 /ssl 一处）
- [x] 7.4 验收造数清理归零（review-* 4 张，DELETE 带 body #60）+ 临时脚本删除

## 8. 批2·创建契约修正（P1-4b，设计 D3）

- [x] 8.1 RED：POST `/clusters/{id}/ssl` body 不带 cluster_id SHALL 201；body 与 URL 不一致 SHALL 422 detail 指明「cluster_id 与 URL 中的集群不一致」（当前缺省必 422 Field required，必红）→ GREEN：`SslCertificateCreate.cluster_id` Optional + **端点层**一致性校验（Pydantic validator 看不到 URL path param，评审问题 4；PUT 的 Update schema 无 cluster_id 字段，无需处理）
- [x] 8.2 **PG 方言冒烟**（#31：创建写路径触及）：`TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q`

## 9. 批2·私钥保护对齐（P1-6，设计 D4，接口行为变更）

- [x] 9.1 RED：列表/详情响应 `private_key` 与 `sign_key` SHALL 均为空串（掩码无条件 + 盖国密签名私钥，当前 server 全量下发、GM sign_key 明文=旁路，必红）→ GREEN：掩码泛化；响应加 `has_private_key`/`has_sign_key` 布尔（评审问题 2/3）
- [x] 9.2 RED：`GET /clusters/{id}/ssl/{cert_id}/key` 单一按需端点——**全证书类型生效（含 CA）**、国密返回加密+签名双私钥、`log_audit` 记「下载/查看私钥」、不存在 404（当前端点缺失必红）→ GREEN：新建统一端点；`/ca-key` 调用方（CA 查看抽屉 + 相关测试）迁移后**删除旧端点**（#18 单实现，评审问题 6）
- [x] 9.3 前端私钥消费链迁移：下载弹窗/查看抽屉的私钥选项与👁 **改按 `has_private_key`/`has_sign_key` 布尔判定**（掩码后字段内容恒空，真值判定=私钥选项静默消失；mock 用掩码后真实响应形状，#43）；私钥获取改按需端点（复用高风险确认弹窗形态）；编辑抽屉不回填明文、placeholder「已保存，留空表示不修改」
- [x] 9.4 RED：① PUT `private_key` 为 None 或空串 SHALL 跳过更新（**仅此字段**，勿全字段一刀切——`client_ca` 手动清空 textarea 依赖发空串生效）；② **逐字节回归**：编辑不碰私钥保存后，库中私钥与改前一致（数据损坏级防护，评审问题 1）→ GREEN：前端 payload 省略空私钥 + 后端 setattr 循环对 private_key 单独跳过 None/""（双防）
- [x] 9.5 回归：`pytest -k "ssl"` + PG 冒烟；实页走查私钥三链路（👁/ZIP/编辑）+ 审计记录可见

## 10. 批2·PEM 即时预览（P1-5b，设计 D5）

- [x] 10.1 RED：`POST /clusters/{id}/ssl/preview`——分字段响应 `cert: {ok, subject_cn, san[], not_after, algorithm, expire_days} | null` / `key: {ok} | null` / `key_match`（仅双 ok 时返回）；非法/缺失按字段 null 或 ok=false，不落库（当前端点缺失必红）→ GREEN：解析逻辑与 `derive_expiry` 抽公共函数（评审问题 9）
- [x] 10.2 RED：前端文件选择/粘贴（防抖）后 SHALL 显示预览行（CN/有效期/算法/配对结果；不配对红色警示）→ GREEN；表单抽屉「上传文件」体验闭环（与 5.1 衔接）

## 11. 批2·生成弹窗信息架构重排（设计 D7，纯前端）

- [x] 11.1 RED：字段顺序断言——签发（算法/集群/CA）→ 主体（名称/CN/O/OU）→ 覆盖范围（SAN/有效期+到期日即时预览）→ 高级选项默认折叠（mTLS/客户端证书不在首屏）→ GREEN：模板重排，mTLS 显示条件不变（SM2+server），spec 措辞=「区域可见、默认折叠、展开可达」（评审问题 10）
- [x] 11.2 `SslGenerateDialog` 既有用例全量回归（选择器随结构更新的断言同步）

## 12. 批2·回归与实页验收

- [x] 12.1 前端三连（同 7.1）+ 后端 `pytest -k "ssl"` + PG 冒烟复跑
- [x] 12.2 实页验收：契约（无 cluster_id 创建成功）、私钥全链路（掩码/按需/留空不改/审计）、PEM 预览（正常/不配对/非法）、生成弹窗重排版；截图落真实页面
- [x] 12.3 openspec 归档前核对：specs 合并按 #53 手工流，MODIFIED 全块取自主 spec 现文
