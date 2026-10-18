import { createContext, useContext } from 'react'

import type { SlashCommandSource } from './slash-commands'

/**
 * composer に差し込む拡張の口 (O-10 / 018 data-model §5 / plan「実装方針」6)。
 *
 * - `commands`: 表示中のセッションのスラッシュコマンドの一覧。`null` (既定) か空なら候補を出さない
 *   (過去ログ・構成が届いていない・稼働中でないセッション)。LivePane だけが値を渡す (`ChatScreen` は渡さない)
 * - `retryTextFor`: 拒否の行 (message id) より前の最も近い利用者の入力の本文 (US-4「編集して再試行」)。無い・過去ログ・
 *   未提供なら `null` (ボタンを出さない)
 *
 * assistant-ui の `unstable_` の API (trigger popover) を使う面は本ファイルと `slash-commands.ts` に閉じる (RK-05)。
 * IME の変換中のガードはライブラリ側 (`ComposerInput` の `isComposing`) に任せ、自前の keydown のガードを足さない (AD-037)。
 */
export interface ComposerExtensions {
  readonly commands: readonly SlashCommandSource[] | null
  readonly retryTextFor?: ((messageId: string) => string | null) | null
}

const NO_EXTENSIONS: ComposerExtensions = { commands: null }

export const ComposerExtensionsContext = createContext<ComposerExtensions>(NO_EXTENSIONS)

export function useComposerExtensions(): ComposerExtensions {
  return useContext(ComposerExtensionsContext)
}
