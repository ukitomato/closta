# Research: 会話の時間と活動の可視化 (O-9)

**Date**: 2026-10-16 (夜間の自走。利用者は不在) | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

`/speckit.plan` は調べものを research agents に出す形だが、designer は Agent ツールを持たないので、自分で SDK の型と実装・assistant-ui の core・main のソース (1761c32) を読んで書いた。規則の正本は [data-model.md](./data-model.md) で、ここには判断と理由だけを書く。spec の U-1〜U-8 は未承認の仮採用で、本 research の判断はその上に載る (承認されなかった項目は spec と合わせて直す)。

## R-01 過去ログの時刻の出所 (U-2)

- **Decision**: `getSessionMessages` の返りの各記録の `timestamp` (ISO 8601 の文字列) を読む。`SessionMessageLike` に `timestamp?: unknown` を足し、未信頼として `parseMessageTime` (R-05) に通す。読めなければ `null`
- **Rationale**:
  - 公開の型 `SessionMessage` (`sdk.d.ts:5903-5916`) は時刻を持たない
  - 実装は持っている。SDK 0.3.270 の `sdk.mjs:134` で `SessionMessage` を組む関数は、記録の `timestamp` をそのまま返りに入れる (`timestamp:e.timestamp`)。この関数は `isCompactSummary` / `is_meta` も返す
  - 記録を集める関数は `user` / `assistant` / `progress` / `system` / `attachment` の記録を残す
  - JSONL をアプリが自分で読まずに済む (AD-034 の取得の経路と Principle IV の SDK の境界のまま)
- **Alternatives considered**:
  - transcript の JSONL を自分で読む — AD-034 と Principle IV を外れる
  - 過去ログは時刻を出さない — Journey 1 (過去の会話を読む) で時刻が無い
- **Risk**: 型に無い値に頼るので、SDK の版を上げると黙って消えうる。消えても `null` に倒れて今の表示に戻るだけで、例外にはならない。版を上げる PR で確かめる手順を `docs/ui-coverage.md` に 1 行足す (FR-014)。AD-051 Decision 1

## R-02 実行中の時刻の出所 (U-3)

- **Decision**:
  - **assistant**: `SDKAssistantMessage.timestamp` (`sdk.d.ts:3386-3388`) を `parseMessageTime` に通す。無いか読めなければ、セッションスレッドの受信時刻 (`Date.now()`) にする
  - **tool の結果だけのメッセージ** (`orphanMessage`): 受信時刻
  - **システムイベントの行** (O-2 の Hook / task、O-4〜O-6 の行): 受信時刻。SDK の system 系の型は時刻を持たない
  - **送り直し**: 同じ id の送り直し (tool の結果を埋めた assistant) は、追跡が持つ最後に送った DTO から作るので最初の時刻を保つ (`live-tool-results.ts` の `lastMessages`)
- **Rationale**:
  - SDK の注記は「元のホストの時計なので表示だけに使い、並べ替えに使わない。古い emitter は省くので受信時刻に倒せ」と言っている (`sdk.d.ts:3386`)
  - 受信時刻を取るのは agents (Worker) で、時計はアプリのホストのもの。ランタイム (WSL ディストロ・docker endpoint のコンテナ) の中の Claude Code の時計とずれうる。ずれは正にも負にもなり、正のずれは負の値の検査では隠せない (design-gate H-001)。そのため所要時間は表示の時刻 (`createdAt`) で引かず、renderer の稼働中のストアが受け取った時点 (ホストの時計。`metadata.custom.receivedAt`) で両端をそろえる (U-8。data-model §1 / §2)。renderer の中だけの値なので DTO は変えない。過去ログは記録の時刻どうし (ランタイムの時計 1 つ) で引く
- **Alternatives considered**:
  - 受信時刻だけを使う — SDK の値を捨て、supervisor の遅れが時刻に乗る
  - renderer がすべてに受信時刻を入れる — 過去ログと実行中で出所が変わる。port と decoder の遅れも乗る
- **SDK の user / replay の `timestamp`** (`sdk.d.ts:5745-5747` / `:5821-5823`): 読まない。実行中の `user` は tool の結果を運ぶだけで (`sdk-agent-session.ts:640-646`)、本文は表示しない (利用者の本文は renderer が出す。R-03)。replay は `表示不要` (対応表 A 節)

## R-03 利用者の入力の時刻 (U-3)

- **Decision**: 稼働中のストアの `appendUser` (`running-session-store.ts:620-630`) が、ストアの時計 `now()` で `createdAt` を入れる。積まれた入力 (message queue) は、取り出して `send` に渡す時点 (`:484-496`) の `appendUser` で入るので、積んだ時刻ではなく送った時刻になる
- **Rationale**: SDK は利用者の本文を返さない。spec の Edge case「送信の時刻は実際に SDK に渡した時刻」に合う
- **Alternatives considered**: composer で Enter を押した時刻 — 積まれた入力で送った時刻とずれる

## R-04 assistant-ui の `createdAt` の既定値

- **Finding**: `@assistant-ui/core` の `thread-message-like.ts:115` は `createdAt: createdAt ?? new Date()` で、`createdAt` を渡さないメッセージを「今」にする。表示が `message.createdAt` を読むと、時刻の無いメッセージに描いた時刻が出てしまう
- **Decision**: `toThreadMessage` と `appendUser` は、`createdAt` (Date) と一緒に `metadata.custom.createdAt` (epoch ms の数) を入れる。表示とターンの導出は `metadata.custom.createdAt` **だけ**を読む。無い・数でなければ時刻は無い
- **Rationale**: `metadata.custom` は assistant-ui の変換をそのまま通る (今もシステムイベントの行の印 `systemEvent` が通っている。`convert.ts:172`)
- `fromSystemEventData` (`convert.ts:143`) は `message.createdAt?.getTime()` を読む。今は既定値の「今」を拾いうるので、`metadata.custom.createdAt` から読むように直す。稼働中のストアは `mergeSystemEvent` (`...prev`) で最初の時刻を保つ
- **`metadata.timing`** (core `types/message.ts:388` の `MessageTiming`) は使わない。中身はストリームの開始・最初のトークン・トークン数で、メッセージの時刻ではない (R-10)

## R-05 時刻の検査

- **Decision**: 新設の `src/domain/session/transcript-time.ts` に純関数 `parseMessageTime(raw: unknown, now: number): number | null` を置く。過去ログ (domain) と実行中 (agents) の両方が呼ぶ。規則は data-model §1
- **Rationale**: 時刻は Claude Code の記録の値で、未信頼の入力として扱う (FR-004)。`Date.parse` は実装ごとに受ける形が違うので、先に正規表現で厳密な ISO 8601 (タイムゾーン付き) に絞る。範囲 (2020-01-01 から受けた時点 + 1 日) は spec Clarifications
- **置き場所**: `domain/session/` は agents から import できる (Principle VII。agents が足す import は domain だけ)。ファイル名が `transcript*.ts` に当たるので、ui-coverage-reviewer の `auto_invoke_patterns` に自動で入る

## R-06 ターンと所要時間

- **Decision**:
  - ターンの導出は renderer の純関数 `deriveTurns` (`features/chat/turns.ts`) にする。中央の所要時間・地図の行・帯の入力が同じ結果を読む
  - 入力は表示に渡す `ThreadMessageLike` の列 (過去ログは `useTranscript` の `messages`、稼働中はストアの全件。窓で切る前)
  - 規則は data-model §2
- **Rationale**:
  - ターンの区切りは表示の概念。DTO に足すと `TRANSCRIPT_MESSAGE_FIELDS` が変わり FR-005 に反する
  - 過去ログと実行中の両方で同じ関数を通せる
- **実行中の最後のターンの「終わり」**: 稼働中の runtime の `busy` (`RunningSessionsProvider.tsx:183-192`。`runState` が `running` / `awaiting_permission` で終わっていない) と同じ判定を関数に出して、`lastTurnOpen` に渡す。result が届けば `runState` が動くので、spec AC4 の「result が届いた」に当たる
- **既知の限界**: 過去ログの圧縮の要約 (`isCompactSummary` の user の記録) と `is_meta` の user の記録も、本文を持つ user のメッセージとして 1 ターンに数える。今の変換はこれらを区別せず本文として出している (O-6 の範囲の外)。見分ける値は SDK の返りにある (R-01) が、本 feature では読まない。V-3 で過去ログ 1 件の出方を記録する (plan RK-05)

## R-07 地図と中央をつなぐ経路

- **Finding**:
  - 移動は O-3 の `ConversationSearchProvider` の `goTo` にある (`ConversationSearchProvider.tsx:94-101`)。`TranscriptNavigator.scrollToMessage` を試し、外れたら稼働中だけ `reveal` (`RunningSessionsView.revealMessage`) で窓を広げ、navigator の登録し直しを待って移り直す
  - `goTo` は `useEffectEvent` で、effect の外 (別のコンポーネントのクリック) からは呼べない
  - provider は `CenterPane` の `RunningCenter` / `PastCenter` の中にある (`CenterPane.tsx:93-115` / `:181-193`)。右のペイン (`RightPanel`) は `ShellLayout` で中央と兄弟なので、provider の外にある
  - 過去ログの取得 (`useTranscript`) は `PastCenter` が 1 回だけ呼ぶ (2 回呼ぶと port が 2 本開く。`ChatScreen.tsx:71-72`)
- **Decision**:
  1. `ConversationSearchProvider` の `goTo` の本体を `useCallback` の `navigateTo(messageId)` に移す。今の effect (検索の移動) と新しい context の両方から呼ぶ。中身 (navigator → `reveal` → 登録し直しで再試行) は変えない
  2. 新設の `features/chat/center-conversation.ts` に、中央の会話の公開口を置く。小さな store (`publish` / `clear` / `subscribe` / `current`) と、それを配る context で、形は `createTranscriptNavigatorRegistry` (`transcript-context.ts:202-291`) と同じ
     - store は `ShellLayout` で 1 つ作る。中央が出しているセッションの `{ conversationKey, messages, turns, navigateTo }` を、中央の中の `ConversationTimeProvider` (R-06 の導出と所要時間の context を持つ) が publish する
     - 地図のタブは `useSyncExternalStore` で購読する
  3. 地図は中央が持つ `messages` を読むだけで、過去ログをもう一度取得しない (AD-034)
- **Rationale**:
  - FR-010 (O-3 と同じ経路。新しい移動の仕組みを作らない) と、AD-034 (取得は 1 本) を両方守れる
  - 中央を切り替えると provider ごと作り直されるので (`key`)、publish し直しで地図も替わる (US-2 AC6)
  - 中央に何も出していないときは `clear` されて、地図は空の状態になる
- **Alternatives considered**:
  - 地図を中央の provider の内側に描く — 右のペインのタブの表 (AD-046 Decision 4) に載らない
  - zustand の `ui` store に移動の要求の番号を置く (`conversationSearchRequest` の形) — 移り先の id を store に置くと、中央を切り替えた直後の古い要求の扱いが要る。会話の中身 (`messages`) も別に渡す必要が残る
  - 地図のタブが自分で `useTranscript` を呼ぶ — port が 2 本開く

## R-08 地図の描画

- **Decision**:
  - 行は `@tanstack/react-virtual` (依存に既にある。`package.json:35`。transcript の仮想化と同じ) で仮想化する。DOM は `<ol>` の `<li aria-setsize aria-posinset>` の中の `<button>`
  - フォーカスは roving tabindex にする。矢印の上下・Home・End・PageUp・PageDown で移る
  - `rangeExtractor` で、フォーカスのある行を常に描く範囲に入れる (スクロールで外れてもフォーカスを失わない)
  - 規則は data-model §6
- **Rationale**: FR-011 (同時に描く行の数を会話の長さに依存させない)。フォーカスは行の id で覚えるので、実行中に行が増えても動かない (US-2 AC3)
- **Alternatives considered**:
  - `role="listbox"` の option にする — 選ぶ操作は「移る」で、選択の状態を持たない。ボタンの一覧のほうが意味に合う
  - 仮想化しない — 1,000 ターンで行の数だけ DOM ができる

## R-09 活動の帯の区間 (U-4)

- **Decision**: 新設の `features/chat/activity-bins.ts` に純関数 `activityBins` を置く。区間は時刻を持つメッセージの最小と最大のあいだを等しい幅で分ける。幅は 1 分以上で、区間は最大 48 (spec Clarifications)。濃さは 0 と 4 段階。規則と表は data-model §4
- **Rationale**:
  - 記録の順の最初と最後ではなく、最小と最大で幅を決める。時計が戻ったときに区間の外にこぼれる時刻を作らないため
  - 色だけに頼らないよう、濃さの段に合わせて棒の高さも変える (WCAG 1.4.1)
- **Alternatives considered**: 区間の幅を固定 (5 分など) — 数日にまたがる会話で区間が数百になる

## R-10 registry の照合 (Principle XIII / U-6)

照合の正本は完了の PR の説明で、ここでは design の時点の読みを書く。`.claude/skills/elements/references/` (catalog と elements の参照) を読んだ。

| 候補 (registry の名前) | 種類 | 読み | 判断 |
|---|---|---|---|
| `message-timing` (`message-timing.aui.tsx`) | AUI 接続 | `s.message.metadata.timing` (`streamStartTime` / `firstTokenTime` / `totalStreamTime` / `tokenCount` / `tokensPerSecond` …) を読む。`totalStreamTime` が無いと何も描かない | **不適合の見込み**。本アプリはメッセージ単位で更新し (X-1)、ストリームの統計を持たない。メッセージの時刻を出す element ではない |
| `elements-message-timing` (`message-timing.tsx`) | standalone | `stats: TimingStat[]` (`{ label, value }`) と `streaming` を受け、ラベルと値の並びを常に出す | **第 1 候補**。時刻と「所要 m:ss」を `stats` に渡せる形。実装の最初に取り込んで、文言の直書き (英語)・`streaming` の表示・ポインタとフォーカスで全体の時刻を出す口があるかを確かめる。合わなければ文字の体裁で作る |
| `heat-graph` (`heat-graph.tsx`) | primitive | 月と曜日のラベル・凡例・tooltip を持つ暦の heat map。`DataPoint { date, count }` (日単位) | **不適合の見込み**。帯は 1 つの会話の分単位の区間で、暦の格子ではない。実装の最初に取り込んで、日以外の単位と 1 行の帯にできるかを確かめる。できなければ帯を自作し、テーマのトークンだけで塗る |
| `elements-activity-graph` | standalone | 半年の暦の格子 (`heat-graph` の `DataPoint`) | **使わない** (U-6)。複数日の活動が前提で、1 つの会話の時間に合わない (U-4) |
| `elements-trace-waterfall` | standalone | `TraceSpan { id, name, depth, startMs, durationMs, status }` | **使わない** (U-6)。tool の開始と終わりの時刻の組を運ばない。並列の tool と実行中の subagent の入れ子は O-11 が持つ。再検討は O-11 の入れ子の後 |
| `conversation-map` (`conversation-map.aui.tsx`) | AUI 接続 | catalog の説明は「スレッド全体のレール。ターンごとに 1 つの目盛り、読んでいるターンの印、hover の preview」。参照に props の記述が無い (`aui-elements.md:548-554`) | **不適合の見込み**。**F 節の 127 名に無い** (registry が増えた)。Principle XIII の Exceptions の「registry が増えたら F 節に足してから照合する」に従い、完了の PR で F 節に行を足す (data-model §7)。AUI 接続で中央の runtime を読むので、中央の外 (右のペイン) に置けない。行に時刻・所要時間・数を持たせる形 (FR-009) とも違う。実装の最初に registry の中身を取り込んで確かめる |
| `elements-day-separator` (F 節 `Day separator`。`未使用`) | standalone | 日付の区切り | **使わない** (本 feature では検討の外。今日でない時刻は `M/D HH:mm` で日付を持つ) |

- **Message timing と Heat graph の F 節の使い道**: element を取り込まなくても、表示の行 (`A SDKAssistantMessage / A SDKUserMessage`) を書き、備考に照合の結果を写す。Context display の前例 (`docs/ui-coverage.md:266`) と同じ形
- **Conversation map**: 採るなら U-5 (タブの行の一覧) の形が変わる。照合で「合う」となったら、実装を止めて利用者に返す (plan RK-04)

## R-11 探す操作を広げない (U-7)

- **Decision**: 本文の横断検索・過去の一覧の仮想化・会話内検索の対象の拡大を、どれも足さない。理由と再検討の条件は spec U-7
- **追加の事実**: 012 の quickstart V-3 (過去のセッション 50 件以上で語 1〜2 個で絞れたか) は未実施 (`012 quickstart-results.md:69-72`)。U-7 の判断材料は無いまま。本 feature の V-3 (quickstart) で同じ確認を 1 回行い、結果を記録する。結果が悪ければ U-7 の再検討の条件 (利用者が要約行で見つけられない会話を報告した) に当たる
- **地図との関係**: 地図は「開いた会話の中で、どのあたりで何をしたか」を探す面になる。会話をまたいで探す必要は U-7 の範囲のまま

## R-12 更新の間引き

- **Decision**: 地図のタブは、購読した中央の会話を前縁と後縁で 500ms に 1 回までにまとめる (前縁で即時に描き、続く更新は 500ms の終わりにまとめて 1 回。spec Clarifications)。中央の所要時間は間引かない (ターンが閉じたときに 1 回だけ変わる)
- **Rationale**: 実行中はメッセージ単位で届く (X-1) が、tool の結果の送り直しと行の更新で 1 秒に数回の更新がありうる。帯は全メッセージを読み直すので、地図のタブの描画が間引きの対象になる
- **中央の導出の費用**: `deriveTurns` はメッセージの数に比例する 1 回の走査で、`messages` の参照が変わったときだけ走る (`useMemo`)。所要時間の context は、値が変わらない限り参照を保つ (data-model §2)

## R-13 観測点への影響

- `SessionEvent` の `message` の数え方 (`receivedMessages`) は変えない (時刻は既存のメッセージの値)
- 地図のタブを開いている間は、右のペインの再描画が 500ms に 1 回まで増える。O-8 の行の (c) の「基準の変化を並べて書く」に 1 項目足す (FR-016)
