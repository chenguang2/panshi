/**
 * IPv4/CIDR 计算（tools-new-utilities 第二批）。仅 IPv4（运维场景为主）。
 */

export interface CidrResult {
  error?: string
  ip?: string
  prefix?: number
  mask?: string
  wildcard?: string
  network?: string
  broadcast?: string
  firstHost?: string
  lastHost?: string
  /** 地址总数（含网络/广播） */
  totalHosts?: number
  /** 可用主机数（/31 按 RFC 3021 两地址；/32 为 1） */
  usableHosts?: number
  /** 私网段（10/8、172.16/12、192.168/16、127/8） */
  isPrivate?: boolean
}

export function ipToInt(ip: string): number | undefined {
  const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return undefined
  const octs = m.slice(1).map(Number)
  if (octs.some((n) => n > 255)) return undefined
  return ((octs[0] << 24) | (octs[1] << 16) | (octs[2] << 8) | octs[3]) >>> 0
}

export function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

function isPrivateIp(n: number): boolean {
  const a = (n >>> 24) & 255
  const b = (n >>> 16) & 255
  if (a === 10 || a === 127) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

export function parseCidr(input: string): CidrResult {
  const raw = input.trim()
  if (!raw) return { error: '无法识别：请输入 IPv4 地址或 a.b.c.d/prefix' }
  const [ipPart, prefixPart] = raw.split('/')
  if (prefixPart !== undefined && (!/^\d{1,2}$/.test(prefixPart) || Number(prefixPart) > 32)) {
    return { error: '无法识别：前缀长度应为 0-32' }
  }
  const ipInt = ipToInt(ipPart)
  if (ipInt === undefined) {
    return { error: '无法识别：请输入合法的 IPv4 地址（如 192.168.1.10/24）' }
  }
  const prefix = prefixPart === undefined ? 32 : Number(prefixPart)
  const maskInt = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  const networkInt = (ipInt & maskInt) >>> 0
  const broadcastInt = (networkInt | (~maskInt >>> 0)) >>> 0
  const total = 2 ** (32 - prefix)
  // /31 按 RFC 3021 两地址可用；/32 单主机；其余去网络/广播
  const usable = prefix >= 32 ? 1 : prefix === 31 ? 2 : total - 2
  let firstHost: string
  let lastHost: string
  if (prefix >= 32) {
    firstHost = intToIp(ipInt)
    lastHost = intToIp(ipInt)
  } else if (prefix === 31) {
    firstHost = intToIp(networkInt)
    lastHost = intToIp(broadcastInt)
  } else {
    firstHost = intToIp(networkInt + 1)
    lastHost = intToIp(broadcastInt - 1)
  }
  return {
    ip: intToIp(ipInt),
    prefix,
    mask: intToIp(maskInt),
    wildcard: intToIp(~maskInt >>> 0),
    network: intToIp(networkInt),
    broadcast: intToIp(broadcastInt),
    firstHost,
    lastHost,
    totalHosts: total,
    usableHosts: usable,
    isPrivate: isPrivateIp(ipInt),
  }
}
