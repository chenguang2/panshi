## 1. 前端校验 + 字段重命名

- [x] 1.1 `frontend/src/components/StreamProxyFormWizard.vue`: 新增 `validateHost` / `buildTarget` / `parseTarget` 函数
- [x] 1.2 `frontend/src/components/StreamProxyFormWizard.vue`: 保留 `IP_PATTERN`（DNS 校验仍需使用）；普通 target 校验从 `IP_PATTERN.test(t.ip)` 改为 `validateHost(t.host)`
- [x] 1.3 `frontend/src/components/StreamProxyFormWizard.vue`: 普通 target 类型 `{ ip, port, weight }` → `{ host, port, weight }`

## 2. 编辑回填解析

- [x] 2.1 `frontend/src/components/StreamProxyFormWizard.vue`: 编辑预填时 `t.target.split(':')` 替换为 `parseTarget(t.target)`，返回字段 `ip` → `host`

## 3. 提交包装

- [x] 3.1 `frontend/src/components/StreamProxyFormWizard.vue`: `handleSubmit` 中 `${t.ip}:${t.port}` 改用 `buildTarget(t.host, t.port)`

## 4. UI 文案

- [x] 4.1 `frontend/src/components/StreamProxyFormWizard.vue`: 表头 "IP 地址" → "主机/域名"
- [x] 4.2 `frontend/src/components/StreamProxyFormWizard.vue`: placeholder "IP 地址" → "主机地址（IP 或域名）"
