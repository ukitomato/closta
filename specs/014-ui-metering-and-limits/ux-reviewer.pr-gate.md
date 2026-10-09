# ux-reviewer Review: 計量と制限の表示 (O-4)

**Run**: 2026-10-09
**Reviewer**: ux-reviewer
**Spec**: specs/014-ui-metering-and-limits/spec.md
**Gate**: pr-gate Round 1 (base: main)

(パスは C:\dev\closta からの相対。読んだもの: reviewer-base / spec / plan / data-model / tasks / research R-09 / design-gate.md / code-gate.md / ui charter / AD-047・AD-045 全文 / diff の UI 部分 / touched の UI ファイル。reviewers.yml の exclude にある thinking-indicator.tsx などの vendored ファイルは指摘の対象から外した)

## 初回読了 viewpoint

- FR/SC:
  - FR-002 失敗の文言と再ログインの導線 (FailureBanner・行・読み上げ)
  - FR-006 Quota banner
  - FR-007 API の再試行の行
  - FR-008 使用量のタブ
  - FR-009 コンテキストと費用の目盛り
  - FR-010 概要の現在の権限モードと警告の帯
  - FR-011 圧縮の行
  - FR-012 tool の経過時間と思考の印
  - FR-013 task の進み具合
  - FR-016 Provider の表記
  - FR-017 / FR-019 は a11y-reviewer の担当なので UX の面だけ見た
  - SC-001 / SC-003 / SC-007
- touched files に該当する charter / Confirmation:
  - ui charter「業務ルール」(Principle VIII / XII / XIII)
  - ui charter KPI「自作率」(計測経路は ux-reviewer)。Quota banner・Cost meter・Context display を採らなかった理由は research R-09:119-129 にある。正本は PR の説明なので、/cl-done で写すこと
  - AD-045 Decision 2 と Confirmation (直書きの基準線 331 行) → L-010
  - AD-047 の Confirmation (SC-001 / SC-002 / SC-006) は UX の観点の外
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当 (AD-045 の直書きの基準線は UX-6 として G で扱う)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当 (US-3 AC2 と最初のターンの目盛りの食い違いは E の範囲なので出さない。文言だけ G の L-001 で扱う)
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: Critical:0 High:0 Medium:4 Low:10
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

O-4 は次の UI を新しく作った。
- 中央のヘッダ: コンテキストと費用の目盛り (`ContextCostMeter`)、権限モードの警告の帯と Quota banner (`CenterBanners` / `quota-banner.ts`)
- 右のペイン: 「使用量」のタブ (`UsageTab`)、「概要」の現在の権限モード
- transcript: API の再試行・圧縮・権限モードの行、task の進み具合、tool の経過時間、思考の印
- 失敗の理由 8 種の文言と短い理由。再ログインの導線は `isReloginFailure` で出し分ける

空の状態、送れない終端での Quota banner、文言を `labels.ts` に置くことは丁寧に作られている。

問題は終わり方の扱いにある。turn の来ない終わり方や終端の後にも、進行中を示す表示 (警告の帯・思考の印・経過時間) が直されずに残る。design-gate R3 の MG-06 / MG-08 は手当てされないまま実装された。もう 1 つの問題は、US-1 の中心である「次の操作を選べる」が CTA の文言に届いていないこと。

## Findings

### [Medium] 権限モードの警告の帯が、セッションの終了・失敗の後も `role="alert"` と「動いています」のまま残り、次の操作も示さない (M-001) (scope: feature)

- **観察**:
  - `src/renderer/src/features/shell/CenterBanners.tsx:42-43` は `terminal` を `QuotaBanner` にだけ渡している。`UnsafeModeBanner` (`:58-68`) は `terminal` を受け取らない
  - `:86-97` は常に `role="alert"` で `src/renderer/src/features/shell/labels.ts:152-153` の文 (「…で動いています。承認なしで操作が走ることがあります。」) を描く
  - `meters.permissionMode` が消えるのは `close()` のときだけ (`src/renderer/src/features/session/running-session-store.ts:571-576`)
  - したがって失敗したセッションでは、FailureBanner (`src/renderer/src/features/session/LivePane.tsx:321-322`。`role="alert"`) と並んで、事実と違う「動いています」の alert が出続ける
  - 帯の文には、利用者が取れる操作 (中断・終了・概要で確かめる) が無い
- **同種事象探索**: `CenterBanners.tsx` の中で `terminal` を `UnsafeModeBanner` に渡す箇所は 0 件。同じ問題を Quota banner では手当て済み (`src/renderer/src/features/shell/quota-banner.ts:64-72`)。design-gate R3 MG-06 (po M-007) が同じ事象を Medium で出したが、手当てされずに残った
- **リスク/影響**:
  - 終わったセッションで「承認なしで操作が走る」と読ませるのは誤警報である (UX-8)
  - alert が 2 つ重なり、本当の失敗の理由が埋もれる
  - 動いている間も、危険を知らせるだけで次の一手が無い (UX-2)
- **推奨アクション**:
  - `terminal` を `UnsafeModeBanner` にも渡す。terminal では帯を出さないか、`role="status"` に下げて文を過去形にする (例「…で動いていました。」)
  - 動いている間は次の一手を 1 文添える (例「意図しない場合は、サイドバーの行から中断か終了をしてください。」)
  - 文言は `shell/labels.ts` に置き、data-model §4 / §5 を同じ PR で直す
  - `CenterBanners.test.tsx` に「警告の帯 × terminal」の組を足す
- **根拠**: UX-2 / UX-8、spec US-4 AC1a と Edge Cases「最後の値を残す」、data-model §4 (Quota banner の terminal の規則)、design-gate R3 MG-06
- **scope 根拠**: touched の `CenterBanners.tsx` / `shell/labels.ts` で直せる

### [Medium] turn の来ない終わり方では、「思考中 約 N トークン」と tool の経過時間が止まったまま残る (M-002) (scope: feature)

- **観察**:
  - `thinkingTokens` / `toolElapsed` を消すのは次の 3 か所だけ
    - `turn` を受けたとき (`running-session-store.ts:163-172`)
    - 主ループの assistant を受けたとき。消すのは `thinkingTokens` だけ (`:193-202`)
    - `close()` (`:571-576`)
  - 強制終了・プロセスの異常終了・supervisor の終了・0 に倒した result (data-model §2 で `turn` を送らない) では、`turn` が来ない
  - `src/renderer/src/components/assistant-ui/elements/thread.aui.tsx:570-579` の `LiveThinkingIndicator` と、`src/renderer/src/components/assistant-ui/elements/tool-result-marks.tsx:49-50` は、終了・失敗の印 (`TranscriptSettledContext`。`LivePane.tsx:222`) を見ない。値があれば描く
  - そのため、失敗の告知の下に、点滅する点つきの「思考中」と止まった「12秒」が出続ける
- **同種事象探索**:
  - `running-session-store.ts` で `thinkingTokens|toolElapsed` は 6 件 (:170, :171, :180, :184, :199, :201)。終了・失敗で消す経路は 0 件
  - `LivePane.progress.test.tsx` で `killed|ended|terminal|failure|crash|settled` は 0 件 (`interrupt` は :76 の mock だけ)
  - design-gate R3 MG-08 (po M-010) と同じ事象で、手当てされずに残った
- **リスク/影響**: 進み具合の表示が実際の状態と矛盾する (UX-3)。止まったセッションが考え続けているように見える
- **推奨アクション**: 累計の値 (`lastTurn` / `contextUsed`) と進行中の値 (`thinkingTokens` / `toolElapsed`) を分ける。手は次のどちらか
  - (a) `useLiveThinkingTokens` / `useLiveToolElapsed` が `useTranscriptSettled()` を見て、settled なら null を返す (chat の側で閉じる)
  - (b) ストアが終端で `thinkingTokens: null`・`toolElapsed: new Map()` に戻す

  どちらでも data-model §2「renderer の保持」に 1 行足す。
- **根拠**: UX-3、data-model §4「進み具合」、design-gate R3 MG-08
- **scope 根拠**: touched の `transcript-context.ts` か `running-session-store.ts` で直せる

### [Medium] 「再ログインの導線」が利用者に見えない。2 つのボタンの文言は同義で、同じ操作をする。レート制限では解除の時刻が閉じた時点で消える (M-003) (scope: feature)

- **観察**:
  - `LivePane.tsx:327` は `isReloginFailure(reason) ? '閉じて起動し直す' : '閉じて再起動'` と出し分ける。どちらも `onClose` (= `session.close`) で、日本語としても同義である
  - US-1 AC1 (再ログインを案内する) と AC2 (案内しない) の差は、このボタンの文言の差だけで実装されている
  - `isReloginFailure` を UI で使うのはこの 1 か所だけ。`LivePane.failure.test.tsx:190-191,196,198` は、この 2 つの文言を「導線あり / なし」として固定している
  - `rate-limited` では、本文は「しばらく待ってから起動し直してください」なのに、横のボタンはすぐの再起動を誘う
  - 閉じると `meters` が消え (`running-session-store.ts:576`)、Quota banner の解除の時刻も失われる。起動ダイアログの `previousFailureLabel` (`src/renderer/src/features/session/labels.ts:467-469`) も時刻を持たない
- **同種事象探索**:
  - `isReloginFailure` (src/renderer/src、非テスト) は 1 件 (`LivePane.tsx:327`)
  - `閉じて再起動|閉じて起動し直す` は、`LivePane.tsx:327` と `LivePane.failure.test.tsx:190-191`。ほかはコメントと `AppShell.test.tsx` だけ
- **リスク/影響**:
  - US-1 の価値 (次の操作を選べる) が CTA に届かない
  - 認証の失敗でも、ボタンからはログインを確かめる手順が読めない
  - レート制限のときにすぐ起動し直し、また失敗する
- **推奨アクション**:
  - (a) 同義の 2 語で出し分けない。再ログインの理由は「閉じて、ログインを確かめてから起動し直す」などにし、それ以外は 1 つの文言にそろえる
  - (b) `rate-limited` で解除の時刻が分かっているときは、FailureBanner か起動ダイアログに時刻を出す。渡し方は data-model §1 / §4 で決める
  - (c) 触るついでに、FailureBanner の直書き (`LivePane.tsx:319,327`) を `session/labels.ts` に移す (AD-045 Decision 2)
  - `LivePane.failure.test.tsx` の期待値を同じ PR で直す
- **根拠**: UX-2、spec US-1 AC1 / AC2・FR-002、data-model §1、AD-045 Decision 2
- **scope 根拠**: FailureBanner 自体は本 PR で変えていない。ただし FR-002 の導線の出し分けは本 PR の要求で、touched の `LivePane.tsx` で直せる

### [Medium] 表示していないセッションが安全 3 値の外の権限モードになっても、どこにも知らせない (M-004) (scope: feature)

- **観察**:
  - 警告の帯は、表示中のセッションの `live` があるときだけ描かれる (`src/renderer/src/features/shell/CenterHeader.tsx:63-69` / `src/renderer/src/features/shell/CenterPane.tsx:104-109`)
  - renderer の非テストのコードで `permissionMode|isSafePermissionMode` を読むのは 10 ファイル。監視ビューの行 (`RunningSessionRow.tsx` / `RunningSessionList.tsx`) と読み上げ (`SessionAttentionAnnouncer.tsx`) は 0 件
  - 稼働中のセッションは最大 10 本ある (plan Scale/Scope)
- **同種事象探索**: `permissionMode|isSafePermissionMode` (src/renderer/src、非テスト) は 10 ファイル。そのうち行と読み上げは 0 件
- **リスク/影響**: 承認なしで操作が走りうる状態 (Principle III の逸脱の信号) を、利用者はそのセッションを開くまで知らない。レート制限と違い、待てば戻る性質の知らせではない
- **推奨アクション**: 次のどれかにする。どれにするかは spec の判断が要る
  - 行に短い印 (全文はツールチップと sr-only) を足す
  - `SessionAttentionAnnouncer` の遷移に「安全 3 値の外になった」を足す
  - 行の密度 (O-1) を理由に出さないなら、spec の Out of Scope に理由つきで書き、roadmap の I-3 の行に申し送る
- **根拠**: UX-8、Principle III、spec US-4 AC1a / Out of Scope (Out of Scope が外しているのは、レート制限・再試行の印だけ)
- **scope 根拠**: touched の `RunningSessionRow.tsx` / `SessionAttentionAnnouncer.tsx` で直せる (spec の判断が先)

### [Medium] (H) 終端の後の表示の規則を検出するテストが無い (M-005) (scope: feature)

- **観察**:
  - `CenterBanners.test.tsx` の terminal の観点 (:177, :233-243, :263-266, :389-397) は、どれも Quota banner のもの。警告の帯のテスト (:458-556) は terminal を組まない
  - `LivePane.progress.test.tsx` は、終了・失敗・強制終了を 1 件も扱わない
  - `LivePane.failure.test.tsx:190-198` は同義の 2 つの文言を導線の差として固定している。M-003 を直すときは期待値を書き換える必要がある
- **同種事象探索**: `LivePane.progress.test.tsx` で `killed|ended|terminal|failure|crash|settled` は 0 件。`CenterBanners.test.tsx` で terminal を扱うテストは 5 件あり、どれも Quota banner
- **リスク/影響**: M-001 / M-002 は全件緑のまま通る (code-gate の test-agent は 2604 件 passed)。直した後の回帰も検出できない
- **推奨アクション**: 次のテストを足す
  - 警告の帯 × terminal (失敗・終了済み・強制終了)
  - thinking と tool-elapsed を流した後に強制終了し、思考の印と経過時間が消える
  - 0 に倒した result の後に、思考の印が残らない
- **根拠**: reviewer-base H
- **scope 根拠**: touched のテストファイルに足す
- 既存の振る舞いを壊していないと言える根拠
  - FailureBanner と EndNotice の差分は 0 (`LivePane.tsx` の diff は FR-019 と進み具合の追加だけ)
  - 「プロバイダ」は `src/renderer` と `e2e` で 0 件
  - code-gate では全件緑

### [Low] 「最初の応答の後に出ます」が出る条件と文言が合わない。最初のターンの前に終わったセッションでは、この文言が出続ける (L-001) (scope: feature)

- **観察**:
  - `src/renderer/src/features/shell/UsageTab.tsx:48-49` は、`lastTurn` が null の間 `usageAwaitFirst` (`shell/labels.ts:191`) を出す。条件は「result が届く前」で、「応答の前」ではない
  - `UsageTab.test.tsx:166-176` は `context` (assistant の応答が届いた印) を送った後にこの文言を期待している
  - 0 に倒した result や異常終了で終わったセッションでは、この文言が出続ける
- **推奨アクション**:
  - 文言を「最初のターンが終わると出ます。」などにする
  - 終端で `lastTurn` が無いときは「最初のターンの前に終わりました。」のように理由を分けて出す
  - data-model §5 を直す
- **根拠**: UX-1 (空である理由を示す)

### [Low] 同じ出来事に 2 つの語を使っている。「(SDK の記録)」は利用者に通じない (L-002) (scope: feature)

- **観察**:
  - 会話の上の DeniedNotice は「自動的に拒否された操作:」(`LivePane.tsx:471`)
  - 使用量のタブは「聞かれずに拒否された操作」(`shell/labels.ts:187`)
  - data-model §4 は、この 2 つを同じ出来事と定めている
  - `:188` の「拒否された操作の合計 (SDK の記録)」は、実装の内部の語を出している
- **推奨アクション**: 語を 1 つにそろえて glossary に置く。「SDK の記録」は、何を数えたかが分かる言い方にする
- **根拠**: UX-9

### [Low] 経過時間と単位の書き方が、行ごとにばらばら (L-003) (scope: feature)

- **観察**: `src/renderer/src/features/chat/labels.ts` の中で、同じ transcript の中の経過時間が 3 通りに書かれる
  - tool の経過時間は `{n}秒` / `{m}分{s}秒` (:147-148)
  - task の進み具合は `{n} 秒` で、60 秒を超えても秒のまま (:81-82。例「3,725 秒」)
  - 再試行の待ち時間は `{n} 秒後` (:66-71)
  - 監視ビューの行 (`session/labels.ts:260-268`) は時間の単位まで持つ
- **推奨アクション**: 経過時間の書式を 1 つの関数にまとめ、数と単位の間の空白もそろえる
- **根拠**: UX-9 / UX-6

### [Low] 再試行の行の「N 秒後」が、成功・失敗・結果不明になった後も未来の言い方のまま残る (L-004) (scope: feature)

- **観察**: `thread.aui.tsx:1046-1049` は、状態によらず `retryDetail` を描く (`chat/labels.ts:70` の `秒後`)
- **推奨アクション**: 「待ち N 秒」のように、時点に依らない言い方にする
- **根拠**: UX-3

### [Low] 失敗の案内に偏りがある (L-005) (scope: feature)

- **観察**:
  - `SystemEventRow` の案内は Hook と task の失敗だけに出る (`thread.aui.tsx:1114-1119`)。圧縮の失敗・再試行の失敗には案内が無い
  - `max-turns` / `max-budget` / `structured-output-retries` の文言 (`session/labels.ts:44-46`) だけ、次の一手が無い
  - アプリは `maxTurns` / `maxBudgetUsd` を渡さない (`src/agents/session-core.ts:48-57`)。そのため利用者には上限の出所が分からない
- **推奨アクション**:
  - 圧縮の失敗に案内を足す (例: /compact か、新しいセッションで続ける)
  - 上限の 3 つには「起動し直すと続けられます」と、上限の設定の在りか (Claude Code の設定) を添える
- **根拠**: UX-2

### [Low] 権限モードの行が同じことを 3 回言っている (L-006) (scope: feature)

- **観察**: 1 行の中に、次の 3 つが並ぶ
  - 種類の「権限モード」(`thread.aui.tsx:1133-1135`)
  - detail の「権限モードが「…」に変わりました」(`:1050-1053`)
  - バッジの「変更」(`chat/labels.ts:44`)
- **推奨アクション**: detail をモードの名前だけにするか、バッジを出さない
- **根拠**: UX-7

### [Low] 使用量のタブだけがモデルの生の id を出す。「概要」は表示名を出す (L-007) (scope: feature)

- **観察**:
  - `UsageTab.tsx:150-153` は `modelId` をそのまま出す
  - `src/renderer/src/features/shell/OverviewTab.tsx:97` は、Provider のカタログの `displayName` を引き、引けなければ id を出す
- **推奨アクション**: 同じ引き方にする (完全一致で引けなければ id のまま)
- **根拠**: UX-9

### [Low] 圧縮の行は `compact_result` でしか閉じない (L-008) (scope: feature)

- **観察**:
  - `src/agents/live-signals.ts:262-276` は、`compact_result` が来たときだけ圧縮の行を閉じる
  - セッションが動いている間に結果が来なければ、行は「圧縮中」のまま残る
  - design-gate R3 MG-16 が手当てされずに残っている。実機で結果が来ないことは観察していない
- **推奨アクション**: 再試行の行と同じく、次の主ループの assistant か result で、開いた圧縮の行を閉じる (状態は結果不明か成功)
- **根拠**: UX-3

### [Low] 7 日の枠の注意の帯が何日も出たままになり、閉じられない (L-009) (scope: feature)

- **観察**:
  - Quota banner (`CenterBanners.tsx:149-163`) には閉じる操作が無い
  - `allowed_warning` (`quota-banner.ts:51-62`) は、解除の時刻まで出続ける。`seven_day` なら日単位になる
  - 値が変わるたびに `key` で作り直される (`CenterBanners.tsx:120`)
- **推奨アクション**: `allowed_warning` だけはセッションの中で閉じられるようにする (`status` が変わったら再び出す)。または 1 行の簡略な形にする
- **根拠**: UX-8

### [Low] AD-045 の直書きの数が 331 から 335 に増えた。増えたのはテストの固定データで、UI の直書きではない (L-010) (scope: feature)

- **観察**:
  - AD-045 の Confirmation の式で数えると、`src/renderer/src` の非テストの `*.tsx` は合計 335 行
  - 増えた 4 行は `src/renderer/src/test-support/app-shell-harness.tsx:72,91,222,251`。`AppShell.test.tsx` から移したテストの固定データで、式の `!*.test.tsx` では外れない
  - 新しい UI の部品 (`CenterBanners` / `ContextCostMeter` / `UsageTab` / `RunningSessionRow`) は 0 件
- **判定**: UI の直書きは新たに増えていない
- **推奨アクション**: この判定と内訳を PR の説明か `quickstart-results.md` に記録する。次に数える人のために、`test-support/` を外すことを AD-045 の再検討のときに直す (ADR は accepted なので、ここでは本文を書き換えない)
- **根拠**: AD-045 Decision 2 / Confirmation、UX-6

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `CenterBanners.tsx` の中の `terminal` の `UnsafeModeBanner` への受け渡し | 0 | (`QuotaBanner` へは `CenterBanners.tsx:43`) |
| M-002 | `running-session-store.ts` の `thinkingTokens\|toolElapsed` | 6 | :170, :171, :180, :184, :199, :201 (終端で消す経路は 0) |
| M-003 | `src/renderer/src` (非テスト) の `isReloginFailure` | 1 | `LivePane.tsx:327` |
| M-004 | `src/renderer/src` (非テスト) の `permissionMode\|isSafePermissionMode` | 10 | 10 ファイル。行 (`RunningSessionRow` / `RunningSessionList`) と読み上げは 0 |
| M-005 | `CenterBanners.test.tsx` の terminal の観点 / `LivePane.progress.test.tsx` の `killed\|ended\|terminal\|failure\|crash\|settled` | 5 | :177, :233-243, :263, :389 (どれも Quota banner) / progress は 0 |
| L-002 | `聞かれずに拒否\|自動的に拒否` (src) | 4 | `shell/labels.ts:187`、`LivePane.tsx:471`、`session/labels.ts:336`、`agent-session.ts:188` |
| L-010 | AD-045 の Confirmation の式 (`*.tsx`) | 335 | `test-support/app-shell-harness.tsx:72,91,222,251` (+4) |

## Verdict

- Critical: 0
- High: 0
- Medium: 5
- Low: 10
