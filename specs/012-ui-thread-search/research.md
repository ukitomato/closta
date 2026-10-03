# Research: Thread 検索と探す操作 (O-3)

調べた日: 2026-10-04 (夜間の自走。コードの事実は同日の読み取り)

## R-01 範囲の分割 (spec U-1。未承認)

- **Decision**: O-3 は「探す」(Thread search・会話内検索・Command palette・Empty state) と、義務 (X-4 から) の再利用率の計測経路、義務 (O-1 から) (1) の i18n の判断に絞る。義務 (O-1 から) (2) は O-7 (`session`)、conversation map / message timing / heat graph と本文の横断検索の要否は O-8 (`ui`) に移す
- **Rationale**:
  - 入力の全部を入れると FR が 20 を超える (メモリの目安)。表示 7 種のうち 3 種 (map / timing / heat graph) は時刻の情報を要るが、メッセージの `createdAt` は過去ログ (`transcript.ts:279`)・実行中 (`live-message.ts:76`) とも `null` で、agents / domain の変換を変える必要がある。「探す」は renderer の中で閉じる
  - 義務 (2) は (a) が利用者の承認を要し、(d) が ADR を要り、計測は実機でしかできない。夜間には一つも完了できない。「探す」と依存が無い
- **Alternatives**: 全部を入れる (FR 超過・夜間に完了できない義務が残り spec ごと止まる) / perf だけ分ける (map / timing / heat graph の変換の変更が残り FR 超過)

## R-02 Thread search の一致の規則

- **Decision**: renderer の純関数 `matchSession(summary, query)` を `src/renderer/src/features/search/match.ts` に置き、一覧と palette で共有する。正規化は NFKC → 小文字化 → 制御文字 (C0 / C1 / 双方向制御 / ゼロ幅) の除去 → 空白の圧縮。語を空白で区切り、全語がどれかのフィールドに部分一致したら一致
- **Rationale**: 一覧の DTO は既に renderer にあり、既存の所在・フォルダの絞り込みも IPC を往復させない (`SessionListScreen.tsx:731`)。NFKC で全角 / 半角の英数とカナの揺れを吸収できる (Principle VIII)
- **Alternatives**: main で検索する (IPC が要り、既存の絞り込みと揃わない) / あいまい一致 (並びが変わり、既存の並びと所在の見出しの読み方が崩れる)

## R-03 会話内検索と仮想化・強調

- 事実: transcript は 40 件を超えると `@tanstack/react-virtual` で仮想化する (`thread.aui.tsx:170-187,316`)。index / id で移る公開 API は無く、最下部への追従で `virtualizer.scrollToIndex` を内部で呼ぶだけ (`:337`)。text part は `MarkdownText` で描く (`:770`)
- **Decision**:
  - 一致はメッセージのデータ (text part の本文) から数える。単位は「本文の中の出現 1 つ」。描かれていないメッセージも数えられる
  - 移動は transcript の context に `scrollToMessage(index)` を足す。仮想化のときは `virtualizer.scrollToIndex(index, { align: 'center' })`、仮想化しないときは `data-message-id` の要素の `scrollIntoView`。最下部への追従は検索中は止める (R-3 のアンカリングの「利用者が上にいるときは追従しない」と同じ扱い)
  - 強調は **CSS Custom Highlight API** (`CSS.highlights` と `Range`) で、描かれた DOM の text node に掛ける。DOM を書き換えない・HTML を組まないので、markdown の描画と XSS 境界 (R-3 FR-020) に触れない。Electron 39 (Chromium) で使える
  - markdown の記号を含む語 (`**` など) は、本文の出現数と描画の出現数がずれうる。件数は本文の出現で数え、強調は描画の中で一致したものすべてに掛け、現在の位置はメッセージ単位で示す [ASSUMED]
- **Alternatives**: 本文を区切って `<mark>` を差し込む (MarkdownText の内側を変える必要があり、markdown の構文を壊す) / ブラウザの検索 (`webContents.findInPage`。仮想化の外に届かず main を経由する)

## R-04 Command palette と element (Principle XIII)

- 事実: 対応表 F 節に `Command palette` / `Conversation search` / `Thread search` / `Empty state` が Tier B・未使用で載っている。`EmptyState` は既に elements にある (`empty-state.tsx`)
- **Decision**: 実装の最初に、registry の `Command palette` / `Conversation search` / `Thread search` の element の中身を確かめ (`docs/discovery.md` の element の取り込みの手順)、使えるものは取り込む。取り込めない・runtime を前提にして合わないときは、既存の Radix の Dialog と listbox で作り、理由を対応表の F 節の備考に書く
- palette のキー操作: Ctrl+K を `window` の keydown (capture) で受ける。`event.isComposing` か `keyCode === 229` のときは何もしない (X-2 の扱い)。既存の window / document の keydown は画像ダイアログのフォーカストラップ 1 件だけで衝突しない
- **Alternatives**: `cmdk` のライブラリを足す (依存が増える。element に同等があれば不要)

## R-05 再利用率の記録

- 事実: 起動は `IPC_CHANNELS.launchSession` (`capability.ts:199-216`) を `launchSession(config)` で呼ぶ (`preload/index.ts:58`)。main は `ipc.ts:282-291` の `handle()` で送信元を検査し、`session-ipc.ts:137-144` で形を検査し、`session-launch-service.ts:187-202` で受け付けか拒否かを決める。`ipc.ts:284-290` で `launching` のときだけ port を渡す。preset の store は一時ファイルからの置き換えと `.bak` の退避を持ち (`preset-store.ts:74-178`)、直列化は service 側 (`preset-service.ts:51-56`)
- **Decision**:
  - capability の `launchSession(config, origin?)` に第 2 引数 `origin: LaunchOrigin` を足す。`SessionLaunchConfig` は変えない (起動の設定と計測を分ける)
  - main は `ipc.ts` の起動の handler で、結果が `launching` のときだけ `launchUsage.record(origin)` を await せずに呼ぶ (失敗は握りつぶし、起動の応答を遅らせない)。origin の検証は `validate.ts` に `checkLaunchOrigin` を足す
  - 記録は `src/main/infra/settings/launch-usage-store.ts` (store) と `src/main/app/launch-usage-service.ts` (直列化と日付の計算)。純粋な集計 (足す・90 日の刈り込み・30 日の合計) は `src/domain/session/launch-usage.ts`
  - 読み出しは新しいチャネル `closta:getLaunchUsage` が `{ preset, manual, days: 30 }` を返す
  - 日付は main が `now()` からローカルの暦日 (`YYYY-MM-DD`) を作る。renderer の時計を信じない
- **Rationale**: 日ごとの回数だけなら、秘密や識別子が構造上入らない (Principle V)。ファイルは最大 90 キーで大きくならない
- **Alternatives**: 起動ごとの行の追記 (時刻・プリセット名が残り、刈り込みと秘密の検査が要る) / renderer の localStorage (main の永続化の規則の外。再起動の後に読めるが、database-reviewer の観点の外になる)

## R-06 i18n の判断 (spec U-3。未承認)

- **Decision**: リソース化しない。AD-045 (proposed) に記録した ([docs/decisions/0045-ui-labels-no-i18n-resources.md](../../docs/decisions/0045-ui-labels-no-i18n-resources.md))
- 事実: UI の文言は 6 つの `labels.ts` (runtime-list / workspace-folders / session-list / provider / session / chat) にある。`target-finder.ts:92,99` が `候補 #N` / `名前 (#N)` を作る
- **Alternatives**: AD-045 の Alternatives
