# edge-data-import Delta

## MODIFIED Requirements

### Requirement: 连接测试

系统 SHALL 验证与 Edge 节点的 Admin API 连通性，并在导入前展示节点基本信息。连通性探测 SHALL 不阻塞事件循环。

#### Scenario: 连接成功

- **WHEN** 用户输入 Edge 节点 IP、端口和 API Key 并点击"测试连接"
- **THEN** 系统 SHALL 调用 Edge 节点 Admin API（`GET /PANSHI/admin/routes`）验证连通性
- **AND** 系统 SHALL 返回节点版本号、已安装插件数量、路由数量、上游数量和 SSL 证书数量
- **AND** 前端 SHALL 显示连接成功状态和节点概要信息

#### Scenario: 连接失败

- **WHEN** Edge 节点不可达、端口错误或 API Key 无效
- **THEN** 系统 SHALL 返回明确的错误信息（超时/拒绝连接/认证失败）
- **AND** 前端 SHALL 显示错误信息并允许用户修改参数后重新测试

#### Scenario: 阻塞 IO 卸载工作线程

- **WHEN** 异步端点执行同步的 Edge 数据抓取或连接探测（httpx 串行请求）
- **THEN** 同步调用 SHALL 经 `asyncio.to_thread` 卸载，事件循环 SHALL 保持可响应
- **AND** 预览/执行路径的长外部 IO 前 SHALL 先 `db.commit()` 结束读事务并落审计（防写锁横跨 IO 期的假 401）
