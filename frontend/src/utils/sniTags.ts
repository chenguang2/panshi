/**
 * 拆分 SNI tag 输入：支持逗号（中英文）、空白、换行分隔的多个值。
 * 例如 "a.com,b.com 1.2.3.4\nb.net" → ["a.com", "b.com", "1.2.3.4", "b.net"]
 */
export function splitSniTags(input: string): string[] {
  return input
    .split(/[,，\s]+/)
    .map(t => t.trim())
    .filter(Boolean)
}
