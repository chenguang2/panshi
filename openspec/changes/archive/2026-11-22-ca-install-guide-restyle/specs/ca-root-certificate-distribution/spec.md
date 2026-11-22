# Spec Delta

## MODIFIED Requirements

### Requirement: 用户安装指引

CA 根证书页面 SHALL 内置可折叠的「用户安装指引」，覆盖 Windows（系统级安装）、macOS（钥匙串）、Chrome / Edge 浏览器（浏览器内导入，独立成卡）、Linux (Debian/Ubuntu，含 RHEL/CentOS 兼容说明) 四类环境。指引 SHALL 以平台步骤卡呈现（每卡：平台图标与名称、覆盖范围徽标、圆圈序号步骤、加粗关键术语、代码条带单条复制按钮、卡内关系提示行），并在面板底部提供通用「如何确认安装成功」验证条；summary 行 SHALL 提供「复制全部文本」操作，生成可直接粘贴 IM 发给用户的纯文本。步骤 SHALL 达到「发给用户即可照做」的粒度。

#### Scenario: 指引展开

- **WHEN** 用户在 CA 根证书页面展开「用户安装指引」
- **THEN** SHALL 显示四张平台步骤卡：
  - **Windows**（系统级安装）：双击 .crt → 安装证书 → 本地计算机（UAC 选「是」）→ 将所有的证书放入下列存储 → 受信任的根证书颁发机构 → 重启浏览器；卡内提示行说明系统级安装后 Chrome/Edge 及内网软件即已信任，浏览器内单独导入见 Chrome / Edge 卡
  - **macOS**（钥匙串 · 含 Safari）：双击 .crt → 钥匙串访问 → 系统 → 始终信任 → 输开机密码确认；卡内提示行说明 Safari 及系统级应用导入即生效
  - **Chrome / Edge 浏览器**（全平台 · 浏览器内导入）：chrome://settings/security（Edge 为 edge://settings/privacy）→ 高级 → 管理证书 → 证书颁发机构 → 导入 .crt → 勾选「信任此 CA 标识网站」→ 重启浏览器生效；卡内提示行说明 Windows 下导入会打开系统向导（按 Windows 卡操作）、已完成系统级安装的浏览器通常已自动信任
  - **Linux**（Debian/Ubuntu · RHEL 兼容）：`sudo cp <证书名>.crt /usr/local/share/ca-certificates/` 与 `sudo update-ca-certificates` 两条命令各带单条复制按钮；卡内提示行给出 RHEL/CentOS 路径与 `sudo update-ca-trust`
- **AND** SHALL NOT 包含 Firefox 段（维持移除，ssl-cert-management 既定裁决）

#### Scenario: 指引入口

- **WHEN** 用户查看 CA 根证书页面
- **THEN** 「用户安装指引」SHALL 作为页面内独立的可折叠入口（`<details>` 折叠面板）呈现于分发横幅下方
- **AND** 分发横幅 SHALL NOT 提供指向指引面板的联动操作（2026-11-22 用户裁决：不补「查看安装指引」横幅入口，以现状为准）

#### Scenario: 安装结果验证指引

- **WHEN** 指引面板展开
- **THEN** 面板底部 SHALL 常驻通用验证条：访问任一内部 HTTPS 系统，地址栏出现锁图标且不再出现「您的连接不是专用连接」警告即安装成功
- **AND** 验证条 SHALL 附失败排查两条：确认装入「受信任的根证书颁发机构」而非「个人」存储；浏览器完全退出后重开再试

#### Scenario: 步骤纯文本复制

- **WHEN** 用户点击 Linux 卡内某条命令的「复制」按钮
- **THEN** 该条命令 SHALL 以纯文本写入剪贴板
- **WHEN** 用户点击 summary 行的「复制全部文本」
- **THEN** 指引全文（四卡步骤 + 验证段）SHALL 以纯文本写入剪贴板，供管理员粘贴 IM 发送给用户
