# database-management Delta

## MODIFIED Requirements

### Requirement: 连接配置管理

系统 SHALL 在数据库外部配置文件（`data/db_config.json`）中维护连接列表与当前激活连接，支持添加、编辑、删除、测试 SQLite 与 PostgreSQL 连接。PostgreSQL 密码 SHALL 加密存储且 API 返回时脱敏。密码加密密钥 SHALL 与 JWT 密钥同源（security 解析链），连接测试 SHALL 不阻塞事件循环。

#### Scenario: 添加 PostgreSQL 连接

- **WHEN** 管理员在数据库管理页填写主机、端口、数据库名、用户名、密码并点击保存
- **THEN** 系统 SHALL 将新连接写入配置并出现在连接列表中，密码以加密形式存储、列表显示脱敏

#### Scenario: 测试连接成功

- **WHEN** 管理员点击某连接的"测试连接"且目标数据库可达
- **THEN** 系统 SHALL 在 3 秒内返回连接成功

#### Scenario: 测试连接失败

- **WHEN** 管理员点击某连接的"测试连接"且目标数据库不可达
- **THEN** 系统 SHALL 返回明确的失败原因（网络不通/认证失败/数据库不存在）
- **AND** 失败 SHALL 在超时预算内返回（不阻塞事件循环分钟级）

#### Scenario: 连接测试不阻塞事件循环

- **WHEN** 管理员发起连接测试且目标数据库网络不可达
- **THEN** 同步探测体 SHALL 卸载到工作线程（`asyncio.to_thread`），`asyncio.wait_for` 超时 SHALL 真实生效并可取消
- **AND** 测试期间其他请求（登录、健康检查）SHALL 正常响应

#### Scenario: Fernet 密钥单源与存量迁移

- **WHEN** 后端启动且 db_config 中存在连接密码密文
- **THEN** 密码加密密钥 SHALL 复用 security 解析的 JWT_SECRET_KEY（同源单点）
- **AND** 若密文由旧密钥加密，启动 SHALL 自动用当前密钥重加密迁移（`ensure_config`）
- **AND** 换密钥导致不可解的密文 SHALL 有明确的失败表现而非静默错库

#### Scenario: 删除连接

- **WHEN** 管理员删除一个非激活连接
- **THEN** 系统 SHALL 从配置中移除该连接

#### Scenario: 删除激活中的连接

- **WHEN** 管理员尝试删除当前激活的连接
- **THEN** 系统 SHALL 拒绝操作并提示先切换其他数据库
