import { ref, reactive, onUnmounted } from 'vue'

const API_BASE = '/api/v1'

export interface InstallStreamOptions {
  onLine: (line: string) => void
  onProgress?: (percent: number) => void
  onComplete?: (rc: number, status: string) => void
  onError?: (error: string) => void
}

export function useInstallStream() {
  const installing = ref(false)
  const progress = reactive({ percent: 0 })
  const logs = ref<string[]>([])
  const error = ref<string | null>(null)
  let abortController: AbortController | null = null

  async function start(url: string, body: Record<string, unknown>, options: InstallStreamOptions) {
    installing.value = true
    error.value = null
    logs.value = []
    progress.percent = 0
    abortController = new AbortController()

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}${url}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: abortController.signal,
      })

      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        let errMsg = `请求失败 (${response.status})`
        try { const j = JSON.parse(errText); errMsg = j.detail || errMsg } catch { /* ignore */ }
        options.onError?.(errMsg)
        error.value = errMsg
        installing.value = false
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        options.onError?.('浏览器不支持流式读取')
        error.value = '浏览器不支持流式读取'
        installing.value = false
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const raw of lines) {
          const trimmed = raw.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          try {
            const data = JSON.parse(trimmed.slice(6))
            if (data.line) {
              logs.value.push(data.line)
              options.onLine(data.line)
            }
            if (data.percent !== undefined) {
              progress.percent = data.percent
              options.onProgress?.(data.percent)
            }
            if (data.rc !== undefined) {
              options.onComplete?.(data.rc, data.status || 'success')
              progress.percent = 100
            }
          } catch {
            // Ignore malformed SSE events
          }
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return
      const msg = e.message || '安装失败'
      error.value = msg
      options.onError?.(msg)
    } finally {
      installing.value = false
      abortController = null
    }
  }

  function cancel() {
    abortController?.abort()
    installing.value = false
    abortController = null
  }

  onUnmounted(() => cancel())

  return { installing, progress, logs, error, start, cancel }
}
