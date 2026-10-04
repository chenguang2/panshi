# Design: packaging-mirror-toolchain

## Context

tuna 对本机出口渐进式 403 是外部约束（其他机器可能可用），故不能只做一次性替换——镜像必须是可切换的配置。三个 gen 脚本的安装命令形态为 `install -i <镜像> -e ...`（PowerShell 侧 `pip install -i ...`），镜像字面量可被 sed 定位。

## Decisions

- **D1 短期止血与中期方案分层**：`switch-pypi-mirror.sh`（sed 改写三脚本字面镜像，短期）+ `install-backend-deps.sh`（统一安装入口，中期）；两者并存，前者覆盖 mac/win 的 `-i` 字面量，后者服务 gen-linux。
- **D2 `.mirror` 持久化修传导缺口**：gen-linux 改调 helper 后，sed 只能改 mac/win 的字面镜像、改不到 helper 内部缺省；helper 与 vendor 读 `product/tools/.mirror` 作缺省镜像（优先级 `PIP_INDEX_URL` > `.mirror` > aliyun 兜底），选择一次、三平台一致。
- **D3 离线模式优先级最高**：`WHEELS_DIR` 存在 → `--no-index --find-links` + `--no-build-isolation`——build 隔离会触发联网解析，正是 403 的出错点，离线模式必须同时关掉。
- **D4 进程树内统一覆盖镜像变量**：`UV_DEFAULT_INDEX`/`UV_INDEX_URL`/`PIP_INDEX_URL` 三变量在 helper 内显式 export，机器 shell 环境指向限流镜像也无法渗入打包过程。
- **D5 vendor 临时文件基址 `${TMPDIR:-/tmp}`**：曾把 mktemp 模板与失败日志写死在 `/tmp/opencode/`（agent 工作区，用户环境不存在；mktemp 不自建父目录导致必挂，开发环境常驻该目录掩盖了缺陷）；trap 清理同步覆盖日志。
- **D6 sed 字符类教训固化为校验**：URL 以空白收界，`[^[:space:]]*` 即可——双引号 sed 里多写一个 `]` 曾把三脚本改坏且复跑不幂等；switch 脚本内置「残留非目标镜像数 = 0」校验兜底。
- **D7 提示语整行同步重写**：`-i <URL>` 改写时对相邻提示语（`echo`/`Write-Host` 双形态）整行替换、内嵌实际镜像地址——整行替换同时保证幂等与「嘴上清华、实际 aliyun」类漂移不再发生。

## Risks / Trade-offs

- 预置镜像可用性标注为「2026-10-03 包级路径实测」，属时效性信息，README 已注明实测日期；tuna 在其他出口可能正常，保留在预置列表。
- 无自动化测试：打包工具依赖真实网络与镜像可用性，自动化 ROI 低；以 README 的「包级自测技巧」（`/simple/<pkg>/` 探测、md5 复跑幂等校验）替代。
