## 1. 后端 Schema 扩展

- [x] 1.1 扩展 `UpstreamBase.load_balance` 的 Literal 类型，新增 `ewma` 和 `least_conn`
- [x] 1.2 扩展 `UpstreamBase.hash_on` 的 Literal 类型，新增 `vars_combinations`
- [x] 1.3 在 `UpstreamBase` 中新增 optional 字段：`retries`, `retry_timeout`, `timeout`, `pass_host`, `upstream_host`, `scheme`, `keepalive_pool`

## 2. 前端数据模型

- [x] 2.1 扩展 `upstreamForm` reactive 对象，新增高级配置字段（retries, retry_timeout, timeout, pass_host, upstream_host, scheme, keepalive_pool）
- [x] 2.2 新增 `upstreamForm.advancedEnabled` 和 `upstreamModalActiveTab` 状态
- [x] 2.3 扩展 `getLoadBalanceLabel` 映射，新增 ewma 和 least_conn 标签
- [x] 2.4 扩展 `hash_on` 的 select options，新增 vars_combinations
- [x] 2.5 在 `showAddUpstreamModal` 中初始化高级配置默认值

## 3. 前端模板（基础配置 Tab）

- [x] 3.1 用 `<a-tabs>` 包裹上游表单内容，创建"基础配置"和"高级配置"两个 Tab
- [x] 3.2 基础配置 Tab 中新增 ewma 和 least_conn 负载均衡选项（放在一致性哈希之后）
- [x] 3.3 基础配置 Tab 中新增 vars_combinations 哈希位置选项
- [x] 3.4 基础配置 Tab 底部添加"高级配置" a-switch 开关
- [x] 3.5 高级配置 Tab 根据 advancedEnabled 控制可访问性

## 4. 前端模板（高级配置 Tab）

- [x] 4.1 健康检查（checks）：JSON 文本域编辑器，默认填充现有 checks 值
- [x] 4.2 重试次数（retries）：数字输入，默认值为节点数量，0=禁用
- [x] 4.3 重试超时（retry_timeout）：数字输入（秒），默认 0
- [x] 4.4 超时配置（timeout）：connect、send、read 三个数字输入
- [x] 4.5 host 策略（pass_host）：select 下拉（pass/node/rewrite），默认 pass
- [x] 4.6 上游 host（upstream_host）：文本输入，仅 pass_host=rewrite 时显示
- [x] 4.7 通信协议（scheme）：select 下拉（http/https/tcp/udp），默认 http
- [x] 4.8 连接池（keepalive_pool）：size、idle_timeout、requests 三个数字输入

## 5. 前端提交逻辑

- [x] 5.1 修改 `handleUpstreamSubmit`，将高级配置字段条件性包含在 submitData 中
- [x] 5.2 编辑上游时（`editingUpstream` 为 true）正确回显高级配置字段

## 6. 后端测试

- [x] 6.1 验证新增负载均衡类型（ewma, least_conn）的创建和更新
- [x] 6.2 验证新增高级配置字段的透传和持久化
- [x] 6.3 确保现有测试不受影响
