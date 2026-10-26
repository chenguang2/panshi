# Design: cluster-backup-restore-fix

## 根因链（已实锤，2026-10-26 排查）

```
build_backup._serialize          →  全列导出，datetime → ISO 字符串（last_published_at = "2026-10-20T06:56:31"）
import_backup._entity_kwargs     →  _DROP_KEYS 只丢 id/cluster_id/current_version/created_at/updated_at
StaticResource(**kwargs)         →  last_published_at 仍为 str
db.commit() (cluster_backup.py:463)  →  SQLite DateTime bind processor 拒绝 str
                                 →  StatementError → except Exception: rollback → raise
api 层无转译                      →  500 {"detail": "服务器内部错误"}
```

触发条件：源集群存在任一曾发布过的静态资源。`last_published_at` 是全部参与备份模型中唯一 created_at/updated_at 之外的时间列——今日必现，昨日（列全 NULL 时代）不可现。

证据：`backend/logs/app.log` 2026-10-23 17:28–17:31 三次同错（用户真实操作）；test 集群（id=4）导出→导入 100% 复现 500，回滚无库残留，但 `data/static/<edge_uuid>/1.zip` 落盘残留（第二缺陷实证）。

## 决策

### D1 时间矫正放 `_entity_kwargs` 通用层，不逐列打补丁

`_entity_kwargs(item, cluster_id, model)` 已持模型引用（BAK-08 白名单处）。在其白名单过滤后追加一步：遍历 `sa_inspect(model).columns`，对 `DateTime`/`Date` 类型列，若值为 `str` 则 `datetime.fromisoformat()` 解析（容错 `Z` 后缀 → naive UTC；解析失败置 None）。railroad 与 BAK-08 同 philosophy：按模型元数据按类修，新列自动免疫。

- 备选「把 last_published_at 加进 _DROP_KEYS」：只堵一列，下一列重演；且运行态列语义处置见 D2，两件事分开做。

### D2 运行态发布状态列加入导入丢弃清单

`_RUNTIME_STATE_KEYS = ("last_publish_ok", "last_publish_detail", "last_published_at")`，在 static_resources 分支从 kwargs 剔除（不放全局 `_DROP_KEYS`——其他表无这些列，全局化无意义但也无害；放 static 分支更精确）。语义依据：导入产物是未发布新集群（cluster status=1、node status=0），继承源集群「已发布 ok」痕迹 = 状态说谎。

### D3 Cluster 导入从硬编码改模型感知映射

现状 `Cluster(name=…, display_name=…, description=…, group_name=…, admin_url=…, status=1, creator_id=…)` 漏 `region_code`。改为：`kwargs = _entity_kwargs(src, cid, model=Cluster)` 后强制 `kwargs["name"] = target_cluster_name`、`kwargs["status"] = 1`、剔除 `creator_id`/`admin_key`（后者导出侧已排除，双保险）。`region_code` 等业务列自然流入。区域绑定改变后的网关白名单语义（约定 #50：绑定≠白名单，需下发配置）不受本变更影响——导入的是未发布集群，发布引导链路已有。

### D4 静态资源落盘移到 flush 全成功后 + 失败清理

时序改为：静态资源行先收集 kwargs（含 content 解码），全部分支 flush 成功后统一写盘，再 commit；`except` 路径 rollback 后对本次已写文件逐个 `unlink(missing_ok=True)`（记录待清理清单）。备选「commit 后写盘」会把文件写盘失败暴露成「库已提交但文件缺失」——比孤儿文件更糟，不取。

### D5 错误转译在 service 出口，API 层只映射状态码

`import_backup` 的 `except Exception` 分支：先 rollback，再将异常分类——`ValueError` 原样上抛（现有 400 路径）；SQLAlchemy `StatementError`/其他 → 上抛 `ValueError("导入失败：<表/资源定位>：<简短原因>")`。API 层现有 `except ValueError → 400` 自然承接，前端 `useClusterBackup` 已渲染 `detail.errors` 数组——前端零改动。不在 API 层吞 500 转假 400（丢失服务端日志），日志仍记原始堆栈。

## 不做（本轮）

- 备份文件 format version 升级（无格式变更，不需要）。
- 导入前文件预解析预览（属统一管理 UX 变更范围：`central-management-ux-review-fixes`）。
- expected_checksum 前端接线（同上，UX 变更统一处理）。
- 整库级恢复（约定 #17：走数据库管理，不造保号模式）。

## 浓缩回归面

- 新增：`tests/test_cluster_backup_import_datetime.py`（RED→GREEN：含已发布静态资源的备份导入成功 / 时间列非字符串 / region_code 保留 / 运行态三列清空 / 失败无孤儿文件——monkeypatch 让 commit 前抛错断言磁盘）。
- 既有：`tests/test_cluster_backup*.py` 全量回归；约定 #103 PG 方言冒烟（本次无 schema 变更，但触及写库路径，照跑）；约定 #51④ 同域回归 `pytest -k "backup"`。
