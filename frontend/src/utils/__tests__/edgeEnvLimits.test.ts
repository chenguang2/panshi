import { describe, it, expect } from 'vitest'
import { EDGE_ADMIN_BASELINE_MB, describeAdminLimit, parseAdminBodyLimitMb } from '../edgeEnvLimits'

// 与后端 app/services/edge_env_limits.py 夹具同源（真实节点 192.168.0.13 形态裁剪）
const REAL = `deploy:
  prefix: edge
  http:
    #"log_format main": escape=default '...'
    client_max_body_size: 132m
    edge:
      listen:
        - addr: 0.0.0.0:16611
    admin:
      listen:
        - addr: 0.0.0.0:16621
    custom:
      include:
        - site/nginx_server_81XX.conf

  stream:
    admin:
      listen:
        - addr: unix:conf/edge_stream_monitor.sock
      client_max_body_size: 512m
`

const WITH_ADMIN_32 = REAL.replace(
  '        - addr: 0.0.0.0:16621\n',
  '        - addr: 0.0.0.0:16621\n      client_max_body_size: 32m\n',
)

describe('parseAdminBodyLimitMb', () => {
  it('http 级值不参与判定（pack server 级 32m 覆盖它）', () => {
    expect(REAL).toContain('client_max_body_size: 132m')
    expect(parseAdminBodyLimitMb(REAL)).toBeNull()
  })

  it('admin 段值生效', () => {
    expect(parseAdminBodyLimitMb(WITH_ADMIN_32)).toBe(32)
  })

  it('stream.admin 的同类键不计入', () => {
    expect(REAL).toContain('client_max_body_size: 512m') // stream.admin 里确有
    expect(parseAdminBodyLimitMb(REAL)).toBeNull()
  })

  it('大写后缀与注释行', () => {
    const content = WITH_ADMIN_32.replace('client_max_body_size: 32m', 'client_max_body_size: 64M  # 运维备注')
    expect(parseAdminBodyLimitMb(content)).toBe(64)
  })
})

describe('describeAdminLimit', () => {
  it('未配置 → 提示 pack 基线并要求补齐', () => {
    const hint = describeAdminLimit(REAL, 132)
    expect(hint.effectiveMb).toBe(EDGE_ADMIN_BASELINE_MB)
    expect(hint.sufficient).toBe(false)
    expect(hint.willAutoFill).toBe(true)
    expect(hint.text).toContain('pack 默认 32MB')
    expect(hint.text).toContain('部署时将自动补齐到 132MB')
  })

  it('低于平台 → 保留显式值并告警落差（不自动抬升）', () => {
    const hint = describeAdminLimit(WITH_ADMIN_32, 132)
    expect(hint.adminMb).toBe(32)
    expect(hint.willAutoFill).toBe(false)
    expect(hint.text).toContain('低于平台上限 132MB')
    expect(hint.text).toContain('32–132MB')
    expect(hint.text).toContain('413')
    expect(hint.text).toContain('不会自动抬升')
  })

  it('已对齐 → 中性文案，不再提示补齐', () => {
    const hint = describeAdminLimit(WITH_ADMIN_32, 32)
    expect(hint.sufficient).toBe(true)
    expect(hint.willAutoFill).toBe(false)
    expect(hint.text).toContain('已与平台上限 32MB 一致')
  })
})
