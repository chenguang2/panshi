# edge-env-remote-editing

## Purpose

允许用户在磐石 Admin 平台中远程读取、编辑和部署 Edge 网关的 `edge.env` 核心配置文件，替代手工 SSH 操作。

## Requirements

### Requirement: 全局页面入口

系统 SHALL 新增全局页面 `/edge-env`，支持 `?cluster_id=` 参数筛选，侧边栏"核心功能"区新增「edge.env 配置」导航入口。该页面受 `edge_env` 特性开关控制。

#### Scenario: 侧边栏显示入口
- **WHEN** 用户登录后查看侧边栏
- **THEN** 核心功能区 SHALL 显示「edge.env 配置」导航项
- **AND** 点击后跳转到 `/edge-env`

#### Scenario: 通过 cluster_id 打开特定集群的配置
- **WHEN** 用户访问 `/edge-env?cluster_id=1`
- **THEN** 页面 SHALL 加载集群的活跃节点列表
- **AND** 页面顶部 SHALL 显示集群选择器（下拉内支持按名称/IP 搜索、分组 optgroup 展示）、节点选择器、「读取节点配置」和「发布」按钮
- **AND** 编辑器为空白，显示操作指引

#### Scenario: 未指定 cluster_id
- **WHEN** 用户访问 `/edge-env`（无 cluster_id 参数）
- **THEN** 页面 SHALL 显示集群选择器下拉框
- **AND** 用户选择集群后自动跳转到 `/edge-env?cluster_id={id}`

#### Scenario: 无活跃节点时显示提示
- **WHEN** 集群下没有任何活跃节点
- **THEN** 页面 SHALL 显示提示"当前集群无活跃节点，无法管理 edge.env"
- **AND** 编辑器、「读取节点配置」和「发布」按钮 SHALL 置灰

#### Scenario: 手动切换集群同步 URL
- **WHEN** 用户在页面内通过集群选择器手动切换集群
- **THEN** URL SHALL 同步更新为 `/edge-env?cluster_id={新id}`
- **AND** 刷新页面后选择 SHALL 恢复

### Requirement: 节点选择与配置模板获取

系统 SHALL 提供节点列表接口和 edge.env 配置读取接口。页面不自动加载配置，用户手动点击「读取节点配置」按钮从选中节点读取当前 edge.env 内容。按钮与弹窗标题 SHALL 使用「读取节点配置」命名（不使用「模板」措辞——读取的是节点当前配置而非预置样例）。

#### Scenario: 页面加载时获取节点列表
- **WHEN** 用户打开 edge.env 页面并选择集群
- **THEN** 前端 SHALL 加载该集群的节点列表
- **AND** 节点选择器 SHALL 显示每个节点的 IP:管理端口，离线节点附「(离线)」标注

#### Scenario: 读取节点配置（流式）
- **WHEN** 用户选中节点后点击「读取节点配置」按钮
- **THEN** 前端 SHALL 通过 SSE 调用 `GET /api/v1/clusters/{clusterId}/edge-env/read-stream?node_id={nodeId}`
- **AND** 弹窗 SHALL 显示 Ansible 执行过程日志（与部署弹窗样式一致）
- **AND** 执行完成后，最后一条 SSE 事件携带配置内容
- **AND** 读取成功时前端 SHALL 自动关闭弹窗并 toast 提示「已载入 {节点IP} 的当前配置」
- **AND** 读取进行中关闭弹窗 SHALL 中止读取，按钮 SHALL 以 title 说明该行为

#### Scenario: 读取失败保留现场
- **WHEN** 选中节点不可达或读取失败
- **THEN** 弹窗 SHALL 显示错误信息且不自动关闭，保留日志供排障
- **AND** 编辑器内容不变
- **AND** 错误信息 SHALL 为可行动文案（无法连接/SSH 认证失败/不在主机清单等），SHALL NOT 显示裸退出码

#### Scenario: 切换节点时提示丢弃编辑内容
- **WHEN** 编辑器内容已修改，用户切换节点选择器
- **THEN** 页面 SHALL 弹出确认框"当前编辑内容尚未发布，切换节点将丢弃编辑内容，是否继续？"
- **AND** 用户确认后节点切换，内容保留为空

### Requirement: Monaco Editor YAML 编辑

前端 SHALL 使用 Monaco Editor 提供 YAML 编辑能力。

#### Scenario: YAML 编辑器加载
- **WHEN** 成功读取节点配置后
- **THEN** 页面 SHALL 渲染 Monaco Editor，语言模式设为 `yaml`
- **AND** 编辑器 SHALL 以读取的内容作为初始值

#### Scenario: YAML 语法高亮
- **WHEN** 编辑器加载内容
- **THEN** SHALL 显示 YAML 语法高亮（键值对着色、层级缩进线）

#### Scenario: 前端实时语法校验
- **WHEN** 用户编辑过程中 YAML 格式错误
- **THEN** Monaco Editor SHALL 在错误行显示红色波浪线和标记

#### Scenario: 编辑器空态指引
- **WHEN** 编辑器无内容
- **THEN** 页面 SHALL 在编辑器区域外（不得叠放在编辑器行号槽内伪装成文件内容）显示指引
- **AND** 指引文案 SHALL 随选择状态变化：未选集群→指引选择集群；集群无节点→指引到集群管理添加节点；已选节点未读取→指引点击「读取节点配置」或直接输入

#### Scenario: 全屏编辑
- **WHEN** 用户点击"全屏"按钮
- **THEN** 编辑器 SHALL 切换到全屏模式

#### Scenario: Monaco Editor 异步加载
- **WHEN** 用户首次访问 edge.env 页面
- **THEN** Monaco Editor SHALL 通过异步加载（dynamic import）按需加载，不阻塞页面首次渲染

### Requirement: 发布 edge.env

系统 SHALL 提供接口 `POST /api/v1/clusters/{clusterId}/edge-env/deploy` 将编辑后的 edge.env 发布到指定节点。

#### Scenario: 空内容检查
- **WHEN** 编辑器内容为空，用户点击"发布"按钮
- **THEN** 系统 SHALL 弹出提示"编辑器内容为空，请先读取节点配置或输入内容"
- **AND** 不打开发布弹窗

#### Scenario: 无节点集群发布拦截
- **WHEN** 所选集群没有任何节点
- **THEN** 「发布」按钮 SHALL 置灰不可点击（对齐「无活跃节点时显示提示」场景）
- **AND** 空态指引 SHALL 引导用户先为该集群添加节点

#### Scenario: 发布前字段验证
- **WHEN** 用户点击"发布"按钮且编辑器内容非空
- **THEN** 前端/后端 SHALL 验证 YAML 合法性
- **AND** SHALL 验证以下字段必须存在且合法：
  - `deploy` 顶层字段
  - `deploy.http` 字段
  - `deploy.http.edge.listen` 字段，且不为空列表
  - `deploy.http.admin.listen` 字段，且不为空列表
- **AND** `deploy.http.edge.listen` 与 `deploy.http.admin.listen` 的每个条目（`addr` 字段，或纯字符串条目）中 `host:port` 的端口部分 SHALL 为 1-65535 的整数；`unix:` 前缀条目 SHALL 跳过端口校验
- **AND** 验证不通过时 SHALL 提示具体错误（含字段路径；YAML 语法错误含行号；端口非法含项序号、原值与合法范围，如「deploy → http → edge → listen 第 1 项端口非法: 0.0.0.0:99999（端口须为 1-65535 的整数）」）

#### Scenario: 发布节点选择弹窗
- **WHEN** 字段验证通过
- **THEN** 弹窗 SHALL 显示集群所有节点列表（多选复选框），**默认勾选全部在线节点**
- **AND** 非活跃节点（status≠1）SHALL 置灰不可选，行内标注"离线"
- **AND** 弹窗顶部 SHALL 提供「全选」「取消全选」链接与「已选择 N / 在线 M 台」计数（全选仅作用于在线节点，分母排除离线）
- **AND** 未选中任何节点时 SHALL NOT 在弹窗打开时即显示红色报错；校验提示仅在该用户点击确认且选中数为 0 时出现
- **AND** 弹窗 SHALL 显示后果说明行：「将把上述内容写入所选节点并执行 edge init/reload 生效」
- **AND** 弹窗底部显示"确认发布"和"取消"按钮

#### Scenario: 发布请求格式
- **WHEN** 用户确认发布
- **THEN** 前端 SHALL 发送请求 `POST /api/v1/clusters/{clusterId}/edge-env/deploy`
- **AND** 请求体 SHALL 包含 `{"content": "<完整的 edge.env 文本>", "node_ids": [1, 3, 5]}`
- **AND** `node_ids` 为空时 SHALL 发布到所有活跃节点

#### Scenario: 后端 YAML 语法校验
- **WHEN** 后端收到发布请求
- **THEN** 后端 SHALL 对 content 做 YAML 语法校验
- **AND** 若 YAML 格式错误，SHALL 返回 HTTP 422
- **AND** 响应体 SHALL 包含错误行号和错误描述

#### Scenario: YAML 校验通过后开始发布
- **WHEN** YAML 校验通过
- **THEN** 后端 SHALL 逐个遍历选中的节点，串行执行发布
- **AND** 对每个节点执行的步骤：
   1. 备份远端 `edge.env` → `edge.env.bak.{timestamp}`
   2. 通过 `ansible.builtin.copy` 的 `content` 参数写入新 edge.env
   3. 执行 `cd {node.edge_path} && bin/edge init`
   4. 执行 `cd {node.edge_path} && bin/edge reload`

#### Scenario: 节点成功判定包含 init 真实结果
- **WHEN** 后端遍历节点的 ansible 执行流
- **THEN** `bin/edge init` 步骤 SHALL 以真实退出码判定失败（`failed_when: rc != 0`），失败节点 SHALL 标记为 failed
- **AND** `bin/edge reload` 步骤保持宽松判定，但执行异常时节点结果 SHALL 附 `warning` 字段，前端在节点卡上以警示样式展示
- **AND** 不得仅凭"ansible 流正常结束"或 rc==0 而 init 实际失败判定成功

#### Scenario: 部署失败错误文案与读取一致
- **WHEN** 节点发布失败
- **THEN** 节点错误信息 SHALL 经与读取流共享的转译逻辑生成可行动文案（无法连接/SSH 认证失败/不在主机清单等）
- **AND** 未命中已知模式时 SHALL 显示「发布失败（ansible rc={rc}），详情见下方日志」，SHALL NOT 仅显示裸退出码

#### Scenario: 发布进度弹窗发布中不可关闭
- **WHEN** 发布流程进行中
- **THEN** 进度弹窗 SHALL 禁用关闭（发布不可取消，诚实呈现）
- **AND** 全部节点执行完毕后 SHALL 显示汇总条（全部成功/部分成功/全部失败 + 成功 N / 失败 M）
- **AND** 存在失败节点时 SHALL 提供「重试失败节点」入口，点击后以失败节点集重新进入发布流程（预填集过滤已离线节点）
- **AND** 重试时 diff 按 dirty 分流：内容相对上次尝试有修改 SHALL 照常展示 diff 确认；无修改 SHALL 跳过 diff 直达节点选择弹窗

#### Scenario: 完成反馈与结果一致
- **WHEN** 前端收到 complete 事件
- **THEN** `all_success` SHALL toast「发布完成」（success）
- **AND** `partial` SHALL toast「发布完成，N 个节点失败，请查看失败原因」（warning）
- **AND** `all_failed` SHALL toast「发布失败」（error）
- **AND** 全部失败时 SHALL NOT 出现任何成功语义提示
- **AND** complete 事件（可能无 line 字段）SHALL 被前端正确处理，不得因缺少 line 字段而丢弃

### Requirement: diff 对比

发布前 SHALL 展示编辑内容与 diff 基线（最近一次读取的节点配置）的差异，diff SHALL 基于 LCS 行级算法并压缩未变更上下文。

#### Scenario: 变更摘要与基线说明
- **WHEN** 用户点击"发布"且内容与基线存在差异
- **THEN** 确认弹窗 SHALL 头部显示变更摘要「+N −M」与基线说明（如「基线：192.168.0.13 的当前配置」；从未读取时「基线：空（未读取节点配置）」）

#### Scenario: 差异块渲染与上下文折叠
- **WHEN** diff 弹窗渲染差异
- **THEN** SHALL 以 LCS 行级对比渲染（新增行绿色、删除行红色、成对修改相邻展示）
- **AND** 仅渲染变更块及其 ±3 行上下文
- **AND** 被折叠的未变更区域 SHALL 显示「⋯ 未变更 N 行 ⋯」折叠条
- **AND** SHALL NOT 按行号位置逐行对比（中间插入行不得导致其后全部行误报为修改）

#### Scenario: 无变更时提示
- **WHEN** 编辑内容与基线完全相同
- **THEN** diff 显示"与基线内容一致，无变更"
- **AND** 用户仍可选择节点并继续发布

### Requirement: SSE 实时发布日志

发布过程 SHALL 通过 SSE 推送实时事件与日志，每个节点串行执行，前端按节点分组展示。

#### Scenario: SSE 事件契约
- **WHEN** 发布开始
- **THEN** 后端 SHALL 通过 SSE 推送 JSON 事件，每条事件格式 `data: {json}`：
  - 节点开始：`{"type": "node_start", "ip": "<ip>", "index": <i>, "total": <n>, "route": "relay"|"direct"}`
  - 节点结束：`{"type": "node_done", "ip": "<ip>", "status": "success"|"failed", "error": "<可行动文案，失败时>", "warning": "<reload 异常提示，可选>", "route": ...}`
  - 整体完成：`{"type": "complete", "version": <版本号，全部失败时不携带>, "status": "all_success"|"partial"|"all_failed", "node_results": [...]}`
- **AND** ansible 原始输出行 SHALL 以 `{"line": "..."}` 事件形式透传用于日志展示

#### Scenario: 日志按节点分组展示
- **WHEN** 前端收到 SSE 事件
- **THEN** 发布进度弹窗 SHALL 按节点分组展示，每个节点一张卡片（IP + 状态徽章 + 路径标注「（经中继）/（直连）」）
- **AND** 卡片下方 SHALL 展示该节点的 ansible 原始日志行

#### Scenario: 串行发布，逐节点推送
- **WHEN** 集群有多个节点
- **THEN** 系统 SHALL 串行发布每个节点
- **AND** 上一个节点发布完成后才开始下一个节点

### Requirement: 版本管理

系统 SHALL 使用 `ConfigVersion` 表（`ps_config_version`）记录版本历史，`resource_type='edge_env'`，`resource_id=cluster_id`。版本记录语义为「至少一个节点实际写入的配置快照」：仅当发布至少成功一个节点时创建。

#### Scenario: 发布成功时创建版本记录
- **WHEN** 发布完成且整体状态为 `all_success` 或 `partial`
- **THEN** 系统 SHALL 创建版本记录（集群 ID、完整 edge.env 内容、版本号自动递增、创建时间）
- **AND** 版本 SHALL 在首个节点成功后立即创建（SHALL NOT 等到全部节点执行完毕）——发布流中断时「版本存在 ⟺ 至少一个节点成功」恒成立
- **AND** complete 事件 SHALL 携带新版本号

#### Scenario: 全部失败不创建版本
- **WHEN** 发布完成且整体状态为 `all_failed`
- **THEN** 系统 SHALL NOT 创建版本记录，`current_version` 不推进
- **AND** complete 事件 SHALL NOT 携带版本号

#### Scenario: 「当前」徽章语义
- **WHEN** 版本列表展示「当前」徽章
- **THEN** 该徽章 SHALL 表示「最近一次成功发布产生的版本」
- **AND** 徽章 SHALL 提供 tooltip 说明「最近一次发布创建的版本；发布全部失败时不产生新版本」

#### Scenario: 查看版本历史列表
- **WHEN** 用户点击"版本管理"按钮
- **THEN** 页面 SHALL 显示版本列表（版本号、创建时间、创建人）
- **AND** 列表按版本号倒序排列
- **AND** 支持分页

#### Scenario: 查看版本详情
- **WHEN** 用户点击某个版本记录
- **THEN** 页面 SHALL 展示该版本的完整 edge.env 内容（只读模式）

#### Scenario: 加载历史版本到编辑器
- **WHEN** 用户在版本历史中点击"加载到编辑器"
- **THEN** 系统 SHALL 将该版本的内容填入编辑器
- **AND** SHALL NOT 自动发布，用户需要确认后手动点击"发布"
- **AND** 加载后编辑器 SHALL 处于「未发布修改」状态

### Requirement: 编辑提示与确认

编辑器 SHALL 在内容可能丢失的场景下提示用户，保护行为在切换节点、切换集群、页面离开三个入口一致。

#### Scenario: 编辑器内容未保存时刷新提示
- **WHEN** 编辑器内容已修改但未发布，用户尝试刷新或关闭页面
- **THEN** 浏览器 SHALL 弹出离开确认（beforeunload）

#### Scenario: 路由离开提示
- **WHEN** 编辑器内容已修改但未发布，用户通过侧边栏/路由跳转离开本页
- **THEN** 页面 SHALL 弹出确认"当前编辑内容尚未发布，确定要离开吗？"
- **AND** 确认后方可离开

#### Scenario: 发布进行中离开拦截
- **WHEN** 发布流程进行中（无论编辑器是否 dirty），用户刷新、关闭页面或路由跳转离开
- **THEN** 页面 SHALL 拦截并提示（发布中断会导致剩余节点无声跳过、无完成汇总）
- **AND** 拦截条件 SHALL 为「有未发布修改或发布进行中」二者任一

#### Scenario: 切换集群时提示丢弃编辑内容
- **WHEN** 编辑器内容已修改但未发布，用户切换集群选择器
- **THEN** 页面 SHALL 弹出确认"当前编辑内容尚未发布，切换集群将丢弃编辑内容，是否继续？"
- **AND** 取消时不切换集群、内容保留

#### Scenario: 读取配置时确认丢弃编辑
- **WHEN** 编辑器内容已修改，用户点击「读取节点配置」
- **THEN** 系统 SHALL 弹出确认"当前编辑内容将被丢弃，确定要读取吗？"

### Requirement: 编辑器状态条与内容来源

页面 SHALL 在编辑器区域提供状态条，展示当前内容的来源、读取时间与发布状态，使「正在编辑什么、相对什么基线」始终可见。

#### Scenario: 内容来源展示
- **WHEN** 编辑器内容来自某节点的读取
- **THEN** 状态条 SHALL 显示「内容来自 {节点IP} · 读取于 {MM-DD HH:mm}」
- **AND** 编辑器从未读取过时 SHALL 显示「未读取，手动输入」

#### Scenario: 未发布修改标记
- **WHEN** 编辑器内容与 diff 基线（最近一次读取内容）不一致
- **THEN** 状态条 SHALL 显示「● 未发布修改」警示标记
- **AND** 发布成功（all_success/partial）后 SHALL 清除该标记
- **AND** 发布全部失败后 SHALL 保留该标记（内容仍相对基线未落盘）
