## 1. 前端负载均衡选项精简

- [ ] 1.1 将负载均衡下拉框选项精简为"加权轮询"和"一致性哈希"（ClusterList.vue ~line 342-347）
- [ ] 1.2 upstreamForm 增加 `hash_location` 和 `hash_key` 字段声明

## 2. 一致性哈希条件字段

- [ ] 2.1 在负载均衡选择下方，添加 hash_location 下拉框（v-if 条件显示）
- [ ] 2.2 hash_location 选项：header, cookie, vars
- [ ] 2.3 添加 hash_key 输入框（必填验证）
- [ ] 2.4 watch load_balance 变化，重置 hash_location 默认值

## 3. 后端支持（如需要）

- [ ] 3.1 检查后端 Upstream 模型是否支持 hash_location 和 hash_key 字段
- [ ] 3.2 如不支持，扩展字段或使用 metadata 存储

## 4. 测试验证

- [ ] 4.1 选择一致性哈希时，hash_location 和 hash_key 字段显示
- [ ] 4.2 切换回加权轮询时，条件字段隐藏
- [ ] 4.3 hash_key 为空时，表单验证提示正常
- [ ] 4.4 保存上游后，hash_location 和 hash_key 值正确存储