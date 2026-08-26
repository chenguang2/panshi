import { describe, expect, it } from 'vitest'
import {
  apiDetail,
  applyGroupCreds,
  assembleHosts,
  credString,
  extraVarKeys,
  mergeBulkEntries,
  parseBulkHosts,
  toBool,
  validateAdvancedField,
  unknownKeysOf,
} from '../ansibleInventory'
import type { InventoryHostEntry } from '@/api/ansibleInventory'

describe('assembleHosts', () => {
  it('保留未知自定义键（全保真）', () => {
    const rows: InventoryHostEntry[] = [
      { ip: '10.0.0.1', ansible_ssh_user: 'root', ansible_ssh_pass: 'p', ansible_port: 2222, custom_note: '备注' },
    ]
    const res = assembleHosts(rows)
    expect(res.error).toBeNull()
    expect(res.hosts).toEqual([
      { ip: '10.0.0.1', ansible_ssh_user: 'root', ansible_ssh_pass: 'p', ansible_port: 2222, custom_note: '备注' },
    ])
  })

  it('剔除空字符串凭据字段（继承组级默认凭据）', () => {
    const rows: InventoryHostEntry[] = [
      { ip: '10.0.0.2', ansible_ssh_user: '', ansible_ssh_pass: '' },
      { ip: '10.0.0.3' },
    ]
    const res = assembleHosts(rows)
    expect(res.error).toBeNull()
    expect(res.hosts[0]).toEqual({ ip: '10.0.0.2' })
    expect(res.hosts[1]).toEqual({ ip: '10.0.0.3' })
  })

  it('trim IP 且拒绝空白 IP', () => {
    const ok = assembleHosts([{ ip: '  10.0.0.5  ' }])
    expect(ok.error).toBeNull()
    expect(ok.hosts[0]?.ip).toBe('10.0.0.5')

    const blank = assembleHosts([{ ip: '10.0.0.1' }, { ip: '   ' }])
    expect(blank.hosts).toHaveLength(0)
    expect(blank.error).toContain('第 2 行')
  })

  it('拒绝重复 IP', () => {
    const res = assembleHosts([{ ip: '10.0.0.1' }, { ip: '10.0.0.1' }])
    expect(res.error).toContain('重复')
    expect(res.error).toContain('10.0.0.1')
  })

  it('空列表合法（允许清空全部主机，删除保护由后端拦截）', () => {
    const res = assembleHosts([])
    expect(res.error).toBeNull()
    expect(res.hosts).toEqual([])
  })
})

describe('unknownKeysOf / extraVarKeys', () => {
  it('识别自定义键、忽略 ip 与凭据字段', () => {
    expect(unknownKeysOf({ ip: 'x', ansible_ssh_user: 'u', ansible_ssh_pass: 'p', foo: 1 })).toEqual(['foo'])
    expect(unknownKeysOf({ ip: 'x' })).toEqual([])
  })

  it('extraVarKeys 过滤组级凭据键', () => {
    expect(extraVarKeys({ ansible_ssh_user: 'u', ansible_ssh_pass: 'p', http_proxy: 'x' })).toEqual(['http_proxy'])
    expect(extraVarKeys({})).toEqual([])
  })
})

describe('applyGroupCreds', () => {
  it('有值覆盖、留空删除、其余键原样保留', () => {
    const next = applyGroupCreds(
      { ansible_ssh_user: 'old', ansible_ssh_pass: 'old', http_proxy: 'keep' },
      'root',
      '',
    )
    expect(next).toEqual({ ansible_ssh_user: 'root', http_proxy: 'keep' })
  })

  it('不修改入参对象', () => {
    const vars = { ansible_ssh_user: 'a' }
    applyGroupCreds(vars, '', '')
    expect(vars).toEqual({ ansible_ssh_user: 'a' })
  })
})

describe('credString', () => {
  it('null/undefined → 空串；非字符串转字符串', () => {
    expect(credString(undefined)).toBe('')
    expect(credString(null)).toBe('')
    expect(credString('abc')).toBe('abc')
    expect(credString(123)).toBe('123')
  })
})

describe('apiDetail', () => {
  it('提取后端 detail（含行号）', () => {
    const err = { response: { status: 400, data: { detail: 'YAML 解析失败（第 3 行）: xxx' } } }
    expect(apiDetail(err, 'fallback')).toBe('YAML 解析失败（第 3 行）: xxx')
  })

  it('detail 缺失或非字符串时返回 fallback', () => {
    expect(apiDetail(new Error('boom'), '保存失败')).toBe('保存失败')
    expect(apiDetail({ response: { data: {} } }, '加载失败')).toBe('加载失败')
    expect(apiDetail(null, '加载失败')).toBe('加载失败')
  })
})


describe('KNOWN_HOST_KEYS / unknownKeysOf（高级字段升级）', () => {
  it('常用连接变量不再视为未知键', () => {
    const entry = {
      ip: '10.0.0.1',
      ansible_port: 2222,
      ansible_host: '10.0.0.9',
      ansible_connection: 'ssh',
      ansible_python_interpreter: '/usr/bin/python3',
      ansible_become: true,
      ansible_become_user: 'root',
      ansible_become_pass: 'p',
      ansible_ssh_private_key_file: '~/.ssh/id_rsa',
      ansible_ssh_common_args: '-o Foo=bar',
    }
    expect(unknownKeysOf(entry)).toEqual([])
  })

  it('真正冷门键仍报告', () => {
    expect(unknownKeysOf({ ip: '10.0.0.1', deploy_tier: 'gold' })).toEqual(['deploy_tier'])
  })
})

describe('assembleHosts 空串高级字段剔除', () => {
  it('空字符串高级键不写入载荷', () => {
    const res = assembleHosts([
      { ip: '10.0.0.7', ansible_port: '', ansible_ssh_private_key_file: '', ansible_ssh_user: 'jboss' },
    ])
    expect(res.error).toBeNull()
    expect(res.hosts[0]).toEqual({ ip: '10.0.0.7', ansible_ssh_user: 'jboss' })
  })
})

describe('toBool（become 字符串规范化）', () => {
  it('yes/true 不分大小写为真', () => {
    expect(toBool('yes')).toBe(true)
    expect(toBool('TRUE')).toBe(true)
    expect(toBool(true)).toBe(true)
  })
  it('no/false 为假', () => {
    expect(toBool('no')).toBe(false)
    expect(toBool(false)).toBe(false)
  })
  it('其他值安全回退为假', () => {
    expect(toBool('maybe')).toBe(false)
    expect(toBool(undefined)).toBe(false)
  })
})

describe('validateAdvancedField', () => {
  it('端口：空值合法、非数字与越界报错', () => {
    expect(validateAdvancedField('ansible_port', '')).toBeNull()
    expect(validateAdvancedField('ansible_port', 22)).toBeNull()
    expect(validateAdvancedField('ansible_port', '11022')).toBeNull()
    expect(validateAdvancedField('ansible_port', 99999)).toContain('1-65535')
    expect(validateAdvancedField('ansible_port', 'ssh')).toContain('1-65535')
  })

  it('其余已知键自由文本不校验', () => {
    expect(validateAdvancedField('ansible_ssh_common_args', '-o X=1')).toBeNull()
  })
})

describe('parseBulkHosts（批量导入解析）', () => {
  it('解析「IP 用户 密码」行，仅提供的字段存在', () => {
    const res = parseBulkHosts('10.0.0.1 root pass1\n10.0.0.2')
    expect(res.errors).toEqual([])
    expect(res.duplicatesInText).toBe(0)
    expect(res.entries).toEqual([
      { ip: '10.0.0.1', ansible_ssh_user: 'root', ansible_ssh_pass: 'pass1' },
      { ip: '10.0.0.2' },
    ])
  })

  it('跳过空行与 # 整行注释（含缩进）', () => {
    const res = parseBulkHosts('\n10.0.0.1 root\n   # 这是注释\n#全角顶格注释\n   \n10.0.0.2\n')
    expect(res.errors).toEqual([])
    expect(res.entries).toEqual([
      { ip: '10.0.0.1', ansible_ssh_user: 'root' },
      { ip: '10.0.0.2' },
    ])
  })

  it('行尾 # 注释：丢弃其后内容', () => {
    const res = parseBulkHosts('10.0.0.1 root pass1 # web服务器\n10.0.0.2 # 纯IP加注释')
    expect(res.errors).toEqual([])
    expect(res.entries).toEqual([
      { ip: '10.0.0.1', ansible_ssh_user: 'root', ansible_ssh_pass: 'pass1' },
      { ip: '10.0.0.2' },
    ])
  })

  it('Tab 与连续空白分隔（兼容 Excel 粘贴）', () => {
    const res = parseBulkHosts('10.0.0.1\troot\tpass1\n10.0.0.2    user2     pass2')
    expect(res.errors).toEqual([])
    expect(res.entries).toEqual([
      { ip: '10.0.0.1', ansible_ssh_user: 'root', ansible_ssh_pass: 'pass1' },
      { ip: '10.0.0.2', ansible_ssh_user: 'user2', ansible_ssh_pass: 'pass2' },
    ])
  })

  it('数据段超过 3 段的行报错并带物理行号，且不进入条目', () => {
    const res = parseBulkHosts('10.0.0.1 root pass1 extra\n\n10.0.0.2 ok')
    expect(res.errors).toEqual([{ line: 1, reason: expect.stringContaining('段') }])
    expect(res.entries).toEqual([{ ip: '10.0.0.2', ansible_ssh_user: 'ok' }])
  })

  it('IP 不符合主机键口径的行报错（与后端一致的宽松形态校验）', () => {
    const res = parseBulkHosts('10.0.0.1 root\n-bad ip! x\n999.999.999.999')
    expect(res.errors).toEqual([{ line: 2, reason: expect.stringContaining('IP') }])
    expect(res.entries).toEqual([
      { ip: '10.0.0.1', ansible_ssh_user: 'root' },
      { ip: '999.999.999.999' },
    ])
  })

  it('文本内部重复 IP：后者整体覆盖前者并计数', () => {
    const res = parseBulkHosts('10.0.0.1 old oldpass\n10.0.0.1 root pass1\n10.0.0.1 admin')
    expect(res.duplicatesInText).toBe(2)
    expect(res.entries).toEqual([{ ip: '10.0.0.1', ansible_ssh_user: 'admin' }])
  })
})

describe('mergeBulkEntries（批量导入合并）', () => {
  it('新 IP 追加到末尾，保持条目出现顺序', () => {
    const rows: InventoryHostEntry[] = [{ ip: '10.0.0.1' }]
    const res = mergeBulkEntries(rows, [
      { ip: '10.0.0.2', ansible_ssh_user: 'root' },
      { ip: '10.0.0.3' },
    ])
    expect(res.overwrittenCount).toBe(0)
    expect(res.rows).toEqual([
      { ip: '10.0.0.1' },
      { ip: '10.0.0.2', ansible_ssh_user: 'root' },
      { ip: '10.0.0.3' },
    ])
  })

  it('同 IP 仅覆盖粘贴中提供的字段，保留未提及凭据与高级/未知键', () => {
    const rows: InventoryHostEntry[] = [
      { ip: '10.0.0.1', ansible_ssh_user: 'old', ansible_ssh_pass: 'oldpass', become: true, custom_key: 'val' },
    ]
    // 仅提供 user，不提供 pass → pass 应保留
    const res = mergeBulkEntries(rows, [
      { ip: '10.0.0.1', ansible_ssh_user: 'new' },
    ])
    expect(res.overwrittenCount).toBe(1)
    expect(res.rows[0]).toEqual({
      ip: '10.0.0.1',
      ansible_ssh_user: 'new',
      ansible_ssh_pass: 'oldpass',
      become: true,
      custom_key: 'val',
    })
  })

  it('不修改入参 rows 数组', () => {
    const rows: InventoryHostEntry[] = [{ ip: '10.0.0.1' }]
    const original = [...rows]
    mergeBulkEntries(rows, [{ ip: '10.0.0.1', ansible_ssh_user: 'x' }])
    expect(rows).toEqual(original)
  })
})
