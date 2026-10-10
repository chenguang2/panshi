# cluster-test-connection Specification

## Purpose

集群连接测试（`POST /clusters/{id}/test`）的前端交互规范：如实表达管理面探测语义（EdgeClient `list_available_plugins`，中继感知），明示测试会回写节点在线状态，两页（集群管理/统一管理）使用一致文案与结构。

## Requirements

### Requirement: 连接测试交互语义

集群连接测试（`POST /clusters/{id}/test`）的前端交互 SHALL 如实表达管理面探测语义（EdgeClient `list_available_plugins`，中继感知），并明示测试会回写节点在线状态；两页（集群管理/统一管理）SHALL 使用一致文案与结构。

#### Scenario: 引导文案与管理面语义
- **WHEN** 用户发起连接测试
- **THEN** 引导文案 SHALL 为「将对下列节点执行管理面连通性测试（集群挂接区域时自动经区域网关）：」
- **AND** 文案与结果 SHALL NOT 使用「TCP 端口连接测试」等已废弃的裸探测表述

#### Scenario: 总结行如实着色
- **WHEN** 测试完成
- **THEN** 总结行 SHALL 按失败数着色：全部成功绿色；存在失败时为警示色并追加「⚠ 存在 B 个失败节点，请检查失败原因（白名单 403 需先下发网关配置）」
- **AND** 总结行 SHALL NOT 在存在失败时仍显示成功态

#### Scenario: 节点状态回写告知
- **WHEN** 测试完成且节点在线状态被更新（后端按测试结果写 `node.status` 与 `status_detail`）
- **THEN** 结果区 SHALL 提示「测试结果将更新节点的在线状态标记」，使用户知晓状态变化来源

#### Scenario: 白名单 403 快捷动作
- **WHEN** 失败原因文本含「白名单」（后端 403 类失败，前端按文本判定，后端零改动；结构化字段留待后续）
- **THEN** 失败行下方 SHALL 提供「去下发网关配置」快捷动作，跳转中继网关页（`/relay-gateways`）
- **AND** 该动作 SHALL 仅对具备 `relay_gateway` 权限的用户渲染（与侧边栏菜单权限 keys 同源），无权限用户 SHALL NOT 见该按钮

#### Scenario: 异常终止文案统一
- **WHEN** 测试异常终止
- **THEN** 两页总结 SHALL 使用同一文案（含耗时：「测试异常终止，耗时 Xs」）
