# docs/tools/tunnel — 边缘隧道方案（13 → 15 经 14:16610 中继）

> 环境模拟：三台服务器 `192.168.0.13/.14/.15`，模拟内外网隔离网络。
> 目标：`13:9999` → 只经 `14:16610`（**HTTP/WebSocket 端点**）→ `15:12345`（磐石 Admin 管理后端）；**13 与 15 禁止直连**。
> 技术：gost v3.2.6 `tunnel+ws` 协议（tunnel 隧道经 WebSocket 承载）+ firewalld（含出站隔离 direct 规则）。
> 状态：✅ 已跑通验证（2026-08-15）

## 目录结构

```
docs/tools/tunnel/
├── README.md                      本文件
├── edge-16610-tunnel-solution.md  完整方案文档（拓扑/防火墙/gost 配置/验证/排障/回滚）
├── scripts/                       运维脚本
│   ├── deploy.sh                  一键部署（工作站执行：推送脚本+配防火墙+起隧道+验证）
│   ├── setup-firewalld.sh         配置本机 firewalld（按自身 IP 识别角色，幂等）
│   ├── start-tunnel.sh            启动本机 gost 隧道（ws|tcp 双模式，按自身 IP 识别角色）
│   ├── start-tunnel-f5.sh         **F5 场景（Design A，已验证）**：14=VIP 纯转发模拟，gost 全部在 15
│   ├── stop-tunnel.sh             停止本机 gost 隧道
│   ├── clear-firewalld.sh         **清除三台防火墙隔离规则**（恢复全放行，隧道不受影响）
│   ├── verify-tunnel.sh           验证：E2E 访问 + 隔离性 + 隧道连接 + firewalld 状态
│   ├── rollback-firewalld.sh      回滚：停用 firewalld，恢复 iptables 备份
│   └── restore-openresty-14.sh    恢复 14 原 openresty 网关（还原"查询服务"）
└── tools/
    ├── edge_query.py              边缘网关 admin API 查询/解密工具（SM4-ECB）
    └── edge_admin.py              边缘网关 admin API 增删改工具（SM4-ECB）
```

## 快速上手

```bash
# 一键部署（从工作站）——推送脚本 + 配置防火墙 + 启动隧道 + 验证
./scripts/deploy.sh

# 或手动分步（每台服务器上执行）：
#   14: ./setup-firewalld.sh && ./start-tunnel.sh   # 中继，先起
#   15: ./setup-firewalld.sh && ./start-tunnel.sh   # 服务端
#   13: ./setup-firewalld.sh && ./start-tunnel.sh   # 访问端

# 双承载模式（三台必须一致）：
#   ./start-tunnel.sh ws     # WebSocket 承载（默认，16610 为 HTTP/WS 端点）
#   ./start-tunnel.sh tcp    # 裸 TCP 承载（备选保留版，16610 为私有协议）

# 验证
./scripts/verify-tunnel.sh

# 停止 / 回滚
#   各机: ./stop-tunnel.sh
#   各机: ./rollback-firewalld.sh                  # 需 /root/iptables-backup-before-firewalld.rules 备份
#   14:   ./restore-openresty-14.sh                # 恢复原 openresty 网关
```

## 关键参数

| 参数 | 值 |
|---|---|
| tunnel.id | `5a1d5536-362d-4551-bbc9-27d7a76e1e6c`（13/15 一致） |
| 中继地址 | `192.168.0.14:16610` |
| 15 服务 | `127.0.0.1:12345`（磐石 Admin, uvicorn `app.main:app`） |
| 13 入口 | `0.0.0.0:9999` |
| gost 版本 | v3.2.6 (linux/arm64)，位于各机 `/root/gost` |
| SSH 密码 | `linux123!@#`（`deploy.sh`/`verify-tunnel.sh` 可用 `SSH_PASS` 环境变量覆盖） |

## 快速验证清单

- [ ] `curl http://192.168.0.13:9999/` → HTTP 200（磐石前端 HTML）
- [ ] 13→15 任何端口（12345/12346/22）→ 连接失败
- [ ] 14 上 `ss -tn state established | grep 16610` → 有 15 的 established 连接
- [ ] 15 的 `/root/gost-15-tunnel.log` → 出现 `<-> 127.0.0.1:12345`

详见 [edge-16610-tunnel-solution.md](edge-16610-tunnel-solution.md)。
