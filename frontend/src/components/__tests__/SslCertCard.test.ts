import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SslCertCard from '../SslCertCard.vue'

const stubs = {
  PublishStatusTag: { template: '<span class="pub-stub">pub</span>', props: ['version', 'pending'] },
  PublishDiffButton: {
    template: `<button class="diff-preview-btn" @click="$emit('click', $event)">差异</button>`,
    emits: ['click'],
  },
}

function mountCard(props: Record<string, unknown>) {
  return mount(SslCertCard, { props: props as never, global: { stubs } })
}

const baseServer = {
  id: 1,
  name: '网关证书',
  sni: 'a.com,b.com',
  cert_type: 'server',
  algorithm: 'rsa',
  cluster_name: '演示集群',
  cluster_id: 3,
  cluster_group_name: '生产环境',
  expire_at: '2027-10-18T00:00:00',
  expire_days: 360,
  current_version: 2,
  published_at: '2026-11-14T10:22:00',
}

const caCert = {
  id: 2,
  name: '企业根CA',
  sni: 'Embrace Root CA',
  is_ca: true,
  algorithm: 'sm2',
  cluster_name: '演示集群',
  cluster_id: 3,
  cluster_group_name: '生产环境',
  expire_at: '2031-10-18T00:00:00',
  expire_days: 1800,
}

describe('SslCertCard · l5-panel 解剖（mockup-parity 卡片页推广）', () => {
  it('两形态根节点 = l5-panel + 集群色相（clusterHueClass）+ lp-head/lp-body/lp-foot 三段', () => {
    for (const [cert, variant] of [
      [caCert, 'ca'],
      [baseServer, 'server'],
    ] as const) {
      const w = mountCard({ cert, variant })
      const root = w.find('article.l5-panel')
      expect(root.exists()).toBe(true)
      expect(root.classes()).toContain('cluster-c3') // 3 % 8
      expect(root.find('.lp-head').exists()).toBe(true)
      expect(root.find('.lp-body').exists()).toBe(true)
      expect(root.find('.lp-foot').exists()).toBe(true)
      w.unmount()
    }
  })

  it('lp-head：名称 + 集群/分组 tag（平铺身份）；server 另有算法徽章；ca 有「CA 根证书」badge + 剩余天数徽章', () => {
    const ca = mountCard({ cert: caCert, variant: 'ca' })
    expect(ca.find('.lp-name').text()).toBe('企业根CA')
    expect(ca.find('.lp-tag.lp-cluster').text()).toBe('演示集群')
    expect(ca.find('.lp-tag.lp-group').text()).toBe('生产环境')
    expect(ca.text()).toContain('CA 根证书')
    expect(ca.text()).toContain('剩余 1800 天')
    expect(ca.find('.algo-badge').exists()).toBe(false)
    ca.unmount()

    const sv = mountCard({ cert: baseServer, variant: 'server' })
    expect(sv.find('.algo-badge.algo-international').exists()).toBe(true)
    expect(sv.find('.pub-stub').exists()).toBe(true)
    sv.unmount()
  })

  it('server 国密徽章（sm2）；待发布/部分失败旁有「差异」胶囊（PublishDiffButton）', async () => {
    const sm = mountCard({ cert: { ...baseServer, algorithm: 'sm2' }, variant: 'server' })
    expect(sm.find('.algo-badge.algo-sm').exists()).toBe(true)
    sm.unmount()

    const w = mountCard({ cert: { ...baseServer, pending_publish: true, current_version: null }, variant: 'server' })
    const pill = w.find('.diff-preview-btn')
    expect(pill.exists()).toBe(true)
    await pill.trigger('click')
    expect(w.emitted('preview-diff')).toHaveLength(1)
    w.unmount()
  })
})

describe('SslCertCard CA 形态', () => {
  it('隐藏 SNI/类型行，显示 CN 行；foot = 下载根证书 op-pub + ⋯（查看/删除）', async () => {
    const w = mountCard({ cert: caCert, variant: 'ca' })
    const keys = w.findAll('.lp-row .lp-k').map((l) => l.text())
    expect(keys).toContain('CN')
    expect(keys).not.toContain('SNI')
    expect(keys).not.toContain('类型')
    expect(keys).not.toContain('签发 CA')
    expect(w.find('.lp-foot .op-pub').text()).toBe('下载根证书')
    // ⋯ 菜单：打开后可见 查看/删除，无 编辑/发布/版本管理
    await w.find('.lp-foot .op-btn').trigger('click')
    expect(w.find('.l5-menu').classes()).toContain('open')
    const items = w.findAll('.l5-menu .mi-main').map((b) => b.text())
    expect(items).toEqual(['查看', '删除'])
  })

  it('临期（≤30 天）渲染 lp-notice 警示（现实现 E4 原文），宽限期不渲染', () => {
    const expiring = mountCard({ cert: { ...caCert, expire_days: 20 }, variant: 'ca' })
    expect(expiring.find('.lp-notice').exists()).toBe(true)
    expect(expiring.find('.lp-notice').text()).toContain('重新分发根证书')
    const fresh = mountCard({ cert: caCert, variant: 'ca' })
    expect(fresh.find('.lp-notice').exists()).toBe(false)
  })

  it('已过期（expire_days<0）也渲染警示（「已经过期」语义）', () => {
    const w = mountCard({ cert: { ...caCert, expire_days: -3 }, variant: 'ca' })
    expect(w.find('.lp-notice').exists()).toBe(true)
    expect(w.find('.lp-notice').text()).toContain('已经')
  })

  it('菜单事件透传：查看 → view、删除 → delete，点击后菜单收起', async () => {
    const w = mountCard({ cert: caCert, variant: 'ca' })
    await w.find('.lp-foot .op-btn').trigger('click')
    const items = w.findAll('.l5-menu .mi')
    await items.find((b) => b.text().includes('查看'))!.trigger('click')
    expect(w.emitted('view')).toHaveLength(1)
    await w.find('.lp-foot .op-btn').trigger('click')
    const del = w.findAll('.l5-menu .mi').find((b) => b.text().includes('删除'))
    await del!.trigger('click')
    expect(w.emitted('delete')).toHaveLength(1)
    expect(w.find('.l5-menu').classes()).not.toContain('open')
  })
})

describe('SslCertCard 服务器证书形态', () => {
  it('显示 SNI/类型/签发 CA 行，签发 CA 可点击触发 ca-click；foot = 发布 op-pub + ⋯（查看/下载/编辑/版本/删除）', async () => {
    const w = mountCard({ cert: baseServer, variant: 'server', caName: '企业根CA' })
    const keys = w.findAll('.lp-row .lp-k').map((l) => l.text())
    expect(keys).toContain('SNI')
    expect(keys).toContain('类型')
    expect(keys).toContain('签发 CA')
    await w.find('.ca-link').trigger('click')
    expect(w.emitted('ca-click')).toHaveLength(1)
    expect(w.find('.lp-foot .op-pub').text()).toBe('发布')
    await w.find('.lp-foot .op-btn').trigger('click')
    // 2026-11-20 用户裁决：server 菜单去 编辑/下载证书（下载入口下线，查看=纯查看）
    const items = w.findAll('.l5-menu .mi-main').map((b) => b.text())
    expect(items).toEqual(['查看', '版本管理', '删除'])
  })

  it('caName 缺失显示「—」且不可点击', () => {
    const w = mountCard({ cert: baseServer, variant: 'server', caName: null })
    expect(w.find('.ca-link').exists()).toBe(false)
    expect(w.text()).toContain('—')
  })

  it('client 证书：无下载/发布/版本入口，保留查看', async () => {
    const w = mountCard({ cert: { ...baseServer, cert_type: 'client' }, variant: 'server', caName: '企业根CA' })
    expect(w.find('.lp-foot .op-pub').exists()).toBe(false)
    await w.find('.lp-foot .op-btn').trigger('click')
    const items = w.findAll('.l5-menu .mi-main').map((b) => b.text())
    expect(items).toEqual(['查看', '删除'])
  })

  it('操作事件透传（view/download/delete）', async () => {
    const w = mountCard({ cert: baseServer, variant: 'server', caName: '企业根CA' })
    await w.find('.lp-foot .op-btn').trigger('click')
    const items = w.findAll('.l5-menu .mi')
    await items.find((b) => b.text().includes('查看'))!.trigger('click')
    expect(w.emitted('view')).toHaveLength(1)
    await w.find('.lp-foot .op-btn').trigger('click')
    const list = w.findAll('.l5-menu .mi')
    await list.find((b) => b.text().includes('删除'))!.trigger('click')
    expect(w.emitted('delete')).toHaveLength(1)
  })
})

describe('SslCertCard IP SAN 行（uapm 修复）', () => {
  it('server 卡片有 ip_sans 时渲染 IP 行与标签', () => {
    const w = mountCard({
      cert: { ...baseServer, ip_sans: ['192.168.0.13', '192.168.0.14'] },
      variant: 'server',
      caName: '企业根CA',
    })
    const keys = w.findAll('.lp-row .lp-k').map((l) => l.text())
    expect(keys).toContain('IP')
    const ipRow = w.findAll('.lp-row').find((r) => r.find('.lp-k').text() === 'IP')
    expect(ipRow!.text()).toContain('192.168.0.13')
    expect(ipRow!.text()).toContain('192.168.0.14')
  })

  it('无 ip_sans 不渲染 IP 行', () => {
    const w = mountCard({ cert: baseServer, variant: 'server', caName: null })
    const keys = w.findAll('.lp-row .lp-k').map((l) => l.text())
    expect(keys).not.toContain('IP')
  })
})

describe('SslCertCard sniMismatch（server 专属）', () => {
  it('sniMismatch=true 显示 lp-notice 与「同步」按钮，点击 emit sync-sni', async () => {
    const w = mountCard({ cert: baseServer, variant: 'server', caName: '企业根CA', sniMismatch: true })
    expect(w.find('.lp-notice').exists()).toBe(true)
    expect(w.find('.lp-notice').text()).toContain('匹配名单与证书 SAN 不一致')
    await w.find('.lp-notice .n-act').trigger('click')
    expect(w.emitted('sync-sni')).toHaveLength(1)
  })

  it('sniMismatch 缺省/false 不渲染警示行', () => {
    const w = mountCard({ cert: baseServer, variant: 'server', caName: '企业根CA' })
    expect(w.find('.lp-notice').exists()).toBe(false)
  })
})
