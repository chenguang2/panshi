export const EXPANSION_LIMIT = 1000

const IP_PATTERN = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/

export interface IpParseRow {
  ip: string
  valid: boolean
  error?: string
}

export interface NodeImportRow {
  ip: string
  service_port: number
  management_port: number
  edge_path: string
  openresty_path: string
  status: number
  valid: boolean
  line?: number
  error?: string
}

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc << 8) | Number(oct), 0) >>> 0
}

function intToIp(n: number): string {
  return [24, 16, 8, 0].map((shift) => (n >>> shift) & 255).join('.')
}

function isValidIp(ip: string): boolean {
  return IP_PATTERN.test(ip)
}

function expandRange(startIp: string, endIp: string): string[] | null {
  if (!isValidIp(startIp) || !isValidIp(endIp)) return null
  const start = ipToInt(startIp)
  const end = ipToInt(endIp)
  if (start > end) return null
  const count = end - start + 1
  if (count > EXPANSION_LIMIT) return null
  const ips: string[] = []
  for (let n = start; n <= end; n++) ips.push(intToIp(n))
  return ips
}

function expandCidr(cidr: string): string[] | null {
  const match = cidr.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/)
  if (!match) return null
  const ip = match[1]
  const prefix = Number(match[2])
  if (!isValidIp(ip) || prefix > 32) return null
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  const network = ipToInt(ip) & mask
  const broadcast = network | (~mask >>> 0)
  const count = broadcast - network - 1
  if (count <= 0 || count > EXPANSION_LIMIT) return null
  const ips: string[] = []
  for (let n = network + 1; n < broadcast; n++) ips.push(intToIp(n))
  return ips
}

export function parseIpList(text: string): IpParseRow[] {
  const rows: IpParseRow[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('#') || line.startsWith('//')) continue

    if (line.includes('-')) {
      const [startRaw, endRaw] = line.split('-').map((s) => s.trim())
      const expanded = expandRange(startRaw, endRaw)
      if (expanded) {
        for (const ip of expanded) rows.push({ ip, valid: true })
        continue
      }
      rows.push({ ip: line, valid: false, error: 'IP 范围格式错误或超出单次上限' })
      continue
    }

    if (line.includes('/')) {
      const expanded = expandCidr(line)
      if (expanded) {
        for (const ip of expanded) rows.push({ ip, valid: true })
        continue
      }
      rows.push({ ip: line, valid: false, error: 'CIDR 格式错误或超出单次上限' })
      continue
    }

    if (isValidIp(line)) {
      rows.push({ ip: line, valid: true })
    } else {
      rows.push({ ip: line, valid: false, error: '不是合法的 IP 地址' })
    }
  }
  return rows
}

const HEADER_ALIASES: Record<string, string> = {
  ip: 'ip',
  '服务端口': 'service_port',
  '管理端口': 'management_port',
  edge_path: 'edge_path',
  'edge路径': 'edge_path',
  '安装路径': 'openresty_path',
  status: 'status',
  '状态': 'status',
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields.map((f) => f.trim())
}

export function parseNodeCsv(csvText: string): NodeImportRow[] {
  const rawLines = csvText.replace(/^\uFEFF/, '').split(/\r?\n/)
  const lines: string[] = []
  for (let i = 0; i < rawLines.length; i++) {
    if (rawLines[i].trim() === '') {
      lines.push('') // 占位保留原始行号
    } else {
      lines.push(rawLines[i])
    }
  }
  if (lines.length === 0) return []

  const headers = parseCsvLine(lines[0]).map((h) => HEADER_ALIASES[h.toLowerCase()] ?? h.toLowerCase())
  const rows: NodeImportRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1
    if (lines[i].trim() === '') continue
    const values = parseCsvLine(lines[i])
    const record: Record<string, string> = {}
    headers.forEach((header, idx) => {
      if (header) record[header] = values[idx] ?? ''
    })

    const ip = (record.ip || '').trim()
    const servicePort = Number(record.service_port)
    const managementPort = Number(record.management_port)
    const edgePath = (record.edge_path || '').trim()
    const edgeInstallPath = (record.openresty_path || '').trim()
    const status = record.status === '' ? 1 : Number(record.status)

    const base = {
      ip,
      service_port: servicePort,
      management_port: managementPort,
      edge_path: edgePath,
      openresty_path: edgeInstallPath,
      status,
      line: lineNo,
      valid: true,
    }

    if (!isValidIp(ip)) {
      rows.push({ ...base, valid: false, error: `第 ${lineNo} 行 IP 非法` })
      continue
    }
    if (!(servicePort >= 1 && servicePort <= 65535)) {
      rows.push({ ...base, valid: false, error: `第 ${lineNo} 行服务端口非法` })
      continue
    }
    if (!(managementPort >= 1 && managementPort <= 65535)) {
      rows.push({ ...base, valid: false, error: `第 ${lineNo} 行管理端口非法` })
      continue
    }
    if (!edgePath.startsWith('/') || edgePath.endsWith('/')) {
      rows.push({ ...base, valid: false, error: `第 ${lineNo} 行 Edge路径需以 / 开头且不以 / 结尾` })
      continue
    }
    if (!(status === 0 || status === 1)) {
      rows.push({ ...base, valid: false, error: `第 ${lineNo} 行状态只能为 0 或 1` })
      continue
    }
    rows.push(base)
  }

  return rows
}

export function buildNodeCsvTemplate(): string {
  return '\uFEFF' + [
    'ip,service_port,management_port,edge_path,openresty_path,status',
    '10.0.0.1,80,9180,/edge/node1,,1',
  ].join('\n')
}

export function isDuplicateIp<T extends { ip: string; valid: boolean }>(rows: T[], row: T, index: number): boolean {
  if (!row.valid) return false
  return rows.some((other, otherIdx) => otherIdx !== index && other.ip === row.ip)
}
