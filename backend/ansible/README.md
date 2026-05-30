# edge-ansible

# master server 建立 jboss 用户

```bash
mkdir  /work

# 添加组
groupadd jboss

# 删除用户: userdel jboss

# 添加用户
useradd -d /work/jboss -g jboss -p '$6$iN.SGDwZ$kscEB5ff6yYkHLQSMabxa6qHLQ1NUHa51/a9Wz1jR6enlUcgK19HjLcNhke86jqOjSXCrGLwCRJpjFeooqLU3.' jboss

# 注：此加密密码为：jboss@12306

chown jboss:jboss /work
```

# 普通用户离线安装 ansible-runner

## 1. 安装 anaconda

anaconda 安装 shell 已经自带 pyhone 等各种组件，所有运行安装命令一路默认即可

```bash

# 1. 下载地址:
ftp://192.168.0.18/pub/ansible/ansible-runner-offline.zip
curl ftp://192.168.0.18/pub/ansible/ansible-runner-offline.zip -o ansible-runner-offline.zip

# 2. 解压 zip 文件
unzip ansible-runner-offline.zip
# 或者使用 jar xf 解压 zip 文件
jar xf ansible-runner-offline.zip

# 3. 安装 anaconda3
cd ansible-runner-offline
bash Anaconda3-2023.03-1-Linux-x86_64.sh

# 或者安装 Anaconda3 新版本
wget https://repo.anaconda.com/archive/Anaconda3-2023.07-1-Linux-x86_64.sh
bash Anaconda3-2023.07-1-Linux-x86_64.sh

# 过程比较慢
# by running conda init? [yes|no]
# yes

# 4. 验证
source ~/.bashrc
python -V
```

## 2. 安装 ansible-runner

```bash

cd ansible-runner-offline/

# 安装 ansible 依赖
pip install --no-index --find-links ./requires -r requires/requirements.txt

# 安装 ansible_runner
pip install ./requires/ansible_runner-2.3.3.dev4-py3-none-any.whl

# 安装 ansible 本身的依赖
conda install sshpass-1.06-h516909a_0.tar.bz2 --offline

```

# 免密登录

```bash

# ssh gen key, 默认回车,不用设置
ssh-keygen -t rsa

# 免密登录 ip
ssh-copy-id jboss@192.168.100.141
# 免密登录 ip
ssh-copy-id jboss@192.168.120.14

# 测试
ssh  jboss@192.168.120.14

```

# 项目地址

```bash
origin  git@gitlab.gzky.com:jack.qi/edge-ansible.git (fetch)
origin  git@gitlab.gzky.com:jack.qi/edge-ansible.git (push)

```

# ansible 脚本目录及配置文件

```bash

# ansible 脚本根地址
cd /work/jboss/edge-ansible

# host 文件, 存储管理的主机和用户名,密码
cd /work/jboss/edge-ansible/inventory
cat host

# all.yaml 文件路径, 存储默认的全局变量
cd /work/jboss/edge-ansible/group_vars
cat all.yaml

# soft 安装软件存放目录
cd /work/jboss/edge-ansible/soft
```

# 安装 openresty 服务 (仅安装nginx)

```bash
# 参数
# ips : slave 服务器 ip 列表, 多台以 , 半角逗号分隔
# prefix : 要安装的程序路径, 多台以 , 半角逗号分隔
           注意: 安装目录最后没有 "/"
# srcpath : master 服务器上的安装文件路径, 
            注意: 目录以  "/" 符号结尾
            /work/soft   是传文件或目录 soft, 目的地址会有 soft 文件或目录 
            /work/soft/  是传目录下的文件, 传输的是 soft 目录下的文件   
# destpath: slave 服务器上的安装软件存放地址
            注意: destpath 路径中最后一定要以  "/" 结束, 代表目录
            /work/soft/  接收到的文件或目录都放到这个目录下

# 单台
ansible-runner run -p edge.yml -i "runner-test" \
--tags openresty_build \
--extra-vars \
"ips=192.168.100.235  \
prefix=/data/qcg/openresty-1.21.4 \
srcpath=/data/qcg/edge-ansible/soft \
destpath=/data/qcg/" \
/data/qcg/edge-ansible/

```

# 安装 edge1.0 服务 (安装openresty 和 edge1.0)

```bash
# 参数
# ips : slave 服务器 ip 列表, 多台以 , 半角逗号分隔
# prefix : 要安装的程序路径, 多台以 , 半角逗号分隔
           注意: 安装目录最后没有 "/"
# srcpath : master 服务器上的安装文件路径, 
            注意: 目录以  "/" 符号结尾
            /work/soft   是传文件或目录 soft, 目的地址会有 soft 文件或目录 
            /work/soft/  是传目录下的文件, 传输的是 soft 目录下的文件   
# destpath: slave 服务器上的安装软件存放地址
            注意: destpath 路径中最后一定要以  "/" 结束, 代表目录
            /work/soft/  接收到的文件或目录都放到这个目录下

# 单台
ansible-runner run -p edge.yml -i "runner-test" \
--tags edge_build \
--extra-vars \
"ips=192.168.120.14  \
prefix=/work/jboss/openresty-14 \
srcpath=/work/jboss/edge-ansible/soft \
destpath=/work/jboss/" \
/work/jboss/edge-ansible/

```

# 安装 edge2.5 服务 (安装openresty 和 edge2.5)

```bash
# 参数
# ips : slave 服务器 ip 列表, 多台以 , 半角逗号分隔
# prefix : 要安装的程序路径, 多台以 , 半角逗号分隔
           注意: 安装目录最后没有 "/"
# srcpath : master 服务器上的安装文件路径, 
            注意: 目录以  "/" 符号结尾
            /work/soft   是传文件或目录 soft, 目的地址会有 soft 文件或目录 
            /work/soft/  是传目录下的文件, 传输的是 soft 目录下的文件   
# destpath: slave 服务器上的安装软件存放地址
            注意: destpath 路径中最后一定要以  "/" 结束, 代表目录
            /work/soft/  接收到的文件或目录都放到这个目录下

# 单台
ansible-runner run -p edge.yml -i "runner-test" \
--tags edge_2.5_build \
--extra-vars \
"ips=192.168.100.235  \
prefix=/data/qcg/uapm/openresty-edge2.5 \
srcpath=/data/qcg/edge-ansible/soft \
destpath=/data/qcg/uapm/" \
/data/qcg/edge-ansible/

```

# 关联 edge2.5 和 openresty nginx 服务

```bash
# 参数
# ips : slave 服务器 ip 列表, 多台以 , 半角逗号分隔
# edgepath:  edge2.5 软件路径, 多台以 , 半角逗号分隔
            注意: 路径最后没有 "/"
# openrestypath : openresty 程序路径, 多台以 , 半角逗号分隔
            注意: 路径最后没有 "/"



# 单台
ansible-runner run -p edge.yml -i "runner-test" \
--tags edge_init_openresty \
--extra-vars \
"ips=192.168.100.235  \
edgepath=/data/qcg/uapm/uap-edge \
openrestypath=/data/qcg/uapm-2.5/openresty-edge2.5" \
/data/qcg/edge-ansible/

# 多台
ansible-runner run -p edge.yml -i "runner-test" \
--tags edge_init_openresty \
--extra-vars \
"ips=192.168.100.235,192.168.100.235  \
edgepath=/data/qcg/uapm/uap-edge,/data/qcg/uapm-2.5/uap-edge \
openrestypath=/data/qcg/uapm/openresty-edge2.5,/data/qcg/uapm-2.5/openresty-edge2.5" \
/data/qcg/edge-ansible/
```

# 初始化 edge2.5 环境

```bash
# 参数
# ips : slave 服务器 ip 列表, 多台以 , 半角逗号分隔
# srcpath : 源文件程序路径
            注意: 路径最后没有 "/"
# filetype : 源文件类型
            env ：表示 srcpath 为 文件
			site：表示 srcpath 为 tar 压缩的文件
			env_site： 表示 srcpath 为 tar 压缩的文件
# destpath:  edge2.5 软件路径, 多台以 , 半角逗号分隔
            注意: 路径最后没有 "/"

# 单台 env
ansible-runner run -p edge.yml -i "runner-test" \
--tags edge_init_env \
--extra-vars \
"ips=192.168.100.235  \
srcpath=/tmp/edge.env \
filetype=env \
destpath=/data/qcg/uapm/uap-edge" \
/data/qcg/edge-ansible/

# 单台 env_site
ansible-runner run -p edge.yml -i "runner-test" \
--tags edge_init_env \
--extra-vars \
"ips=192.168.100.235  \
srcpath=/tmp/mobile1.env.tar.gz \
filetype=env_site \
destpath=/data/qcg/uapm/uap-edge" \
/data/qcg/edge-ansible/

# 多台 env
ansible-runner run -p edge.yml -i "runner-test" \
--tags edge_init_env \
--extra-vars \
"ips=192.168.100.235,192.168.100.235  \
srcpath=/tmp/edge.env \
filetype=env \
destpath=/data/qcg/uapm/uap-edge,/data/qcg/uapm-2.5/uap-edge" \
/data/qcg/edge-ansible/

# 多台 env_site
ansible-runner run -p edge.yml -i "runner-test" \
--tags edge_init_env \
--extra-vars \
"ips=192.168.100.235,192.168.100.235  \
srcpath=/tmp/mobile1.env.tar.gz \
filetype=env_site \
destpath=/data/qcg/uapm/uap-edge,/data/qcg/uapm-2.5/uap-edge" \
/data/qcg/edge-ansible/
```

# 启动, 停止, reload 和 查看状态 (edge1.0 和 edge 2.5 通用)

```bash
# 参数
# ips : slave 服务器 ip 列表, 多台以 , 半角逗号分隔
# nginx_cmd : 命令, 包括 nginx_start, nginx_stop, nginx_reload, nginx_check
# prefix : slave 服务器的 openresty 安装路径或者 uap-edge 安装路径, 多台以 , 半角逗号分隔
           注意: 安装目录最后没有 "/", 以 uap-edge 结尾为 edge2.5版，其它为edge1.0版
# ports : edge 程序管理端口, 多台以 , 半角逗号分隔
# -vvv : 显示调试详细信息

# 单台 nginx_check
ansible-runner run -p edge.yml --tags nginx_cmd_run -i "runner-test" --extra-vars "ips=192.168.100.235 nginx_cmd=nginx_check prefix=/data/qcg/uapm/uap-edge ports='16620' " /data/qcg/edge-ansible/

# 单台 nginx_start
ansible-runner run -p edge.yml --tags nginx_cmd_run -i "runner-test" --extra-vars "ips=192.168.100.235 nginx_cmd=nginx_start prefix=/data/qcg/uapm/uap-edge ports='16620' " /data/qcg/edge-ansible/

# 单台 nginx_stop
ansible-runner run -p edge.yml --tags nginx_cmd_run -i "runner-test" --extra-vars "ips=192.168.100.235 nginx_cmd=nginx_stop prefix=/data/qcg/uapm/uap-edge ports='16620' " /data/qcg/edge-ansible/

# 单台 nginx_reload
ansible-runner run -p edge.yml --tags nginx_cmd_run -i "runner-test" --extra-vars "ips=192.168.100.235 nginx_cmd=nginx_reload prefix=/data/qcg/uapm/uap-edge ports='16620' " /data/qcg/edge-ansible/

# 多台 nginx_check
ansible-runner run -p edge.yml --tags nginx_cmd_run -i "runner-test" --extra-vars "ips=192.168.100.235,192.168.100.235 nginx_cmd=nginx_check prefix=/data/qcg/uapm/uap-edge,/data/qcg/uapm-2.5/uap-edge ports='16620,16621' " /data/qcg/edge-ansible/

# 多台 nginx_start
ansible-runner run -p edge.yml --tags nginx_cmd_run -i "runner-test" --extra-vars "ips=192.168.100.235,192.168.100.235 nginx_cmd=nginx_start prefix=/data/qcg/uapm/uap-edge,/data/qcg/uapm-2.5/uap-edge ports='16620,16621' " /data/qcg/edge-ansible/

# 多台 nginx_stop
ansible-runner run -p edge.yml --tags nginx_cmd_run -i "runner-test" --extra-vars "ips=192.168.100.235,192.168.100.235 nginx_cmd=nginx_stop prefix=/data/qcg/uapm/uap-edge,/data/qcg/uapm-2.5/uap-edge ports='16620,16621' " /data/qcg/edge-ansible/

# 多台 nginx_reload
ansible-runner run -p edge.yml --tags nginx_cmd_run -i "runner-test" --extra-vars "ips=192.168.100.235,192.168.100.235 nginx_cmd=nginx_reload prefix=/data/qcg/uapm/uap-edge,/data/qcg/uapm-2.5/uap-edge ports='16620,16621' " /data/qcg/edge-ansible/

```

# 查看日志

```bash
# 参数
# ips : slave 服务器 ip 列表, 多台以 , 半角逗号分隔
# paths : 日志文件的路径, 多台以 , 半角逗号分隔
# number_line: 返回的日志条数, 不设置默认是 10 条

# 单台
ansible-runner run -p edge.yml -i "runner-test" --tags edge_tail_log --extra-vars "ips=192.168.120.14 paths=/work/jboss/openresty-14/nginx/logs/error.log" /work/jboss/edge-ansible/

# 多台, 指定行数为 3 行
ansible-runner run -p edge.yml -i "runner-test" --tags edge_tail_log --extra-vars "ips=192.168.120.14,192.168.100.141 paths=/work/jboss/openresty-14/nginx/logs/error.log,/work/jboss/openresty-141/nginx/logs/error.log number_line=3" /work/jboss/edge-ansible/
```

# 查看 cpu, memory, disk 统计数据 (edge1.0 和 edge 2.5 通用)

```bash
# 参数
# ips : slave 服务器列表, 多台以 , 半角逗号分隔
# prefix : slave 服务器的openresty 或者 uap-edge 程序安装路径, 多台以 , 半角逗号分隔
           注意: 安装目录最后没有 "/"，以 uap-edge结尾的是edge2.5版本, 其它为 edge1.0版本
# ports : slave 服务器的管理端口, 多台以 , 半角逗号分隔

# 单台
ansible-runner run -p edge.yml -i "runner-test" --tags edge_statistic --extra-vars "ips=192.168.100.235 prefix=/data/qcg/uapm/uap-edge ports='16620' " /data/qcg/edge-ansible/

# 多台
ansible-runner run -p edge.yml -i "runner-test" --tags edge_statistic --extra-vars "ips=192.168.120.14,192.168.100.141 prefix=/work/jboss/uapm/openresty-14,/work/jboss/uapm/openresty-141, ports='9990,9990'" /work/jboss/uapm/edge-ansible/

http://127.0.0.1:16620/edge/server_info
```

# 拷贝文件或目录(从 master 同步到 slave, 可多台)

```bash
# 参数
# ips :  slave 服务器 ip, 多台以 , 半角逗号分隔
# srcpath : master 服务器上的待传输文件地址, 多台以 , 半角逗号分隔
            注意: 目录以 "/" 符号结尾 
            /work/soft   是传文件或目录 soft, 目的地址会有 soft 文件或目录 
            /work/soft/  是传目录下的文件, 传输的是 soft 目录下的文件   
# destpath: 传输到 slave 服务器上的文件存放地址, 多台以 , 半角逗号分隔 
            注意: destpath 路径中最后一定要以  "/" 结束, 代表目录
            /work/soft/  接收到的文件或目录都放到这个目录下
        
# 1. 传送文件, 单台 
ansible-runner run -p edge.yml -i "runner-test" --tags edge_master_copy_to_slaves --extra-vars "ips=192.168.120.14 srcpath=/etc/profile destpath=/work/test-copy-14/" /work/jboss/edge-ansible/

# 2. 传送文件, 多台
ansible-runner run -p edge.yml -i "runner-test" --tags edge_master_copy_to_slaves --extra-vars "ips=192.168.120.14,192.168.100.141 srcpath=/etc/hosts,/etc/profile destpath=/work/test-copy-14/,/work/test-copy-141/" /work/jboss/edge-ansible/

# 3. 传送目录, 单台
ansible-runner run -p edge.yml -i "runner-test" --tags edge_master_copy_to_slaves --extra-vars "ips=192.168.120.14 srcpath=/work/jboss/edge-ansible/soft destpath=/work/test-copy-14/" /work/jboss/edge-ansible/

# 4. 传送目录, 多台
ansible-runner run -p edge.yml -i "runner-test" --tags edge_master_copy_to_slaves --extra-vars "ips=192.168.120.14,192.168.100.141 srcpath=/work/jboss/edge-ansible/env,/work/jboss/edge-ansible/group_vars destpath=/work/test-copy-14/,/work/test-copy-141/" /work/jboss/edge-ansible/
```

# 拷贝文件或目录(从 slave 同步到 master,单台)

```bash
# 参数
# ips : slave 服务器 ip, 不支持多台
# srcpath : slave 服务器上的待传输目录地址
            注意: 目录以 "/" 符号结尾 
            /work/soft   文件, 末尾不能有 "/" 符号 
            /work/soft/  目录, 路径中最后一定要以  "/" 结束
# destpath: 传输到 master 服务器上的文件存放地址 
            注意 destpath 路径中最后一定要以  "/" 结束, 代表目录
            /work/soft/  接收到的文件或目录都放到这个目录下
        
# 1. 传送文件
ansible-runner run -p edge.yml -i "runner-test" --tags edge_slave_copy_to_master --extra-vars "ips=192.168.100.141 srcpath=/work/141.txt destpath=/work/slave-141-tar/" /work/jboss/edge-ansible/

# 2. 传送目录
ansible-runner run -p edge.yml -i "runner-test" --tags edge_slave_copy_to_master --extra-vars "ips=192.168.100.141 srcpath=/work/test-copy-141/ destpath=/work/slave-141-tar/" /work/jboss/edge-ansible/

```

# 运行命令脚本

```bash
# 参数
# ips : slave 服务器 ip, 不支持多台
# script_path_name : master 服务器上的命令脚本地址

ansible-runner run -p edge.yml --tags edge_cmd_run -i runner-test --extra-vars "ips=192.168.120.14,192.168.100.141, script_path_name=/work/jboss/edge-ansible/cmd_scripts/cmd_run.sh"  /work/jboss/edge-ansible/

# 在 /work/jboss/edge-ansible/cmd_scripts/cmd_run.sh 中添加相关运行命令
# 例如:
cat cmd_run.sh

#!/bin/bash
#调用命令请使用绝对路径
free -m
```
