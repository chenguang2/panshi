import { describe, it, expect } from 'vitest'
import { parseIpList, parseNodeCsv, buildNodeCsvTemplate, isDuplicateIp, EXPANSION_LIMIT } from '../nodeImport'

describe('parseIpList', () => {
  it('parses a single IP per line', () => {
    const rows = parseIpList('10.0.0.1')
    expect(rows).toEqual([{ ip: '10.0.0.1', valid: true }])
  })

  it('parses multiple IPs separated by newlines', () => {
    const rows = parseIpList('10.0.0.1\n10.0.0.2\n10.0.0.3')
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.valid)).toBe(true)
  })

  it('expands an IP range', () => {
    const rows = parseIpList('10.0.0.1-10.0.0.5')
    expect(rows).toHaveLength(5)
    expect(rows[0].ip).toBe('10.0.0.1')
    expect(rows[4].ip).toBe('10.0.0.5')
    expect(rows.every((r) => r.valid)).toBe(true)
  })

  it('expands a CIDR block excluding network and broadcast', () => {
    const rows = parseIpList('10.0.0.0/30')
    expect(rows).toHaveLength(2)
    expect(rows[0].ip).toBe('10.0.0.1')
    expect(rows[1].ip).toBe('10.0.0.2')
  })

  it('skips empty lines', () => {
    const rows = parseIpList('10.0.0.1\n\n10.0.0.2\n')
    expect(rows).toHaveLength(2)
  })

  it('skips comment lines starting with # or //', () => {
    const rows = parseIpList('# comment line\n10.0.0.1\n// another comment\n10.0.0.2')
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.valid)).toBe(true)
  })

  it('flags invalid lines with an error', () => {
    const rows = parseIpList('10.0.0.1\nnot-an-ip')
    expect(rows[0].valid).toBe(true)
    expect(rows[1].valid).toBe(false)
    expect(rows[1].error).toBeTruthy()
  })

  it('rejects expansion beyond the limit', () => {
    // 10.0.0.1-10.0.4.1 跨度 1025 个地址 > EXPANSION_LIMIT(1000)
    const rows = parseIpList('10.0.0.1-10.0.4.1')
    expect(rows).toHaveLength(1)
    expect(rows[0].valid).toBe(false)
    expect(rows[0].error).toContain('上限')
  })
})

describe('parseNodeCsv', () => {
  it('parses rows with english headers', () => {
    const csv = 'ip,service_port,management_port,edge_path,openresty_path,status\n10.0.0.1,80,9180,/edge/n1,,1\n10.0.0.2,8080,9181,/edge/n2,/opt/edge,1'
    const rows = parseNodeCsv(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      ip: '10.0.0.1',
      service_port: 80,
      management_port: 9180,
      edge_path: '/edge/n1',
      openresty_path: '',
      status: 1,
      valid: true,
    })
  })

  it('parses rows with chinese headers', () => {
    const csv = 'IP,服务端口,管理端口,Edge路径,安装路径,状态\n10.0.0.1,80,9180,/edge/n1,,1'
    const rows = parseNodeCsv(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ ip: '10.0.0.1', valid: true })
  })

  it('skips header row', () => {
    const csv = 'ip,service_port,management_port,edge_path,openresty_path,status\n10.0.0.1,80,9180,/edge/n1,,1'
    const rows = parseNodeCsv(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0].ip).toBe('10.0.0.1')
  })

  it('flags invalid rows with line number and error', () => {
    const csv = 'ip,service_port,management_port,edge_path,openresty_path,status\n10.0.0.1,80,9180,/edge/n1,,1\nbad-ip,80,9180,/edge/n2,,1'
    const rows = parseNodeCsv(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0].valid).toBe(true)
    expect(rows[1].valid).toBe(false)
    expect(rows[1].line).toBe(3)
    expect(rows[1].error).toBeTruthy()
  })

  it('keeps original line numbers when blank rows present', () => {
    const csv = 'ip,service_port,management_port,edge_path,openresty_path,status\n10.0.0.1,80,9180,/edge/n1,,1\n\nbad-ip,80,9180,/edge/n2,,1'
    const rows = parseNodeCsv(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0].line).toBe(2)
    expect(rows[1].valid).toBe(false)
    expect(rows[1].line).toBe(4)
  })

  it('flags invalid status values', () => {
    const csv = 'ip,service_port,management_port,edge_path,openresty_path,status\n10.0.0.1,80,9180,/edge/n1,,5\n10.0.0.2,80,9180,/edge/n2,,abc'
    const rows = parseNodeCsv(csv)
    expect(rows[0].valid).toBe(false)
    expect(rows[0].error).toContain('状态')
    expect(rows[1].valid).toBe(false)
  })

  it('defaults empty status to 1', () => {
    const csv = 'ip,service_port,management_port,edge_path,openresty_path,status\n10.0.0.1,80,9180,/edge/n1,,'
    const rows = parseNodeCsv(csv)
    expect(rows[0].valid).toBe(true)
    expect(rows[0].status).toBe(1)
  })

  it('handles quoted fields with commas', () => {
    const csv = 'ip,service_port,management_port,edge_path,openresty_path,status\n"10.0.0.1",80,9180,"/edge,node1",,1'
    const rows = parseNodeCsv(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0].edge_path).toBe('/edge,node1')
  })
})

describe('buildNodeCsvTemplate', () => {
  it('includes header and an example row with BOM', () => {
    const csv = buildNodeCsvTemplate()
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('ip,service_port,management_port,edge_path,openresty_path,status')
    expect(csv).toContain('10.0.0.1')
  })
})

describe('isDuplicateIp', () => {
  it('flags a row whose ip appears elsewhere in the list', () => {
    const rows = [
      { ip: '10.0.0.1', valid: true },
      { ip: '10.0.0.2', valid: true },
      { ip: '10.0.0.1', valid: true },
    ]
    expect(isDuplicateIp(rows, rows[0], 0)).toBe(true)
    expect(isDuplicateIp(rows, rows[1], 1)).toBe(false)
    expect(isDuplicateIp(rows, rows[2], 2)).toBe(true)
  })

  it('does not flag invalid rows', () => {
    const rows = [
      { ip: '10.0.0.1', valid: true },
      { ip: '10.0.0.1', valid: false },
    ]
    expect(isDuplicateIp(rows, rows[1], 1)).toBe(false)
  })
})
