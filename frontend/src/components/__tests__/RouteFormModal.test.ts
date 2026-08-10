import { describe, it, expect } from 'vitest'

describe('RouteFormModal enable_websocket logic', () => {
  function buildRouteSubmitData(editing: boolean, form: any) {
    const data: Record<string, any> = {
      name: form.name,
      uri: form.uri,
      methods: form.methods,
      priority: form.priority,
      status: form.status,
      description: form.description,
      upstream_id: form.upstream_id,
    }
    // 始终发送 enable_websocket（true/false 都传），确保取消勾选能清除 DB 旧值
    data.enable_websocket = form.enable_websocket
    return data
  }

  it('includes enable_websocket when checked', () => {
    const data = buildRouteSubmitData(false, {
      name: 'ws-route', uri: '/ws', methods: 'GET',
      priority: 0, status: 1, upstream_id: 1,
      enable_websocket: true,
    })
    expect(data.enable_websocket).toBe(true)
  })

  it('includes enable_websocket=false when unchecked (clears DB value)', () => {
    const data = buildRouteSubmitData(false, {
      name: 'no-ws', uri: '/no-ws', methods: 'GET',
      priority: 0, status: 1, upstream_id: 1,
      enable_websocket: false,
    })
    expect(data.enable_websocket).toBe(false)
  })
})
