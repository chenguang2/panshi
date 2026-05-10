## 1. IP 校验逻辑

- [ ] 1.1 添加 IP 地址校验正则函数 `validateIP`
- [ ] 1.2 添加负载均衡中文映射函数 `getLoadBalanceLabel`

## 2. 节点添加校验

- [ ] 2.1 修改节点模态框：IP 添加 required 和 IP 格式校验 rules
- [ ] 2.2 修改节点模态框：服务端口添加 required rules
- [ ] 2.3 修改节点模态框：管理端口添加 required rules
- [ ] 2.4 修改节点模态框：状态添加 required rules

## 3. 上游添加校验

- [ ] 3.1 修改上游模态框：名称添加 required rules
- [ ] 3.2 修改上游模态框：负载均衡添加 required rules
- [ ] 3.3 修改上游模态框：一致性哈希时 Key 添加 required rules
- [ ] 3.4 修改上游模态框：节点列表 IP 添加 IP 格式校验

## 4. 上游列表中文显示

- [ ] 4.1 修改 upstreamColumns：为 load_balance 列添加 customRender
- [ ] 4.2 修改 allUpstreamColumns：为 load_balance 列添加 customRender

## 5. 验证

- [ ] 5.1 运行 `npm run build` 确保构建成功
- [ ] 5.2 手动测试节点添加校验
- [ ] 5.3 手动测试上游添加校验
- [ ] 5.4 手动测试上游列表中文显示
