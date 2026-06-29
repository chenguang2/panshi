## 1. DB Migration

- [x] 1.1 给 `ps_stream_proxy` 表增加 `hash_on`, `key`, `checks`, `retries`, `retry_timeout` 列

## 2. Backend Schemas

- [x] 2.1 `StreamProxyBase` / `StreamProxyUpdate` 增加 `hash_on`, `key`, `checks`, `retries`, `retry_timeout` 字段
- [x] 2.2 `StreamProxyResponse` 增加 `checks` JSON 字段验证器

## 3. Backend Publish API

- [x] 3.1 发布时传递 `hash_on`/`key`、`retries`/`retry_timeout`、`checks` 到 Edge

## 4. Frontend Form

- [x] 4.1 一致性哈希时显示 hash key（写死 `remote_addr`）
- [x] 4.2 高级配置增加重试次数和重试超时
- [x] 4.3 高级配置增加健康检查 JSON 编辑
- [x] 4.4 移除 Remote Addr 和 SNI 输入框
- [x] 4.5 提交数据时发送新字段，不再发送 remote_addr/sni

## 5. 验证

- [x] 5.1 LSP diagnostics + build
