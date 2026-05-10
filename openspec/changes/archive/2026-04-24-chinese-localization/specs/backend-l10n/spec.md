# Backend Localization Spec

## Overview
Backend Chinese localization for API messages and validation errors.

## Files to Modify

### 1. app/schemas/*.py (Validation Messages)
Update Pydantic schema error messages to Chinese:
- UserCreate: username, password validation
- ClusterCreate: name, admin_url validation
- UpstreamCreate: name, upstream_type validation
- RouteCreate: route_name, uri validation

### 2. app/api/v1/auth.py
Update error messages:
- Invalid credentials → "用户名或密码错误"
- Unauthorized → "未授权，请登录"
- Logout success → "退出登录成功"

### 3. app/api/v1/users.py
Update messages:
- User created → "用户创建成功"
- User updated → "用户更新成功"
- User deleted → "用户删除成功"

### 4. app/api/v1/clusters.py
Update messages:
- Cluster created → "集群创建成功"
- Cluster updated → "集群更新成功"
- Cluster deleted → "集群删除成功"
- Connection test failed → "集群连接失败"

### 5. app/api/v1/routes.py
Update messages:
- Route created → "路由创建成功"
- Route published → "路由发布成功"

### 6. app/api/v1/dicts.py
Update messages for dict type and data CRUD operations.

## Error Code Standards
All Chinese error messages should be concise, user-friendly, and actionable.