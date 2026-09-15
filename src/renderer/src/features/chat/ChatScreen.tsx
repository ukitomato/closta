import { useState } from 'react'
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ThreadMessageLike
} from '@assistant-ui/react'
import { Thread } from '@/components/assistant-ui/elements/thread.aui'

/**
 * assistant-ui の runtime-connected element (`Thread`) を実際に載せる画面。
 *
 * ランタイムは AD-023 の決定どおり `useExternalStoreRuntime` を使う
 * (「メッセージ状態が既に zustand にあるなら useExternalStoreRuntime」が公式の決定木。
 * Closta は Zustand を持つ)。
 *
 * **Claude Code / Agent SDK には繋がない。** 本 feature (R-1) の範囲は
 * 「transcript の表示」でも「セッションの起動」でもないため、モデル呼び出しは行わない。
 * `onNew` は受け取ったメッセージをローカルの配列に積むだけで、応答を生成しない。
 * 実際の会話は R-3 (transcript 表示) と X-1 (起動) が担う。
 */
export function ChatScreen(): React.JSX.Element {
  const [messages, setMessages] = useState<ThreadMessageLike[]>([])

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: false,
    // messages が既に ThreadMessageLike なので恒等変換を渡す
    convertMessage: (message) => message,
    onNew: async (message) => {
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: message.content },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'R-1 ではモデルに繋いでいません。会話は R-3 / X-1 で実装します。'
            }
          ]
        }
      ])
    }
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="h-full min-h-0">
        <Thread />
      </div>
    </AssistantRuntimeProvider>
  )
}
