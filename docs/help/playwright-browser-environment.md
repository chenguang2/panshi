# Playwright 浏览器环境说明与排查

## 概述

本平台通过 **Playwright MCP**（`@playwright/mcp`）驱动浏览器进行自动化操作（页面验证、截图、E2E 测试等）。本文档说明浏览器实际安装/运行位置、有界面（headed）与无界面（headless）模式的差异，以及常见"拉起后没界面"问题的排查方法。

## 浏览器安装位置

Playwright 使用的是**自带的 Chromium**（不是系统 Chrome），按操作系统分别缓存：

| 环境 | 缓存路径 |
|---|---|
| Linux / WSL | `~/.cache/ms-playwright/chromium-<build>/chrome-linux64/chrome` |
| Windows | `%LOCALAPPDATA%\ms-playwright\chromium-<build>\chrome-win\chrome.exe`（即 `C:\Users\<用户>\AppData\Local\ms-playwright\`） |
| macOS | `~/Library/Caches/ms-playwright/chromium-<build>/chrome-mac/` |

**在 WSL 中运行 Playwright 时，浏览器装在 WSL 的 Ubuntu 文件系统里**（`~/.cache/ms-playwright/`），而不是 Windows 侧。Windows 侧即使也存在一套 `ms-playwright/` 缓存，通常不会被 WSL 内的 Playwright 使用（属于历史遗留或 Windows 原生工具使用）。

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
| 4 | Linux 图形依赖库 | `ldd ~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome \| grep "not found"` | 安装缺失依赖：`sudo apt install libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2` |

### 最常见的两种情况

1. **Windows 10**（无 WSLg）：Chrome 找不到图形显示，只能 headless。解决：装 VcXsrv 并 `export DISPLAY=:0`（或升级 Win11）。
2. **配置里带了 `--headless`**：`@playwright/mcp` 默认 headed，只有显式指定才无界面。去掉该参数即可。

## 本机实测结论（2026-08 排查）

- 本机为 **Win11 + WSL2（Ubuntu）**，`DISPLAY=:0`、`/mnt/wslg/` 就绪 → **有界面模式正常**
- Playwright 浏览器本体安装在 **WSL Ubuntu**：`~/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`
- Playwright MCP 版本：`@playwright/mcp` v0.0.78，启动命令 `npx -y @playwright/mcp`（无 `--headless`）
- 若在无界面的机器上遇到问题，优先检查 **DISPLAY / WSLg / 是否误加 `--headless`**
