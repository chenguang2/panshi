# kylin 安装 panshi

## 解压

```
unzip panshi.zip
```

## 安装 uv

```
# 安装 uv
curl -LsSf https://astral.sh/uv/install.sh | sh
uv --version

# 加入路径
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
uv -h

# 加入阿里云源
mkdir -p ~/.config/uv && nano ~/.config/uv/config.toml

[registries.pypi]
index = "https://mirrors.aliyun.com/pypi/simple/"

# 按 Ctrl + O 保存文件，按回车确认，再按 Ctrl + X 退出编辑器

cat  ~/.config/uv/config.toml
```

## 转换格式

```
yum install -y dos2unix git
dos2unix gen-linux.sh
```

## 安装 nvm

```
# 设置 nvm 的源代码镜像为 Gitee
export NVM_SOURCE=https://gitee.com/mirrors/nvm.git

# 现在再运行安装脚本
curl -sSL https://gitee.com/mirrors/nvm/raw/master/install.sh | bash

# 自动在 ~/.bashrc 中加入了下面的路径
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

source ~/.bashrc
```

## 安装 node

```
# 临时生效
export NVM_NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node

# 永久生效（推荐）
echo 'export NVM_NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node' >> ~/.bashrc
source ~/.bashrc

# 最新版
nvm install latest

# 长期稳定版
nvm install --lts

# 检查
node -v
npm -v
```

## centos 7 开发机安装 node 16

```
# 卸载当前版本
nvm uninstall v24.16.0

# 安装Node.js 16 LTS
nvm install 16

# 设置为默认版本
nvm alias default 16

# 验证
node -v
npm -v
```

## centos 7 开发机安装必要软件 node 20

### 1. 下载并安装 node20 glibc-217 兼容版

```bash
# 1. 下载 Node.js 20 LTS 的 glibc-217 兼容版（以 v20.19.0 为例）
cd /tmp
wget https://unofficial-builds.nodejs.org/download/release/v20.19.0/node-v20.19.0-linux-x64-glibc-217.tar.gz

# 2. 解压
tar -zxvf node-v20.19.0-linux-x64-glibc-217.tar.gz

# 4. 添加到 PATH
echo 'export PATH=/home/qcg/soft/node-v20.19.0-linux-x64-glibc-217/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# 5. 验证版本
node -v
# 应该输出 v20.19.0
npm -v
```

### 2. 修改依赖包

```
编辑 backend/pyproject.toml

"greenlet>=3.0.0",

改为：

"greenlet>=2.0.0,<3.0.0",

```

### 3. 生成拷贝包

```
cd panshi/product/linux/
bash gen_linux.sh

将生成的 panshi 目录拷贝到目的机
```