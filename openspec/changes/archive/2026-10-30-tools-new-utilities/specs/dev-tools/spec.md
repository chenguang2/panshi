# dev-tools Delta（tools-new-utilities）

## ADDED Requirements

### Requirement: 时间戳转换工具

系统 SHALL 提供时间戳转换工具：单输入框输入即算（无按钮），自动识别输入形态——10 位数字按 epoch 秒、13 位数字按 epoch 毫秒、日期时间字符串按 ISO 解析（**无时区后缀按 UTC 解析**，对齐平台存储约定），非法输入显示中文错误提示。输出 SHALL 对照展示：北京时间（Asia/Shanghai）、UTC 时间、epoch 秒、epoch 毫秒、ISO 8601（UTC）。提供「当前时间」快捷填充。

#### Scenario: epoch 秒识别
- **WHEN** 用户输入 `1793331059`
- **THEN** 系统按 epoch 秒解析，展示北京时间与 UTC 时间的对照结果

#### Scenario: epoch 毫秒识别
- **WHEN** 用户输入 `1793331059000`
- **THEN** 系统按 epoch 毫秒解析，结果与该时刻一致

#### Scenario: 无时区后缀字符串按 UTC
- **WHEN** 用户输入 `2026-10-30 08:00:00`（平台后端 isoformat 形态，无时区后缀）
- **THEN** 系统按 UTC 解析，北京时间列显示 `2026-10-30 16:00:00`

#### Scenario: 带时区后缀字符串
- **WHEN** 用户输入 `2026-10-30T16:00:00+08:00`
- **THEN** 系统按其后缀时区解析（与无后缀形态区分）

#### Scenario: 非法输入
- **WHEN** 用户输入无法识别的内容（如 `hello`）
- **THEN** 显示中文提示「无法识别的时间格式」

#### Scenario: 当前时间快捷填充
- **WHEN** 用户点击「当前时间」按钮
- **THEN** 输入框填充当前 epoch 毫秒并即时展示转换结果

### Requirement: JWT 解码工具

系统 SHALL 提供 JWT 解码工具：粘贴 token 输入即算，展示格式化后的 header 与 payload（`exp` 附可读时间与过期状态：已过期 / 剩余时间），签名段仅提示不展开。工具 SHALL NOT 验证签名（纯解码，用途是查看内容）。非三段结构或 base64 解码失败 SHALL 显示中文错误提示。

#### Scenario: 解码平台 token
- **WHEN** 用户粘贴有效的平台 JWT（三段 base64url，`.` 分隔）
- **THEN** 展示格式化 header（alg 等）与 payload（sub/exp/pwd_ver 等）
- **AND** payload 中 `exp` 行附北京时间与过期状态标签

#### Scenario: exp 过期状态
- **WHEN** payload 的 `exp` 早于当前时间
- **THEN** 状态标签显示「已过期」

#### Scenario: 非法输入
- **WHEN** 用户输入少于三段或含非法 base64url 的内容
- **THEN** 显示中文提示「不是有效的 JWT（应为三段 . 分隔的 Base64URL）」

### Requirement: YAML 与 JSON 互转工具

系统 SHALL 提供 YAML 与 JSON 互转工具：左侧输入（YAML 或 JSON），中间按钮「YAML → JSON」与「JSON → YAML」，右侧只读输出。转换失败 SHALL 沿用各格式既有的中文错误文案模式。

#### Scenario: YAML 转 JSON
- **WHEN** 用户在左侧输入合法 YAML（如 `key: value`）并点击「YAML → JSON」
- **THEN** 右侧显示格式化的 JSON（2 空格缩进）

#### Scenario: JSON 转 YAML
- **WHEN** 用户在左侧输入合法 JSON 并点击「JSON → YAML」
- **THEN** 右侧显示 2 空格缩进的 YAML

#### Scenario: 转换失败
- **WHEN** 用户输入非法 YAML/JSON 并点击对应转换按钮
- **THEN** 右侧显示中文错误提示（含解析错误详情）

### Requirement: 文本 Diff 工具

系统 SHALL 提供纯文本对比工具：左右两栏分别输入文本 A 与 B，点击「对比 →」后展示差异统计摘要与逐行差异（复用 JSON 对比的差异渲染层，不做键序归一化——按原文行序比较）。

#### Scenario: 文本行差异
- **WHEN** 用户在两栏输入存在行差异的纯文本（如两段 nginx 配置）并点击「对比 →」
- **THEN** 下方展示差异统计与逐行差异渲染（红=删除，绿=新增）

#### Scenario: 完全一致
- **WHEN** 两栏文本完全相同
- **THEN** 显示「两个文本完全一致，无差异」

#### Scenario: 空输入校验
- **WHEN** 任一栏为空时点击「对比 →」
- **THEN** 显示「请输入文本 A」/「请输入文本 B」

### Requirement: IPv4/CIDR 计算器

系统 SHALL 提供 IPv4/CIDR 计算工具（仅 IPv4）：输入 `a.b.c.d` 或 `a.b.c.d/prefix`（缺省前缀按 /32）输入即算，展示 IP、前缀、子网掩码、反掩码、网络地址、广播地址、可用主机范围、可用主机数，并标注私网段（10/8、172.16/12、192.168/16、127/8）。非法 IP 或前缀 SHALL 显示中文错误提示。

#### Scenario: 网段输入
- **WHEN** 用户输入 `192.168.1.10/24`
- **THEN** 展示掩码 `255.255.255.0`、网络地址 `192.168.1.0`、广播地址 `192.168.1.255`、可用范围 `192.168.1.1 - 192.168.1.254`、可用主机数 254、私网标注

#### Scenario: 无前缀输入
- **WHEN** 用户输入 `10.0.0.5`
- **THEN** 按前缀 /32 解析：可用主机即该地址本身

#### Scenario: 非法输入
- **WHEN** 用户输入 `300.1.1.1` 或 `1.2.3.4/33`
- **THEN** 显示中文错误提示

### Requirement: 哈希计算工具

系统 SHALL 提供文本哈希计算工具：输入即算，同时展示 MD5 与 SHA-1/SHA-256/SHA-512（Web Crypto 可用时；不可用则仅 MD5 本地实现），输出统一小写十六进制。

#### Scenario: MD5 已知向量
- **WHEN** 用户输入 `abc`
- **THEN** MD5 行显示 `900150983cd24fb0d6963f7d28e17f72`

#### Scenario: SHA-256 已知向量
- **WHEN** 用户输入 `abc` 且运行环境提供 Web Crypto
- **THEN** SHA-256 行显示 `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`

#### Scenario: 空输入
- **WHEN** 输入为空
- **THEN** 各哈希行显示占位提示而非空串
