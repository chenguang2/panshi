# 数据库备份包命名加入来源标识

## Why

备份包名固定为 `panshi_backup_{YYYYMMDD_HHMMSS}.tar.gz`（秒级时间戳，无来源标识）。多套平台实例共享同一远端备份目录时：① 两实例同秒触发会同名静默覆盖（`.part` 上传后原子改名）；② 更严重的是保留清理对目录内**全部**白名单文件按名全局排序、只保留最新 `retain_count` 份——高频实例会把低频实例的备份链整体顶出保留窗口，造成**静默的容灾数据丢失**；③ 恢复向导列包时无从分辨包来自哪套平台。

## What Changes

- 备份配置新增**来源标识** `source_name`：可配置；未配置时自动探测本机标识（探测策略与清洗规则见 design），经字符白名单清洗后进入包名
- 备份包命名变更为 `panshi_backup_{source}_{YYYYMMDD_HHMMSS}.tar.gz`
- 远端白名单正则**兼容新旧两种格式**（`db_backup_service.py` 与 `db_restore_service.py` 各自硬编码一份）：旧格式包在列表与保留清理中继续可见，不失效、不永久堆积
- 保留清理改为**按自身 source 过滤后**再计算保留份数，消除共享目录下的互删
- 恢复向导远端包列表接受新格式并展示来源标识；恢复落位**继承**包内来源标识（保证旧包保留清理连续），完成提示附来源标识检查提醒（防双跑同源互删）
- meta.json 记录 source_name，供恢复侧展示与核对
- 同步更新设计文档 `docs/design/sqlite-backup-dr.md` 的命名约定

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `sqlite-remote-backup`：
  - 「SSH 推送与远端保留清理」需求变更——包命名加入来源标识、白名单正则兼容新旧格式、保留清理按来源过滤（原全局排序语义作废）
  - 「备份配置模型与安全存储」需求变更——配置模型新增 `source_name` 字段（含清洗校验）
  - 「备份包内容与环境一致性」需求变更——meta.json 记录 source_name
- `sqlite-backup-restore`：
  - 「远端备份列表与包内容明示」需求变更——列表接受新旧两种包名格式，展示各包来源标识
  - 「落位与激活」需求变更——恢复继承来源标识 + 完成提示附来源标识检查提醒

## Impact

- **后端**
  - `app/services/db_backup_service.py`：包名生成、白名单正则、保留清理过滤
  - `app/services/db_restore_service.py`：列包正则
  - `app/models/db_backup.py`：`DbBackupConfig` 新列 `source_name` → **必须登记 `COLUMN_MIGRATIONS`**（`app/core/migrate.py`，约定 #118）
  - `app/schemas/db_backup.py`：配置请求/响应结构
  - `app/api/v1/db_backup.py`：配置保存链路
- **前端**
  - `components/DbBackupCard.vue`：配置表单增加来源标识输入（含自动探测值的展示）
  - `components/DbBackupRestoreWizard.vue`：包列表展示来源标识
  - `types/dbBackup.ts` / `api/dbBackup.ts`：类型与 API 字段
- **文档**：`docs/design/sqlite-backup-dr.md` 命名节与保留清理语义
- **测试**：`tests/` 下 db_backup / db_restore 相关用例（TDD：先写失败测试）；涉及 schema 变更，合入前跑 PG 方言冒烟（约定 #103）
- **兼容性**：远端目录中新旧格式包并存；升级前旧格式包的清理归属策略在 design 中定夺
