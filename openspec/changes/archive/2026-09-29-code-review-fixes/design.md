# Design: 2026-09-29-code-review-fixes

## Context

评审批次一次性落地 20 项，规模大但单点小；多数为纵深防御（限速/白名单/双防线），不改变既有主流程语义。

## Decisions

- **D1 登录限速进程内实现**：模块级 dict（键 (username, client_ip)），10 分钟固定窗口 + 上限 5 次 → 429，成功登录清零、过期键 prune 防泄漏；单进程语义（多 worker 各自计数）已可挡暴力枚举，不引入外部依赖。
- **D2 pwd_ver 版本号吊销**：JWT 内嵌 pwd_ver，users 改密时递增——旧 token 在下一次鉴权即 401，无需黑名单表。
- **D3 schema 自检只加不删**：启动自检收敛为增量（CREATE IF NOT EXISTS / 补列），drop_all 类破坏性路径从自检链路摘除——误删防线以「能力不存在」替代「调用前判断」。
- **D4 32MB 双防线**：前端选择期即拒（省上传带宽）+ 后端强制校验（绕过前端仍拦），两道独立。
- **D5 metrics label 键白名单**：键不在白名单直接 400，值仍参数化绑定——注入面从「转义正确性」收缩为「白名单成员资格」。
- **D6 前端会话治理单点**：clearSession 收敛 auth store 唯一出口，api/index.ts 拦截器经 store 调用；401 风暴由后续批次（0e0f4e27）补 toast 去重。

## Risks / Trade-offs

- 进程内限速多 worker 不共享计数——单机 uvicorn 单 worker 部署形态下足够，若未来多 worker 需迁移 Redis（记录在案）。
