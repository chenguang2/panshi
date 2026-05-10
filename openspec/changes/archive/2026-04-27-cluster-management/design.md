## Context

磐石 Admin 平台的集群管理功能当前存在以下问题：
1. 集群名称仅有后端唯一性检查，缺少格式验证（中划线、小写字母、数字）
2. 表单中包含"管理地址"和"管理密钥"字段，但实际已不使用
3. 删除集群直接执行，无确认步骤，存在误删风险

## Goals / Non-Goals

**Goals:**
- 实现集群名称格式验证（小写字母、数字、中划线，中划线不在首尾）
- 前后端统一验证逻辑，用户体验友好
- 移除无用的管理地址和管理密钥字段
- 添加删除确认对话框，防止误删

**Non-Goals:**
- 不修改集群的数据库模型结构（保留兼容性）
- 不修改其他模块的功能

## Decisions

### 1. 集群名称验证规则
**Decision:** 前端使用 Ant Design Form 的 validator 实时校验，后端在 Pydantic schema 中使用 field_validator 校验
**Rationale:** 前后端双重验证，既提升用户体验，又保证数据安全
**Regex:** `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$` (长度为 1 时直接匹配)

### 2. 字段移除策略
**Decision:** 前端表单移除输入框，后端 schema 移除字段但保持 model 兼容
**Rationale:** API 兼容性考虑，保留数据库字段但不暴露给前端

### 3. 删除确认实现
**Decision:** 使用 Ant Design Vue 的 Modal.confirm() 实现
**Rationale:** 与项目现有 UI 库一致，用户熟悉

## Risks / Trade-offs

- [Risk] 旧数据中的管理地址/密钥字段仍存在于数据库，但不再显示 → 接受，向后兼容
- [Risk] 已有集群名称不符合新规则 → 不影响，只验证新创建/修改的集群

## Open Questions

- 无
