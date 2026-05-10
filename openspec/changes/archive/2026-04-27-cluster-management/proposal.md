## Why

当前集群管理功能存在以下体验和验证问题：
1. 集群名称缺少前端和后端一致性验证，用户可以输入任意字符
2. 管理地址和管理密钥字段已不再需要，但 UI 仍保留输入框
3. 删除集群操作没有二次确认，容易误删

## What Changes

1. **集群名称唯一性验证（前后端）**
   - 规则：小写字母 a-z、数字 0-9、中划线 `-` 组成
   - 中划线不能出现在首尾位置
   - UI 输入框下方显示规则提示
   - 报错信息明确显示规则内容
   - 后端 API 同时验证并返回友好错误信息

2. **移除管理地址和管理密钥字段**
   - 前端表单移除这两个输入框
   - 后端 schemas 同步移除相关字段
   - 数据库模型保留（兼容性）

3. **删除集群二次确认**
   - 点击删除按钮后弹出确认对话框
   - 确认对话框显示集群名称
   - 用户确认后才执行删除操作

4. **测试覆盖**
   - 为所有验证规则添加单元测试
   - 更新 Playwright E2E 测试

## Capabilities

### New Capabilities
- `cluster-name-validation`: 集群名称验证规则，包含格式验证和唯一性检查

### Modified Capabilities
- `cluster-mgmt`: 修改集群创建/更新表单，移除管理地址和管理密钥字段

## Impact

- **Frontend**: `ClusterList.vue` 表单修改，添加确认对话框
- **Backend**: `clusters.py` API 添加名称验证，`schemas/cluster.py` 移除字段
- **Tests**: `test_cluster.py` 添加验证测试，`cluster.spec.ts` 更新 E2E 测试
