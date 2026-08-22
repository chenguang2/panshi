# 设计：从零搭建用户操作手册

## Context

- 现有 `docs/user-manual.md`（v1.19.0）为模块参考型手册，无端到端主线，字段级解释不足。
- 系统功能已齐备（集群/节点/edge.env/全局规则/插件元数据/插件组/上游/路由/SSL/四层代理/DNS 代理），但缺少按顺序串联的教程。
- 开发环境前后端已在运行（12344 / 12345），可通过数据库管理切换到空 SQLite 文件获得干净起点。

## Goals / Non-Goals

**Goals:**
- 产出 `docs/new/` 场景式手册：0-12 章从空库到 HTTPS/TCP/UDP/DNS 全链路可用
- 每章解释"为什么做这一步 + 每个选项是什么"
- 关键界面配真实截图（Playwright 自动截取），不可达画面用占位描述
- 手册示例值全部可复现、可复制执行

**Non-Goals:**
- 不修改任何前后端代码
- 不替换/删除旧 user-manual.md
- 不覆盖 API 参考类文档（docs/edge/）
- 不做视频/动图

## Decisions

### 1. 文档组织：单文件分章 vs 多文件

**选择**：多文件。`docs/new/README.md` 为总目录 + `01-cluster.md` … `12-domain-verify.md` 每章一个文件。

**理由**：单文件超过千行后难以维护和截图对位；多文件便于后续按章更新与评审。旧手册是单文件，本次刻意区分。

### 2. 干净环境策略

**选择**：新建空 SQLite 文件 `backend/data/manual-demo.db`，通过「数据库管理 → 连接列表」把 local_sqlite 的路径改为该文件并设为当前，重启后端生效；手册编写完成后恢复原 db_config.json（激活 PG conn_15cbb267）。

**备选**：直接删 panshi.db → 危险，会破坏现有开发数据，否决。

**注意**：seed_data 会自动创建 admin 账号，正好作为手册第 0 章的"首次登录"素材。

### 3. 截图策略

**选择**：Playwright（chromium）脚本登录后逐页截取，存 `docs/new/images/<chapter>-<step>.png`；表单填写中间态尽量通过真实 UI 操作产生。无法自动到达的画面（如 SSH 密码输入后的执行日志抽屉依赖真实节点交互）用「📷 截图待补充」占位。

**理由**：项目已有 Playwright 基建与登录选择器约定（#username/#password）；自动截图保证与当前 UI 一致，后续 UI 变更可低成本重拍。

### 4. 内容事实来源

以代码为准，不凭记忆写：
- 字段清单 ← `frontend/src/views/*.vue` 表单与 `backend/app/schemas/*`
- 发布流程 ← `useClusterUtils.ts` 的 executePublish / executeDeleteWithProgress
- edge.env 字段含义 ← docs/edge/ 与 cluster_edge_env.py
- 插件内置清单 ← backend features.yaml enabled_plugins 与 plugins.py

### 5. 演示拓扑

```
客户端 ──HTTPS :5000──> OpenResty(192.168.0.13-15) ──> 上游 demo-upstream(模拟业务)
        ──TCP :8880──> 四层代理 ──> 目标
        ──UDP :53────> DNS 代理 ──> 上游 DNS
域名 demo.panshi.local → 节点 IP（hosts 演示）
```

路由绑定端口 5000 并启用 HTTPS（证书来自第 9 章），使 3/8/9/12 章形成闭环。

## Risks / Trade-offs

- 切换演示库期间开发数据不可见 → 只在编写截图阶段切换，完成后立即恢复
- Playwright 截图依赖前端已启动 → 编写前健康检查 12345
- 真实节点操作（发布到 192.168.0.13-15）可能因网络不通失败 → 手册中如实展示成功/失败两种结果样式，失败场景同时是排错章节素材
