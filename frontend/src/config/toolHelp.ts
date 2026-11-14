/**
 * toolHelp.ts — 工具箱帮助文档单一事实源（tools-help-drawer）。
 *
 * 每个工具一份六段文档（是什么 / 前因后果 / 什么时候用 / 怎么用 / 示例 / 注意坑），
 * 由 ToolHelpDrawer.vue 渲染为帮助抽屉。key 与 Tools.vue 的 tools 数组一一对应，
 * 覆盖性由 config/__tests__/toolHelp.source.test.ts 守卫（源码扫描，漏配即红）。
 *
 * 文案依据出处随条目标注（约定编号 / dev-tools spec 场景 / 功能设计），
 * 修正时只改本文件单点，抽屉展示随之更新。
 */

export interface ToolHelpExample {
  /** 示例输入 */
  input: string
  /** 示例输出 */
  output: string
  /** 补充说明（可选） */
  note?: string
}

export interface ToolHelpDoc {
  /** ① 这是什么（一句话） */
  what: string
  /** ② 为什么需要它（前因后果，绑定平台真实场景） */
  why: string
  /** ③ 什么时候用（典型场景列表） */
  when: string[]
  /** ④ 怎么用（步骤列表） */
  how: string[]
  /** ⑤ 示例（输入 → 输出） */
  example: ToolHelpExample
  /** ⑥ 注意/坑 */
  cautions: string[]
}

export const TOOL_HELP: Record<string, ToolHelpDoc> = {
  /* ── Lua 互转 ── */
  lua: {
    what: 'Lua 函数代码 ↔ 插件配置字符串的双向转换。',
    why: '平台给路由/插件配置「自定义预处理函数」（pre_functions）时，函数最终要以转义后的单行字符串写进 Edge 配置（APISIX 侧存的是字符串，不是代码），手工加引号转义极易出错。本工具负责双向转换，配置串不再手写。',
    when: [
      '写好一段 Lua 函数要贴进插件的 pre_functions 配置 →「转换为字符串 →」',
      '从 Edge / 数据库里看到一串带 \\" 转义的配置串看不懂 →「← 转换为函数」还原成可读代码',
    ],
    how: [
      '左侧粘贴 Lua 函数体（反向场景则右侧粘贴配置字符串）',
      '点「转换为字符串 →」生成配置串（或「← 转换为函数」反向还原）',
      '复制结果，粘贴到插件配置的对应字段',
    ],
    example: {
      input: 'ngx.log(ngx.ERR, "hello")',
      output: '"return function(conf, ctx)\\nngx.log(ngx.ERR, \\"hello\\")\\nend"',
      note: '带引号的输出即插件配置里实际存放的字符串形态',
    },
    cautions: [
      '只做字符串转义，不做 Lua 语法校验——语法错误要发布后在 Edge 日志里才会暴露',
      '方向与内容要匹配：函数体放左侧、配置字符串放右侧',
    ],
  },

  /* ── URL 编解码 ── */
  url: {
    what: 'URL 编码 / 解码互转（encodeURIComponent 语义），两框对等。',
    why: '网关场景常要把中文、特殊字符塞进 URL 参数（回调地址、跳转参数），或从日志里还原被编码过的 URL——手转容易漏掉 %、&、= 这类保留字符。',
    when: [
      '构造带中文/特殊字符的跳转或回调 URL',
      '排查 Edge 访问日志里被转义的 URL 参数',
      '核对重写插件里配置的编码值',
    ],
    how: ['原文贴左框，点「编码 →」在右框得到编码串', '编码串贴右框，点「← 解码」在左框还原原文', '复制所需一侧的结果'],
    example: {
      input: 'https://example.com?name=张三&age=18（左框）',
      output: 'https%3A%2F%2Fexample.com%3Fname%3D%E5%BC%A0%E4%B8%89%26age%3D18（右框；右框发起「← 解码」可还原）',
    },
    cautions: [
      '解码含非法 % 序列的内容会报中文错误提示',
      '空格编码为 %20（不是 +）——与表单提交的 application/x-www-form-urlencoded 语义不同',
    ],
  },

  /* ── JSON 格式化 ── */
  json: {
    what: 'JSON 美化（格式化）与压缩。',
    why: '排查接口返回、核对插件配置时，接口/库里常是单行压缩 JSON，肉眼对不出结构——先格式化再看，改完再压回去贴进配置。',
    when: ['查看接口返回的压缩 JSON', '粘贴发布预览 / 配置快照核对字段', '把改好的 JSON 压成单行贴进配置'],
    how: ['左侧粘贴 JSON', '点「格式化 →」（美化）或「压缩 →」（单行），结果落右框', '复制右侧只读结果'],
    example: {
      input: '{"name":"test","value":123}',
      output: '{\n  "name": "test",\n  "value": 123\n}',
    },
    cautions: ['非法 JSON 会显示解析错误与中文修复指引（检查引号/逗号/括号配对），不会输出半截结果'],
  },

  /* ── SM4 加解密 ── */
  sm4: {
    what: 'SM4 国密加解密计算（ECB 模式 + PKCS7 填充），密文为 Base64。',
    why: '平台 ↔ Edge 的管理通道用 SM4 加密（默认密钥即 Edge 通道密钥）。排查「平台下发 Edge 收不到 / Edge 上报解不开」时，用同一密钥本地复算一段，即可区分是密钥不一致还是链路问题。',
    when: ['调试平台↔Edge 加密链路', '核对平台与 Edge 两端密钥是否一致', '对一段密文/明文手工复算验证'],
    how: [
      '密钥框填 16 字节密钥（默认即 Edge 通道密钥，可点「恢复默认」）',
      '左侧明文点「加密 →」，或右侧粘贴 Base64 密文点「← 解密」',
      '复制结果',
    ],
    example: {
      input: '{"cmd":"get_config"}（默认密钥加密）',
      output: 'Base64 形态的 SM4 密文（每次加密结果一致，ECB 确定性）',
    },
    cautions: [
      '密钥非 16 字节时工具会自动补齐/截断并显示黄条警告——此时与 Edge 通道真实加解密行为可能不一致',
      '通道密钥仅用于链路调试比对，若疑似泄露应在两端同步轮换',
    ],
  },

  /* ── Base64 编解码 ── */
  base64: {
    what: 'Base64 编码 / 解码（UTF-8 安全）。',
    why: '平台的节点任务脚本传输走「base64 管道」（echo {b64} | base64 -d | bash），脚本分发、配置透传都经它——手工编一段或还原一段时用本工具。',
    when: ['为节点任务的脚本管道生成 base64 段', '还原日志/配置里出现的 base64 内容', '核对一段编码值是否与原文一致'],
    how: ['原文贴左框，点「编码 →」在右框得到编码串', '编码串贴右框，点「← 解码」在左框还原原文', '复制所需一侧的结果'],
    example: {
      input: 'Hello World（左框）',
      output: 'SGVsbG8gV29ybGQ=（右框；右框发起「← 解码」可还原）',
    },
    cautions: [
      '解码含非法字符的内容会报错并列出常见原因（混入空格/换行/中文）',
      '中文按 UTF-8 编码——节点上解码也要 UTF-8 环境（base64 -d 默认按字节还原，通常无碍）',
    ],
  },

  /* ── YAML 格式化 ── */
  yaml: {
    what: 'YAML 美化（2 空格缩进规整）。',
    why: 'edge.env、Ansible 清单等 YAML 手改之后缩进容易乱，格式化一遍再贴回，避免缩进类解析报错。',
    when: ['手改 edge.env / 主机清单后规整缩进', '排查 YAML 缩进类报错'],
    how: ['左侧粘贴 YAML', '点「格式化 →」，结果落右框', '复制右侧只读结果'],
    example: {
      input: 'key: value\nlist:\n- a\n- b',
      output: 'key: value\nlist:\n  - a\n  - b',
    },
    cautions: [
      '格式化会丢弃 # 注释——需要保留注释的文件不要整段格式化后回贴',
      'Tab 缩进不合法（YAML 标准禁止 Tab），会报错提示',
    ],
  },

  /* ── JSON 对比 ── */
  diff: {
    what: '两份 JSON 的结构化对比（红=删除/旧值，绿=新增/新值），附差异统计。',
    why: '排查「配置没生效 / 两边配置不一致」时要对比平台配置与 Edge 实际、或新旧版本快照——键序不同但内容相同的 JSON 人眼比不出来。',
    when: ['对比发布前后的配置快照', '核对平台与 Edge 的 JSON 配置差异', '对比两个环境接口返回值的差异'],
    how: [
      '两栏分别粘贴 JSON A / JSON B',
      '（可选）点「两边格式化」先把两栏美化',
      '点「对比」，差异统计与逐行差异展示在两框下方',
    ],
    example: {
      input: 'A：{"a":1,"b":2}　B：{"b":2,"a":1}',
      output: '✅ 两个 JSON 完全一致，无差异（键序不同不影响结果）',
    },
    cautions: ['对比前自动按键序归一化——键序不同不算差异', '只支持 JSON；纯文本配置文件请用「文本 Diff」'],
  },

  /* ── 时间戳转换 ── */
  timestamp: {
    what: '时间戳 / 日期时间 ↔ 北京时间、UTC、epoch、ISO 8601 的对照换算（输入即算）。',
    why: '平台所有时间按 naive UTC 存储（无时区后缀的字符串，见前端展示约定），日志里则是 epoch——把库里的时间直接当北京时间看会差 8 小时。排查日志、核对数据前先在这里换算。',
    when: [
      '看到日志/数据库里的时间，想知道对应北京时间',
      '构造测试用 epoch（秒/毫秒）',
      '核对 token 过期时间等「未来时刻」',
    ],
    how: ['粘贴 epoch（10 位秒 / 13 位毫秒）或日期时间串，输入即算', '点「当前时间」快捷填入现在时刻'],
    example: {
      input: '2026-10-30 08:00:00',
      output: '北京时间 2026-10-30 16:00:00（无后缀按 UTC 解析，+8 即北京时间）',
    },
    cautions: [
      '无时区后缀的字符串按 UTC 解析（平台存储约定）；带后缀（如 +08:00）按后缀解析',
      '10 位数字按秒、13 位按毫秒识别，其他形态报「无法识别的时间格式」',
    ],
  },

  /* ── JWT 解码 ── */
  jwt: {
    what: 'JWT token 解码查看（header / payload / exp 过期状态），纯解码不验签。',
    why: '排查「为什么没权限 / 为什么掉登录」要看 token 里实际带的 sub/role/permissions/exp（及 pwd_ver 吊销版本）——在控制台手写 atob 太绕，这里粘贴即得。',
    when: [
      '从浏览器 DevTools 拿到 token，想确认里面带了什么',
      '确认 token 是否过期、还剩多久',
      '核对改密/重置后旧 token 的 pwd_ver 是否已变',
    ],
    how: ['粘贴三段式 token（. 分隔），输入即算', '查看 Header / Payload 与 exp 行的剩余时间标签'],
    example: {
      input: 'eyJhbGciOiJIUzI1NiJ9.<base64url(payload)>.<signature>',
      output: 'Payload 展示 sub/role/exp 等字段；exp 行显示「剩余 N 分钟」或「已过期」',
    },
    cautions: [
      '解码成功 ≠ token 有效——签名校验需要服务端密钥，本工具不验签',
      '不要把生产环境的 token 粘贴到外部工具网站',
    ],
  },

  /* ── YAML↔JSON 互转 ── */
  convert: {
    what: 'YAML ↔ JSON 双向转换，两框对等（左框 YAML、右框 JSON）。',
    why: '平台两域配置格式不同：Edge 的 edge.env 是 YAML、插件配置是 JSON——排查时要把一边转成另一边的形态对照，手转容易失真。',
    when: [
      '把 edge.env 片段（左框）转成 JSON 贴进相关工具排查',
      '把插件 JSON 配置（右框）转成 YAML，对照 Edge 侧实际文件',
    ],
    how: [
      'YAML 贴左框，点「转 JSON →」在右框得到 JSON',
      'JSON 贴右框，点「← 转 YAML」在左框得到 YAML',
      '复制所需一侧的结果',
    ],
    example: {
      input: 'key: value（左框）',
      output: '{"key":"value"}（右框；右框发起「← 转 YAML」可还原）',
    },
    cautions: [
      '框位即角色：左框放 YAML、右框放 JSON——误贴时 JSON 是 YAML 子集会原样透过，先核对框位',
      '转换失败会显示解析错误详情（沿用各格式既有中文文案）',
      'YAML 注释转成 JSON 后会丢失',
    ],
  },

  /* ── 文本 Diff ── */
  textdiff: {
    what: '纯文本逐行对比（红=删除，绿=新增），不做键序归一化。',
    why: 'nginx/openresty 配置、Ansible 清单等非 JSON 文本，改动前后要逐行找差异，肉眼扫长文件容易漏。',
    when: ['对比两份 nginx / openresty 配置文件', '对比改动前后的主机清单 / edge.env'],
    how: ['两栏分别粘贴文本 A / 文本 B', '点「对比」，差异统计与逐行差异展示在两框下方'],
    example: {
      input: 'A：listen 8443;　B：listen 9443;',
      output: '📊 共 1 处差异（~1 修改），该行红色旧值 / 绿色新值',
    },
    cautions: ['按原文行序严格对比，空行/空格差异也算——JSON 请用「JSON 对比」（键序无关）'],
  },

  /* ── IPv4/CIDR 计算器 ── */
  ipcalc: {
    what: 'IPv4/CIDR 网段计算器：掩码、网络/广播地址、可用范围、可用主机数、私网标注。',
    why: '录入节点、配置白名单、规划中继网段时需要确认网段边界——/24 的掩码和可用范围手算容易错。',
    when: ['节点 / 网关白名单录入前核对网段范围', '中继网关网段规划', '确认两个 IP 是否同网段（掩码对齐后比网络地址）'],
    how: ['输入 IPv4 地址或网段（如 192.168.1.10/24），缺省前缀按 /32', '输入即算，直接读对照表'],
    example: {
      input: '192.168.1.10/24',
      output:
        '掩码 255.255.255.0（0.0.0.255）· 网络 192.168.1.0 · 广播 192.168.1.255 · 可用 192.168.1.1–254（254 个）· 私网段',
    },
    cautions: ['仅支持 IPv4；非法 IP 或前缀超 32 报错提示'],
  },

  /* ── 哈希计算 ── */
  hash: {
    what: '文本摘要计算：MD5 与 SHA-1/SHA-256/SHA-512（输出小写十六进制）。',
    why: '校验备份/安装包完整性、比对两段内容是否一致时，需要用统一算法快速算摘要，不用另开终端。',
    when: ['校验脚本/备份内容的 MD5/SHA 是否与预期一致', '比对两段文本是否相同（摘要相同即内容相同）'],
    how: ['粘贴要计算摘要的文本，输入即算', '读对照表的各行结果'],
    example: {
      input: 'abc',
      output:
        'MD5 900150983cd24fb0d6963f7d28e17f72 · SHA-256 ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    },
    cautions: ['算的是文本哈希——整文件校验请取文件内容或用节点上的 md5sum', 'MD5 仅用于完整性校验，不用于安全场景'],
  },

  /* ── Keepalived 配置生成 ── */
  keepalived: {
    what: '多节点 VRRP 高可用（keepalived 单播 + VIP）全套配置生成：每节点 conf、健康检查/通知脚本、防火墙放行命令与部署手册。',
    why: 'Edge DNS 等多节点高可用部署依赖 keepalived，手工写 N 份 conf、逐节点改 router_id/priority/对端列表极易出错。本工具按输入一次性生成全部节点的配置与部署命令，节点间差异只保留该保留的五处。',
    when: ['部署 Edge DNS 高可用（VRRP 单播）', '扩容 / 调整 keepalived 节点', '核对现有 keepalived 配置的节点间差异'],
    how: [
      '填 VIP 地址与节点列表（每行一条：节点IP 网卡名，空格分隔，2–8 个）',
      '（可选）展开「高级参数」调整掩码位 / VRRP 组 ID / 优先级等',
      '复制或下载共用脚本、各节点 conf 与部署手册，按手册逐节点执行',
    ],
    example: {
      input: 'VIP 10.128.216.154 + 三节点（10.128.216.160/161/162，网卡 ens7），高级参数默认',
      output:
        '三份 keepalived.conf（priority 150/140/130、router_id EDGE_DNS_1/2/3）+ check_dns.sh 等共用脚本 + 防火墙放行命令 + 部署手册',
    },
    cautions: [
      '各节点 conf 差异仅五处：router_id / priority / unicast_src_ip / unicast_peer / interface',
      '认证密码仅前 8 字符生效；VIP 与节点不同网段会黄条提醒（按 VIP 掩码位计算）',
      '纯前端生成、不做网络连通性校验——部署前先按手册执行 keepalived -t 校验配置',
    ],
  },
}
