# DNS 代理发布失败：unknown plugin [dns_upstream]

> 发生时间：2026-09-03
> 影响范围：DNS 代理[HTTP] 发布 DoH 到特定节点失败
> 修复人：AI 助手

## 现象

DNS 代理[HTTP] 中，发布 DoH 路由到 192.168.0.13（节点 ID=11）报错：

```
Edge API error 400: unknown plugin [dns_upstream]
```

同一路由发布到 192.168.0.14（节点 ID=10）和 192.168.0.15（节点 ID=3）正常。

## 排查过程

### 1. 确认后端 API 正常

平台后端 `POST /clusters/{id}/routes/{id}/publish` 本身无问题，错误信息来自 Edge 节点的 Admin API（400 响应）。

### 2. 对比节点配置

SSH 到两个节点检查配置文件：

| 文件 | 192.168.0.13（异常） | 192.168.0.14（正常） |
|------|---------------------|---------------------|
| `conf/edge.cfg` | 无 `dns_upstream` | 无 `dns_upstream` |
| `conf/plugins.cfg` | 无 `dns_upstream` | 无 `dns_upstream` |
| `plugins/dns_upstream.lua` | 存在 | 存在 |

两个节点的 `plugins.cfg` 和 `edge.cfg` **完全一致**，且都**没有** `dns_upstream`。

### 3. 定位根因

Edge 网关（OpenResty）的插件列表在 **master 进程启动时加载**，运行时缓存在 Lua VM 中。

- 192.168.0.14：启动时 `plugins.cfg` 中曾包含 `dns_upstream`，后来配置被修改，但已加载的插件驻留在内存中 → 正常工作
- 192.168.0.13：启动时 `plugins.cfg` 中已无 `dns_upstream` → 插件未加载 → 报 "unknown plugin"

### 4. 修复步骤

#### 步骤 1：备份配置

```bash
cp /work/jboss/uapm/uap-edge/conf/plugins.cfg /work/jboss/uapm/uap-edge/conf/plugins.cfg.bak
```

#### 步骤 2：在 plugins.cfg 中添加 dns_upstream

在 `plugins:` 列表中添加 `- dns_upstream`。

#### 步骤 3：⚠️ openresty -s reload 不够！

执行 `openresty -s reload` 后再次发布，仍然报 `unknown plugin`。

**原因**：`-s reload` 只重载 nginx.conf，不刷新 Lua 层的插件列表缓存。插件列表在 master 启动时由 Lua 代码读取并缓存。

#### 步骤 4：通过 Edge Admin API 热加载插件

```
PUT /edge/admin/plugins/reload
```

响应：`"done"`

#### 步骤 5：验证发布成功

再次发布 DoH 路由到 192.168.0.13，返回 `status: "success"`。

## 关键结论

| 操作 | 能刷新插件列表 |
|------|---------------|
| `openresty -s reload` | ❌ 只重载 nginx.conf |
| `openresty -s stop && openresty` | ✅ 完整重启（有短暂中断） |
| `PUT /edge/admin/plugins/reload` | ✅ 热加载，无中断（推荐） |

## 平台操作方式

通过平台的 Edge 客户端 API 触发热加载：

```
PUT /api/v1/edge-client/nodes/{ip}/{port}/plugins/reload
```

或在节点任务中通过 `cmd_exec` 执行重启（如有必要）。

## 教训

1. **新增 Edge 插件后**，所有节点都需要确保 `plugins.cfg` 的 `plugins:` 列表中包含该插件名
2. **配置修改后**不能仅靠 `openresty -s reload`，必须通过 Admin API 热加载或完整重启
3. **排查 Edge 报错**时，优先检查节点侧的 `plugins.cfg` 和 `edge.cfg`
