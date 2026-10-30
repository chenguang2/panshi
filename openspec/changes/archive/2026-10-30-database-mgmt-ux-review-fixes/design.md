# database-mgmt-ux-review-fixes 设计

## 证据清单（真实探测，2026-10-30）

| # | 问题 | 级别 | 证据 |
|---|---|---|---|
| 1 | 弹窗「测试连接」按钮假功能 | P1 | `handleTestDraft`（DatabaseManagement.vue:326-334）仅弹「请先保存再测试」；实测点击只出 info toast；截图 db-2 |
| 2 | 当前行删除可点 | P1 | 后端 400 拦截（database.py:272-273）但 UI 无感知；截图当前行删除钮正常色可点 |
| 3 | SSL 死字段 | P1 | form.ssl 全链路存在（:251/:281/:321/:350）但模板无控件（grep 模板 0 命中） |
| 4 | 测试失败 detail 英文直出 | P1 | `_do_test_sync` str(e)；超时已中文（database.py:296）；成功「连接成功」实测 ✓ |
| 5 | 「设为当前」全表主色 | P2 | 截图 db-1：10 个 btn-primary 钮 |
| 6 | 地址列超长无省略 | P2 | 截图 db-1：`data/panshi.db.restored-20261008_015112` 全宽 |
| 7 | 无重名校验 | P2 | `create_connection` 直接 append（database.py:213-231），前端也无校验 |
| 8 | 状态点恒绿 | P2 | `.status-dot online`（:18）无条件渲染 |
| 9 | 名称 placeholder 无示例 | P2 | 「连接名称」 |
| 10 | 11 行无分页 | P3 | 裁决默认保持全量（小表白名单边缘） |

已达标不改：切换确认弹窗（重启/JWT/空库 admin/命令指引——实测 db-4 全过）、删除确认安抚语、pending_restart 卡片与提示、摘要卡权限+功能双门控、空库 a-empty。

## 关键设计决策

### D1 假测试按钮（待决 1，推荐 A）

去掉弹窗 footer「测试连接」按钮；`handleTestDraft` 删除。保存成功 toast：
- 新增：「连接已添加，可点击列表中「测试」验证可用性」
- 编辑：「连接已更新」（测试引导仅在新增时给——编辑场景用户已知）

### D2 当前行删除禁用（批 1-2）

- 模板：删除按钮 `:disabled="isActive(record)"` + 包 `.tip-host`（title「当前连接不可删除，请先切换到其他连接」）
- 后端 400 保留为最终防线（spec 已注明）

### D3 SSL 开关（批 1-3）

- postgres 模板块密码字段下方加：
  `<label class="form-check"><input type="checkbox" v-model="connModal.form.ssl" /> 启用 SSL 连接</label>`
- 编辑回显已有（:321 `ssl: record.ssl ?? false`）✓；提交链路已有（:350/:363）✓——纯补 UI

### D4 测试失败转译（批 1-4，后端 `_do_test_sync`）

```python
except Exception as e:
    msg = str(e)
    low = msg.lower()
    if 'connection refused' in low:
        detail = '连接被拒绝（数据库服务未启动或端口错误）'
    elif 'authentication' in low or 'password' in low:
        detail = '用户名或密码错误'
    elif 'does not exist' in low and 'database' in low:
        detail = '数据库不存在'
    elif 'timeout' in low or 'timed out' in low:
        detail = '连接超时'
    else:
        detail = '连接失败：' + msg
    return False, detail
```

- 不动 schema/迁移/写库路径 → 不触发 #103 PG 冒烟义务；`_do_test_sync` 既有测试回归

### D5 状态点语义（待决 2，推荐 A）

- `testResults = reactive<Record<string, 'ok' | 'fail'>>()`（内存态，刷新重置——语义诚实：状态点只反映「本会话内最近一次测试」）
- `handleTest` 成功/失败写 testResults[record.id]
- 模板：class 三态 `online`（绿）/`fail`（红）/`unverified`（中性灰）+ title「已验证连通 / 验证失败 / 未验证连通性」

### D6 重名校验（批 2-7）

- `handleSaveConnection` 保存前：`connections.value.some(c => c.name === form.name.trim() && c.id !== editingId)` → error「已存在同名连接」阻断
- 后端不加校验（软校验足够；避免动契约）

### D7 视觉（批 2-5/6）

- 非当前行「设为当前」`btn-primary` → `btn-secondary`；当前行按钮保持 disabled
- 地址列：`<span class="addr-cell" :title="record.display_address">{{ ... }}</span>` + `max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: bottom;`

## 文案对照表

| 位置 | 现文案 | 新文案 |
|---|---|---|
| 弹窗假按钮 | （按钮「测试连接」点击仅提示） | 移除；保存 toast「连接已添加，可点击列表中「测试」验证可用性」 |
| 当前行删除 tooltip | （无） | 当前连接不可删除，请先切换到其他连接 |
| SSL | （无控件） | 启用 SSL 连接 |
| 测试失败 | connection refused / password authentication failed … | 连接被拒绝（数据库服务未启动或端口错误）/ 用户名或密码错误 / 数据库不存在 / 连接超时 / 连接失败：<原始> |
| 重名 | （无） | 已存在同名连接 |
| 名称 placeholder | 连接名称 | 如：生产 PG / 本机 SQLite |
| 状态点 | 恒绿 | 未验证（灰）/ 已验证连通（绿）/ 验证失败（红）+ tooltip |

## 测试策略

- 组件测试（扩展 `DatabaseManagement.test.ts`）：当前行删除禁用+tooltip、重名阻断、SSL 开关渲染与回显、假按钮不存在、状态点三态
- 后端：`_do_test_sync` 转译单测（四分类 + 兜底前缀）——mock 异常串断言 detail
- 真实 UI：截图核对（当前行禁用态 / SSL 开关 / 状态点）
