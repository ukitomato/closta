import type { Win32ClaudePathResult } from '@domain/capability'
import { classifyClaudeExecutable } from '@domain/runtime/claude-executable'
import type { RuntimeListDTO } from '@domain/runtime/dto'

/**
 * Win32 の claude.exe の場所の指定・解除 (X-8 BE-023 / contracts C-1・C-2)。
 *
 * ダイアログ (electron) と保存と再検出は composition root が注入する (この層は `electron` を import しない)。
 * **戻り値・ログにパスを含めない** (DTO はパスを持たない。data-model §4)。ファイルが在るかは保存の時点では
 * 見ない (再検出が `override-invalid` を出す)。
 */
export interface Win32ClaudePathServiceDeps {
  /** ファイル選択のダイアログ。取り消しは null。 */
  readonly chooseFile: () => Promise<string | null>
  /** 指定 (`null` は解除) を保存する。失敗は throw。 */
  readonly save: (path: string | null) => Promise<void>
  /** 再検出 (利用者の明示操作)。 */
  readonly refresh: () => Promise<RuntimeListDTO>
}

export interface Win32ClaudePathService {
  pick(): Promise<Win32ClaudePathResult>
  clear(): Promise<Win32ClaudePathResult>
}

export function createWin32ClaudePathService(
  deps: Win32ClaudePathServiceDeps
): Win32ClaudePathService {
  async function saveAndRefresh(path: string | null): Promise<Win32ClaudePathResult> {
    try {
      await deps.save(path)
    } catch {
      // 理由 (errno・パス) は返さない。
      return { status: 'save-failed' }
    }
    const list = await deps.refresh()
    return { status: 'updated', runtimes: list.runtimes }
  }

  return {
    async pick() {
      const chosen = await deps.chooseFile()
      if (chosen === null) return { status: 'cancelled' }
      if (classifyClaudeExecutable(chosen) !== 'exe')
        return { status: 'rejected', reason: 'not-exe' }
      return saveAndRefresh(chosen)
    },
    clear() {
      return saveAndRefresh(null)
    }
  }
}
