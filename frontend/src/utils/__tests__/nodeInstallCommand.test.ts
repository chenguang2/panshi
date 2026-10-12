import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildNodeInstallCommand } from '../nodeInstallCommand'

// 基线形态取自 NodeList.vue batch1 修复后的相对路径实现（node-management-ux-batch3 1.1 / design D1：
// 以该形态为唯一实现提取纯函数，两视图引用；Tab 的硬编码绝对路径为活缺陷，顺带修复）。
const node = { ip: '10.0.0.1', ssh_port: 22, edge_path: '/edge/node1' }

describe('buildNodeInstallCommand', () => {
  it('install_edge：只输出 Ansible 命令（相对 inventory/extravars 路径）', () => {
    const cmd = buildNodeInstallCommand(node, 'install_edge', { prefix: '/usr/local/nginx' })
    expect(cmd).toContain('# Ansible 命令:')
    expect(cmd).toContain(
      'ansible-playbook -i inventory -e @env/extravars -e \'{"prefix":"/usr/local/nginx","ips":"10.0.0.1"}\' --tags install_edge edge.yml',
    )
    expect(cmd).not.toContain('ssh')
    expect(cmd).not.toContain('/home/qcg')
  })

  it('install-openresty：Ansible + SSH 两阶段，ssh 命令无账号/密钥虚构', () => {
    const cmd = buildNodeInstallCommand(node, 'install_openresty', { prefix: '/usr/local/nginx' })
    expect(cmd).toContain('# SSH 编译命令:')
    expect(cmd).toContain('ssh -p 22 10.0.0.1')
    expect(cmd).toContain('cd /usr/local/soft/install-edge/ && ./install-edge.sh /usr/local/nginx')
    expect(cmd).not.toContain('jboss@')
    expect(cmd).not.toContain('id_rsa')
    expect(cmd).not.toContain('/home/qcg')
  })

  it('ssh 端口取节点 ssh_port；prefix 回退 edge_path', () => {
    const cmd = buildNodeInstallCommand({ ...node, ssh_port: 2222, edge_path: '/e/fallback' }, 'install_openresty', {})
    expect(cmd).toContain('ssh -p 2222 10.0.0.1')
    expect(cmd).toContain('./install-edge.sh /e/fallback')
  })

  // ── 源码守卫：两视图引用共享实现，硬编码绝对路径清零（batch3 1.1）──
  it('两视图引用共享实现；Tab 硬编码 /home/qcg 与 jboss@ 账号清零', () => {
    const nodeList = readFileSync(resolve(process.cwd(), 'src/views/NodeList.vue'), 'utf-8')
    const clusterNodes = readFileSync(resolve(process.cwd(), 'src/views/clusters/ClusterNodes.vue'), 'utf-8')
    for (const [name, src] of [
      ['NodeList.vue', nodeList],
      ['ClusterNodes.vue', clusterNodes],
    ] as const) {
      expect(src, `${name} 应引用共享 buildNodeInstallCommand`).toContain('buildNodeInstallCommand')
      expect(src, `${name} 不应内联重复实现`).not.toMatch(/function buildInstallCommand/)
      expect(src, `${name} 不应保留硬编码绝对路径`).not.toContain('/home/qcg')
      expect(src, `${name} 不应保留 jboss@ 硬编码账号`).not.toContain('jboss@')
    }
  })
})
