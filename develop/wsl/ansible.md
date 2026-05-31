找到根因了，来看详细分析：
实测结果
测试	耗时
SSH TCP 直连	0.05s
ansible -m raw "date"	2.1s
ansible -m ping	14.8s
ansible -m script	14.1s
ansible-playbook edge_statistic	11.4s
HTTP POST 完整请求	12.9s
瓶颈定位
关键发现：~/.ansible/cp/ 目录不存在，SSH ControlMaster 失效。每次连接都做完整密码认证。
一次 playbook 跑了 5 次 SSH 连接：
1. echo ~jboss (查找 homedir)
2. mkdir -p (创建临时目录)
3. sftp put cron_check.sh (上传脚本)
4. chmod +x (加执行权限)
5. 执行 cron_check.sh
没有 ControlMaster → 5 次独立密码认证，每次 ~2s → 10s 浪费在重复认证上。实际脚本执行不到 0.5s。
两种优化方案
方案 A：SSH 密钥认证（推荐，一劳永逸）
# 1. 生成密钥（如果还没有）
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""

# 2. 复制到目标节点
ssh-copy-id -o StrictHostKeyChecking=no jboss@192.168.100.235
**效果：每次 SSH 从 2s → 0.05s，5 次连接从 10s → 0.25s，总耗时降到 ~1-2s**
方案 B：安装 sshpass + 修复 ControlPath 目录（低成本修）
# 1. 安装 sshpass
sudo apt install sshpass  # Ubuntu/Debian
sudo yum install sshpass  # CentOS/RHEL

# 2. 创建 ControlPath 目录（已做）
mkdir -p ~/.ansible/cp && chmod 700 ~/.ansible/cp
效果：ControlMaster 复用连接，5 次认证降为 1 次，总耗时从 11s 降到 ~4-5s
建议：方案 A（密钥认证）最彻底，方案 B 作为备选。你那边能直接做密钥认证吗？还是先装 sshpass 试试？

=====================================================================================


找到根因了。问题不在我们这边，在 目标节点（192.168.100.235）的 shell 初始化太慢：
逐级定位
SSH TCP 连接:        0.05s
SSH 认证 (密钥):     0.04s
SSH 认证后 ~ 执行命令:  3.5s  ← 这就是瓶颈！
                          ↑
                  远端服务器 .bashrc 初始化
3.5s 花在了哪里？远端 .bashrc 里有这些：
# conda init — 启动 Python 解释器评估 hook
/work/jboss/anaconda3/bin/conda shell.bash hook   →  ~0.5s

# nvm init — 加载 Node Version Manager
source ~/.nvm/nvm.sh                               →  ~0.3s

# /etc/bashrc + /etc/profile.d/lang.sh
# 以及 locale 配置异常导致 "manpath: can't set the locale"
# 反复尝试搜索 locale 数据                          →  ~2-3s
以上所有东西 每次 SSH 连接都要跑一遍。而 ansible 一次查询要建 5 次 SSH 连接 → 5 × 3.5s = 17.5s —— 和实际观察的 12-14s 基本吻合（ControlMaster 能省掉一部分认证时间，但 shell init 躲不掉）。
可选的优化方向
方案 1：在目标节点上优化 shell（最有效）
SSH 到 192.168.100.235，把 .bashrc 里 conda 和 nvm 初始化包起来，非交互式登录时不执行：
# .bashrc 里 conda/nvm 初始化改为：
if [[ $- == *i* ]]; then
    # 交互式 shell 才加载
    /work/jboss/anaconda3/bin/conda shell.bash hook
    source ~/.nvm/nvm.sh
fi
效果预估：每次 SSH 从 3.5s → 0.3s 以内，总查询时间从 12s → 1-2s
方案 2：减少 SSH 连接次数（不改远端）
用 raw 模块替换 playbook 里的 script 模块，把 5 次 SSH 连接降到 1 次。需要改 ansible role 的实现。
效果预估：1 次 × 3.5s = ~4s
方案 3：ControlMaster + 长连接
当前 ControlPath 可用，但控制 socket 只保持 60s。加长到 600s 后，连续操作的第二下开始就能复用前一次的 shell 会话，每次 ~0.2s。
效果预估：第一次 12s，连续第二次 ~1-2s
最推荐方案 1，3 分钟改完目标节点一行配置。你那边能 SSH 到 192.168.100.235 上改 .bashrc 吗？

=========================================================================================
找到根因了。/etc/locale.conf 写的是 LANG=en_US.UTF-8，但系统里实际安装的是 en_US.utf8（小写）。大小写不匹配，glibc 每次都要搜一遍全部 794 种 locale 数据去找匹配项，这是那 2-3s 延迟的来源。
SSH 到 192.168.100.235 上执行下面任意一条即可：

确认了。/etc/locale.conf 写的是：
LANG=en_US.UTF-8
但系统实际安装的 locale 是 en_US.utf8（小写）。en_US.UTF-8（大写）不存在。
每次 SSH 登录时，shell 初始化脚本按 /etc/locale.conf 设 LANG=en_US.UTF-8，glibc 找不到这个 locale，就全量搜索 794 种 locale 数据，每次多花 2-3 秒。manpath: can't set the locale 也是这个原因。
在目标机器（192.168.100.235）上执行以下任一命令修复：
方法 1（推荐） — 把 /etc/locale.conf 改成已安装的 locale 名称：
sudo sed -i 's/en_US.UTF-8/en_US.utf8/' /etc/locale.conf
方法 2 — 生成缺失的 locale（如果 localedef 可用）：
sudo localedef -i en_US -f UTF-8 en_US.UTF-8
改完后再试一次 SSH 到那台机器，如果不再出现 manpath: can't set the locale 的警告，就说明修好了。修改是立即生效的，不需要重启。
========================================================================================

原因有几个：
1. ansible.cfg 没设 ControlPath（主因）
当前 ssh_args 只有：
ssh_args = -o ControlMaster=auto -o ControlPersist=60s
没有 -o ControlPath=...。OpenSSH 在没有 ControlPath 时的默认行为因版本而异——有些版本会在 SSH 进程退出后自动清理 socket，或者两个连接生成的 socket 路径不一致，导致第二个找不到第一个的 socket，又建新的。
2. ansible_runner 每次跑的 SSH 指纹可能不同
ansible_runner.run() 每次调用可能会生成不同的 artifact 目录路径，如果 ControlPath 和 artifact 目录绑定，第二次就跑偏了。
3. ControlPersist 的 60s 是从最后一个连接关闭开始算的
不是从连接建立开始算。playbook 跑 12s，结束后 socket 再保留 60s。但如果中间有其他进程或系统定时任务清理了 /home/qcg/.ansible/cp/ 目录，socket 就丢了。
修复
在 backend/ansible/ansible.cfg 里显式指定 ControlPath：
[ssh_connection]
ssh_args = -o ControlMaster=auto -o ControlPersist=600s -o ControlPath=~/.ansible/cp/%%h-%%p-%%r
pipelining = True
%%h = host, %%p = port, %%r = remote user（在 ansible.cfg 里要用双 %% 转义）。
效果：
- 第一次 playbook：12s（建 socket）
- 第二次 playbook（10分钟内）：*~5s*（复用 socket，5次 SSH 中只有第一次走完整认证 + shell init，后面 4 次走控制通道）
- 第三次、第四次：同样 ~5s
要改吗？
=====================================================================================