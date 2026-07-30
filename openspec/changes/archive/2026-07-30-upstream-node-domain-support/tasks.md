## 1. 前端校验函数

- [x] 1.1 `frontend/src/components/UpstreamFormModal.vue`: 新增 `validateHost` 函数，自动识别 IPv4 / IPv6 / 域名并分别校验，返回具体错误信息
- [x] 1.2 `frontend/src/components/UpstreamFormModal.vue`: 保留 `IP_PATTERN` 供 IPv4 校验专用，移除 `isValidIP` 函数

## 2. 前端编辑回填解析

- [x] 2.1 `frontend/src/components/UpstreamFormModal.vue`: 新增 `parseTarget(target: string)` 函数，智能解析 `target` 字符串为 `{ host, port }`

## 3. IPv6 括号自动包装

- [x] 3.1 `frontend/src/components/UpstreamFormModal.vue`: 新增 `buildTarget(host, port)` 函数，IPv6 自动加 `[]`，在 `handleSubmit` 中使用

## 4. IP → Host 字段重命名

- [x] 4.1 `frontend/src/composables/useClusterUpstreams.ts`: `UpstreamTargetForm` 中 `ip: string` → `host: string`
- [x] 4.2 `frontend/src/components/UpstreamFormModal.vue`: 将所有 `t.ip` 引用替换为 `t.host`

## 5. 前端 UI 文案

- [x] 5.1 `frontend/src/components/UpstreamFormModal.vue`: 节点列表表头 "IP 地址" → "主机/域名"
- [x] 5.2 `frontend/src/components/UpstreamFormModal.vue`: 输入框 placeholder "IP地址" → "主机地址（IP 或域名）"
- [x] 5.3 `frontend/src/components/UpstreamFormModal.vue`: 更新 `validateForm` 中节点错误提示，根据 `validateHost` 返回的具体信息显示
