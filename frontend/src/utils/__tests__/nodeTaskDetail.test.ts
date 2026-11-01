import { describe, it, expect } from 'vitest'
import { buildSuggestion, paramEntries, countsLine } from '../nodeTaskDetail'

describe('utils/nodeTaskDetail', () => {
  describe('buildSuggestion（结论区处理建议，7.2 C）', () => {
    it('无失败/无取消 → 不显示建议', () => {
      expect(buildSuggestion({ status: 'success', failed_nodes: 0, cancelled_nodes: 0 })).toBe('')
    })

    it('清单类 → 引导先加入主机清单', () => {
      const s = buildSuggestion({
        status: 'failed',
        failed_nodes: 1,
        failure_summary: '1 台节点不在 Ansible 主机清单中',
      })
      expect(s).toBe('建议：确认节点已加入 Ansible 主机清单后重试')
    })

    it('连接/网络类 → 引导检查网络与 SSH', () => {
      const s = buildSuggestion({
        status: 'failed',
        failed_nodes: 1,
        reasons: ['ssh: connect to host 10.0.0.11 port 22: Connection refused'],
      })
      expect(s).toBe('建议：确认节点网络与 SSH 服务可达后重试')
    })

    it('认证/权限拒绝类 → 引导核对清单账号', () => {
      const s = buildSuggestion({
        status: 'failed',
        failed_nodes: 1,
        reasons: ['Permission denied (publickey,password)'],
      })
      expect(s).toBe('建议：核对清单中的 SSH 账号与密码/密钥后重试')
    })

    it('超时类 → 引导检查负载与超时设置', () => {
      const s = buildSuggestion({ status: 'failed', failed_nodes: 1, failure_summary: '执行超时（1800s）' })
      expect(s).toBe('建议：检查节点负载与网络后重试，必要时调大超时时间')
    })

    it('磁盘类 → 引导清理空间', () => {
      const s = buildSuggestion({ status: 'failed', failed_nodes: 1, reasons: ['No space left on device'] })
      expect(s).toBe('建议：清理节点磁盘空间后重试')
    })

    it('未知原因 → 通用建议', () => {
      const s = buildSuggestion({ status: 'failed', failed_nodes: 1, reasons: ['rc=1 boom'] })
      expect(s).toBe('建议：查看节点日志定位具体原因')
    })

    it('仅取消无失败 → 也给建议（可重试）', () => {
      const s = buildSuggestion({ status: 'cancelled', failed_nodes: 0, cancelled_nodes: 2 })
      expect(s).toBe('建议：确认节点环境后重试已取消的节点')
    })

    it('优先级：清单关键词先于连接关键词命中', () => {
      const s = buildSuggestion({
        status: 'failed',
        failed_nodes: 1,
        failure_summary: '2 台节点不在 Ansible 主机清单中',
        reasons: ['Connection refused'],
      })
      expect(s).toBe('建议：确认节点已加入 Ansible 主机清单后重试')
    })
  })

  describe('paramEntries（参数 key-value 摘要）', () => {
    it('cmd_exec 命令模式：命令 / 安全策略 / 白名单 / 超时', () => {
      const entries = paramEntries({
        task_type: 'cmd_exec',
        params: { cmd: 'ls -la', security: 'whitelist', whitelist: ['ls', 'ps'], timeout: 30 },
      })
      expect(entries).toEqual([
        { label: '命令', value: 'ls -la' },
        { label: '安全策略', value: '白名单' },
        { label: '白名单命令', value: 'ls、ps' },
        { label: '超时', value: '30s' },
      ])
    })

    it('cmd_exec 脚本模式：脚本 + 安全策略', () => {
      const entries = paramEntries({
        task_type: 'cmd_exec',
        params: { script_filename: 'deploy.sh', security: 'blacklist', timeout: 60 },
      })
      expect(entries[0]).toEqual({ label: '脚本', value: 'deploy.sh' })
      expect(entries[1]).toEqual({ label: '安全策略', value: '黑名单' })
    })

    it('distribute_file：源文件 / 目标目录 / 超时', () => {
      const entries = paramEntries({
        task_type: 'distribute_file',
        params: { srcfilename: 'a.tar.gz', destpath: '/opt/tmp', timeout: 600 },
      })
      expect(entries).toEqual([
        { label: '源文件', value: 'a.tar.gz' },
        { label: '目标目录', value: '/opt/tmp' },
        { label: '超时', value: '600s' },
      ])
    })

    it('安装/升级类：安装包与目标版本', () => {
      expect(paramEntries({ task_type: 'install_openresty', params: { openresty_file: 'o.tar.gz' } })).toEqual([
        { label: '安装包', value: 'o.tar.gz' },
      ])
      expect(paramEntries({ task_type: 'edge_pack_add', params: { pack_file: 'p.tar.gz' } })).toEqual([
        { label: '版本包', value: 'p.tar.gz' },
      ])
      expect(paramEntries({ task_type: 'edge_pack_rebase', params: { version: 'edge-1' } })).toEqual([
        { label: '目标版本', value: 'edge-1' },
      ])
    })

    it('software_check：软件列表', () => {
      expect(paramEntries({ task_type: 'software_check', params: { software_list: ['nc', 'vim'] } })).toEqual([
        { label: '软件列表', value: 'nc、vim' },
      ])
    })

    it('空参数返回空数组（渲染侧给占位文案）', () => {
      expect(paramEntries({ task_type: 'start', params: {} })).toEqual([])
      expect(paramEntries({ task_type: 'start', params: null })).toEqual([])
    })

    it('未识别的键兜底成通用 key-value（不静默丢参数）', () => {
      const entries = paramEntries({ task_type: 'start', params: { extra: 'x', timeout: 15 } })
      expect(entries).toEqual([
        { label: 'extra', value: 'x' },
        { label: '超时', value: '15s' },
      ])
    })
  })

  describe('countsLine（四项计数 / 共 N）', () => {
    it('始终展示四项并追加总数', () => {
      expect(
        countsLine({ total_nodes: 4, success_nodes: 2, failed_nodes: 1, skipped_nodes: 0, cancelled_nodes: 1 }),
      ).toBe('成功 2 · 失败 1 · 跳过 0 · 取消 1 / 共 4')
    })
    it('缺失字段按 0 处理', () => {
      expect(countsLine({ total_nodes: 2, success_nodes: 2 })).toBe('成功 2 · 失败 0 · 跳过 0 · 取消 0 / 共 2')
    })
  })
})
