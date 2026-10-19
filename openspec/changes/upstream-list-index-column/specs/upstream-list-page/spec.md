# upstream-list-page 变更

## ADDED Requirements

### Requirement: 上游列表序号列

上游管理独立页（UpstreamList）的表格 SHALL 以「#」序号列作为第一列，与其余资源独立页（用户/节点/路由管理）的表格解剖保持一致：

- 序号列 SHALL 展示跨页连续计数：`(page - 1) * pageSize + index + 1`（第 2 页首行 = pageSize + 1）
- 序号列样式 SHALL 与既有页面同款（width 45、text-muted），不进入列配置弹窗

#### Scenario: 首列展示序号

- **WHEN** 用户打开上游管理独立页
- **THEN** 表格第一列为「#」序号列，首行显示 1

#### Scenario: 翻页后计数连续

- **WHEN** 用户翻到第 2 页（每页 20 条）
- **THEN** 首行序号 SHALL 显示 21

#### Scenario: 筛选后计数连续

- **WHEN** 用户切换集群或负载均衡筛选
- **THEN** 筛选视图内序号 SHALL 从 1 起重排，翻页偏移按筛选后总数计算（视图行序 + 页偏移，与路由管理页筛选语义一致）

#### Scenario: 与其他资源独立页一致

- **WHEN** 并排对比用户/节点/路由/上游四个独立页的表格
- **THEN** 四页第一列均为同款「#」序号列（同宽度、同跨页计数语义）

#### Scenario: Tab 面板表格不受影响

- **WHEN** 用户在统一管理面板的 Tab 内查看上游表
- **THEN** Tab 表格不添加序号列（方案 1 裁决边界：面板紧凑形态保持不变）
