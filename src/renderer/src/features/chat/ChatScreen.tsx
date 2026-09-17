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
 * 実際の会話は R-3 (transcript 表示) と X-1 (起動) が担う。
 *
 * ## composer を無効にしている理由
 *
 * 以前は入力と送信ができ、送ると **assistant ロールで偽の応答**が返っていた。
 * 未接続であることは送信後にしか分からず、応答が吹き出しで返るため
 * **モデルが答えたように見えた**。README は SC-012 で「未実装機能を実装済みとして
 * 書かない」ことを課しているのに、UI 側で同じ誤認を作っていた。
 *
 * 加えて、生きた composer は **Constitution Principle VIII (日本語環境で破綻しない)** の
 * 検証対象になる。IME の変換確定 Enter を送信として扱わないことを確かめる経路が
 * R-1 には無い (E2E 基盤が無い) ため、**送信経路そのものを閉じる**ことで
 * 「検証していない送信経路」を残さない形にした ([AD-024](docs/decisions/0024-constitution-verification-paths.md) #18)。
 *
 * **延期先は R-2 ではない** ([AD-028](../../../../docs/decisions/0028-session-enumeration-process-and-unc-handoff.md) §5)。
 * R-2 は読み取り専用であり、E2E 基盤を作らない。
 * composer を開けるときに IME テストを同時に載せる方針は変わらないが、
 * その持ち主は M4 完了後に決める (Constitution v1.2.3 の Principle VIII)。
 */
export function ChatScreen(): React.JSX.Element {
  const messages: readonly ThreadMessageLike[] = []

  const runtime = useExternalStoreRuntime({
    messages: messages as ThreadMessageLike[],
    isRunning: false,
    /**
     * **スレッド全体を無効にする。** composer の入力・添付・送信がすべて閉じる。
     */
    isDisabled: true,
    // messages が既に ThreadMessageLike なので恒等変換を渡す
    convertMessage: (message) => message,
    onNew: () => {
      /*
       * **到達しない。** `isDisabled: true` が送信を閉じている。
       *
       * 黙って何もしない形にはしない — ここへ来たということは
       * 無効化が効いていないという意味であり、**未接続のまま送信できる状態**である。
       * 静かに握り潰すと、その退行が誰にも気付かれない。
       */
      throw new Error('composer は R-1 では無効である (isDisabled が効いていない)')
    }
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-full min-h-0 flex-col">
        {/*
          **未接続であることを送信前に示す。** 以前は送信後にしか分からなかった。
          `role="note"` にしているのは、警告でも操作結果でもない常設の説明だからである。
        */}
        <div
          role="note"
          className="border-border bg-muted/40 text-muted-foreground shrink-0 border-b px-4 py-2 text-sm"
        >
          <p className="text-foreground font-medium">
            この画面はまだ Claude Code に繋がっていません。
          </p>
          <p className="mt-0.5 text-xs">
            assistant-ui の表示部品を実際に載せて確かめるための画面です。入力はできません。
            会話の表示は R-3、セッションの起動は X-1 で実装します。
          </p>
        </div>

        <div className="min-h-0 flex-1">
          <Thread />
        </div>
      </div>
    </AssistantRuntimeProvider>
  )
}
