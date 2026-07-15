## Context

SSL 证书列表页通过 `GET /ssl` 接口加载所有证书，返回数据经过 `SslCertificateResponse` Pydantic schema 校验。该 schema 继承 `SslCertificateBase`，其中 `cert` 和 `private_key` 字段定义有 `min_length=1` 约束。从 Edge 节点导入的 SSL 证书可能包含空的 `cert` 或 `key` 字段，导致 `model_validate` 抛出 `ValidationError`，前端收到 500 响应并显示 "加载 SSL 证书失败"。

搜索框使用 `flex: 1` 占据可用空间，与其他页面固定宽度的搜索框风格不一致。

## Goals / Non-Goals

**Goals:**
- SSL 证书列表页正常加载，即使存在 cert/private_key 为空的记录
- 创建 SSL 证书时仍需校验 cert/private_key 非空
- 搜索框样式与其他页面一致

**Non-Goals:**
- 不修改 SSL 证书导入逻辑
- 不修改其他页面样式

## Decisions

### 1. Pydantic 约束分层

`SslCertificateBase` 中 `cert` 和 `private_key` 移除 `min_length=1`，改为空字符串默认值。在 `SslCertificateCreate` 中单独添加 `min_length=1` 约束。

**理由**：`SslCertificateBase` 同时作为响应和创建的基础 schema。移除基础约束使响应可以处理空值，创建时独立约束确保输入校验不丢失。

### 2. 搜索框固定宽度

将 `.search-input-wrap` 的 `flex: 1` 移除，改为固定宽度 `200px`。

**理由**：与四层代理等页面的搜索框样式保持一致，避免搜索框过长占用整行。
