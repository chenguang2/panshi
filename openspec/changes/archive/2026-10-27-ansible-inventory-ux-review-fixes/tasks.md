# tasks: ansible-inventory-ux-review-fixes

> 决策点 1–3 待用户裁决；下列任务按推荐分支（1A/2A/3B）编写，裁决后按 design.md B 分支落差微调。批准前不动代码。

## 批 1 · 护栏与恢复（P1-1/2；决策 1/2）

- [x] 1.1 RED：raw_text 保存护栏用例——删除受管 IP → 400 删除保护文案 + 无写盘；主机键非法 → 400 + 无写盘；含全部平台 IP 的合法 raw → 仍 200（既有 `test_put_raw_text_saves_and_backs_up` 回归）
- [x] 1.2 GREEN：`put_inventory` raw 分支补 `validate_structure(platform_node_ips)`（400 join 全量，与 hosts 路径统一）；既有断言反转清点（#217）
- [x] 1.3 RED→GREEN：`GET /ansible/inventory/backups`（name/saved_at/size 倒序，`host.bak.*` 形态校验防穿越）+ `GET .../backups/{name}/content`（只读预览）
- [x] 1.4 RED→GREEN：`POST .../backups/{name}/restore`——以备份内容走全护栏（409 互斥 → parse → validate_structure → save_inventory）；审计 `恢复 Ansible 主机清单备份 {name}`；恢复被拒 400/409 如实透出
- [x] 1.5 前端「恢复记录」抽屉：备份列表（时间倒序）+ 只读预览 + 恢复确认弹窗（覆盖说明 + 「当前清单将先被自动备份，可再次恢复」语义）；恢复成功后重载清单
- [x] 1.6 PG 方言冒烟触发式评估记录（#103）：无模型/SQL/序列化变更，预期不触发；后端域内 `pytest -k "inventory or ansible"` 绿
- [x] 1.7 【批 1.2 实测揭示 → 用户裁决 A】删除保护收窄为基线口径：`validate_structure` 增 `previous_host_ips`（removed = 保存前清单 ∩ 平台 − 提交）；三调用点接基线；断言反转清单落地（既有 hosts 400 用例补基线、服务级两用例反转、A 口径差异用例 ×3）；文案 IP 去重（多集群同 IP 实测 ×13）；restore 审计显式映射 `ansible_inventory.restore`

## 批 2 · 反馈与表单（P2-3/4/5/6 + P3-7）

- [x] 2.1 RED→GREEN：GET 响应带 `last_modified`（mtime naive UTC，缺失 null）；保存成功 toast「已保存并生效：N 台主机」（表格=组装后 N，源码=parse 后 N）；页头「操作日志」入口 + 「清单最后修改」元数据行（`utils/format.ts` 时间）
- [x] 2.2 RED→GREEN：批量导入预览——`parseBulkHosts` 增 `isHostnameKey`；双摘要（将新增 N 台 / 将覆盖 M 条）+ 非 IP 主机键黄色警示行 + placeholder 口径文案更新
- [x] 2.3 RED→GREEN：高级校验错误定位——`validateRowsAdvanced` 结构化返回；失败自动展开首错行 + 滚动定位 + `AnsibleAdvancedFields` 行内标红（errors prop）；toast 汇总降级为辅助；组级错误同理
- [x] 2.4 空源码切换表格的引导文案（前端转译，不写盘）；页头 description 精简（保留一句明文口径说明）
- [x] 2.5 组件测试反转清点复核（#217）：`AnsibleInventory` 既有测试（如存在）逐项核对；新增组件测试（备份抽屉/导入预览/校验定位）挂 a-table 桩约定

## 批 3 · 打磨收尾（P3-8/9）

- [x] 3.1 列头「SSH 密码（明文）」收敛为「SSH 密码」+ 组级卡副标题统一明文口径说明
- [x] 3.2 保存后保持行展开态：稳定行键（加载期 index+ip 生成，WeakMap 兜新增行）
  - 实现：`applyServerStructure` 加载期按 `stableRowKey(index, ip)`（FNV-1a）注册键，`rowKeyOf` 经 `toRaw` 归一后查 WeakMap、新增行走自增兜底；`load()` 不清空 `expandedKeys` → save→load 后同名主机取回同键，展开态保持；组件测试「保存后重载：行键稳定」钉死
- [x] 3.3 收口：`npx vitest run --no-file-parallelism` 全量绿；`npx vue-tsc -b` 0 error；`uv run pytest` 全量绿；真页 Playwright 走查（护栏 400/备份抽屉/恢复链路在 test 环境实测后还原/导入预览/校验定位/保存反馈）+ 现场还原
## 批 4 · 删除保护彻底移除（2026-10-27 用户二次裁决，design D9）

- [x] 4.1 RED：API 层断言反转——hosts 删除受管 IP → 200 写盘；raw 删除受管 IP → 200 写盘；恢复缺受管 IP 的备份 → 200 写盘（基类用例被子类继承，反转一次覆盖四组）
- [x] 4.2 GREEN：`validate_structure` 收窄为纯结构校验（去 `platform_node_ips`/`previous_host_ips`）；删 `_current_host_ips()`；三调用点只传 `doc`；`_platform_node_ips` 保留（GET unmanaged_ips 仍用）
- [x] 4.3 服务级三删除保护用例删除（#30：端到端行为由 API 层钉死，不加同行为替代用例）；`TestRawTextGuard`/`_platform_ips` docstring 同步
- [x] 4.4 前端文案残留清理（错误 toast 注释、空列表用例标题去「删除保护由后端拦截」措辞）
- [x] 4.5 delta spec：ADDED「保存护栏跨载荷形态一致」改为纯结构校验口径 + MODIFIED「表格视图编辑」整块替换（主 spec「删除平台已录入的主机被阻止」场景标题保留作稳定标识符、正文反转，替换块取自主 spec 现文 #53）；`openspec validate` 通过
- [x] 4.6 收口：`pytest -k "inventory or ansible"` 213 绿；全量 `uv run pytest` 绿；前端涉及文件 vitest 绿
- [x] 4.7 恢复记录 saved_at 时区修正（2026-10-27 用户实测 +8h）：备份文件名是 `save_inventory` 的本地墙钟，`list_backups` 原样透出被前端按 UTC 解析（12:35:32 → 20:35:32）；改为 API 边界转 naive UTC（#26 口径，文件名保持本地墙钟不动，防打乱 `_rotate_backups` 按名排序）；服务级 TZ 参数化用例（Asia/Shanghai / UTC）+ 既有 API 用例钉 TZ=UTC 反转

## 收尾说明

- 真页证据（批 3）：恢复记录抽屉列表/预览（截图 02）、批量导入双摘要+非 IP 警示（03）、删除保护 400 toast（04，去重后 12 IP；**批 4 后该护栏已移除，此截图仅为历史证据**）、保存成功 toast「已保存并生效：3 台主机」+ last_modified 刷新（05）、保存后展开态保持 expanded=1（06）；幂等保存/幂等恢复 API 实测指纹一致；操作审计 save/restore 两条落库
