# Proposal: packaging-mirror-toolchain

## Why

2026-10-03 实测：`pypi.tuna.tsinghua.edu.cn` 对本机出口 IP 渐进式 403（索引/包全拒、pip UA 拦截更狠），而三个打包脚本（`gen-linux.sh` / `gen-mac.sh` / `gen-window.ps1`）把 tuna 镜像**硬编码**在 install 命令行里，离线打包链路整体阻塞。附带问题：

1. 三脚本各自维护镜像，换源要改三处，无幂等工具、无改写后校验；
2. 依赖安装逻辑分散在各 gen 脚本（pip 直装），无离线模式、无 uv 缓存加速；且机器 shell 环境的 `UV_INDEX_URL` 仍指向已限流镜像，uv 路径会复现故障；
3. 打包提示语与实际镜像漂移——镜像已换 aliyun 但提示仍写清华（「嘴上清华、实际 aliyun」），npm 镜像被误描述为清华（实为 npmmirror，阿里运营、原淘宝源）。

## What Changes

- 三打包脚本硬编码镜像 tuna → aliyun（tuna 403、aliyun 包级路径实测全通）。
- 新增 `product/tools/install-backend-deps.sh`：后端依赖安装统一入口，gen-linux 第 4 步改调它；三模式按优先级（`WHEELS_DIR` 离线 → uv 优先 → pip 退化）；进程树内统一覆盖 `UV_DEFAULT_INDEX`/`UV_INDEX_URL`/`PIP_INDEX_URL`（新旧变量名双保险，机器环境指向限流镜像也不影响打包）。
- 新增 `product/tools/switch-pypi-mirror.sh`：预置 5 个国内镜像（aliyun/tencent/ustc/huawei/tsinghua，2026-10-03 包级路径实测前四 200）；支持交互菜单 / 名称 / 序号 / 完整 URL 四种选法，非法输入报错出菜单退出码 1；幂等改写三脚本 `-i` 镜像（残留非目标镜像数必须为 0）；选择持久化到 `product/tools/.mirror`（.gitignore 机器本地态），`install-backend-deps.sh` 与 `vendor-wheels.sh` 读之作缺省（`PIP_INDEX_URL` 仍可单次覆盖）——闭合「gen-linux 走 helper 后 sed 换不动其镜像」的传导缺口，三平台一致生效。
- 新增 `product/tools/vendor-wheels.sh`：`uv pip compile` 锁定 + 全量 wheel 落盘 `product/wheels/`（.gitignore，本机缓存可随时重建；pyproject 依赖变更后须重跑）；临时文件基址 `${TMPDIR:-/tmp}`（脱离 agent 工作区 `/tmp/opencode` 硬编码），trap 清理同步覆盖日志。
- gen 脚本 npm 提示纠错（npmmirror=阿里，原淘宝源）；`switch-pypi-mirror.sh` 以 `-i <URL>` 改写时整行同步重写相邻提示语（bash `echo` / PowerShell `Write-Host` 双形态），提示内嵌实际镜像地址。
- `product/README.md` 打包指南（场景对号 A 日常 / B 换源 / C 离线 + gen 脚本 12 步流程 + FAQ）。

## Capabilities

### Modified

- `mac-deployment`：「macOS deployment preparation script (gen-mac.sh)」依赖安装场景改按统一镜像配置（缺省 aliyun，可经 `switch-pypi-mirror.sh` 一键幂等改写）；新增 npm 提示语与实际镜像一致的场景
- `unified-deploy-output`：新增「依赖安装统一入口与 PyPI 镜像配置」需求（gen-linux 委派 helper、镜像优先级与 `.mirror` 持久化、离线 wheels 落盘、临时文件基址、提示语跟随实际镜像）

（说明：候选 spec 中的 `dev-tools` 经核实为工具箱 UI 页面能力，与打包镜像无关，不涉及。Linux 侧落点选 `unified-deploy-output`（gen-linux.sh 打包能力 spec）。）

## Impact

- 脚本：`product/linux/gen-linux.sh`、`product/mac/gen-mac.sh`、`product/windows/gen-window.ps1`
- 新增工具：`product/tools/install-backend-deps.sh`、`product/tools/switch-pypi-mirror.sh`、`product/tools/vendor-wheels.sh`
- 文档：`product/README.md`
- 仓库：`.gitignore`（`product/wheels/`、`product/tools/.mirror` 两条机器本地态）
- 测试：无自动化测试（打包链路为 shell 工具，仓库既有形态）；验证为实测证据——vendor 落盘 54 构件、离线/uv 两模式全套安装 + 导入断言 + `pip check` 通过、switch 复跑 md5 零变化、独立 TMPDIR 模拟用户环境全量真跑（54 构件、无残留）、切 ustc 后 `.mirror` 写入 + helper 传导 + mac/win 改写再切回 aliyun 复验
- 风险：低——全部为打包期工具，不进运行时；镜像由硬编码改配置化后，单一镜像限流的单点故障可自助切换
