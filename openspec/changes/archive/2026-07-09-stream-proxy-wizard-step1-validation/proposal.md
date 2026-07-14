## Why

四层代理创建向导第一步（端口选择）中，只要手动输入了有效端口就可以点击"下一步"，没有校验集群和节点是否已选择。用户可能漏选必填项就进入下一步，造成体验不一致。

## What Changes

- `canGoNext` 增加集群和节点的必填校验
- `goToStep2()` 点击时校验集群/节点/端口，显示内联错误
- 集群和节点下拉框增加 `@blur` 实时校验

## Capabilities

### New Capabilities

无

### Modified Capabilities

- `stream-proxy-management`: 四层代理创建向导第一步增加必填项校验

## Impact

| 文件 | 改动 |
|---|---|
| `frontend/.../StreamProxyFormWizard.vue` | `canGoNext`、`goToStep2()`、集群/节点 `@blur` 校验 |
