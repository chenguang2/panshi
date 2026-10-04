# ssl-certificate-management Delta

## MODIFIED Requirements

### Requirement: SSL 证书列表展示

系统 SHALL 提供一个独立 SSL 证书管理页面（`/ssl`），以卡片网格形式展示所有集群的 SSL 证书。该页面 SHALL 受 `ssl_cert` 部署特性控制：当 `ssl_cert` 禁用时，前端路由和侧边栏菜单 SHALL NOT 注册/显示，API 端点 SHALL 返回 404。证书卡片 SHALL 展示到期信息并对临期/已过期证书给出预警徽章。两个 SSL 列表端点（统一管理、集群内）SHALL 经 `_build_publish_map` 从 ConfigVersion 回查每个证书最近一次成功发布时间并回填 `published_at`（可选字段），同步状态标签据此判定；回查失败 SHALL 按「无发布记录」降级，MUST NOT 阻断列表。

#### Scenario: 页面入口
- **WHEN** `features.yaml` 中 `ssl_cert` 为 `true`
- **AND** 用户点击侧边栏"SSL 证书"菜单项
- **THEN** 导航到 `/ssl` 路由
- **AND** 页面显示 `PageHeader`，标题为"SSL 证书"

#### Scenario: 功能禁用时隐藏
- **WHEN** `features.yaml` 中 `ssl_cert` 为 `false`
- **THEN** 侧边栏"SSL 证书"菜单项 SHALL NOT 显示
- **AND** `/ssl` 路由 SHALL NOT 注册
- **AND** 用户直接访问 `/ssl` SHALL 显示 404

#### Scenario: 证书卡片展示到期徽章

- **WHEN** 证书卡片渲染且证书含有效期信息
- **THEN** 卡片 SHALL 显示到期徽章「剩余 N 天」
- **AND** 剩余天数 < 0 时 SHALL 显示已过期预警
- **AND** 剩余天数 ≤ 30 时 SHALL 显示临期预警
- **AND** 其余情况 SHALL 正常显示剩余天数

#### Scenario: 列表响应携带到期计算字段

- **WHEN** 前端请求 SSL 证书列表
- **THEN** 后端响应 SHALL 包含证书到期时间与剩余天数计算字段（守卫测试 `backend/tests/test_ssl_expiry.py`）

#### Scenario: 列表回填最近发布时间

- **WHEN** 前端请求 SSL 证书列表（统一管理或集群内）且某证书曾成功发布
- **THEN** 该证书 SHALL 携带自 ConfigVersion 回查的最近发布时间（`published_at`）
- **AND** 同步状态标签 SHALL 据此显示「已同步」，SHALL NOT 因刷新/重进而恒显「未同步」
- **AND** 无发布记录的证书保持「未同步」语义；发布时间回查失败时按无发布记录降级
