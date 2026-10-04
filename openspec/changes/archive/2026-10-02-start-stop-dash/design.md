# Design: 2026-10-02-start-stop-dash

## Context

start.sh 的 pre-start 清理、端口校验等逻辑依赖 bash 语法；`sh start.sh` 此前在解析期即失败，错误信息与运维意图（启动服务）无关。

## Decisions

- **D1 顶部守卫 + exec 重执行**：`$BASH` 未设置即判定为非 bash 调用；`command -v bash` 确认后 `exec bash "$0" "$@"`——同进程替换、参数原样透传、退出码语义不变；bash 不可用时退化为原生报错（不伪装修复）。
- **D2 stop.sh 同步挂守卫**：当前 stop.sh 全量 dash 可解析（守卫是纯冗余），但未来 bashism 改动不再需要回归「sh 调用兼容」——一次挂守卫永久免疫。
- **D3 守卫必须是 dash 可解析前缀**：守卫本身只允许 POSIX 语法（[ ]、command -v），保证 `sh` 能读到守卫并完成重执行；守卫之后的 bashism 不再被 dash 触及。
