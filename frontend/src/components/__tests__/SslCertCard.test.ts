import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SslCertCard from '../SslCertCard.vue'

const stubs = { PublishStatusTag: { template: '<span class="pub-stub">pub</span>' } }

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
  expire_at: '2027-10-18T00:00:00',
  expire_days: 360,
}

describe('SslCertCard CA 形态', () => {
  const caCert = {
    id: 2,
    name: '企业根CA',
    sni: 'Embrace Root CA',
    is_ca: true,
    algorithm: 'sm2',
    cluster_name: '演示集群',
    expire_at: '2031-10-18T00:00:00',
    expire_days: 1800,
  }

  it('隐藏 SNI/类型行，显示 CN 行与「下载根证书」按钮', () => {
    const w = mountCard({ cert: caCert, variant: 'ca' })
    const labels = w.findAll('.ssl-card-row label').map((l) => l.text())
    expect(labels).toContain('CN')
    expect(labels).not.toContain('SNI')
    expect(labels).not.toContain('类型')
    expect(labels).not.toContain('签发 CA')
    const btns = w.findAll('button').map((b) => b.text())
    expect(btns).toContain('下载根证书')
    expect(btns).not.toContain('编辑')
    expect(btns).not.toContain('发布')
    expect(btns).not.toContain('版本管理')
  })

  it('临期（≤30 天）渲染红色警示条，宽限期不渲染', () => {
    const expiring = mountCard({ cert: { ...caCert, expire_days: 20 }, variant: 'ca' })
    expect(expiring.find('.ssl-card-alert-msg').exists()).toBe(true)
    expect(expiring.text()).toContain('重新分发')
    const fresh = mountCard({ cert: caCert, variant: 'ca' })
    expect(fresh.find('.ssl-card-alert-msg').exists()).toBe(false)
  })

  it('已过期（expire_days<0）也渲染警示条', () => {
    const w = mountCard({ cert: { ...caCert, expire_days: -3 }, variant: 'ca' })
    expect(w.find('.ssl-card-alert-msg').exists()).toBe(true)
  })
})

describe('SslCertCard 服务器证书形态', () => {
  it('显示 SNI/类型/签发 CA 行，签发 CA 可点击触发 ca-click', async () => {
    const w = mountCard({ cert: baseServer, variant: 'server', caName: '企业根CA' })
    const labels = w.findAll('.ssl-card-row label').map((l) => l.text())
    expect(labels).toContain('SNI')
    expect(labels).toContain('类型')
    expect(labels).toContain('签发 CA')
    await w.find('.ca-link').trigger('click')
    expect(w.emitted('ca-click')).toHaveLength(1)
    const btns = w.findAll('button').map((b) => b.text())
    expect(btns).toContain('下载证书')
    expect(btns).toContain('发布')
    expect(btns).toContain('版本管理')
  })

  it('caName 缺失显示「—」且不可点击', () => {
    const w = mountCard({ cert: baseServer, variant: 'server', caName: null })
    expect(w.find('.ca-link').exists()).toBe(false)
    expect(w.text()).toContain('—')
  })

  it('client 证书无下载/发布/版本入口，保留查看', () => {
    const w = mountCard({ cert: { ...baseServer, cert_type: 'client' }, variant: 'server', caName: '企业根CA' })
    const btns = w.findAll('button').map((b) => b.text())
    expect(btns).not.toContain('下载证书')
    expect(btns).not.toContain('发布')
    expect(btns).not.toContain('版本管理')
    expect(btns).toContain('查看')
    expect(btns).toContain('编辑')
  })

  it('操作事件透传（view/download/delete）', async () => {
    const w = mountCard({ cert: baseServer, variant: 'server', caName: '企业根CA' })
    const btns = w.findAll('button')
    await btns.find((b) => b.text() === '查看')!.trigger('click')
    await btns.find((b) => b.text() === '下载证书')!.trigger('click')
    await btns.find((b) => b.text() === '删除')!.trigger('click')
    expect(w.emitted('view')).toHaveLength(1)
    expect(w.emitted('download')).toHaveLength(1)
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
    const labels = w.findAll('.ssl-card-row label').map((l) => l.text())
    expect(labels).toContain('IP')
    const ipRow = w.findAll('.ssl-card-row').find((r) => r.find('label').text() === 'IP')
    expect(ipRow!.text()).toContain('192.168.0.13')
    expect(ipRow!.text()).toContain('192.168.0.14')
  })

  it('无 ip_sans 不渲染 IP 行', () => {
    const w = mountCard({ cert: baseServer, variant: 'server', caName: null })
    expect(w.findAll('.ssl-card-row label').map((l) => l.text())).not.toContain('IP')
  })
})

describe('SslCertCard 匹配名单不一致警示（ssl-cert-rollback-consistency）', () => {
  it('sniMismatch=true 显示警示与「同步」按钮，点击 emit sync-sni', async () => {
    const w = mountCard({ cert: baseServer, variant: 'server', caName: null, sniMismatch: true })
    expect(w.text()).toContain('匹配名单与证书 SAN 不一致')
    const btn = w.findAll('button').find((b) => b.text() === '同步')
    expect(btn).toBeDefined()
    await btn!.trigger('click')
    expect(w.emitted('sync-sni')).toHaveLength(1)
  })

  it('sniMismatch 缺省/false 不渲染警示行', () => {
    const w1 = mountCard({ cert: baseServer, variant: 'server', caName: null })
    expect(w1.text()).not.toContain('匹配名单与证书 SAN 不一致')
    const w2 = mountCard({ cert: baseServer, variant: 'server', caName: null, sniMismatch: false })
    expect(w2.text()).not.toContain('匹配名单与证书 SAN 不一致')
  })
})
