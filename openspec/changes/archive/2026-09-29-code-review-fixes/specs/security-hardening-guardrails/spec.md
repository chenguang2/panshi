# security-hardening-guardrails Delta

## ADDED Requirements

### Requirement: 登录限速与密码版本吊销

登录接口 SHALL 对连续失败实施固定窗口限速：以（用户名，客户端 IP）为键在进程内统计 10 分钟窗口内的失败次数，窗口内失败达 5 次 SHALL 以 429 拒绝后续尝试，窗口过期自动放行，登录成功 SHALL 清除该键计数。用户密码变更后 SHALL 递增 pwd_ver 版本号，全部改密前签发的 JWT 在后续请求鉴权时 SHALL 因版本不匹配被吊销。

#### Scenario: 固定窗口失败限速

- **WHEN** 同一（用户名，IP）组合在 10 分钟窗口内连续登录失败达 5 次后再次尝试登录
- **THEN** 登录接口 SHALL 返回 429 拒绝，即使凭据正确
- **AND** 窗口过期后 SHALL 自动放行，计数不无限累积

#### Scenario: 登录成功清除失败计数

- **WHEN** 某键存在失败计数且该用户随后登录成功
- **THEN** 该键的失败计数 SHALL 被清除，不影响后续正常登录

#### Scenario: 改密后旧令牌吊销

- **WHEN** 用户修改密码后持改密前签发的旧 JWT 访问受保护接口
- **THEN** 鉴权 SHALL 因 pwd_ver 不匹配拒绝该令牌（401）
- **AND** 不存在「改密后旧 token 仍可用」的窗口
