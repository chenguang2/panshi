# 静态资源发布功能 — 架构设计讨论

> 讨论日期：2026-05-14
> 参与方：Sisyphus（AI 代理）, 用户
> 状态：已确定方案方向，待实现

## 需求概述

在集群管理中增加一个静态资源管理 tab 页，支持用户上传 zip 包配置访问 URL，用户即可通过该 URL 访问解压后的静态文件（HTML/JS/CSS 等前端站点）。

## 现有系统架构

```
管理平台（FastAPI + Vue）
      │
      ▼
Edge 节点集群（Apache PANSHI on OpenResty）
      │
      ▼
下游客户端
```

- 管理平台通过 SM4 加密的 HTTP API（`/edge/admin/...`）向 Edge 节点推送配置
- Edge 节点基于 OpenResty（Nginx + LuaJIT），运行 PANSHI 和自定义 Lua 插件
- 已有资源类型：upstream、route、plugin_config、global_rule、plugin_metadata
- 各资源均遵循 Model → Schema → API → 前端 Tab 的开发模式
- 发布流程：版本递增 → ConfigVersion 记录 → 推送到所有活跃 Edge 节点 → 返回同步结果
- 已有自定义 Lua 插件：data_center、pre_functions、log_process、proxy_rewrite、response_rewrite、traffic_limit_count、traffic_split

## 讨论的方案

### 方案 A：对象存储 + 反向代理（推荐但不优先）

上传 zip → 解压到 MinIO/S3 → 在 Edge 网关创建路由代理到对象存储。
需要额外部署存储服务，适合生产大规模场景。

### 方案 B：后端内置文件服务器 + 网关代理

上传 zip → 后端解压 → FastAPI StaticFiles 挂载 → Edge 路由回源到管理后端。
实现简单但后端会成为瓶颈。

### 方案 C：Edge 节点 Lua 插件 + Admin API 分发 【选定】

上传 zip → 管理后端通过 Admin API 分发到各 Edge 节点 → 自定义 Lua 插件在 access 阶段读取本地文件返回。

### 方案 D：OpenResty Nginx 配置注入

上传 zip → 分发到 Edge 节点 → 注入 Nginx location 块 → reload。
需要 reload，生产环境不友好。

## 方案 C 详细设计

### 架构

```
管理平台上传 zip
      │
      ▼
后端解压 + 记录元数据
      │
      ▼ （通过 PUT /edge/admin/static_resources/{name}，SM4 加密传输）
      ├──► Edge 节点 1（解压到 /data/edge/static/{name}/）
      ├──► Edge 节点 2
      └──► Edge 节点 3
      
用户请求：
浏览器 ──GET /static/{name}/index.html──► Edge 节点
                                            │
                                   PANSHI 路由匹配
                                            │
                                   static_resource 插件
                                   读取本地文件返回
```

### 新增 Edge 端点

```
PUT    /edge/admin/static_resources/{name}   # 上传/更新静态资源 zip
DELETE /edge/admin/static_resources/{name}   # 删除静态资源
GET    /edge/admin/static_resources           # 列出已部署资源
```

### 新增 PANSHI 插件：static_resource

- 在 `access` 阶段拦截匹配的请求
- 根据请求 URI 映射到本地文件
- 自动设置 Content-Type（基于后缀）
- 缓存控制：ETag + Last-Modified + Cache-Control + 304 响应
- 条件请求处理（If-None-Match）

### 缓存控制实现

缓存控制在 Lua 插件中实现约需 30 行代码，核心逻辑：

1. 读取文件内容
2. 通过后缀判断 MIME 类型
3. 设置 Cache-Control 头
4. 计算文件 MD5 作为 ETag
5. 检查 If-None-Match 请求头，文件未变则返回 304

### 管理平台扩展

新增 `StaticResource` 模型（id, cluster_id, name, url_path, description, file_size, current_version），
沿用现有 CRUD + 发布流程。前端在集群管理页新增一个 tab。

## 决策记录

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-05-14 | 选择方案 C | 利用已有 Lua 插件框架和 Admin API 通道，不引入新基础设施 |
| 2026-05-14 | 文件不存数据库 | zip 内容直接存 Edge 节点文件系统，数据库只存元数据 |
| 2026-05-14 | 复用现有发布流程 | 版本管理、ConfigVersion 历史记录、节点同步结果沿用现有模式 |
| 2026-05-14 | 缓存控制内置于插件 | 30 行 Lua 代码即可实现规范缓存，不值得为此切换到其他方案 |
