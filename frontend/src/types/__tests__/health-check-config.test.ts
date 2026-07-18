import { describe, it, expect } from 'vitest'
import type { HealthCheckConfig, ActiveHealthCheck, PassiveHealthCheck } from '@/types'
import type { UpstreamFormData } from '@/composables/useClusterUpstreams'

describe('HealthCheckConfig types', () => {
  it('constructs active-only config', () => {
    const config: HealthCheckConfig = {
      active: {
        type: 'http',
        concurrency: 10,
        http_path: '/',
        https_verify_certificate: true,
        timeout: 1,
        healthy: {
          interval: 5,
          successes: 2,
          http_statuses: [200, 302, 403, 404],
        },
        unhealthy: {
          interval: 3,
          http_failures: 5,
          http_statuses: [429, 500, 501, 502, 503, 504, 505],
          tcp_failures: 2,
          timeouts: 3,
        },
      },
    }
    expect(config.active?.type).toBe('http')
    expect(config.active?.healthy?.successes).toBe(2)
    expect(config.active?.unhealthy?.http_failures).toBe(5)
    expect(config.passive).toBeUndefined()
  })

  it('constructs passive-only config', () => {
    const config: HealthCheckConfig = {
      passive: {
        type: 'http',
        healthy: {
          successes: 5,
          http_statuses: [200, 201, 202, 203, 204, 205, 206, 207, 208],
        },
        unhealthy: {
          http_failures: 5,
          http_statuses: [429, 500, 503],
          tcp_failures: 2,
          timeouts: 7,
        },
      },
    }
    expect(config.active).toBeUndefined()
    expect(config.passive?.healthy?.successes).toBe(5)
  })

  it('constructs active+passive config', () => {
    const config: HealthCheckConfig = {
      active: { type: 'http', timeout: 1 },
      passive: { type: 'http' },
    }
    expect(config.active).toBeDefined()
    expect(config.passive).toBeDefined()
  })

  it('supports tcp type for active', () => {
    const active: ActiveHealthCheck = {
      type: 'tcp',
      concurrency: 5,
      timeout: 3,
      healthy: { successes: 2 },
      unhealthy: { tcp_failures: 3, timeouts: 3, http_failures: 5 },
    }
    expect(active.type).toBe('tcp')
    expect(active.http_path).toBeUndefined()
    expect(active.https_verify_certificate).toBeUndefined()
  })

  it('supports tcp type for passive', () => {
    const passive: PassiveHealthCheck = {
      type: 'tcp',
      healthy: { successes: 3 },
      unhealthy: { http_failures: 3, tcp_failures: 1, timeouts: 5 },
    }
    expect(passive.type).toBe('tcp')
    expect(passive.healthy?.http_statuses).toBeUndefined()
  })
})
