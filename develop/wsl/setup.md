WSL 环境重装完成。总结：
已完成的操作：
1. ✅ 停止并关闭所有 WSL 实例
2. ✅ 卸载旧发行版：Ubuntu、Debian、docker-desktop、docker-desktop-data
3. ✅ 卸载 Docker Desktop 及残留文件
4. ✅ 安装 Ubuntu 26.04 LTS（通过 WSL 镜像直接导入）
5. ✅ 设置为默认发行版（WSL 2）
需要注意：
- 当前 Ubuntu 以 root 用户运行（wsl --import 导入的默认行为）
- 如果需要创建普通用户，运行 wsl -d Ubuntu 进入后执行：
adduser <your-username>
usermod -aG sudo <your-username>
- 如果需要重新安装 Docker Desktop，可以从 docker.com (https://www.docker.com/products/docker-desktop/) 下载


收到，记录完毕。
几个小建议帮你收尾：
- 创建普通用户：推荐现在做，否则 root 跑的 npm/pip 文件权限后续会有麻烦
- Docker Desktop 可装可不装：如果只是用 Docker CLI，WSL 里直接 apt install docker.io 配合 dockerd 即可，比 Docker Desktop 轻量很多
- 磁盘压缩：wsl --import 后镜像会膨胀，跑一次 wsl --manage Ubuntu --set-sparse true 可以后续自动回收空间

=============================================================


导出 WSL 镜像
在 PowerShell 中运行（不是 WSL 里面）：
# 1. 先关机
wsl --shutdown

# 2. 导出为 tar 文件（存到 D 盘之类的地方）
wsl --export Ubuntu-26.04 D:\wsl-backup\ubuntu-26.04.tar
- Ubuntu-26.04 是你的发行版名称（wsl --list 可查看）
- 导出文件是 .tar 格式，体积一般 1~3 GB（取决于已安装的内容）
- 导出时发行版必须是 Stopped 状态
恢复镜像
恢复有两种方式：
方式一：导入为全新的发行版（推荐）
# 导入到指定目录
wsl --import Ubuntu-26.04-new D:\wsl\ubuntu-26.04\ D:\wsl-backup\ubuntu-26.04.tar
# 语法: wsl --import <发行版名> <安装位置> <镜像文件路径>

# 以指定用户登录
wsl --distribution Ubuntu-26.04-new --user qcg
方式二：恢复到原有发行版（覆盖）
wsl --set-version Ubuntu-26.04 2          # 确保是 WSL 2
wsl --unregister Ubuntu-26.04             # 删除现有发行版（⚠️ 数据全清）
wsl --import Ubuntu-26.04 C:\Users\28814\AppData\Local\Packages\... D:\backup.tar
⚠️ 方式二要小心，--unregister 会删掉当前发行版的所有数据。
一些有用的小技巧
设置导入后的默认用户：
如果导入后默认是 root，同目录下新建 /etc/wsl.conf：
[user]
default=qcg
查看导出进度：
导出大文件没进度条，可以用 PowerShell 看文件大小在增长：
while ($true) { Clear-Host; ls D:\wsl-backup\ubuntu-26.04.tar; Start-Sleep 2 }
想要更小的导出体积？
导出前先清理一下：
# 在 WSL 里执行
sudo apt clean
sudo apt autoremove -y
sudo rm -rf /tmp/*
sudo dd if=/dev/zero of=/EMPTY bs=1M  # 填充零以压缩
sudo rm -f /EMPTY
需要我直接帮你导出当前的这个 WSL 镜像吗？

==============================================================

已添加。重新打开 Windows Terminal，下拉菜单里应该会出现 Ubuntu-26.04-new。
如果默认用户不是 qcg，进到 WSL 后可以手动设一下默认用户：
# WSL 外执行，指定 root
wsl --distribution Ubuntu-26.04-new -u root --exec bash -c "echo 'default=qcg' > /etc/wsl.conf"
wsl --shutdown
wsl --distribution Ubuntu-26.04-new
现在打开 Terminal 试试看？

================================================================

问题很经典。这是 WSL 的 Windows PATH 泄露 导致的。
原因分析
WSL 默认会把 Windows 的 PATH 追加到 Linux PATH 末尾（/etc/wsl.conf 的 appendWindowsPath = true）。你的 PATH 里，Windows 的 npm 全局目录 (/mnt/c/Users/28814/AppData/Roaming/npm) 排在了前面。
你虽然在 WSL 里装了 opencode，但 shell 优先找到了 Windows 下的那个入口脚本 /mnt/c/Users/28814/AppData/Roaming/npm/opencode。
这个文件本质上是个 Linux shell 脚本（npm 在 Windows 上安装时同时生成 .cmd 和 shell 脚本），大概长这样：
#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\,/,g')")

case `uname` in
    *CYGWIN*|*MINGW*|*MSYS*)
        ...
        ;;
    *)
        exec "node" "$basedir/node_modules/@oh-my-opencode/opencode-cli/dist/index.js" "$@"
        ;;
esac
第 15 行执行 exec "node" ...，但在 WSL 里找不到 node（要么没装，要么 PATH 里没排到 Windows 的 node.exe）。
解决方案
方案 1（推荐）：让 WSL 优先用自己的 opencode
# 确认 WSL 里也确实装了
npm list -g --depth=0 @oh-my-opencode/opencode-cli

# 如果没装，在 WSL 里装
npm install -g @oh-my-opencode/opencode-cli

# 检查 WSL 安装位置
which opencode  # 应该显示 /usr/local/bin/opencode 或类似
如果 WSL 确实装了但还是被 Windows 的抢了优先级，要么调整 WSL 的 PATH，要么 alias：
echo 'alias opencode="/usr/local/bin/opencode"' >> ~/.bashrc

echo 'alias opencode="/home/qcg/.opencode/bin/opencode"' >> ~/.bashrc

source ~/.bashrc
方案 2：关闭 WSL 的 Windows PATH 追加
编辑 /etc/wsl.conf：
[interop]
appendWindowsPath = false
然后重启 WSL（wsl --shutdown 再重开）。但这会导致 WSL 里用不了 Windows 的其他工具，不太推荐。
一句话：WSL 里跑 opencode 时被 Windows 的 npm 全局脚本截胡了。确认 WSL 里也装了，然后确保 WSL 本地路径优先就行。


=========================================================================================

在 WSL (Windows Subsystem for Linux) 中安装 Node.js 非常简单。为了获得最佳的开发体验，**强烈推荐使用 NVM (Node Version Manager)** 来安装和管理 Node.js，这样你可以轻松地在不同项目间切换 Node 版本，并且能完美避免 Linux 环境下的权限问题。

以下是完整的安装步骤：

### 1. 更新系统并安装基础依赖
首先，打开你的 WSL 终端（如 Ubuntu），运行以下命令确保系统软件包是最新的，并安装 `curl` 工具（用于下载 NVM 安装脚本）：
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl
```

### 2. 安装 NVM (Node Version Manager)
复制并运行以下官方安装脚本：
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
```
安装完成后，为了让 NVM 命令在当前终端生效，你需要重新加载一下配置文件：
```bash
source ~/.bashrc
```
*(小提示：可以通过输入 `command -v nvm` 来验证是否安装成功，如果终端输出 `nvm` 就说明没问题了)*。

### 3. 使用 NVM 安装 Node.js
现在，你可以轻松安装你想要的 Node.js 版本了：
*   **安装最新的长期支持版 (LTS，推荐)**：`nvm install --lts`
*   **安装指定版本 (例如 v18.16.0)**：`nvm install 18.16.0`

安装完成后，可以通过以下命令查看已安装的版本以及当前正在使用的版本：
```bash
nvm ls
node --version
npm --version
```

### 4. (可选) 安装 pnpm 或 Yarn 包管理器
Node.js 安装好后，自带的包管理器是 `npm`。如果你习惯使用更快的 `pnpm` 或 `Yarn`，可以通过 npm 全局安装：
```bash
npm install -g pnpm
# 或
npm install -g yarn
```

### 💡 两个重要的 WSL 开发建议
1. **文件存放位置**：为了获得极致的读写性能，建议将你的代码项目存放在 WSL 的 Linux 文件系统中（例如 `~/projects`），**千万不要**放在 Windows 的挂载目录下（如 `/mnt/c/Users/...`），否则在运行 `npm install` 等命令时会非常缓慢。
2. **配合 VS Code 使用**：如果你使用 Visual Studio Code，强烈推荐安装微软官方的 **Remote - WSL** 插件。安装后，你只需在 WSL 的项目目录下输入 `code .`，VS Code 就会自动以 WSL 模式打开，它的终端、调试和扩展都会完美运行在 Linux 环境中。

==============================================================================

在 WSL 的 OpenCode 中安装 `oh-my-openagent`（通常也被称为 `oh-my-opencode` 或 OMO）非常简单。它是一个强大的增强插件，能将 OpenCode 升级为多智能体协作系统。

你可以通过以下两种方式进行安装：

### 🚀 方式一：直接在 OpenCode 内安装（最简单）

这是最推荐的新手方式，让 AI 帮你自动完成安装步骤：

1. 在 WSL 终端中输入 `opencode` 启动程序。
2. 在对话框中直接告诉它：**“帮我安装 oh-my-opencode 插件”**。
3. OpenCode 会自动识别你的意图，执行安装脚本，并询问你是否拥有 Claude、ChatGPT 或 Gemini 等模型的订阅。如果你没有，直接回答“没有”或“No”即可，它会继续为你配置免费模型。

### 💻 方式二：在 WSL 终端手动安装

如果你更喜欢手动控制，或者方式一执行不顺利，可以按以下步骤操作：

1. **安装 Bun 运行时**（oh-my-opencode 依赖 Bun）：
   在 WSL 终端中运行以下命令：
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```
   安装完成后，重新加载环境变量使 Bun 生效：
   ```bash
   source ~/.bashrc
   ```

2. **运行安装命令**：
   直接在终端中输入以下命令进行安装：
   ```bash
   bunx oh-my-opencode install
   ```
   *(注：安装过程中如果遇到依赖缺失的报错，可以尝试先运行 `sudo apt-get install unzip -y` 安装解压工具)*

### 💡 安装后的使用与切换

安装完成后，当你再次输入 `opencode` 启动时，可以通过按 `Tab` 键来切换不同的智能体模式：

*   **OpenCode 原生模式**：包含基础的 `Plan`（规划/只读）和 `Build`（构建/全权限）两种 Agent。
*   **Oh-My-OpenAgent 增强模式**：安装插件后，你将解锁四大核心智能体，它们分工更明确：
    *   **Sisyphus**：主智能体/团队负责人，负责任务编排，直到任务 100% 完成。
    *   **Prometheus**：规划器，负责在执行前进行详细的任务拆解和战略规划。
    *   **Hephaestus**：自主深度工作者，负责目标导向的代码实现。
    *   **Atlas**：重型任务承载者，专门处理大规模代码库和繁重的上下文管理。

日常写小功能或改 Bug 可以直接用原生的 Build 模式；如果要做项目重构、全自动写模块等复杂工程，切换到 OMO 的智能体（如 Sisyphus）会事半功倍。

================================================================


在 WSL (Windows Subsystem for Linux) 中安装 `uv` 非常简单。`uv` 是由 Astral 开发的超高速 Python 包管理器和项目管理工具，能够完美替代传统的 `pip`、`pip-tools` 和 `virtualenv`。

以下是完整的安装与配置步骤：

### 1. 一键安装 uv
打开你的 WSL 终端（如 Ubuntu），直接运行官方提供的安装脚本即可：
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```
脚本会自动下载最新版本的 `uv` 并将其安装到 `~/.local/bin` 目录下。

### 2. 刷新环境变量
安装完成后，为了让终端能够识别 `uv` 命令，需要重新加载一下配置文件：
```bash
source ~/.bashrc
```
*(注：如果你使用的是 zsh，则运行 `source ~/.zshrc`)*

### 3. 验证安装
输入以下命令检查是否安装成功：
```bash
uv --version
```
如果终端正常输出了版本号（例如 `uv 0.x.x`），说明已经大功告成！

### 💡 常见问题与解决方案
如果在输入 `uv --version` 时提示 `command not found`，说明环境变量没有自动生效。你可以通过以下方式手动修复：

1. **手动添加环境变量**：
   运行以下命令，将 `uv` 的安装路径添加到你的 shell 配置中：
   ```bash
   echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
   source ~/.bashrc
   ```

2. **备选安装方案（使用 pipx）**：
   如果官方脚本因为网络原因无法下载，你也可以先安装 `pipx`，再通过它来安装 `uv`：
   ```bash
   sudo apt update
   sudo apt install -y pipx
   pipx ensurepath
   # 重新加载终端或运行 source ~/.bashrc 后
   pipx install uv
   ```

### 🚀 快速上手 uv
安装好后，你可以立刻体验它的高效：
*   **创建新项目**：`uv init my_project && cd my_project`
*   **添加依赖包**：`uv add requests pandas`
*   **创建并激活虚拟环境**：`uv venv && source .venv/bin/activate`
*   **运行 Python 脚本**：`uv run script.py`

在 WSL 中进行 Python 开发时，`uv` 极快的依赖解析和安装速度会让你的开发体验提升一个档次！


===========================================================================

这个报错 `sh: 1: vite: not found` 非常典型，意思是系统找不到 `vite` 这个命令。这通常是因为项目的依赖包（`node_modules`）没有被正确安装。

别担心，只需按以下 3 步快速排查解决：

### 1️⃣ 第一步：检查并安装项目依赖（最常见的原因）
如果你刚拉取了代码或者刚创建完项目，很可能是还没有安装依赖。请确保你当前在项目的根目录下（即包含 `package.json` 文件的目录），然后运行：
```bash
npm install
```
*(如果你习惯使用 Bun，也可以运行 `bun install`)*

### 2️⃣ 第二步：通过 npm 脚本启动（推荐的标准做法）
安装完依赖后，**不要**直接在终端敲 `vite` 命令。因为 Vite 官方推荐将 Vite 安装在项目的本地依赖中（而不是全局安装），直接敲 `vite` 系统会找不到它。

请始终使用 `package.json` 中定义的脚本来启动：
```bash
npm run dev
```
当你运行 `npm run dev` 时，npm 会自动去本地的 `node_modules/.bin/` 目录下寻找并调用 Vite，这样就不会报错了。

### 3️⃣ 第三步：核弹级修复（如果前两步无效）
如果运行 `npm install` 后依然报错，可能是之前的依赖安装损坏了。可以尝试“删库重装”来彻底解决：
```bash
# 1. 删除现有的依赖文件夹和锁定文件
rm -rf node_modules package-lock.json

# 2. 重新安装所有依赖
npm install

# 3. 再次尝试启动
npm run dev
```

按照以上步骤操作，99% 的情况下都能完美解决 `vite: not found` 的问题。快去试试吧！

============================================================

在国内使用 `npm install` 速度太慢是非常常见的问题，这是因为 npm 的官方服务器在海外，国内直连经常会出现网络延迟高、超时甚至卡死的情况。

将镜像源切换到国内的镜像站（如阿里云/淘宝镜像），下载速度通常能提升 3-10 倍。以下是几种常用的指定国内源的方法：

### 🚀 方法一：永久修改为国内源（强烈推荐）
这种方法只需要执行一次，之后所有的 `npm install` 都会默认使用国内源，一劳永逸。目前最推荐使用阿里云（原淘宝 npm 镜像）：

1. **设置国内镜像源**：
   ```bash
   npm config set registry https://registry.npmmirror.com
   ```
2. **验证是否设置成功**：
   ```bash
   npm config get registry
   ```
   如果终端返回 `https://registry.npmmirror.com`，就说明配置成功了。

*(如果以后想恢复回官方源，可以运行 `npm config set registry https://registry.npmjs.org`)*

### ⚡ 方法二：单次临时指定源
如果你不想修改全局配置，只是偶尔某次安装太慢，可以在安装命令后面加上 `--registry` 参数来临时指定：

```bash
npm install <包名> --registry=https://registry.npmmirror.com
# 例如：
npm install axios --registry=https://registry.npmmirror.com
```
*(如果你是在解决刚才 `vite: not found` 的问题，可以直接运行 `npm install --registry=https://registry.npmmirror.com` 来重新安装当前项目的依赖)*

### 🛠️ 方法三：使用 nrm 工具一键管理（进阶推荐）
如果你经常需要在不同的镜像源之间切换（比如有时需要切回官方源测试），推荐使用 `nrm` (npm registry manager) 这个工具。

1. **全局安装 nrm**：
   ```bash
   npm install -g nrm
   ```
2. **查看和切换源**：
   ```bash
   nrm ls          # 列出所有可用的镜像源
   nrm use taobao  # 一键切换到淘宝/阿里云镜像
   nrm test        # 测试所有镜像源的当前网速
   ```

### 💡 其他国内常用镜像源
除了最推荐的阿里云（淘宝）镜像，你也可以根据你所在的网络环境选择腾讯云或华为云的镜像：
*   **腾讯云**：`npm config set registry https://mirrors.cloud.tencent.com/npm/`
*   **华为云**：`npm config set registry https://mirrors.huaweicloud.com/repository/npm/`

建议你先试试**方法一**，永久配置好之后，以后在前端开发中安装依赖的体验会流畅很多！
=================================================================

没错，**极大概率就是因为没有配置国内源**。

在国内，`uv` 默认连接官方的 PyPI 服务器下载 Python 依赖包，速度会非常慢，甚至经常因为网络超时而卡住不动，导致你长时间看不到任何输出。

别担心，我们立刻给它配置上国内镜像源（比如清华大学或阿里云），速度会瞬间提上来！你可以选择以下任意一种方法来解决：

### ⚡ 方法一：临时指定国内源（最快验证）
如果你只是想赶紧把服务跑起来，可以直接在运行命令时加上 `--index` 参数来临时指定国内源。

在终端中运行以下命令（顺便帮你把 `unicorn` 纠正为 `uvicorn`，并规范了写法）：
```bash
uv run --index https://pypi.tuna.tsinghua.edu.cn/simple uvicorn app.main:app --reload --port 9000
```
运行后，你应该很快就能看到类似 `Downloading...` 或 `Installing...` 的进度提示了。

### 🚀 方法二：为 uv 配置全局国内源（一劳永逸）
如果你希望以后每次使用 `uv` 都能飞快下载，可以给它设置一个全局的国内镜像源。

在 WSL 终端中，直接运行下面这行命令，将清华源配置到你的环境变量中：
```bash
echo 'export UV_INDEX_URL="https://pypi.tuna.tsinghua.edu.cn/simple"' >> ~/.bashrc && source ~/.bashrc
```
*(如果你使用的是 `zsh`，把上面的 `.bashrc` 换成 `.zshrc` 即可)*

配置完成后，你直接运行原本的命令（注意纠正拼写）就能享受极速下载了：
```bash
uv run uvicorn app.main:app --reload --port 9000
```

### 💡 补充说明
* **命令纠正**：启动 FastAPI 的 ASGI 服务器叫 `uvicorn`（不是 `unicorn` 哦）。
* **标准写法**：`uvicorn` 指定模块和 app 实例时，标准格式是用冒号连接，即 `app.main:app`（代表 `app/main.py` 文件里的 `app` 变量）。

快试试加上国内源，看看是不是很快就开始跑起来了！如果配置后还有报错，随时把终端的报错信息发给我。

==============================================================================

设置了国内源依然没有输出，这确实有点反常。不过别急，我们可以按以下步骤快速定位到底是哪里卡住了：

### 1. 确认国内源是否真正生效
首先，我们需要确认刚才的源配置是否真的写进去了。请在终端输入以下命令查看：
```bash
echo $UV_INDEX_URL
```
* **如果输出了** `https://pypi.tuna.tsinghua.edu.cn/simple`，说明配置没问题，问题出在其他地方（请直接看第2步）。
* **如果没有输出或为空**，说明刚才的配置没生效。你可以直接运行这行命令临时指定源：
  ```bash
  uv run --index https://pypi.tuna.tsinghua.edu.cn/simple uvicorn app.main:app --reload --port 9000
  ```

### 2. 检查 uv 是否还在后台“偷偷”下载
如果源配置没问题，但依然没输出，可能是 `uv` 正在后台下载较大的依赖包（比如 `numpy`、`pandas` 等），只是没有实时刷新进度。
* **尝试按下回车键**：有时候终端的缓冲区会卡住，按一下回车可能会把隐藏的进度或提示刷出来。
* **查看网络活动**：如果你能打开系统监视器，看看 `uv` 或 `python` 进程是否有网络下载流量。如果有流量，说明它正在努力下载，只是比较慢。

### 3. 强制中断并清理缓存重试
如果卡住超过 5 分钟依然纹丝不动，建议直接按下 `Ctrl + C` 强制终止当前命令。然后清理一下 `uv` 的缓存，重新跑一次：
```bash
# 清理 uv 的缓存
uv cache clean
# 重新尝试运行（带上国内源）
uv run --index https://pypi.tuna.tsinghua.edu.cn/simple uvicorn app.main:app --reload --port 9000
```

### 4. 排查项目结构或命令错误
如果清理缓存后依然没有任何输出（甚至没有报错直接退出），那可能是命令本身找不到对应的文件或模块，导致程序直接静默退出了。请确认：
* **文件路径是否正确**：你的项目目录下，是否真的有 `app` 这个文件夹，且里面有一个 `main.py` 文件？
* **变量名是否正确**：`main.py` 里面是否真的定义了 `app = FastAPI()`？
* **尝试简化命令**：如果你的 `main.py` 就在当前目录下（没有 `app` 文件夹），命令应该改为：
  ```bash
  uv run --index https://pypi.tuna.tsinghua.edu.cn/simple uvicorn main:app --reload --port 9000
  ```

### 5. 终极排查：手动测试 Python 导入
如果以上都不行，我们可以绕过 `uv run`，直接用 Python 看看能不能导入你的项目。在终端运行：
```bash
uv run python -c "from app.main import app; print('导入成功！')"
```
* **如果报错**：终端会打印出具体的 Python 报错信息（比如 `ModuleNotFoundError` 或 `ImportError`），把这个报错发给我，我能立刻帮你定位代码或环境问题。
* **如果打印“导入成功！”**：说明代码没问题，问题出在 `uvicorn` 启动环节。

你先试试按下回车或者强制中断清理缓存，看看能不能把隐藏的报错给“逼”出来！如果还是不行，把第5步的测试结果告诉我。

=======================================================================

根据你提供的报错日志，问题的核心原因非常明确：**Python 版本不兼容**。

### 🚨 核心报错原因
报错信息指出：
> `error: the configured Python interpreter version (3.14) is newer than PyO3's maximum supported version (3.13)`

**简单来说：** `uv` 自动下载并使用了最新的 **Python 3.14** 来构建项目，但你的项目依赖（`pydantic-core`）底层使用了 Rust 编写的绑定（`PyO3`），而目前的 `PyO3` 库版本（0.22.2）还不支持 Python 3.14，它最高只支持到 Python 3.13。

---

### 💡 解决方案

要解决这个问题，我们需要**强制指定一个 Python 3.13 的版本**来运行项目，而不是使用默认的最新版。

#### 1. 创建 Python 3.13 的虚拟环境
在你的 WSL 终端中，先退出当前可能存在的环境，然后运行以下命令创建一个基于 Python 3.13 的新环境：

```bash
# 1. 先确保你安装了 python-launcher (如果提示找不到 python3.13)
# 如果已经安装过 python-launcher 可以跳过这一步
sudo apt update
sudo apt install -y python3.13 python3.13-venv python3.13-dev

# 2. 使用 python-launcher 创建基于 3.13 的虚拟环境
python3.13 -m venv .venv
```

#### 2. 激活虚拟环境
```bash
source .venv/bin/activate
```
激活后，你的终端提示符前面应该会出现 `(.venv)` 的字样。

#### 3. 升级 pip 并重新安装依赖
在激活的虚拟环境中，先升级 pip，然后重新安装项目依赖（记得带上国内源）：
```bash
pip install --upgrade pip
pip install -r requirements.txt --index-url https://pypi.tuna.tsinghua.edu.cn/simple
```
*(如果你没有 `requirements.txt`，直接运行 `pip install uvicorn fastapi` 等核心依赖即可)*

#### 4. 使用指定的 Python 解释器运行 uv
现在，使用当前虚拟环境里的 Python 3.13 来运行 uv 命令：
```bash
uv run --python python3.13 uvicorn main:app --reload --port 9000
```

---

### 📝 补充说明
*   **为什么会出现这个问题？** `uv` 默认会尝试使用最新的 Python 版本（3.14）来获得最佳性能，但很多底层用 C/Rust 编写的库（如 numpy, pandas, pydantic）需要重新编译才能支持新版本的 Python。在这些库更新支持之前，降级使用 Python 3.13 是最稳妥的方案。
*   **关于清华源**：你配置的 `https://pypi.tuna.tsinghua.edu.cn/simple` 是清华大学 TUNA 协会维护的 PyPI 镜像站，它能极大地加速国内的包下载速度，配置是正确的，继续使用即可。

=================================================================================

/home/qcg/.local/bin/python3.11

==================================================================================
既然你已经安装了 Python 3.11，那问题就很好解决了！我们可以直接强制 `uv` 使用这个版本的 Python 来运行项目，完美避开 Python 3.14 的兼容性问题。

你可以直接运行下面这条命令：

```bash
uv run --python /home/qcg/.local/bin/python3.11 uvicorn main:app --reload --port 9000
```

### 💡 命令解析
* `--python /home/qcg/.local/bin/python3.11`：这行参数会明确告诉 `uv`，不要自作聪明去下载最新的 Python 3.14，而是乖乖使用你指定的 Python 3.11 来创建环境并运行项目。
* `uvicorn main:app --reload --port 9000`：这是标准的 Uvicorn 启动命令，`main:app` 表示加载 `main.py` 文件里的 `app` 实例，`--reload` 开启热重载（方便开发调试），`--port 9000` 指定端口。

### 🛠️ 如果运行后提示找不到 uvicorn
如果执行上述命令后，报错提示找不到 `uvicorn` 模块，说明当前 Python 3.11 的环境里还没有安装相关依赖。你只需要在命令前面加上依赖包名，让 `uv` 自动帮你安装即可：

```bash
uv run --python /home/qcg/.local/bin/python3.11 uvicorn fastapi uvicorn main:app --reload --port 9000
```
*(注：这里加上了 `fastapi` 和 `uvicorn`，`uv` 会自动检测并安装它们到 Python 3.11 的独立环境中)*

快去终端试试吧！这次应该能顺利跑起来，并且能看到 Uvicorn 的启动日志了。
=====================================================================================

这个报错 `HCS_E_SERVICE_NOT_AVAILABLE` 非常明确，说明你的 WSL（Windows Subsystem for Linux）无法正常启动，是因为 Windows 系统中的**“虚拟机平台”功能没有被正确启用**。

请按照以下步骤依次排查和修复，通常第一步就能解决你的问题：

### 1. 开启 Windows 虚拟机平台功能
这是最核心的解决步骤，有两种方式可以操作：

*   **图形界面操作（推荐）：**
    1. 按下键盘上的 `Win + R` 键，输入 `appwiz.cpl` 并回车，打开“程序和功能”。
    2. 点击左侧的“**启用或关闭 Windows 功能**”。
    3. 在弹出的列表中找到并**勾选**以下两项（如果其中一项没有，至少保证“虚拟机平台”被勾选）：
        *   **虚拟机平台 (Virtual Machine Platform)**
        *   **适用于 Linux 的 Windows 子系统 (Windows Subsystem for Linux)**
    4. 点击确定，等待系统自动安装所需文件，完成后**重启电脑**。

*   **命令行强制开启（如果图形界面找不到选项）：**
    1. 在开始菜单搜索 `PowerShell`，右键选择“**以管理员身份运行**”。
    2. 复制并粘贴以下命令，然后按回车执行：
        ```powershell
        dism.exe /Online /Enable-Feature /FeatureName:VirtualMachinePlatform /All
        ```
    3. 执行完毕后，**重启电脑**。

### 2. 检查 BIOS 虚拟化设置
如果开启上述功能并重启后依然报错，说明你的电脑主板可能没有在 BIOS 中开启硬件虚拟化技术。
*   **排查方法：** 重启电脑进入 BIOS 设置（通常开机时按 F2、Del 或 F12，具体取决于你的电脑品牌）。
*   **寻找选项：** 找到类似 **Intel VT-x** 或 **AMD-V** 的选项，确保它处于 **Enabled（开启）** 状态。

### 3. 检查 Windows 系统版本
某些较旧或特定版本的 Windows 11（如 21H2）在 Hyper-V 虚拟化栈上存在兼容性问题。
*   **排查方法：** 按下 `Win + R`，输入 `winver` 查看版本。
*   **建议：** 如果你的系统版本较老，建议通过 Windows Update 将系统升级到最新版本（如 Windows 11 23H2 或更高版本），这能彻底规避一些底层的兼容性错误。

### 4. 修复系统组件（保底方案）
如果以上方法都无效，可能是系统相关组件出现了损坏。你可以尝试以管理员身份运行命令提示符或 PowerShell，依次执行以下两条命令来扫描并修复系统文件：
```powershell
DISM /Online /Cleanup-Image /RestoreHealth
sfc /scannow
```
等待修复完成后，再次重启电脑尝试启动 WSL。

建议你先从**第一步**开始操作，绝大多数情况下，勾选“虚拟机平台”并重启就能完美解决这个问题。如果还有其他报错，随时告诉我！
=============================================================================================
