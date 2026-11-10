/**
 * Keepalived 配置生成（tools-keepalived-generator）。
 *
 * 依据用户 3 节点 DNS 高可用样例（单播 VRRP + VIP + DNS 端口健康检查）模板化：
 * - 高级参数默认值 = 样例值（KEEPALIVED_DEFAULTS），未改参数即可逐字复现样例输出；
 * - 节点差异仅四处：router_id（前缀+序号）、priority（起始值按序递减步长）、
 *   unicast_src_ip（本机 IP）、unicast_peer（其余全部节点，不含本机）；
 * - 共用脚本（check_dns/notify_*）全节点一致，只输出一份；
 * - 与样例的两处刻意归一化：对端注释统一 16 空格（样例 16/15 不一致）、
 *   weight 注去掉样例残留的旧部署引用。
 * 模板空格为逐字对齐样例，勿随手重排（回归单测逐行钉死）。
 */
import { ipToInt } from './ip'

export interface KeepalivedGenInput {
  vip: string
  nodes: string[]
  iface: string
  maskBits: number
  vrrpId: number
  authPass: string
  priorityStart: number
  priorityStep: number
  routerIdPrefix: string
  checkPort: number
}

export const KEEPALIVED_DEFAULTS: Omit<KeepalivedGenInput, 'vip' | 'nodes' | 'iface'> = {
  maskBits: 24,
  vrrpId: 51,
  authPass: '12345678',
  priorityStart: 150,
  priorityStep: 10,
  routerIdPrefix: 'EDGE_DNS_',
  checkPort: 53,
}

export interface KeepalivedGenFile {
  /** 稳定 key（列表渲染） */
  key: string
  title: string
  filename: string
  /** 'shared' | `node-${ip}` */
  group: string
  content: string
}

export interface KeepalivedGenResult {
  files: KeepalivedGenFile[]
  handbook: string
}

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

export interface KeepalivedValidation {
  errors: string[]
  warnings: string[]
}

export function validateKeepalivedInput(input: KeepalivedGenInput): KeepalivedValidation {
  const errors: string[] = []
  const warnings: string[] = []
  if (!IPV4_RE.test(input.vip)) errors.push(`VIP 地址不是合法 IPv4：${input.vip || '（空）'}`)
  if (input.nodes.length < 2) errors.push('节点 IP 少于 2 个，无法组成 VRRP 高可用组')
  if (input.nodes.length > 8) errors.push('节点 IP 超过 8 个（单播 peer 列表过长，请拆分组）')
  const seen = new Set<string>()
  for (const ip of input.nodes) {
    if (!IPV4_RE.test(ip)) {
      errors.push(`节点 IP 不是合法 IPv4：${ip || '（空行）'}`)
      continue
    }
    if (seen.has(ip)) errors.push(`节点 IP 重复：${ip}`)
    seen.add(ip)
    if (ip === input.vip) errors.push(`VIP 与节点 IP 重复：${ip}（VIP 不能是节点本机地址）`)
  }
  if (IPV4_RE.test(input.vip) && input.nodes.length > 0 && input.nodes.every((ip) => IPV4_RE.test(ip))) {
    const mask = input.maskBits > 0 ? (input.maskBits < 32 ? ~(0xffffffff >>> input.maskBits) >>> 0 : 0xffffffff) : 0
    const vipNet = (ipToInt(input.vip) ?? 0) & mask
    const sameNet = input.nodes.filter((ip) => ((ipToInt(ip) ?? -1) & mask) === vipNet)
    if (sameNet.length === 0)
      warnings.push('VIP 与所有节点 IP 不在同一网段——单播 VRRP 通常要求 VIP 与节点同网段，请核对')
    else if (sameNet.length < input.nodes.length)
      warnings.push(`有 ${input.nodes.length - sameNet.length} 个节点 IP 与 VIP 不在同一网段，请核对`)
  }
  if ([...input.authPass].length > 8) warnings.push('认证密码超过 8 字符——keepalived PASS 认证仅前 8 字符生效')
  return { errors, warnings }
}

function priorityLabel(index: number): string {
  if (index === 0) return '最高优先级'
  if (index === 1) return '次高优先级'
  return '次级优先级'
}

function nodeConf(input: KeepalivedGenInput, index: number): string {
  const { vip, iface, maskBits, vrrpId, authPass, priorityStart, priorityStep, routerIdPrefix, checkPort } = input
  const self = input.nodes[index]!
  const peers = input.nodes.filter((_, i) => i !== index)
  const peerLines = peers.map((ip, i) => `        ${ip}                # 对端 ${i + 1}`).join('\n')
  return `global_defs {
    router_id ${routerIdPrefix}${index + 1}          # 本机标识，三台不同
    enable_script_security        # 启用脚本安全性
    script_user root              # 健康检查脚本运行用户
}

# ── 健康检查脚本 ──────────────────────────
# 检查本地服务 (端口 ${checkPort} TCP/UDP) 是否存活
vrrp_script chk_dns {
    script       "/etc/keepalived/check_dns.sh"
    interval     2                # 每 2 秒检查一次
    timeout      1                # 脚本超时 1 秒
    weight       -30              # 失败时优先级减 30
    rise         2                # 连续 2 次成功判定恢复
    fall         3                # 连续 3 次失败判定故障
}

# ── VRRP 实例 ────────────────────────────
vrrp_instance VI_DNS {
    state           BACKUP        # 所有节点均为 BACKUP，由 priority 决定 MASTER
    interface       ${iface}          # 绑定网卡名，根据实际环境修改
    virtual_router_id ${vrrpId}          # 同一 VRRP 组的 ID 必须一致 (1-255)
    priority        ${priorityStart - index * priorityStep}           # Edge-${index + 1} ${priorityLabel(index)}
    advert_int      1             # VRRP 通告间隔 1 秒

    # 单播模式配置
    unicast_src_ip  ${self}    # 本机 IP
    unicast_peer {
${peerLines}
    }

    # 认证（同一组内必须一致）
    authentication {
        auth_type      PASS
        auth_pass      ${authPass}     # 明文密码，自行修改
    }

    # 虚拟 IP 地址（VIP）
    virtual_ipaddress {
        ${vip}/${maskBits} dev ${iface} label ${iface}:vip
    }

    # 绑定健康检查脚本
    track_script {
        chk_dns
    }

    # 状态变化通知脚本
    notify_master "/etc/keepalived/notify_master.sh"
    notify_backup "/etc/keepalived/notify_backup.sh"
    notify_fault  "/etc/keepalived/notify_fault.sh"
}
`
}

function nodeFirewall(input: KeepalivedGenInput, index: number): string {
  const peers = input.nodes.filter((_, i) => i !== index)
  const rules = peers
    .map(
      (ip) =>
        `firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="${ip}" protocol value="vrrp" accept'`,
    )
    .join('\n')
  return `# 放行其余节点 VRRP 单播（方式一：逐对端放行，不含本机）
${rules}
firewall-cmd --reload

# 验证
firewall-cmd --list-rich-rules
tcpdump -i ${input.iface} -nn proto 112
`
}

function sharedScripts(input: KeepalivedGenInput): KeepalivedGenFile[] {
  return [
    {
      key: 'check_dns',
      title: '健康检查脚本（检查本地服务端口存活）',
      filename: 'check_dns.sh',
      group: 'shared',
      content: `#!/bin/bash\nss -ulnp | grep -q ':${input.checkPort} ' && exit 0 || exit 1\n`,
    },
    {
      key: 'notify_master',
      title: '状态通知：升级 MASTER',
      filename: 'notify_master.sh',
      group: 'shared',
      content: '#!/bin/bash\nlogger -t keepalived "VI_DNS: Became MASTER on $(hostname)"\n',
    },
    {
      key: 'notify_backup',
      title: '状态通知：降级 BACKUP',
      filename: 'notify_backup.sh',
      group: 'shared',
      content: '#!/bin/bash\nlogger -t keepalived "VI_DNS: Became BACKUP on $(hostname)"\n',
    },
    {
      key: 'notify_fault',
      title: '状态通知：故障',
      filename: 'notify_fault.sh',
      group: 'shared',
      content: '#!/bin/bash\nlogger -t keepalived "VI_DNS: FAULT on $(hostname)"\n',
    },
  ]
}

function handbook(input: KeepalivedGenInput): string {
  const { vip, iface, nodes } = input
  return `# Keepalived 部署手册（${nodes.length} 节点 · VIP ${vip}/${input.maskBits} @ ${iface}）

## 1. 写入配置与脚本
将本工具生成的各节点 keepalived.conf 与共用脚本写入各节点 /etc/keepalived/（conf 按节点对应，勿交叉）。

## 2. 脚本权限（所有节点）
chmod +x /etc/keepalived/check_dns.sh
chmod +x /etc/keepalived/notify_*.sh

## 3. 防火墙放行单播
方式一（推荐）：放行对端 IP——见各节点「防火墙放行」卡片，逐节点执行。
方式二：直接放行 VRRP 协议（所有节点执行）：
firewall-cmd --permanent --add-rich-rule='rule protocol value="vrrp" accept'
firewall-cmd --reload

## 4. 启动服务（所有节点）
systemctl daemon-reload
systemctl enable keepalived
systemctl start keepalived
systemctl status keepalived

## 5. 验证（所有节点）
keepalived -t -f /etc/keepalived/keepalived.conf   # 检查配置语法
ip addr show ${iface}:vip                            # 检查 VIP 是否在本机（仅 MASTER 有输出）
ip addr show ${iface} | grep ${vip}                  # 查看 VIP 在哪台服务器
ps aux | grep keepalived
journalctl -u keepalived -f
tcpdump -i ${iface} -nn proto 112                    # 抓 VRRP 通告（协议号 112）
`
}

export function generateKeepalivedConfig(input: KeepalivedGenInput): KeepalivedGenResult {
  const files: KeepalivedGenFile[] = [...sharedScripts(input)]
  input.nodes.forEach((ip, index) => {
    files.push({
      key: `conf-${ip}`,
      title: `keepalived.conf · ${ip}（Edge-${index + 1}）`,
      filename: `keepalived_${index + 1}_${ip}.conf`,
      group: `node-${ip}`,
      content: nodeConf(input, index),
    })
    files.push({
      key: `fw-${ip}`,
      title: `防火墙放行 · ${ip}`,
      filename: `firewall_${index + 1}_${ip}.sh`,
      group: `node-${ip}`,
      content: nodeFirewall(input, index),
    })
  })
  return { files, handbook: handbook(input) }
}
