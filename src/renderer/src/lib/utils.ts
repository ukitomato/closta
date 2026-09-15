import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * shadcn / assistant-ui の element が前提にするクラス結合ヘルパー。
 * `npx assistant-ui@latest add` は本ファイルが無ければ生成するが、
 * 手動 `components.json` では alias 解決に失敗して生成されないため自分で置く。
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
