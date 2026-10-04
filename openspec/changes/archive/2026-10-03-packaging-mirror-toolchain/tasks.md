# Tasks: packaging-mirror-toolchain

> 追溯性建档：代码已合入（49008571、622f872c、4e336b95、6bcbe8c4），以下为实际执行记录。打包链路为 shell 工具，无自动化测试，验证以实测证据为准。

## 1. 组 1 — 镜像 aliyun 化 + 依赖安装统一入口（49008571）

- [x] 1.1 三打包脚本硬编码 tuna → aliyun（`gen-linux.sh` / `gen-mac.sh` / `gen-window.ps1`）
- [x] 1.2 新增 `product/tools/install-backend-deps.sh`：`WHEELS_DIR` 离线（`--no-index --find-links` + `--no-build-isolation`）→ uv 优先 → pip 退化；进程树内统一覆盖 `UV_DEFAULT_INDEX`/`UV_INDEX_URL`/`PIP_INDEX_URL`
- [x] 1.3 `gen-linux.sh` 第 4 步改调 `install-backend-deps.sh`
- [x] 1.4 新增 `product/tools/vendor-wheels.sh`：`uv pip compile` 锁定 + 全量 wheel 落盘 `product/wheels/`；`.gitignore` 新增条目（本机缓存可随时重建）
- [x] 1.5 新增 `product/tools/switch-pypi-mirror.sh` v1：一键替换三脚本镜像、幂等（首版 sed 字符类误写 `]` 曾损坏三脚本，修复并复验 md5 不变）
- [x] 1.6 `product/README.md` 打包指南：场景对号 A 日常 / B 换源 / C 离线 + gen 脚本 12 步流程 + FAQ
- [x] 1.7 实测：vendor 落盘 54 构件；离线/uv 两模式全套安装 + 导入断言 + `pip check` 通过；switch 复跑 md5 零变化

## 2. 组 2 — 镜像切换菜单化 + `.mirror` 持久化（622f872c）

- [x] 2.1 `switch-pypi-mirror.sh` 预置 5 镜像（aliyun/tencent/ustc/huawei/tsinghua；2026-10-03 包级路径实测前四 200、tuna 本机出口 403）；交互菜单 + 名称/序号/URL 直选，非法输入报错出菜单退出码 1
- [x] 2.2 选择持久化 `product/tools/.mirror`（`.gitignore` 机器本地态）；`install-backend-deps.sh` 与 `vendor-wheels.sh` 读之作缺省（`PIP_INDEX_URL` 可单次覆盖）——闭合 gen-linux 走 helper 后 sed 传导不到的缺口，三平台一致生效
- [x] 2.3 README 场景 B 改菜单用法；5.1 重写（四种调用形式 + 镜像对照表含实测标注 + 包级自测技巧）
- [x] 2.4 实测：切 ustc → `.mirror` 写入 + helper 解析传导 + mac/win 改写；切回 aliyun 复验，全链绿

## 3. 组 3 — 健壮性与提示语跟随实际镜像（4e336b95、6bcbe8c4）

- [x] 3.1 `vendor-wheels.sh` 临时基址改 `${TMPDIR:-/tmp}`（脱离 `/tmp/opencode` 硬编码），trap 清理同步覆盖日志；模拟用户环境（独立 TMPDIR）全量真跑：54 构件落盘、无残留
- [x] 3.2 三 gen 脚本 npm 提示纠错：registry.npmmirror.com 为 npmmirror（阿里，原淘宝源），非清华
- [x] 3.3 `switch-pypi-mirror.sh` 以 `-i <URL>` 改写时整行同步重写相邻提示语（`echo`/`Write-Host` 双形态），提示内嵌实际镜像地址；README 5.1 行为描述同步
- [x] 3.4 实测：切 aliyun 自愈漂移提示；复跑 md5 零变化
