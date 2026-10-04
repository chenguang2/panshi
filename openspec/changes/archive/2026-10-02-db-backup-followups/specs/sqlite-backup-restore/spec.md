# sqlite-backup-restore Delta

## MODIFIED Requirements

### Requirement: 远端备份列表与包内容明示
系统 SHALL 列出远端目录中的备份包（仅白名单文件名——与备份侧共用的组合正则，同时接受新格式 `panshi_backup_{source}_{时间戳}.tar.gz` 与升级前旧格式；忽略 .part 残留），**排序 MUST 按包名中解析出的备份时间戳倒序**（混合来源下文件名字典序不再等价于时间序）；列表 MUST 展示各包的**来源标识**（**文件名解析是唯一事实来源**，与备份侧排序/清理同源；旧格式包无来源标识时显示为未知；meta 的 source 字段仅作核对，与文件名解析不一致时标注包被改名过）与 meta 摘要（备份时间、app 版本标识、包体积、skipped 库清单、未包含的 B 类数据段）；列表「备份于」时间 SHALL 正常渲染——后端新包 meta 记录裸 ISO8601 本地时间，前端解析 SHALL 兼容剥离存量「（Asia/Shanghai）」注记后缀格式，MUST NOT 出现 Invalid Date；新机版本标识与备份包可比较且低于备份包时 MUST 给出明确提示（不可比较时不提示、不阻断）；下载前 MUST 校验文件仍存在，已被清理则提示刷新列表。

#### Scenario: 列表展示与版本提示
- **WHEN** 用户输入可达的远端目标
- **THEN** 列出全部备份包及摘要；若版本可比且备份包版本高于本机，对应条目出现版本差异提示

#### Scenario: 新旧格式并存可见
- **WHEN** 远端目录同时存在升级前旧格式包与多台机器的新格式包
- **THEN** 列表全部展示，新格式条目各自显示来源标识，旧格式条目来源标识显示为未知

#### Scenario: 混合来源按时间排序
- **WHEN** 不同来源标识的包在时间上交错存在
- **THEN** 列表按各包文件名中的时间戳倒序排列，而非文件名字典序

#### Scenario: 备份时间渲染兼容存量注记格式
- **WHEN** 列表渲染包的「备份于」时间（新包为裸 ISO8601，存量包带「（Asia/Shanghai）」注记后缀）
- **THEN** 两种格式 SHALL 均正常解析显示，MUST NOT 出现 Invalid Date

#### Scenario: 包内缺失段明示
- **WHEN** 选定包备份时未勾选 task-logs 与 static
- **THEN** 列表/选包页明示「本包不含：static、task-logs」，以及 skipped 库清单（若有）

#### Scenario: 列表包已被清理
- **WHEN** 用户选择某包发起下载但该文件已被远端清理
- **THEN** 提示包不存在并建议刷新列表
