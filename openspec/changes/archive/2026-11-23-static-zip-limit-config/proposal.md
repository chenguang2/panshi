# Proposal

## Why

静态资源 zip 的 32MB 上限目前是前后端各自硬编码的常量（`STATIC_ZIP_MAX_BYTES = 32 * 1024 * 1024`），换部署环境（网关/Edge nginx `client_max_body_size` 不同）必须改代码再发版。该值本质是**部署级容量策略**（每实例一值，需与本部署的 nginx 上限对齐），应按既有 `features.yaml` 部署配置模型暴露，改完 mtime 热加载即时生效。

## What Changes

- `features.yaml` 新增顶层 `limits` 命名空间（对齐 `concurrency` 先例）：键 `static_zip_max_mb`，整数 MB，缺省 32，合法范围 1–2048；未知键或非法值 → 启动显式报错退出（与 `features`/`concurrency`/`branding` 同款哲学）。校验通过后缺省值回写，`GET /api/v1/system/features` 原样透出 `limits`。
- 后端 `app/core/features.py` 新增唯一读取点 `static_zip_max_mb()`；`cluster_static_resources.py` 删除硬编码常量，上传两端校验（请求声明 `file.size` 预判 + 读上限+1 字节防御校验）与发布 413 文案统一改读该值。
- 前端 `stores/features.ts` 解析 `limits` 并提供 `limitOf(name, default)`；`useClusterStaticResources.ts` 的上传预检改为**调用时**读取 store 值（缺省 32），提示文案随生效值变化。
- 提示文案保持缺省 32MB 时逐字不变（`zip 文件过大：上限 32MB`），零用户可见回归；配置非 32 时文案随之变化。
- 边界如实标注（不改行为）：本配置只改平台侧两道防线；经中继发布仍受网关 nginx `client_max_body_size`、直连发布仍受各 Edge `edge.env` 的 `client_max_body_size`（未配置时 nginx 默认 1m）约束，超限发布仍 413。yaml 注释与本变更 design 写明「调大前先调大 nginx 侧」。Edge 侧配置纳入管理属部署域，本轮不做。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `deployment-feature-config`: 新增 `limits` 命名空间配置要求（含校验、缺省回写、`GET /system/features` 透出、前端 store 解析）。
- `cluster-static-resource-upload`: 上传体积上限由固定 32MB 改为部署配置值（`limits.static_zip_max_mb`，缺省 32MB），前后端双防线语义不变。

## Impact

- 后端：`app/core/features.py`（新 reader + 校验）、`app/api/v1/cluster_static_resources.py`（去常量、两处校验 + 413 文案）、`backend/features.yaml`（新增注释块）、`tests/test_upload_and_sshpass_hardening.py`（patch 点迁移）、新增 `tests/test_features_limits.py`。
- 前端：`stores/features.ts`、`composables/useClusterStaticResources.ts`、`stores/__tests__/features.test.ts`、`composables/__tests__/useClusterStaticResources.test.ts`、`views/__tests__/StaticResourceList.scoped.source.test.ts`（源码守卫断言迁移）。
- 文档：`AGENTS.md` 约定 #50 补「上限可配置」指针；`features.yaml` 注释内的边界说明。
- 无 API 路径/权限变更；`GET /system/features` 响应新增一个 `limits` 字段（向后兼容）。
