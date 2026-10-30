/**
 * 哈希计算（tools-new-utilities 第二批）。
 * MD5 本地实现（RFC 1321，Web Crypto 不提供）；SHA 系列走 Web Crypto（浏览器必有）。
 * 输出统一小写十六进制。
 */

export function subtleAvailable(): boolean {
  return typeof globalThis.crypto !== 'undefined' && !!globalThis.crypto.subtle
}

// ── MD5（RFC 1321）───────────────────────────────────────────────────────

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4,
  11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]
const K = new Int32Array(64)
for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0

function utf8Bytes(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

function rotl(x: number, c: number): number {
  return (x << c) | (x >>> (32 - c)) | 0
}

function md5Bytes(data: Uint8Array): Uint8Array {
  const origLen = data.length
  const bitLen = origLen * 8
  // padding: 0x80 + zeros 到 56 mod 64 + 8 字节 little-endian bitLen
  const paddedLen = (((origLen + 8) >> 6) + 1) << 6
  const buf = new Uint8Array(paddedLen)
  buf.set(data)
  buf[origLen] = 0x80
  const dv = new DataView(buf.buffer)
  dv.setUint32(paddedLen - 8, bitLen >>> 0, true)
  dv.setUint32(paddedLen - 4, Math.floor(bitLen / 2 ** 32), true)

  let a0 = 0x67452301,
    b0 = 0xefcdab89,
    c0 = 0x98badcfe,
    d0 = 0x10325476

  for (let off = 0; off < paddedLen; off += 64) {
    const M = new Int32Array(16)
    for (let i = 0; i < 16; i++) M[i] = dv.getInt32(off + i * 4, true)
    let A = a0,
      B = b0,
      C = c0,
      D = d0
    for (let i = 0; i < 64; i++) {
      let F: number, g: number
      if (i < 16) {
        F = (B & C) | (~B & D)
        g = i
      } else if (i < 32) {
        F = (D & B) | (~D & C)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        F = B ^ C ^ D
        g = (3 * i + 5) % 16
      } else {
        F = C ^ (B | ~D)
        g = (7 * i) % 16
      }
      F = (F + A + (K[i] + M[g])) | 0 | 0
      A = D
      D = C
      C = B
      B = (B + rotl(F, S[i])) | 0
    }
    a0 = (a0 + A) | 0
    b0 = (b0 + B) | 0
    c0 = (c0 + C) | 0
    d0 = (d0 + D) | 0
  }

  const out = new Uint8Array(16)
  const odv = new DataView(out.buffer)
  odv.setInt32(0, a0, true)
  odv.setInt32(4, b0, true)
  odv.setInt32(8, c0, true)
  odv.setInt32(12, d0, true)
  return out
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function md5(str: string): string {
  return toHex(md5Bytes(utf8Bytes(str)))
}

// ── SHA 系列（Web Crypto）──────────────────────────────────────────────

export type ShaAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512'

export async function shaHex(str: string, algorithm: ShaAlgorithm): Promise<string> {
  const bytes = utf8Bytes(str)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const digest = await globalThis.crypto.subtle.digest(algorithm, buffer)
  return toHex(new Uint8Array(digest))
}
