## ADDED Requirements

### Requirement: 手册位置与格式
操作手册 SHALL 位于 `docs/new/` 目录，使用 Markdown 格式，图片存放于 `docs/new/images/`。

#### Scenario: 目录结构
- **WHEN** 查看仓库 docs/new 目录
- **THEN** 存在手册主入口文件（README 或 index）
- **AND** 各章节为独立 .md 文件或单文件分章结构，均可从目录导航跳转

### Requirement: 从零搭建主线
手册 SHALL 以一个空系统为起点，按固定顺序完整演示搭建一套可用网关：登录准备 → 集群 → 节点 → edge.env → 全局规则 → 插件元数据 → 插件组 → 上游 → 路由（含高级匹配绑定端口）→ 根证书与证书发布 → TCP 四层代理 → DNS 代理 → 域名绑定与全链路验证。

#### Scenario: 章节顺序覆盖
- **WHEN** 阅读手册目录
- **THEN** 覆盖上述全部 13 个阶段（0-12 章），顺序与提案一致
- **AND** 每个资源创建后都有对应的「发布」操作说明

#### Scenario: 全链路验证闭环
- **WHEN** 用户完成第 12 章
- **THEN** 能够通过域名以 HTTPS 访问第 8 章创建的路由
- **AND** 能够验证 TCP 8880 与 UDP 53 的四层/DNS 代理连通性

### Requirement: 每章统一结构
每个功能章节 SHALL 遵循统一结构：本步骤的作用 → 页面入口 → 字段/选项逐项解释 → 操作步骤 → 发布 → 预期结果与验证。

#### Scenario: 选项级解释
- **WHEN** 某章节介绍一个含表单的创建操作
- **THEN** 表单中每个字段都有名称、含义、演示值、填写注意事项
- **AND** 高风险操作（如清空目标库、删除）有明确警告说明

### Requirement: 截图规范
手册 SHALL 在关键界面处配截图；无法自动截取的画面 SHALL 使用带文字描述的占位标注，便于后续人工补图。

#### Scenario: 截图存在性
- **WHEN** 章节涉及页面操作
- **THEN** 使用相对路径引用 docs/new/images/ 下的截图
- **AND** 未补图的位置使用「📷 截图待补充：<画面描述>」格式占位

### Requirement: 演示环境一致性
手册中的示例值 SHALL 与演示环境一致：节点 192.168.0.13-15、OpenResty 路径 /work/jboss/uapm/openresty、Edge 路径 /work/jboss/uapm/uap-edge、HTTP 5000(HTTPS)、TCP 8880、UDP 53。

#### Scenario: 示例值可复现
- **WHEN** 用户按手册示例值逐章操作
- **THEN** 各章产物之间能够相互引用（路由引用上游/插件组/证书等）
- **AND** 第 12 章验证命令可直接复制执行
