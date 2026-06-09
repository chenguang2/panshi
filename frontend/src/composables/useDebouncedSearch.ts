import { ref } from 'vue'

export function useDebouncedSearch(delay = 300) {
  const searchText = ref('')
  let timer: ReturnType<typeof setTimeout> | null = null

  function onSearch(callback: () => void) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      callback()
    }, delay)
  }

  function cancelSearch() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  return { searchText, onSearch, cancelSearch }
}
