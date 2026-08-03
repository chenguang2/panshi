# Playwright 浏览器环境说明与排查

## 概述

本平台通过 **Playwright MCP**（`@playwright/mcp`）驱动浏览器进行自动化操作（页面验证、截图、E2E 测试等）。本文档说明浏览器实际安装/运行位置、有界面（headed）与无界面（headless）模式的差异，以及常见"拉起后没界面"问题的排查方法。

## 浏览器安装位置

原始 Playwright 库（`frontend/` E2E 测试、`playwright-core`）使用的是**自带的 Chromium**（不是系统 Chrome），按操作系统分别缓存：

| 环境 | 缓存路径 |
|---|---|
| Linux / WSL | `~/.cache/ms-playwright/chromium-<build>/chrome-linux64/chrome` |
| Windows | `%LOCALAPPDATA%\ms-playwright\chromium-<build>\chrome-win\chrome.exe`（即 `C:\Users\<用户>\AppData\Local\ms-playwright\`） |
| macOS | `~/Library/Caches/ms-playwright/chromium-<build>/chrome-mac/` |

**在 WSL 中运行 Playwright 时，浏览器装在 WSL 的 Ubuntu 文件系统里**（`~/.cache/ms-playwright/`），而不是 Windows 侧。Windows 侧即使也存在一套 `ms-playwright/` 缓存，通常不会被 WSL 内的 Playwright 使用（属于历史遗留或 Windows 原生工具使用）。

> **`@playwright/mcp`（本平台 opencode playwright skill 使用的 MCP）例外**：MCP 0.0.78 默认启动的是**系统 Google Chrome**（Linux 下即 `/usr/bin/google-chrome-stable`，需另行安装），而非 Playwright 自带的 Chromium。`~/.cache/ms-playwright-mcp/mcp-chrome-<hash>/` 只是它的**用户数据目录**（profile），不是浏览器本体。排查"拉起后没界面"时，应检查系统 Chrome 而非 `~/.cache/ms-playwright/` 下的 chromium。

### 安装命令

```bash
# WSL / Linux 内安装（国内网络需用镜像源，见 AGENTS.md）
PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright npx playwright install chromium
```

## 有界面（headed）与无界面（headless）

### 默认行为

`@playwright/mcp` **默认是有界面模式（headed）**，见其 README：

> `--headless`: run browser in headless mode, **headed by default**

只有显式加 `--headless` 参数或设置 `PLAYWRIGHT_MCP_HEADLESS` 环境变量时才是无界面。

本项目的 opencode 内置 playwright skill 启动命令为：

```
npx -y @playwright/mcp
```

**未加任何参数** → 默认 headed（有界面）。

### 两者对比

| 特性 | Headed（有界面） | Headless（无界面） |
|---|---|---|
| 窗口显示 | ✅ 可见 | ❌ 不可见 |
| DOM / 截图 / 网络 | ✅ 正常 | ✅ 正常 |
| 适用场景 | 肉眼观察页面 | CI / 服务器 / 批量验证 |

> 注意：headless **也能截图**——只是不显示窗口，功能不受影响。

## 界面显示的前提：图形环境

在 WSL 里运行 headed 浏览器，**必须有 X/Wayland 图形环境**，否则窗口无法显示：

| 环境 | 说明 |
|---|---|
| **Win11 + WSLg**（推荐） | 系统内置 WSLg，自动提供 `DISPLAY=:0`、`WAYLAND_DISPLAY=wayland-0`、`/mnt/wslg/`，WSL 内的 GUI 应用直接显示到 Windows 桌面 |
| **Win10 + X server** | 需自行安装 X server（如 VcXsrv / X410），并 `export DISPLAY=<Windows-IP>:0` |
| **无图形环境** | Chrome 找不到 DISPLAY，只能 headless 运行或启动失败 |

### 验证图形环境是否就绪

```bash
echo $DISPLAY            # 应为 :0 或类似值（WSLg）
ls /mnt/wslg/            # 应有 PulseServer / run 等内容（Win11 WSLg）
echo $WSL2_GUI_APPS_ENABLED  # 应为 1
```

## "拉起后没界面"排查清单

在出问题的机器上按顺序排查：

| # | 检查项 | 方法 | 若异常 |
|---|---|---|---|
| 1 | 是否被强制 headless | 查看 MCP server 启动命令/配置里有无 `--headless` 或 `PLAYWRIGHT_MCP_HEADLESS` | 去掉该参数/环境变量 |
| 2 | WSLg 是否可用 | `echo $DISPLAY`（应为 `:0`）；`ls /mnt/wslg/`（应有内容） | Win10 无 WSLg，需装 X server |
| 3 | Windows 是否开启 WSL GUI | PowerShell 执行 `wsl --version` | Win11 22000+ 才内置 WSLg，老版本需升级或装 X server |
| 4 | Linux 图形依赖库 | `ldd /usr/bin/google-chrome-stable \| grep "not found"`（MCP 用系统 Chrome）；原始 Playwright 用 `ldd ~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome \| grep "not found"` | 安装缺失依赖：`sudo apt install libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2` |

### 最常见的三种情况

1. **Windows 10**（无 WSLg）：Chrome 找不到图形显示，只能 headless。解决：装 VcXsrv 并 `export DISPLAY=:0`（或升级 Win11）。
2. **配置里带了 `--headless`**：`@playwright/mcp` 默认 headed，只有显式指定才无界面。去掉该参数即可。
3. **WSLg RDP 呈现流故障**（Win11，窗口空白）：任务栏能看到浏览器图标，点开窗口全白/空白。WSL 侧一切正常（进程在跑、窗口已创建、X 层已渲染内容、weston 日志零错误），但 **WSLg VM → Windows 的 RDP 像素流坏了**。解决：PowerShell 执行 `wsl --shutdown` 重启整个 WSL（见下方"WSLg 呈现故障排查"）。

## 本机实测结论（2026-08 排查）

- 本机为 **Win11 + WSL2（Ubuntu）**，`DISPLAY=:0`、`/mnt/wslg/` 就绪 → **有界面模式正常**
- `@playwright/mcp` v0.0.78 实际调用的是**系统 Google Chrome**（`/usr/bin/google-chrome-stable` 151.0.7922.71），用户数据目录在 `~/.cache/ms-playwright-mcp/mcp-chrome-<hash>/`；启动命令 `npx -y @playwright/mcp`（无 `--headless`）
- 原始 Playwright 库（`frontend/` E2E，playwright 1.62.1）使用的自带 Chromium 在 **WSL Ubuntu**：`~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`
- 若在无界面的机器上遇到问题，优先检查 **DISPLAY / WSLg / 是否误加 `--headless`**；若进程在、窗口已注册到 WSLg RDP rail 但仍看不到界面，为 Windows 宿主侧 WSLg 显示问题，可在 PowerShell 执行 `wsl --shutdown` 后重开 WSL

## WSLg 呈现故障排查（2026-08 实测案例）

### 症状

- 任务栏能看到 **"Google Chrome" 图标**，但点开窗口**全白/空白**（标题栏有，内容无）
- 不是 Chrome 独有问题——**任何 GUI 程序都空白**（用 xclock 验证过）
- 页面功能一切正常：playwright 导航成功、DOM 快照完整、截图非空白（X 层已渲染）

### 判断依据（如何确认是 WSLg 呈现故障）

| # | 检查项 | 结果 | 含义 |
|---|---|---|---|
| 1 | 进程存在 | Chrome 进程在跑 | 浏览器正常启动 |
| 2 | X 窗口树 | `xwininfo -root -tree` 能看到窗口，mapped 状态 | 窗口已创建 |
| 3 | X 层渲染 | `xwd -id <窗口ID>` 截图像素分析有内容（1万+颜色） | X 内部渲染正常 |
| 4 | weston 日志 | `/mnt/wslg/weston.log` 窗口注册成功（`associateWindowId`），无断开/错误 | RDP rail 注册正常 |
| 5 | **对照实验** | 启动一个纯 X11 程序（`xclock`）也空白 | **WSLg 全局呈现故障**，不是某个应用的问题 |

关键在第 5 项：如果 xclock 也空白，说明问题在 **WSLg VM → Windows 的 RDP 呈现链路**，不是文档清单里任何一条（headless / DISPLAY / 依赖缺失 / Chrome 本身）。

### 原因

- WSLg 的呈现层运行在**独立的 WSLg VM**（weston 合成器 + Xwayland）里，通过 RDP 把窗口画面推给 Windows 宿主
- Windows 更新、睡眠恢复、长时间运行后，这条 RDP 呈现链路可能进入退化状态（常见佐证：`/mnt/wslg/stderr.log` 出现 `Failed to initialize glamor, falling back to sw`、`GBM Wayland interfaces not available`）
- **注意**：glamor 软件渲染回退本身是 cosmetic 错误，不直接导致空白——真正的故障点是 RDP 像素流没送达 Windows 桌面

### 修复（必须做，会中断当前 WSL 会话）

在 **Windows PowerShell** 里执行：

```powershell
wsl --shutdown
```

这会关闭整个 WSL（包括当前 opencode 会话和开发服务）。重启后按顺序恢复：

```powershell
# 1. 打开 Windows Terminal → Ubuntu
wsl
# 2. 重启开发服务（前端 12345 / 后端 12344）
cd /home/qcg/panshi && ./develop/linux/start.sh
# 3. 重新启动 opencode，再用 playwright 打开 http://localhost:12345/
```

**关键认知**：`wsl --shutdown` 重启的是**整个 WSL + WSLg VM**（重建 RDP 呈现链路）；而 `start.sh` 只重启开发服务，**救不了 WSLg 呈现故障**。所以"开机后重启开发服务却仍然空白"是正常的——WSLg 呈现层一直处于故障状态，只有重启 WSL 才能恢复。

### 一句话总结

> WSL 内一切正常 + 所有 GUI 窗口空白 = WSLg RDP 呈现流故障 → `wsl --shutdown` 重启即可。不用逐项排查 Chrome 本身。
