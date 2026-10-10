# Design: upstream-ux-close-loop

## Context

评审基线 tag `pre-upstream-ux-v1.51.0`。发布/删除链路底座扎实（`useClusterUtils` 共享进度弹窗、双重确认、被引用守卫），断点集中在状态表达与引导层。关键事实：

- `rollback_resource`（`edge_sync.py` L58-98）仅 restore + `current_version` + commit，**无 EdgeClient 调用**——回滚后 Edge 仍跑旧配置。
- `Upstream.updated_at`（`models/cluster.py`，naive UTC + onupdate）与两列表端点的 `published_at`（publish-map 回查，`upstreams.py` L128 / `cluster_upstreams.py` L103）已具备「待发布」推导条件。
- `PublishStatusTag` 现有「v·未同步」分支要求「有版本但无 publishedAt」，而 published_at 取自 `max(ConfigVersion.created_at)`——该分支实际永不可达。
- `cluster-upstreams-component`/`cluster-upstreams-composable` 主 specs 已规定 targets 列与勾选同步单选，代码未达标（spec 领先于代码，非 spec 缺失）。

## Decisions

- **D1 「待发布」推导放后端、以时间对齐代替状态标记**：`pending_publish = current_version 非空 && published_at 可查 && updated_at > published_at`。发布成功时在 `create_config_version`（置 `current_version` + commit 的真单点，`publish_resource` 与 `cluster_edge_env` 的 edge.env 发布均经它）**同一事务内**以 `hasattr(entity, "updated_at")` 守卫显式对齐 `entity.updated_at = config_version.created_at`——StreamProxy/SslCertificate 无 updated_at 列，守卫自然跳过（已核实）；SQLAlchemy 显式赋值优先于 onupdate，不会被覆盖。编辑保存（onupdate）与版本恢复（rollback commit 刷新 updated_at）**自然**推导为真——回滚后即「待发布」，恰好是 D5 想要的引导，无需额外标记字段。
  - **published_at 缺失守卫（版本历史被删光）**：`VersionManagementModal` 可删除版本记录，删光后 current_version 非空而 publish-map 回查为 None——此时 pending MUST 为 False（显示「已发布 vX」无时间），比较 MUST NOT 对 None 执行（Python `updated_at > None` 会 TypeError）。删除的若是最新版本，published_at 回落为剩余最新版本时间，按一般规则推导即可，不特判。
  - 判定顺序：`未发布`（current_version 为空）→ `部分失败`（last_publish_status=='partial'，持续到下次发布动作）→ `待发布` → `已发布`。
  - 两个列表端点（`GET /upstreams`、`GET /clusters/{id}/upstreams`）经**共享 helper**（published_at 回查 + pending 推导 + last_publish_status 透传的单点）统一输出 `pending_publish`，前端不做本地推导（单一事实源，两视图必然一致、口径不漂移）。
- **D2 partial 持久化走模型列 + hasattr 能力探测**：`Upstream` 增 `last_publish_status`（nullable String(16)，仅记 `'partial'`；全部成功清 NULL）。`publish_resource` 以 `hasattr(resource, 'last_publish_status')` 探测写回——其他 7 类资源后续加同名列即可接入，不产生逐资源复制（约定 #18）。新列**必须**注册 `COLUMN_MIGRATIONS`（约定 #118，否则启动 crash-loop）并跑 PG 方言冒烟（约定 #31/#103）。版本记录在节点尝试之前创建（已核实），故**全部节点失败**的发布也会产生版本并落 partial——接受该语义（版本=配置快照，非部署凭证），标签文案用「发布未完全生效」同时覆盖部分/全部失败，不引入 'failed' 第五态（YAGNI）。
- **D3 回滚语义文案对齐真实行为（P0-3 核心）**：「切换到此版本」→「恢复此版本配置（不会自动发布）」+ `useOverlayModal` 确认（说明平台侧恢复、Edge 不受影响、需再发布）；成功提示「已恢复到 vX（平台侧）。请发布以推送到 Edge 节点」+ 弹窗内「立即发布恢复的配置」出口——共享弹窗不直接依赖各域 composable：弹窗 `emit('publish-requested')` 由调用方接自家发布链路，按钮显示由 `canPublish` prop 控制（默认 false），本轮仅上游两处调用点传入，其他资源域接线时逐个打开，MUST NOT 出现「有按钮点了没反应」。`VersionManagementModal` 是共享组件，改动对 8 类资源生效——回滚不推 Edge 是共同真实语义，属期望方向；回归必须覆盖其他资源域版本管理用例（约定 #51④）。
- **D4 删除历史版本加确认**：非当前版本删除走 `useOverlayModal`：「删除后无法再回滚到 vX，确定删除？」；当前版本不可删的既有拦截保留。
- **D5 保存引导走轻确认 + 既有发布链路**：保存成功后 `useOverlayModal`：「已保存。配置尚未发布，发布后才会推送到 Edge 节点生效。[稍后/立即发布]」；「立即发布」复用 `PublishConfirmModal` → `executePublish`（集群子页已有参数注入模式，全局页已引入该组件，成本低）。三处保存成功文案统一为一条。**不做**自动发布（用户保留显式控制权）。
- **D6 假排序先移除、不后端补 sort**：全局页 sorter 只排当前页 20 条，具有误导性；服务端排序需动 `upstreams.py`（现固定 `order_by(name)`）。取舍：本轮移除 sorter 保持固定排序，后端 sort 参数不做（YAGNI，评审 B3⑧ 首选方案）。
- **D7 EWMA 仅改展示层**：API 值 `ewma` 不变，全局页筛选 option 与徽章文案统一为「延迟最小」（与 `upstream` 主 spec 用语、集群子页、表单一致）。
- **D8 集群子页选中修复在组件层接线**：`selectUpstreams` 已按 spec 在 `keys.length===1` 时写 `selectedUpstream`（主 spec 现文要求），缺陷在 `ClusterUpstreams.vue` 的 onChange 接线；修复 = 接线对齐 spec + 选中行高亮。接线须守卫 `rows[0]` 存在性（antd onChange 的 rows 在跨页勾选场景可能只含当前页行，缺失时不写 `selectedUpstream`、单选按钮维持禁用）；「勾选 1 行覆盖此前行点选」语义按主 spec 现文接受，高亮跟随 `selectedUpstream` 无论其来源（行点选或勾选）。composable spec 无需 delta。
- **D9 表单行为规格两套实现都达标、合并另立项**：校验失败自动切 Tab（只做到 Tab 级，不强制展开 Tab 内折叠 section）、误关保护、hint/中文占位在 `UpstreamFormModal` 与集群内联表单都落地；组件合并（集群子页改用 `UpstreamFormModal`）改动面大，按 Non-Goals 另立 change。spec 只写行为不钉实现，合并后规格继续成立。
- **D10 发布失败「重试」降级实现**：进度弹窗 partial/失败时提供「重新发布」按钮（回填同一 endpoint），不新增「仅失败节点」重试 API（后端逐节点 results 已返回，前端只差组织；按节点重试留待后续）。

## 约定符合性

- 不绕开 `usePagination`/AppModal 三层制/`useClusterUtils` 共享弹窗/`utils/format.ts`/中文内联文案（约定 #9/#25/#26/#54）。
- 发布/删除/版本编排一律复用 `edge_sync.publish_resource`、`executePublish`、`executeDeleteWithProgress` 单点实现（约定 #7/#18/#24）。
- `pending_publish`/`last_publish_status` 属列表展示语义，`PublishStatusTag` 消费新字段不改动 publish-map 模式（约定 #162 语义保持）。
- TDD：约定 #16，每任务先写失败测试。
