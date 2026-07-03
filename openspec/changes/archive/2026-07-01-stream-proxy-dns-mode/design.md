## Context

当前 StreamProxyFormWizard 支持创建普通四层代理（TCP/UDP 转发）。需要增加 DNS 服务器模式，配置文件完全不同。因此在步骤 1 就选择模式，步骤 2 根据模式渲染不同表单。

## Goals / Non-Goals

**Goals:**
- 步骤 1 增加代理类型选择（普通 / DNS）
- DNS 模式步骤 2 展示域名映射配置 + 高级配置
- 普通模式步骤 2 保持现有界面不变
- 发布时 DNS 模式携带 `dns_upstream` 插件配置

**Non-Goals:**
- 不支持 `dns_server` 插件（当前只做 `dns_upstream`）

## Decisions

### Decision 1: 步骤 1 增加代理类型 Radio
步骤 1 的端口选择区域下方增加两个 radio 按钮，默认选中「普通四层代理」。选择 DNS 后，步骤 2 完全切换。
编辑时也展示当前代理类型，允许切换，切换时弹窗警告会丢弃当前配置数据。

### Decision 2: 协议选择改为三态（公共逻辑）
步骤 2 的协议选择从 TCP/UDP 切换改为三个选项：TCP、UDP、TCP+UDP。
- 选「TCP+UDP」时，Edge body 不传 `protocol` 字段（表示支持两者）
- DNS 模式下固定 UDP 不可修改

### Decision 3: DNS 模式步骤 2 表单设计
- 名称：输入框
- 协议：固定 UDP（灰色不可改，沿用公共协议选择组件）
- 监听端口：显示已选端口，不允许修改
- 域名配置：可添加多个域名，每个域名下可配置多个目标节点
  - 每个目标节点：目标IP:端口 + 客户端CIDR（可选）
  - 每个域名可选负载均衡算法（默认 roundrobin）
- 高级配置（折叠）：超时、连接池、健康检查

### Decision 4: 存储
- DB 中 `StreamProxy` 新增 `proxy_type` 字段（normal / dns）
- 新增 `dns_config` JSON 字段存储 DNS 域名映射配置（hosts 结构）
- `dns_config` 与 `targets` 字段互斥，根据 proxy_type 决定使用哪个

### Decision 5: 发布（Edge API body）
普通模式保持现有 body 结构不变。DNS 模式 body 结构：
```json
{
  "server_port": 53,
  "protocol": "UDP",
  "name": "dns-server",
  "plugins": {
    "dns_upstream": {
      "hosts": {
        "test.local": {
          "nodes": {"10.0.0.1:53": ["127.0.0.1"], "10.0.0.2:53": ["192.168.0.0/16"]},
          "type": "roundrobin"
        }
      }
    }
  }
}
```
- 普通模式：不传 `protocol` 字段（兼容）
- TCP+UDP 都选：不传 `protocol` 字段
- DNS 模式：固定传 `"protocol": "UDP"`，无 `upstream` 字段

### Decision 6: 列表展示
卡片上增加「DNS」标签区分模式。

### Decision 7: 编辑时允许切换模式
- 编辑加载时统一先进 step 1，展示当前代理类型
- 切换模式弹窗确认：「切换代理类型将丢弃当前配置，是否继续？」
- 切换后清空对应模式的配置数据

### Decision 8: 高级配置复用
DNS 模式的高级配置（超时/连接池/健康检查）与普通模式共用同一个展开区域。
