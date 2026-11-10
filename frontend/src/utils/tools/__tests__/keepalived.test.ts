import { describe, expect, it } from 'vitest'
import {
  KEEPALIVED_DEFAULTS,
  generateKeepalivedConfig,
  parseKeepalivedNodesText,
  validateKeepalivedInput,
  type KeepalivedGenInput,
} from '../keepalived'

const SAMPLE: KeepalivedGenInput = {
  vip: '10.128.216.154',
  nodes: [
    { ip: '10.128.216.160', iface: 'ens7' },
    { ip: '10.128.216.161', iface: 'ens7' },
    { ip: '10.128.216.162', iface: 'ens7' },
  ],
  ...KEEPALIVED_DEFAULTS,
}

// 夹具按用户样例独立转写（docs：3 节点 DNS 高可用 keepalived）。
// 与原始样例的两处刻意归一化（设计 D2/实施说明）：
// ① 对端注释统一 16 空格（样例本身 16/15 不一致）；② weight 注释去掉样例残留的旧部署引用（150→120/.12）。
const NODE1_CONF = `global_defs {
    router_id EDGE_DNS_1          # 本机标识，三台不同
    enable_script_security        # 启用脚本安全性
    script_user root              # 健康检查脚本运行用户
}

# ── 健康检查脚本 ──────────────────────────
# 检查本地服务 (端口 53 TCP/UDP) 是否存活
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
    interface       ens7          # 绑定网卡名，根据实际环境修改
    virtual_router_id 51          # 同一 VRRP 组的 ID 必须一致 (1-255)
    priority        150           # Edge-1 最高优先级
    advert_int      1             # VRRP 通告间隔 1 秒

    # 单播模式配置
    unicast_src_ip  10.128.216.160    # 本机 IP
    unicast_peer {
        10.128.216.161                # 对端 1
        10.128.216.162                # 对端 2
    }

    # 认证（同一组内必须一致）
    authentication {
        auth_type      PASS
        auth_pass      12345678     # 明文密码，自行修改
    }

    # 虚拟 IP 地址（VIP）
    virtual_ipaddress {
        10.128.216.154/24 dev ens7 label ens7:vip
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

describe('generateKeepalivedConfig 样例逐字回归', () => {
  const r = generateKeepalivedConfig(SAMPLE)
  const confOf = (ip: string) => r.files.find((f) => f.group === `node-${ip}` && f.filename.startsWith('keepalived_'))

  it('节点 1 keepalived.conf 与样例逐字一致', () => {
    expect(confOf('10.128.216.160')?.content).toBe(NODE1_CONF)
  })

  it('共用脚本四件与样例一致（只输出一份）', () => {
    const shared = r.files.filter((f) => f.group === 'shared')
    expect(shared.map((f) => f.filename)).toEqual([
      'check_dns.sh',
      'notify_master.sh',
      'notify_backup.sh',
      'notify_fault.sh',
    ])
    expect(shared[0]!.content).toBe("#!/bin/bash\nss -ulnp | grep -q ':53 ' && exit 0 || exit 1\n")
    expect(shared[1]!.content).toBe('#!/bin/bash\nlogger -t keepalived "VI_DNS: Became MASTER on $(hostname)"\n')
    expect(shared[2]!.content).toBe('#!/bin/bash\nlogger -t keepalived "VI_DNS: Became BACKUP on $(hostname)"\n')
    expect(shared[3]!.content).toBe('#!/bin/bash\nlogger -t keepalived "VI_DNS: FAULT on $(hostname)"\n')
  })

  it('节点差异仅四处：router_id / priority / unicast_src_ip / unicast_peer', () => {
    const c1 = confOf('10.128.216.160')!.content
    const c2 = confOf('10.128.216.161')!.content
    const diffLines = c1.split('\n').filter((line, i) => line !== c2.split('\n')[i])
    expect(diffLines).toHaveLength(4)
    expect(diffLines[0]).toContain('router_id EDGE_DNS_1')
    expect(c2).toContain('router_id EDGE_DNS_2')
    expect(c2).toContain('priority        140           # Edge-2 次高优先级')
    expect(c2).toContain('unicast_src_ip  10.128.216.161    # 本机 IP')
    expect(c2).toContain('10.128.216.160                # 对端 1')
    expect(c2).toContain('10.128.216.162                # 对端 2')
    expect(c2).not.toContain('10.128.216.161                # 对端')
    const c3 = confOf('10.128.216.162')!.content
    expect(c3).toContain('router_id EDGE_DNS_3')
    expect(c3).toContain('priority        130           # Edge-3 次级优先级')
    expect(c3).toContain('10.128.216.160                # 对端 1')
    expect(c3).toContain('10.128.216.161                # 对端 2')
  })

  it('防火墙命令按节点生成且不含本机 IP', () => {
    const fw1 = r.files.find((f) => f.group === 'node-10.128.216.160' && f.filename.startsWith('firewall'))!
    expect(fw1.content).toContain('source address="10.128.216.161" protocol value="vrrp" accept\'')
    expect(fw1.content).toContain('source address="10.128.216.162" protocol value="vrrp" accept\'')
    expect(fw1.content).not.toContain('10.128.216.160')
    expect(fw1.content).toContain('firewall-cmd --reload')
    const fw3 = r.files.find((f) => f.group === 'node-10.128.216.162' && f.filename.startsWith('firewall'))!
    expect(fw3.content).toContain('"10.128.216.160"')
    expect(fw3.content).toContain('"10.128.216.161"')
    expect(fw3.content).not.toContain('"10.128.216.162"')
  })

  it('部署手册参数化（实际网卡/VIP，不残留样例值）', () => {
    expect(r.handbook).toContain('keepalived -t -f /etc/keepalived/keepalived.conf')
    expect(r.handbook).toContain('ip addr show ens7:vip')
    expect(r.handbook).toContain('ip addr show ens7 | grep 10.128.216.154')
    expect(r.handbook).toContain('tcpdump -i ens7 -nn proto 112')
    expect(r.handbook).toContain('rule protocol value="vrrp" accept\'')
    expect(r.handbook).not.toContain('eth0')
  })

  it('高级参数联动：组 ID / 密码 / 掩码 / 前缀 / 检查端口', () => {
    const r2 = generateKeepalivedConfig({
      ...SAMPLE,
      vrrpId: 52,
      authPass: 'abcd1234',
      maskBits: 16,
      routerIdPrefix: 'HA_',
      checkPort: 5353,
    })
    const conf = r2.files.find((f) => f.group === 'node-10.128.216.160' && f.filename.startsWith('keepalived_'))!
    expect(conf.content).toContain('virtual_router_id 52')
    expect(conf.content).toContain('auth_pass      abcd1234')
    expect(conf.content).toContain('10.128.216.154/16 dev ens7 label ens7:vip')
    expect(conf.content).toContain('router_id HA_1')
    expect(conf.content).toContain('# 检查本地服务 (端口 5353 TCP/UDP) 是否存活')
    const shared = r2.files.find((f) => f.filename === 'check_dns.sh')!
    expect(shared.content).toContain(":5353 '")
  })
})

describe('各节点网卡不同（逐节点 interface / VIP dev/label / 防火墙 / 手册）', () => {
  const MULTI: KeepalivedGenInput = {
    vip: '10.128.216.154',
    nodes: [
      { ip: '10.128.216.160', iface: 'ens7' },
      { ip: '10.128.216.161', iface: 'eth1' },
      { ip: '10.128.216.162', iface: 'bond0' },
    ],
    ...KEEPALIVED_DEFAULTS,
  }
  const r = generateKeepalivedConfig(MULTI)
  const confOf = (ip: string) => r.files.find((f) => f.group === `node-${ip}` && f.filename.startsWith('keepalived_'))!

  it('每节点 interface 与 VIP dev/label 用本机行内网卡', () => {
    const c1 = confOf('10.128.216.160').content
    const c2 = confOf('10.128.216.161').content
    const c3 = confOf('10.128.216.162').content
    expect(c1).toContain('interface       ens7')
    expect(c1).toContain('10.128.216.154/24 dev ens7 label ens7:vip')
    expect(c2).toContain('interface       eth1')
    expect(c2).toContain('10.128.216.154/24 dev eth1 label eth1:vip')
    expect(c2).not.toContain('interface       ens7')
    expect(c3).toContain('interface       bond0')
    expect(c3).toContain('10.128.216.154/24 dev bond0 label bond0:vip')
    // 跨网卡比对差异行：router_id / priority / interface（连带 VIP dev/label 行）/
    // unicast_src_ip / 对端 IP 行——「五处属性」落到行为 6 行（interface 占 2 行）
    const diffLines = c1.split('\n').filter((line, i) => line !== c2.split('\n')[i])
    expect(diffLines).toHaveLength(6)
    expect(diffLines.some((l) => l.trimStart().startsWith('interface'))).toBe(true)
  })

  it('防火墙 tcpdump 用本机网卡', () => {
    const fw1 = r.files.find((f) => f.group === 'node-10.128.216.160' && f.filename.startsWith('firewall'))!
    const fw2 = r.files.find((f) => f.group === 'node-10.128.216.161' && f.filename.startsWith('firewall'))!
    expect(fw1.content).toContain('tcpdump -i ens7 -nn proto 112')
    expect(fw2.content).toContain('tcpdump -i eth1 -nn proto 112')
    expect(fw2.content).not.toContain('tcpdump -i ens7')
  })

  it('部署手册按唯一网卡集合列举并注明节点', () => {
    expect(r.handbook).toContain('@ ens7/eth1/bond0')
    expect(r.handbook).toContain('ip addr show ens7 | grep 10.128.216.154')
    expect(r.handbook).toContain('ip addr show eth1 | grep 10.128.216.154')
    expect(r.handbook).toContain('ip addr show bond0 | grep 10.128.216.154')
    expect(r.handbook).toContain('tcpdump -i eth1 -nn proto 112')
    expect(r.handbook).toContain('Edge-2')
  })
})

describe('parseKeepalivedNodesText 行解析', () => {
  it('每行「IP 网卡名」→ 结构化节点（空行跳过、两侧空白容忍）', () => {
    const p = parseKeepalivedNodesText('10.128.216.160 ens7\n\n  10.128.216.161 eth1  \n')
    expect(p.errors).toHaveLength(0)
    expect(p.nodes).toEqual([
      { ip: '10.128.216.160', iface: 'ens7' },
      { ip: '10.128.216.161', iface: 'eth1' },
    ])
  })

  it('缺网卡名 → 行号红字', () => {
    const p = parseKeepalivedNodesText('10.128.216.160 ens7\n10.128.216.161\n')
    expect(p.errors).toHaveLength(1)
    expect(p.errors[0]).toContain('第 2 行缺少网卡名')
    expect(p.errors[0]).toContain('10.128.216.161')
    expect(p.errors[0]).toContain('节点IP 网卡名')
  })

  it('多余列 → 行号红字', () => {
    const p = parseKeepalivedNodesText('10.128.216.160 ens7 extra\n')
    expect(p.errors).toHaveLength(1)
    expect(p.errors[0]).toContain('第 1 行')
  })

  it('网卡名非法字符 → 行号红字', () => {
    const p = parseKeepalivedNodesText('10.128.216.160 ens7;rm\n')
    expect(p.errors).toHaveLength(1)
    expect(p.errors[0]).toContain('第 1 行网卡名包含非法字符')
  })
})

describe('validateKeepalivedInput 校验', () => {
  it('非法 IPv4 / 节点不足 / VIP 与节点重复 → 红字错误', () => {
    const badIp = validateKeepalivedInput({ ...SAMPLE, nodes: [SAMPLE.nodes[0]!, { ip: 'abc', iface: 'ens7' }] })
    expect(badIp.errors.some((e) => e.includes('abc'))).toBe(true)
    const tooFew = validateKeepalivedInput({ ...SAMPLE, nodes: [SAMPLE.nodes[0]!] })
    expect(tooFew.errors.some((e) => e.includes('少于 2'))).toBe(true)
    const dup = validateKeepalivedInput({ ...SAMPLE, vip: '10.128.216.160' })
    expect(dup.errors.some((e) => e.includes('VIP') && e.includes('重复'))).toBe(true)
  })

  it('不同网段 / 密码超 8 字符 → 黄字提醒不阻断', () => {
    const v = validateKeepalivedInput({ ...SAMPLE, vip: '10.128.217.154', authPass: '12345678901234' })
    expect(v.errors).toHaveLength(0)
    expect(v.warnings.some((w) => w.includes('网段'))).toBe(true)
    expect(v.warnings.some((w) => w.includes('8 字符'))).toBe(true)
  })

  it('默认样例输入零错误零警告', () => {
    const v = validateKeepalivedInput(SAMPLE)
    expect(v.errors).toHaveLength(0)
    expect(v.warnings).toHaveLength(0)
  })
})
