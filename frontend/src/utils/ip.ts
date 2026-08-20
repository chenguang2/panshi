/**
 * IP 地址校验工具（IPv4 / IPv6）。
 * 供 IP SAN 输入校验与 DNS/IP 分组复用。
 */

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

function isValidIpv4(s: string): boolean {
  const m = IPV4_RE.exec(s)
  if (!m) return false
  return m.slice(1).every(octet => Number(octet) >= 0 && Number(octet) <= 255)
}

// RFC 3986 IPv6 形态（含 :: 压缩与 IPv4-mapped）。
const IPV6_RE =
  /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/

function isValidIpv6(s: string): boolean {
  return IPV6_RE.test(s)
}

/** 判断字符串是否为合法 IPv4 或 IPv6 地址。 */
export function isIpAddress(s: string): boolean {
  const v = s.trim()
  if (!v) return false
  if (v.includes(':')) return isValidIpv6(v)
  return isValidIpv4(v)
}

