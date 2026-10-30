# Tasks — 审计日志模块体验优化

> 执行约定：TDD（先失败测试再实现，约定 #16）；每批收口跑该域既有测试 + `npx vue-tsc -b`；批间可独立交付。批 3 依赖待决项 3/4 裁决结果，批 1/2 不受影响。

## 批 1 — 文案与视觉（纯前端，低风险）

- [x] 1.1 统计文案：`筛选结果 X 条 · 全库共 Y 条（最早 …）`（组件测试断言两数来源分别绑定 list.total / meta.total）
- [x] 1.2 默认时间范围近 7 天（修复 spec 漂移；断言首次加载请求带 start/end，且「今天」起算含当天）
- [x] 1.3 range-picker 快捷项 今天/近 7 天/近 30 天（断言点击后 range 值与 reload(1)）
- [x] 1.4 操作标签视觉编码（danger/success/neutral 三态；断言 delete 族红、create 族绿、其余中性）
- [x] 1.5 资源列合并「{中文名} #{id}」（列定义变更；断言表头无「资源ID」、单元格合并形态；空 id 仅名称）
- [x] 1.6 未知动作兜底 `未识别（{raw}）`（auditResourceRoutes 单测反转既有「原样返回」断言）
- [x] 1.7 错误/提示文案按 design §4 对照表更新（导出未就绪/归档预览失败/复制失败）
- [x] 1.8 批 1 收口：AuditLog 既有组件测试全绿 + `npx vue-tsc -b` 0 错误
- [x] 1.9 验收后调整（2026-10-29）：列序改「时间/用户/资源/操作」自然语序；操作标签只显动词（auditVerbLabel，tooltip 全称+原始值）；宽度实测重排 资源 160/操作 150（原重叠根因：标签含资源全名 135px > 列宽 130px）
- [x] 1.10 验收后调整（2026-10-29）：操作下拉按已选资源联动过滤（auditActionResource 解析 resource_verb 资源段，特殊形态走覆盖表；资源切换清失配动作）；补齐真实词表 4 个未识别动作标签；下拉浮层 popupMatchSelectWidth=false

## 批 2 — 交互修复（前端为主，中风险）

- [x] 2.1 移除全部列头 sorter（待决项 1A；反转既有 sorter 断言；若用户选 B 则改为后端排序参数并补后端测试）
- [x] 2.2 资源跳转改 router.push（goto 重构；断言不再触发整页导航）
- [x] 2.3 映射表扩展高频 6 类（待决项 2A；upstream/route/node/user/ssl_cert/node_task → 对应路由；逐一验证目标路由存在）
- [x] 2.4 筛选下拉 a-select showSearch（用户/操作/资源三处；保留深链 resource= 预选兼容）
- [x] 2.5 后端 meta 增 `ips`（distinct 非空；后端测试）+ 前端 IP 下拉（待决项 4A）
- [x] 2.6 导出收敛单路径：移除 ≤5000 前端分支（组件测试反转为后端路径断言；REMOVED requirement 对应）
- [x] 2.7 导出范围感知：>50000 warning 文案；点击后「将导出当前筛选结果 N 条」提示
- [x] 2.8 批 2 收口：全量 AuditLog 测试 + `npx vue-tsc -b` + 后端 system 相关 pytest

## 批 3 — 归档与检索补全（依赖后端）

- [x] 3.1 后端 `GET /operations/archives`（列表：文件名/大小/归档时间；`require_permission('audit_logs')` + feature 门控）
- [x] 3.2 后端 `GET /operations/archives/{filename}/download`（路径穿越防护：basename 校验；blob 鉴权下载）
- [x] 3.3 安全守卫：两个新端点加入 `tests/test_security_guard.py` UNAUTHENTICATED_SAMPLES（约定 #19）
- [x] 3.4 前端归档历史抽屉（列表 + 下载 + 空态文案；断言 blob 下载带 Authorization）
- [x] 3.5 后端 list 端点 `keyword`（detail ilike + 纯数字时 resource_id 精确）与 `ip` 参数（后端过滤测试）
- [x] 3.6 前端搜索框（placeholder `搜索详情 / 资源ID`，回车生效回第 1 页；与既有筛选 AND 组合断言）
- [x] 3.7 批 3 收口：`pytest -k "operations or audit"` + 前端 AuditLog 全量 + `npx vue-tsc -b`
- [x] 3.8 交付验收：test 集群真实操作一轮（筛选/导出/归档历史下载/关键字检索），页面截图对照 design-sample.html；真实验收发现共享目录串扰（data/archives/ 亦存放数据库归档文件）——归档历史/下载已收窄为 audit_archive_*.csv 白名单，回归 117 passed
