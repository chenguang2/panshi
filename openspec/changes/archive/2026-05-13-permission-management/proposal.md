## Why

用户权限管理缺失。所有用户拥有相同权限，无法区分管理员和普通用户的操作范围。

## What Changes

- 新建 `UserPermission` 模型和 `sys_user_permission` 表
- 登录返回用户权限列表，前端 `hasPermission()` 控制 Tab 显隐
- 用户管理页新增"权限设置"Tab，管理员可勾选插件组/全局规则/边缘节点权限
