## 1. 后端

- [x] 1.1 StreamProxy 模型增加 `proxy_type`（normal/dns）、`dns_config`（TEXT/JSON）字段
- [x] 1.2 迁移脚本：增加 `proxy_type`、`dns_config` 列
- [x] 1.3 Schema: StreamProxyBase/Update 增加 `proxy_type`、`dns_config` 字段
- [x] 1.4 发布 API：DNS 模式组装 `plugins.dns_upstream.hosts` body；普通模式保持现有逻辑
- [x] 1.5 发布 API：`protocol` 字段逻辑（TCP+UDP→省略，单协议→传对应值）
- [x] 1.6 创建/更新 API：处理 `dns_config` JSON 存储

## 2. 前端 StreamProxyFormWizard

- [x] 2.1 步骤 1 增加代理类型 radio 选择（创建+编辑）
- [x] 2.2 编辑时切换模式弹窗警告
- [x] 2.3 协议选择改为三态：TCP/UDP/TCP+UDP（公共逻辑）
- [x] 2.4 DNS 模式步骤 2 表单：域名列表 + 目标节点 + CIDR
- [x] 2.5 DNS 模式高级配置：超时/连接池/健康检查
- [x] 2.6 提交时区分 DNS / 普通模式发送不同数据
- [x] 2.7 编辑时加载 DNS 配置

## 3. 列表展示

- [x] 3.1 StreamProxyList.vue 卡片增加「DNS」标签

## 4. 验证

- [x] 4.1 前端 vue-tsc + vite build 通过
- [x] 4.2 后端 23 个 pytest 全部通过
