## ADDED Requirements

### Requirement: 一致性哈希支持自定义变量
当上游负载均衡为一致性哈希（chash）时，哈希位置 SHALL 支持 `vars_combinations`（自定义变量）选项。

#### Scenario: 选择自定义变量模式
- **WHEN** 用户选择一致性哈希后将哈希位置设置为"自定义变量"
- **THEN** 系统 SHALL 保存 `hash_on` 值为 `vars_combinations`
- **AND** 用户 SHALL 可指定 `key` 值

#### Scenario: vars_combinations 在哈希位置下拉框中的位置
- **WHEN** 用户打开哈希位置下拉框
- **THEN** `vars_combinations` SHALL 作为新增选项出现在 `vars` 选项之后
