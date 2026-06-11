import { ref, reactive, onUnmounted } from 'vue'
import api from '@/api'

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
      const response = await api.post(url, body, {
        responseType: 'stream',
        signal: abortController.signal,
      } as any)

      const reader = (response as any).getReader?.()
      if (!reader) {
        // Fallback for non-streaming responses (e.g. test environments)
        const data = response.data
        if (data) {
          const line = typeof data === 'string' ? data : JSON.stringify(data)
          logs.value.push(line)
          options.onLine(line)
        }
        progress.percent = 100
        options.onComplete?.(data?.rc ?? -1, data?.status ?? 'unknown')
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
      const msg = e?.response?.data?.detail || e.message || '安装失败'
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
