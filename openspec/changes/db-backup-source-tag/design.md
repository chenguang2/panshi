# Design: 数据库备份包命名加入来源标识

## Context

- 备份包名由 `db_backup_service._package_name()` 生成，固定 `panshi_backup_{YYYYMMDD_HHMMSS}.tar.gz`（Asia/Shanghai 秒级时间戳），无来源标识
- 白名单正则硬编码两处：`db_backup_service.PACKAGE_RE`（:43，列表 + 保留清理）与 `db_restore_service.PACKAGE_NAME_RE`（:35，恢复向导列包）；`db_restore_service` 已 `import db_backup_service as bsvc`，共用常量无障碍
- `cleanup_retention()` 对远端目录**全部**白名单文件按名倒序排序、删超出 `retain_count` 的最旧份——共享目录下多实例互删备份链的根因
- `list_remote_packages()` 按 name 倒序排（时间戳命名下等价时间序）——混合来源后此排序失效，需改
- 配置为单行表 `ps_db_backup_config`（`DbBackupConfig` id=1），`DbBackupConfigUpdate` 为 PUT 载荷 schema；meta.json 已有 `format_version` 版本化机制
- 约束：文件名/路径已进远端 shell 命令（`shlex.quote` 转义）；新列必须登记 `COLUMN_MIGRATIONS`（`app/core/migrate.py`）；schema 变更合入前跑 PG 方言冒烟

## Goals / Non-Goals

**Goals:**

- 多套平台实例共享同一远端目录时：包名不冲突、保留清理只老化自己的包、恢复列表可辨识来源
- 来源标识对用户零配置可用（自动解析），又可显式固定（防漂移）
- 旧格式包在新代码下继续可见、可恢复、可自然老化（不永久堆积）

**Non-Goals:**

- 不按数据库连接区分来源（打包单元 = 整个平台实例，一个 source）
- 不改远端目录布局（不做 per-instance 子目录方案）
- 不新增"探测标识"独立 API 端点（保存/备份响应回显已解析值）
- 不回填或重命名远端已有的旧格式包
- 恢复向导不做按 source 的筛选下拉（展示列即可）

## Decisions

### D1: 标识形态 = 可配置 `source_name`，空值时**一次性解析并持久化**

- 探测顺序：**出口 IP**（UDP `connect` 到备份目标 host:port，不发真实流量，得到"目标侧看到的本机 IP"）→ `socket.gethostname()` → 兜底常量 `panshi`
- 解析时机两路收敛到一个 helper（`resolve_source_name(config_row)`，需 DB 会话则回写）：
  1. 配置保存时载荷 `source_name` 为空 → 后端解析并随配置持久化，响应回显
  2. 存量配置（新列 NULL，升级遗留）首次备份时解析并回写配置行
- 备份执行时**只读存储值**，绝不每次动态探测
- 解析顺序 IP 优先已与用户确认（2026-09-30）
- 边缘行为注记（均接受，不做专门处理）：
  - **IPv6 变形**：出口地址含 `:`，不在白名单 → 确定性清洗变形（如 `fe80::1` → `fe80--1`）。同 IP 必同名，保留清理一致性不受影响；IPv6 环境建议显式配置（表单/文档提示）。不把 `:` 加进白名单（scp/跨平台文件名兼容性差）
  - **半配置降级粘滞**：首次保存时目标主机未填（允许存半配置）→ 出口 IP 解析不了 → 落到 hostname 值并粘滞；之后补全目标再保存不会自动升级为 IP（稳定性优先于解析方式）。补救路径已有：清空字段重存即重解析
- 备选与否决：
  - *每次备份动态探测*——否决：IP 漂移（DHCP/换机）后清理认不出自己的旧包 → 永久堆积，恰是本变更要消灭的故障模式
  - *固定拼裸 IP 不可配置*——否决：多网卡取值含糊、容器环境是容器 IP、不可读不可改
- 选 IP 优先于 hostname：用户原始诉求即按地址区分；局点 hostname 可能重名（多台 `localhost.localdomain`）

### D2: 命名格式与共用正则

- 新包名：`panshi_backup_{source}_{YYYYMMDD_HH%M%S}.tar.gz`
- source 字符白名单（**配置保存校验用**）：`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`——首字符必须字母/数字（拒绝 `..`/`.x`/`-x` 开头，2026-09-30 与用户确认收紧；无路径逃逸实害，但语义收紧）。容纳 hostname 点号；禁 `/`（路径逃逸）、禁空白与引号（shell 面，与既有 `shlex.quote` 构成纵深防御）；超长/非法字符在**配置保存时**校验拒绝（422），运行期再防御性清洗
- 组合白名单正则（**单点定义于 `db_backup_service` 并导出**，`db_restore_service` 删除自有 `PACKAGE_NAME_RE` 改为导入；解析用字符类 `[A-Za-z0-9._-]+` 有意保持宽容超集——生成侧已被校验正则收紧，解析侧多接纳无实害）：

  ```
  ^(?:panshi_backup_[A-Za-z0-9._-]+_\d{8}_\d{6}|panshi_backup_\d{8}_\d{6})\.tar\.gz$
  ```

- 两分支不相交且**拆分唯一**（不变量）：时间戳后缀 `\d{8}_\d{6}` 恰占尾部 15 字符——任何匹配串的 (source, 时间戳) 拆分中时间戳被后缀强制，source 随之唯一确定；即使 source 本身形如 `host_20260101_123456` 或纯数字（如 8 位数字 source）也不产生歧义，legacy 名（总长不够"source+8+6"）喂不饱新分支 → 匹配无歧义
- 附 `parse_package_name(name) -> (source | None, ts_str)` helper：供列包排序与展示；legacy 名返回 `(None, ts)`

### D3: 保留清理语义 = 「自身 source 的包 ∪ legacy 包」

- 清理集 = {新格式且 source == own} ∪ {旧格式}；集合内按时间戳倒序保留 `retain_count` 份，删除其余
- **绝不删除其他 source 的新格式包**（可能是别机命脉）
- legacy 归入清理集的理由：升级前本机产生的旧包必须能自然老化，否则永久堆积；共享目录下多实例可竞争删 legacy——有界过渡态（legacy 终将耗尽），风险不劣于升级前的全局排序现状
- 用户中途改 `source_name` 的后果：旧 source 的包变"他人"→ 本机不再清删（搁浅）。缓解：配置表单提示 + 设计文档注明手工清理；"清删全部白名单文件"的备选被否决——那就是互删 bug 本身

### D4: 列表排序改按时间戳

- `list_remote_packages()` 现按 name 倒序（时间戳命名的隐含时间序）——混合 source 后 name 序先按 source 字典序，时间序被破坏
- 改为按 `parse_package_name` 解析的时间戳倒序（解析失败的排序放末尾兜底 mtime）；恢复向导跨 source 列包必须呈现真实时间序

### D5: meta.json 与恢复展示

- `meta["source"] = source_name`（随 `format_version` 既有版本化机制自然向后兼容，旧包无此键）
- **文件名解析是来源标识的唯一事实来源**（2026-09-30 与用户确认）：排序、保留清理、列表展示全第一致；meta 的 `source` 字段仅作核对，不一致时标注"包被改名过"（可检出的手工改名场景）
- `RestorePackageItem` 增加 `source: Optional[str]`：从文件名解析；文件名无 source（legacy）则为 None，前端显示"—"
- 恢复向导列表新增「来源」列

### D6: 模型 / 迁移 / schema

- `DbBackupConfig.source_name = Column(String(64), nullable=True)`
- **登记 `COLUMN_MIGRATIONS`**（漏登记 → 启动 crash-loop，教训 #118）
- `DbBackupConfigUpdate.source_name: Optional[str] = Field(None, max_length=64, pattern=白名单)`；`DbBackupConfigResponse.source_name: Optional[str]`
- 空串与 None 等同处理为"未填 → 自动解析"（Pydantic pattern 只约束非空值）
- 函数签名随之演化：`_package_name(source, now)`、`build_package(..., source)`（写 meta）、`cleanup_retention(..., source)`

### D7: 容灾恢复继承来源标识（维持继承 + 提示）

- 恢复落位把站点库整库恢复，`DbBackupConfig` 行（含 `source_name`）随包恢复 → **新机继承旧机标识**（2026-09-30 与用户确认：维持继承，不重解析、不加后缀）
- 真 DR（旧机已废）时这是优点：保留清理连续性——旧机的包被新机视为己方 source，继续自然老化，不搁浅不堆积
- 双跑/迁移（旧机还活着）时两机同 source → 互删语义回归。缓解：**恢复完成提示附来源标识检查提醒**（显示继承值，如共享目录双跑需人工改）；风险节记录
- 备选与否决：*恢复时清空重解析*——旧包变"他源"永不清删（堆积）；*自动加 -restored 后缀*——标识永久变形且同样丢失清理连续性

## Risks / Trade-offs

- [回滚到旧版代码] 新格式包不匹配旧正则 → 旧代码列表不可见、清理不管 → 永久堆积。→ 缓解：回滚操作手册注明手工删除新格式文件；接受（回滚是罕见路径）
- [source 漂移] 换机/换 IP 后重新自动解析出不同值 → 旧包搁浅。→ 缓解：一次性解析持久化 + 表单提示"多机共享目录时建议显式固定标识"
- [过渡期 legacy 竞争删除] 共享目录多实例都可删 legacy 包。→ 有界、随 legacy 耗尽收敛、不劣化于现状；文档标注
- [两实例配了相同 source_name] 退化为现状语义（时间戳区分、秒级撞名覆盖仍在）。变体：**自动解析全链路失败双双落兜底常量 `panshi`** 同样撞名（极低概率）。→ 表单/文档提示共享目录必须配不同标识；接受
- [恢复继承后双跑] 恢复落位继承旧机 source_name，旧机仍在运行时两机同 source 互删回归（D7）。→ 恢复完成提示检查来源标识（显示继承值）；真 DR 场景继承是正确行为
- [测试盲区] 正则与清理语义是纯函数逻辑，可全覆盖单测；SSH 侧沿用现有 fake `_remote_exec` 测试模式，无需真实远端

## Migration Plan

1. 部署：`COLUMN_MIGRATIONS` 自动补列，存量配置行 `source_name` 为 NULL——无数据回填
2. 升级后首次备份：解析并回写 source → 开始产生新格式包
3. 远端旧格式包经由「own ∪ legacy」清理自然老化退出
4. 回滚：还原代码即可（列残留无害）；新格式包按手册手工清理

## Open Questions

（无——均已拍板；实现期如遇 UI 细节冲突按既有设计文档 `docs/design/sqlite-backup-dr.md` 优先级处理并同步更新该文档）
