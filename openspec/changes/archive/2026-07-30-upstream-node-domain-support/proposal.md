## Why

上游管理节点目前只支持 IPv4 地址，但 Edge API 本身支持域名（如 `foo.com:80`）。用户需要为上游节点配置域名地址的场景（如指向内部负载均衡器、K8s Service 等），当前前端校验会拦截导致无法保存。

## What Changes

- 前端 `UpstreamFormModal.vue`：节点列表的 "IP 地址" 改为 "主机/域名"，校验逻辑从纯 IPv4 扩展为自动识别 IPv4 / IPv6 / 域名并分别校验
- 后端无变更（`UpstreamTarget.target` 字段 `String(255)` 已够长，Edge API 原生支持域名）

## Capabilities

### New Capabilities
_无_

### Modified Capabilities
- `upstream-management`: 上游节点的地址字段从仅支持 IPv4 扩展为支持 IPv4 / IPv6 / 域名

## Impact

- `frontend/src/components/UpstreamFormModal.vue` — 表头文字、placeholder、校验函数 `isValidIP` → `validateHost`、编辑回填解析 `parseTarget`、IPv6 自动包装 `[]`、错误提示文案
- `frontend/src/composables/useClusterUpstreams.ts` — `UpstreamTargetForm.ip` 字段重命名为 `host`
