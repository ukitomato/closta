# Implementation Plan: セッション監視ビュー (O-1)

**Branch**: `010-session-monitoring-view` | **Date**: 2026-10-02 (design-gate R1・R2 反映) | **Spec**: [spec.md](./spec.md)

## Summary

X-5 の稼働中セッション一覧 (`RunningSessionList.tsx` + `thread-list.aui.tsx` の行) を、**renderer の中だけで**監視ビューに拡張する。

- ストアに「行の状態に入った時刻」(`statusSince`)・間引いた直近の活動 (`activity`)・情報密度 (`density`) を足す。値の定義は [data-model.md](./data-model.md) が正本
- 行の情報 (経過時間・直近の活動・枠の使用数・承認待ちの移動先・通知の文) は `session-view.ts` の純関数で導く。枠の数え方は domain の `countOccupying` を使う
- 一覧の見出しに枠の使用数・承認待ちの件数 (押すと次の承認待ちへ移る)・失敗の件数を置き、承認待ち・失敗の行を強調する。グローバルのナビの「セッション起動」にも承認待ちと失敗の件数を出し、見ていないセッションの遷移を `App` の寿命の live region で 1 回だけ通知する
- 行に compact / comfortable の 2 つの形を持たせる (`thread-list.aui.tsx` に語彙を持たない口を足す)
- X-5 SC-003 の E2E を経過時間と直近の活動を出した状態で流し、実 `claude` 10 本の実機計測を `perf/` に置く (AD-038 D2 と同じ分離を掛ける)

IPC・状態通知・preload・main・agents・domain のコードは変えない (spec FR-010)。新しい ADR は起票しない (理由は「ADR」節)。

## Technical Context

- **Stack**: Electron 39 / React 19 / TypeScript / zustand 5 / Vitest / Playwright + Electron (AD-038) / assistant-ui ([docs/discovery.md](../../docs/discovery.md))
- **レイヤ**: renderer (`src/renderer/src/features/session/`・`App.tsx`・`components/assistant-ui/elements/thread-list.aui.tsx`)。`domain` から使うのは既存の `MAX_CONCURRENT_SESSIONS` / `countOccupying` (`concurrency.ts`)・`sanitizeBody` (`sanitize-body.ts`) と型だけ
- **既存の起点**:
  - `running-session-store.ts` — `patch` (`:120`) と `onSessionStatus` の購読 (`:445`) がストアの全更新の入口。`launch` は `patch` を通らず行を足す (`:233-284`)。`inFlight > 0` の間は未知の sessionId の状態通知も受ける (`:450-454`)。`now()` は注入済み (`:266`)
  - `session-view.ts` — `deriveSessionView` / `rowStatus` / `availableActions` / `viewOf`。一覧の行はこれだけで状態と操作を決める
  - `RunningSessionList.tsx` — `useRowFacts` が行の表示に使う値だけを `useShallow` で選ぶ (本文の更新で再描画しない。X-5 SC-003 の対策 (5))
  - `thread-list.aui.tsx` — `ThreadListItem` は操作がある行を縦積みにしている (`:243-249`)。R-2 のセッション一覧と共有し、「体裁だけを持つ」と宣言している (`:36-40`)
  - `App.tsx` — ナビ (`:49-66`) と、稼働中セッションのストアの配線 (`:34`。App の寿命)
  - `SessionScreen.tsx:90` — サイドバーは `w-64` (256px)。`window.ts:45-46` — 既定のウィンドウは 1100×760
  - `e2e/multi-session.spec.ts:113-205` — X-5 SC-003 の負荷と計測の仕込み (long task と入力遅延)。`e2e/support/launch.ts:29-33` — `...process.env` に `CLOSTA_E2E: '1'` を足して起動する
  - `src/main/app/e2e-capability.ts` — E2E stub は text の assistant メッセージだけを流す (承認要求・tool 呼び出し・`error` は流さない)
- **確認済みの事実**:
  - live 表示は SDK のメッセージ単位で更新され、チャンク単位では更新されない (`live-message.ts` の注記)。tool の結果は live 表示に載らない (X-5 plan)
  - 承認要求は port の `permission-request` で `pending` に入り、`failure` で畳まれる (`running-session-store.ts:170-186`)
  - renderer の decoder (`session-event-decoder.ts`) は message の part の `type` だけを検証し、`text` / `toolName` / `argsText` の型は検証しない
  - `sanitizeBody` は LF とタブを保持し、CR・その他の C0 / C1・双方向制御文字を除く。入力が文字列でなければ空に倒す

## Constitution Check

| Principle | 判定 | 根拠 |
|---|---|---|
| I (パス名前空間) | N/A | パスを扱わない。直近の活動に出るパス文字列は表示用の plain text に畳むだけで、解決しない |
| II (プラットフォーム差を infra に閉じる) | N/A | infra を変えない |
| III (権限ゲート) | ✅ | 権限モードの選択肢を変えない。実機計測は既定の権限モードで起動し、承認カードに応答しない (research R-07) |
| IV (SDK 経由) | ✅ | SDK を新たに呼ばない (`AGENT_SDK_ALLOWED_CALLS` の変更なし) |
| V (資格情報非永続) | ✅ | 新しい永続化を持たない (情報密度も保存しない)。実機計測は資格情報を扱わず、結果・成果物に env・本文を書き出さない (trace / screenshot / video は off。research R-07) |
| VI (永続環境を構築しない) | ✅ | 新しい子プロセスの起動元を増やさない。実機計測はアプリの既存の起動経路を使い、perf 自身は子プロセスを起こさない。`perf/` は check.mjs の走査範囲 (`SCAN_ROOTS`) の外になるので、その死角を「機械強制の変更」に明記し、roadmap に system-scope の項目として登録する (AD-038 D4 の死角とは別物) |
| VII (supervisor Electron 非依存) | N/A | supervisor を変えない |
| VIII (日本語環境) | ✅ | composer を変えない。**サイドバーの行も対象**: compact の 1 行で全角の長い表示名でも横あふれせず操作が行の内側にあることを E2E (幅の確認) と目視 (quickstart V-4) で見る。基準画像に差分が出る場合は AD-038 D5 の承認手順に従う (SH-091) |
| IX (main をブロックしない) | ✅ | main を変えない。renderer の負荷は SC-004 の E2E と SC-005 の実機計測で見る |
| X (正本は Claude Code) | ✅ | 行の情報は renderer の保持 (キャッシュ) から導くだけ。実機計測が WSL 内に残す transcript を消さない |
| XI (観測可能な垂直スライス) | ✅ | 承認待ちの強調 → 件数から移動を component テストと目視 (quickstart V-4) で観測できる |
| XII (ui-coverage) | N/A | 新しい SDK メッセージ型・tool の表示を足さない。Hook / Background task の割当は O-2 に送る (spec FR-013) |
| XIII (element 優先) | ✅ | 一覧は X-5 と同じ assistant-ui の ThreadList (`thread-list.aui.tsx`) のまま。行に密度と属性の口を足すだけで独自 element を新設しない。候補の照合 (research R-06): 密度の切り替えは ToggleGroup (未導入) ではなく導入済みの `Button` + `aria-pressed`、件数は shadcn Badge を公式の CLI で導入、compact で外した情報は導入済みの Tooltip。独自のカラー / スペーシングのトークンを足さない |
| XIV (glossary) | ✅ | spec FR-013 の用語を SH-001 (glossary。コードより先) と SH-090 (charter / roadmap) で追随させる |
| XV (Multi-language consistency。UI ラベルは日本語が第一・i18n の判断は M3 まで) | ✅ | 新しい文言は `labels.ts` に置く。i18n リソース化の判断は O-3 に申し送る (research R-08。期限 M3 の内) |

## Domain Context

### Charter reference

- Domain: `session` ([docs/domains/session/charter.md](../../docs/domains/session/charter.md))
- Mission: 複数フォルダ・複数ランタイムにまたがって存在する Claude Code のセッションを、一箇所から走査・起動・監視・差配できるようにする
- Scope (本 feature に関わる行): 「セッション状態の管理 (idle / running / awaiting_permission / error) と監視ビュー」。Out of scope「承認カードや監視ビューの**見た目と element 選定** → `ui` domain」は ui charter の Out of scope「他 domain の一覧・操作 UI は各 domain」と食い違っていたので、**監視ビューは session の操作 UI** に揃える (USER 決定 2026-10-02 design-gate R2。SH-090 で session charter を改める)
- User Journey 3 (10 セッションを並列で差配する): 1. 監視ビューで実行中セッションの状態を一覧する / 2. 承認待ちのセッションが目立つ形で示される / 3. 1 つを選んで没入ビューに切り替え、対応後に一覧へ戻る — 本 feature が担う。「監視ビュー = 稼働中セッション一覧の拡張、没入ビュー = 表示中セッションのペイン」と読み替える (USER 決定。SH-090 で charter に注記)
- KPI: 「並列時の滑らかさ — 10 セッション同時実行で UI の入力応答が保たれる (手動検証 + フレーム計測)」の実機側を SC-005 が担う
- **関係する他 domain の charter**: ui charter の In scope「情報密度の切替 (compact / comfortable)」と Journey 4 (監視 = compact、没入 = comfortable) を本 feature が読み替える (SH-090 で ui charter を改訂)。isolation charter Journey 2 / 不変条件「隔離状態は一目で分かること」(セッション一覧のバッジ。I-x) の置き場を compact の行に残す

### Related ADRs

- [AD-020](../../docs/decisions/0020-sdk-emitted-message-inventory.md) — SDK が emit するメッセージの棚卸し: accepted — Consequences「Hook / Background task の状態管理が要るかを O-1 着手時に判断する」。**本 feature の回答: session の責務に含めない。表示の割当と状態の持ち主の判断を O-2 に送る** (USER 決定。spec FR-013)
- [AD-023](../../docs/decisions/0023-application-architecture.md) — アプリケーション構成: accepted — §5 状態を持たない規則は純関数として 1 か所に置く。枠の数え方は domain の `countOccupying` を使う
- [AD-034](../../docs/decisions/0034-transcript-read-path-and-process-boundary.md) — transcript の読み取り経路: accepted — 本文は main を通さない。本 feature は経路を変えない
- [AD-035](../../docs/decisions/0035-tier-a-tool-display-and-subagent-nesting.md) — Tier A の tool 表示: accepted — Tool group の既定 open 化を「O-1 候補」とした。**本 feature の回答: transcript の描画であり O-2 に送る** (spec Out of Scope)
- [AD-038](../../docs/decisions/0038-e2e-screenshot-harness.md) — E2E とスクリーンショット: accepted — D2 e2e を src のグラフから分離 / D3 credential-free の E2E / D4 日本語フォントの同梱 (死角として verify.yml が `SCAN_FILES` に無いことを記録) / D5 基準画像の更新は PR で承認。**`perf/` に D2 と同じ分離を掛け、D3 の CI 経路の外に置く**。`perf/` が `SCAN_ROOTS` の外にあることは D4 の死角とは別のもので、本 feature で初めて記録する
- [AD-043](../../docs/decisions/0043-single-supervisor-session-threads-and-session-limit.md) — 単一 supervisor・同時実行数の上限: accepted — Decision 3 (枠の数え方) / Decision 4 (状態通知のフィールド。会話由来の文字列を載せない規則の正本は X-5 FR-004)。本 feature は守る

### Glossary excerpt

- **Running session list (稼働中セッション一覧)**: renderer が持つ、この起動で開いたセッションの一覧 (X-5)。行の状態は run-state と生存フラグの組から決める。`claude` が終わったセッションの行も利用者が閉じるまで残る。R-2 の (列挙の) セッション一覧とは別物
- **SessionStatusUpdate (状態通知)**: sessionId・run-state・理由キー・生存フラグだけを持つ一覧用の値。会話由来の文字列を含まない
- **Concurrency limit (同時実行数の上限)**: 10 に固定。枠は予約から `claude` の終了まで占める (応答待ちの `done` と中断済みも数える)
- **Approval card (承認カード)**: `canUseTool` の permission 要求に応答する UI (状態は `session`、見た目は `ui`)
- **SessionRunState**: 単一セッションの状態機械。`done` は応答完了と kill 後の両方を表し、`claude` が終わったかは生存フラグで判定する

## 上流からの申し送り

実行したコマンドと件数:

```text
Grep "010-session-monitoring-view" in docs/ .specify/ tests/ specs/ (*.md|*.mjs|*.js|*.yaml|*.yml)
# → 2 件 (いずれも本 spec 自身)
Grep "\bO-1\b" (node_modules を除くリポジトリ全体)
# → 60 件。うち本 feature の spec / checklist の 7 件を除く 53 件を下表 #1〜#21 に割り当てる
Grep "RunningSessionList|thread-list.aui|running-session-store|session-view" in scripts/ eslint.config.mjs .dependency-cruiser.js
# → 0 件 (実名リスト方式のルールに本 feature が触るモジュールは無い)
Grep "e2e" in eslint.config.mjs .dependency-cruiser.js scripts/constitution/allowlists.mjs (design-gate R1 で追加)
# → 新設のトップレベル perf/ は、e2e/ を実名で外している規則に足す側の対象になる (#25)
Grep "密度|compact|comfortable|没入|隔離" in docs/domains (design-gate R1 で追加。O-1 を名指ししない charter の記述)
# → ui charter :42 / :102-105、isolation charter :71-72 / :118 / :127 (#22〜#24)
```

| # | 出典 (行) | 申し送りの内容 | 処理 |
|---|---|---|---|
| 1 | roadmap.md:213 / _overview.md:60 / PLAN.md:696 / prompts.md:213 | O-1 の行 (状態一覧・密度切替・承認待ちの強調) | **本 feature** — roadmap の O-1 行を完了時に更新 (SH-090)。PLAN.md は素案であり変更しない |
| 2 | roadmap.md:214 / PLAN.md:697 | O-2 は O-1 に依存 | **本 feature** — roadmap の O-2 行に申し送りを足す (SH-090。#5 / #6 / #15) |
| 3 | _overview.md:95 / roadmap.md:209 / PLAN.md:725 | M3 の達成状態「10 セッションを俯瞰でき、未表示情報がゼロ」 | 該当なし (マイルストーンの定義。前半「俯瞰」を本 feature、後半「未表示ゼロ」を O-2 が担う) |
| 4 | charter:176 | 「X-6 / O-1 は未着手」 | **本 feature** — 「X-6 は未着手」に改め、Related Specs に O-1 を足す (SH-090) |
| 5 | 0020:122 / 0020:129 | Hook / Background task の状態管理が session に要るか (別 domain か) を O-1 着手時に判断する | **本 feature** — 含めない (USER 決定)。session charter の Open Questions と `_overview.md` の「帰属の判断根拠」に記録し、表示の割当と状態の持ち主の判断を O-2 に送る (ui charter の Open Questions・roadmap の O-2 行)。AD-020 本文は変えない (SH-090) |
| 6 | 0035:97 | Tool group の既定 open 化は O-1 候補 | **送る** — transcript の描画で `ui` domain。roadmap の O-2 行に申し送る (SH-090) |
| 7 | constitution.md:798 | i18n リソース化の要否は M3 (O-1〜O-3) までに判断する | **送る** — O-3 (research R-08)。roadmap の O-3 行に申し送る (SH-090)。本 feature の文言は `labels.ts` |
| 8 | 009 spec:299 (pr-gate R1 po M-002) | charter KPI の実機計測は O-1 で行う | **本 feature** — FR-012 / SC-005 (SH-030〜SH-033) |
| 9 | 009 spec:336 / 005 spec:484 / 005 plan:21 / 005 data-model:113 / 002 plan:18 / 009 plan:70 | 監視ビュー (強調・承認待ち・密度切替・一覧 ⇄ 没入) は O-1 | **本 feature** — 一覧 ⇄ 没入はサイドバーの拡張で成立させる (spec「本 feature の位置づけ」) |
| 10 | 009 spec:150 | 表示していないセッションの承認待ちを目立たせるのは O-1 | **本 feature** — FR-001〜FR-004 |
| 11 | 009 spec:339 / gate-r2 po:127 / po design-gate:23 | 枠を占める本数 (8/10) の常時表示は O-1 | **本 feature** — FR-007 |
| 12 | 009 spec:158 / 009 spec:338 | 終了済みの件数の上限・自動で閉じるは O-1 で再検討 | **本 feature** — 持たない (spec Edge Cases / Out of Scope)。結論を charter に記録する (SH-090) |
| 13 | 009 spec:337 | 上限の設定変更・待ち行列は O-1 以降で再検討 | 該当なし (spec Out of Scope で引き続き持たない。再検討の材料 (上限に当たる頻度) を本 feature は持たない) |
| 14 | 009 gate-r1 po:156 | 行の補助情報 (最初のプロンプトの先頭など) を出すなら O-1 | **本 feature** — 直近の活動 (FR-006) で引き取る。送信直後は送ったプロンプトの先頭行を出す |
| 15 | 003 spec:281 / 003 plan:18 / 004 plan:18 / 003・004 checklists | transcript の compact / comfortable の密度切替は O-1 | **一部** — 本 feature の密度は一覧の行に限る。transcript の密度は O-2 (Tier A 完全化) に申し送る (SH-090。roadmap の O-2 行と ui charter) |
| 16 | 002 spec:590 / 002 contracts:321 / 002 po:197-199 / 002 arch:187 | 実行中の俯瞰は O-1、R-2 は過去セッションの静的な一覧 | 該当なし (責務の線引きの確認。本 feature は R-2 の一覧を変えない) |
| 17 | 002 spec:597 | 大規模件数向けの描画最適化は必要になれば O-1 / O-3 | 該当なし (稼働中は最大 10 + 終了済み。件数は小さい) |
| 18 | 002 convention-reviewer:94 / :406 | O-1 が `session-service.ts` に WSL を持ち込む・`MonitorWorker` を増やす誘導 | 該当なし (本 feature は main / agents を変えない) |
| 19 | allowlists.mjs:377 / check.mjs:638 / 002 research:230 / 002 contracts:218 / 005 plan:76 | SDK の許可呼び出しを O-1 が使う可能性 | 該当なし (SDK を呼ばない) |
| 20 | 009 plan:113 / 009 tasks:161 / 005 plan:24 | charter 末尾「… O-1 は未着手」の更新 | #4 と同じ |
| 21 | `RunningSessionList.tsx:26` | 「状態の強調表示・情報密度の切替・監視ビューは O-1 の領分」 | **本 feature** — 実装時にコメントを改める (FE-011) |
| 22 | ui charter:42 | In scope「情報密度の切替 (compact / comfortable)」 | **本 feature** — 分担 (一覧の行の密度は O-1、transcript の密度は O-2) を ui charter に書く (SH-090) |
| 23 | ui charter:102-105 | Journey 4「監視ビューでは compact に並び、開くと comfortable な没入ビュー」 | **本 feature** — USER 決定 (サイドバー拡張のみ・密度は利用者のトグル) に合わせて Journey 4 を読み替える注記を ui charter に書く (SH-090) |
| 24 | isolation charter:71-72 / :118 / :127 | セッション一覧で隔離状態が一目で分かること (I-x) | **本 feature** — compact の行にバッジの置き場を残す (spec FR-008)。roadmap の I-2 行に「O-1 の compact の行にバッジを出す」を申し送る (SH-090) |
| 25 | eslint.config.mjs:172-179 / .dependency-cruiser.js:140-141 / allowlists.mjs:12 / e2e/tsconfig.json | `e2e/` を実名で外す・塞ぐ規則 (AD-038 D2) | **本 feature** — `perf/` を同じ形で足す (「機械強制の変更」。SH-005)。`SCAN_ROOTS` の外にあることは新しい死角として roadmap に登録する (design-gate R2) |
| 26 | session charter:54-55 / ui charter:62-63 | 監視ビューの見た目の持ち主が逆向き (session は ui、ui は各 domain) | **本 feature** — session の操作 UI に揃える (USER 決定 2026-10-02 design-gate R2)。session charter の Out of scope を改める (SH-090) |

## 実装方針

### renderer — ストアと導出

- **`running-session-types.ts`**: `RunningSessionStoreState` に `statusSince` / `activity` / `receivedMessages` / `density`、`LiveSessionState` に `folderLabel` を足す (data-model §1)
- **`session-view.ts`**: `deriveActivity` / `toActivityLine` / `formatElapsed` / `slotUsage` / `attentionCounts` / `nextAwaiting` / `announcements` を足す (data-model §2)。すべて純関数。`slotUsage` は domain の `countOccupying`、`toActivityLine` は domain の `sanitizeBody` を使う
- **`running-session-store.ts`**:
  - `patch` / 状態通知の受信 / 起動の受付 / 利用者の送信の後に `trackDerived(sessionIds)` を呼ぶ。これは (1) `rowStatus` が変わったセッションの `statusSince` を**まとめて 1 回の `setState`** で更新し (同じ値なら `setState` しない)、(2) 対象のセッションの `scheduleActivity` を呼ぶ。状態通知のバッチは含まれる全セッションを 1 回で渡す。起動の受付では固定値ではなく、その時点の `rowStatus` を入れる
  - `scheduleActivity(sessionId)`: セッションごとに 500ms の間隔で `deriveActivity` を評価して `activity` に書く (先頭は即時、間隔の中の更新は最後の 1 回だけ trailing で書く。値が等しければ書かない)。タイマはストアに注入する
  - port の `message` で `receivedMessages` を 1 足す (観測点)
  - `launch(config, folderLabel)`: 起動の受付時に作業フォルダの表示名を各セッションに写す (`SessionScreen` が既に引いている値。引けていなければ `null`)
  - `close` で `statusSince` / `activity` を消し、間引きのタイマを止める
  - `setDensity(density)` と `selectNextAwaiting()` (`nextAwaiting` の結果を `selectedId` にする。既存の切り替えと同じ経路を通す) を actions に足す
- **制約**: 本番の composition でストアを `window` などの global に出す口を作らない。実機計測が読むのは一覧の `data-*` の値だけ (research R-07)

### renderer — 一覧・ナビ・通知

- **`RunningSessionList.tsx`**:
  - 見出し: 枠の使用数 (`slotUsage`)、承認待ちの件数のボタン (`nextAwaiting` が `null` のときは押せず、理由を説明に出す)、失敗の件数 (押せない表示)、密度の切り替え (2 値のトグル。押下状態を `aria-pressed` で示す)
  - 上限に達しているとき (`used >= limit`)、新規起動の導線の近くに空け方の案内を出す。文言は X-5 の `session-limit` の拒否文言 (`labels.ts`) を再利用する (FR-007。導線は無効にしない)
  - 行 (`useRowFacts`) は `activity[id]` と `statusSince[id].status` だけを足して選ぶ。本文の配列・メッセージのオブジェクト・時計を選ばない
  - 経過時間は行の子の `ElapsedTime` (新設) だけが時計と `statusSince[id].at` を読む (行本体は時計で再描画されない。research R-03)
  - 行の強調: 承認待ちと失敗に、状態の文言に加えてアイコンを付け、行の左端の帯などを既存のトークンで出す。色だけに頼らない (spec FR-001)。強調の値と行の状態 (`data-row-status`) は `RunningSessionList.tsx` が決め、element には `data-*` 属性を解決する関数として渡す
  - 直近の活動は kind ごとの固定の前置き + 会話由来の部分を別の要素で出し、状態の文言の要素とは分ける
  - 観測点: 一覧の中の視覚的に隠した小さな要素だけが `receivedMessages` を購読し、`data-received-messages` に出す (data-model §1)
  - 件数の表示は shadcn Badge (公式の CLI で導入。research R-06)。compact で外した情報は導入済みの Tooltip
- **`useSessionClock.ts` (新設)**: 1 秒ごとの時計を持つ zustand の小さな store とフック。セッション画面がマウントされている間だけ動く (research R-03)
- **`SessionAttentionAnnouncer.tsx` (新設)**: `App` の寿命で 1 つだけ置く polite な live region (`role="status"`)。ストアの `statusSince` と、画面の状態 (`stores/ui` の `screen`)・`selectedId` から「見ているセッション」を決め、`announcements` の結果を書き込む (空にしてから書く)。表示名はストアの `folderLabel` だけを使い、IPC を持たない。文に会話由来の文字列を入れない (research R-05)
- **`SessionNavBadge.tsx` (新設)**: ナビの「セッション起動」に差し込む件数 (承認待ち・失敗を別々に。0 件は出さない。accessible name「承認待ち N 件」「失敗 N 件」)。session feature が export する (research R-09)
- **`App.tsx`**: ナビの `launch` の行に `SessionNavBadge` を差し込み、`SessionAttentionAnnouncer` を置くだけ。冒頭コメントに「ナビのバッジと通知は各 feature のコンポーネントを差し込む」と足す
- **`SessionScreen.tsx`**: `store.launch(config)` の呼び出しで、引けている作業フォルダの表示名も渡す
- **`thread-list.aui.tsx`**: 行の密度と、行の Root に付ける `data-*` 属性を解決する関数を context で受ける口を足す (`RowMetaContext` と同じ形)。compact では操作を Trigger と同じ段に置き (横並び・折り返さない・表示名は切り詰め)、comfortable は現状の縦積み。**R-2 の一覧は口を使わないので現状のまま**。session の語彙を element に書かない
- **`labels.ts`**: 見出し (枠の使用数・承認待ちの件数・失敗の件数・密度の 2 値・押せない理由)、ナビの件数の accessible name、経過時間の表記、直近の活動の前置き (承認を求めている / 実行 / 送信 / 応答)、live region の文と表示名の代替語、compact の操作のアイコンボタンの accessible name (X-5 の操作の文言を流用)

### E2E と実機計測

- **`e2e/support/input-probe.ts` (新設)**: `e2e/multi-session.spec.ts:131-205` の仕込みと集計 (long task・入力遅延・p95) を関数に切り出す。E2E の挙動は変えない
- **`e2e/multi-session.spec.ts` (変更)**: SC-003 のテストを、comfortable で経過時間と直近の活動 (本文の分岐) が出ていることを確かめてから流す (SC-004)。強調は含めない (USER 決定。E2E stub を変えない)。compact で 10 本の行がすべて一覧の可視領域に収まり、各行で `scrollWidth <= clientWidth`、操作のボタンが行の内側にあることのテストを足す (SC-003)
- **`perf/real-sessions.spec.ts` + `playwright.perf.config.ts` + `perf/tsconfig.json` (新設)**: research R-07 のとおり (置き場・安全柵・観測点・成果物・負荷・有効な回・`afterEach` の後始末)。結果は spec SC-005 の許可リストの項目だけを annotation と標準出力に出し、quickstart-results に人が写す
- **順序**: 実機計測 (SH-033) は pr-gate の前に済ませる。有効な回が 3 回記録されるまで `/cl-pr-gate` / `/cl-done` に進まない (spec FR-012 の完了条件)

### 記録の追随

- glossary (SH-001。コードより先): Monitoring view (監視ビュー) / Recent activity (直近の活動。`Activity`) / Density (情報密度。`density`) / Slot usage (枠の使用数。`slotUsage`。Concurrency limit との関係を Counterexamples に) / Status since (状態に入った時刻。`statusSince`) / Immersive view (没入ビュー = 表示中セッションのペイン)。Running session list の定義に「監視ビューは本一覧を拡張したもの」を足す
- session charter: Out of scope の見た目の持ち主の改訂 (監視ビューは session の操作 UI。承認カードと transcript の見た目は ui)・Journey 3 の読み替え・KPI「並列時の滑らかさ」の計測経路 (E2E + `perf/` の実機手順)・Related Specs (O-1)・末尾の「未着手」・Open Questions に Hook / Background task の結論・終了済みの件数の上限を持たない結論
- ui charter: In scope の密度の分担・Journey 4 の読み替え・Open Questions に「Hook / Background task の表示の割当と状態の持ち主は O-2 が判断する」
- `_overview.md`: 「帰属の判断根拠」に Hook / Background task の 1 行
- roadmap: O-1 行 (状態)、O-2 行 (Hook / Background task の表示の割当と状態の持ち主の判断・Tool group の既定 open 化・transcript の情報密度の切替・直近の活動の tool ごとの整形)、O-3 行 (i18n リソース化の判断)、I-2 行 (compact の行の隔離バッジ)、**新しい system-scope の項目**「`e2e/` / `perf/` が check.mjs の `SCAN_ROOTS` の外にある。足すか足さない理由を ADR で決める (`allowlists.mjs:4`)」(AD-038 D4 の項目とは別)、renderer の `dangerouslySetInnerHTML` を lint で禁じる提案 (system scope。design-gate security L-005)
- discovery.md: "Build / Test / Lint" 表に実機計測の行 (人間用のみ。agent 用の列は「利用者の明示的な指示があるときだけ実行する」)、読む環境変数 (`CLOSTA_PERF_FOLDER` / `CLOSTA_PERF_RUNTIME` / `CLOSTA_PERF_PROMPT`) と既定値

## ADR

**起票しない。** 本 feature は accepted ADR の決定を読み替えない — AD-043 Decision 3 / 4 を守り (枠の数え方は domain の関数を使い、状態通知を変えない)、AD-038 D3 (credential-free の E2E) の CI 経路に実 `claude` を持ち込まない。`perf/` は「CI 外・実資格情報・自動操作」の新しい検証経路だが、AD-038 D2 の分離を同じ形で当てはめるだけで、決定を変えないので D2 の類推で扱う (plan に記録し、ADR は起こさない)。`SCAN_ROOTS` の死角を解消するかどうかは ADR を要するので、roadmap の system-scope の項目に送る。AD-020 Consequences の問い (Hook / Background task) への回答と AD-035 の「O-1 候補」の扱いは、charter・`_overview.md`・roadmap に記録する (判断の記録であり、ADR の決定の変更ではない)。

## 機械強制の変更

| 対象 | 変更 | 根拠 |
|---|---|---|
| `eslint.config.mjs` の ignores | `'perf/**'` と `'playwright.perf.config.ts'` を足す (`e2e/**` / `playwright.config.ts` と同じ扱い) | AD-038 D2 |
| `.dependency-cruiser.js` の `not-to-test` | prefix を `^(specs\|tests\|e2e\|perf)` に広げる (src → perf の逆流入を塞ぐ) | AD-038 D2 / Confirmation |
| `perf/tsconfig.json` (新設) と `.github/workflows/verify.yml` | `e2e/tsconfig.json` と同じ形で `perf/`・`e2e/support/`・`../playwright.perf.config.ts` を含め、CI の e2e job の型検査に `-p perf/tsconfig.json` の step を足す (**型検査だけ。perf は実行しない**)。step は `perf/` の実体 (SH-032) と同じ変更で入れる (include が空だと TS18003 で落ちる) | AD-038 D2 |
| `scripts/constitution/allowlists.mjs` の `SCAN_ROOTS` | **変更しない** (変えるには ADR が要る。`allowlists.mjs:4`)。`perf/` と `e2e/` は check.mjs の死角になる。代わりに、perf は子プロセスを起こさない (`child_process` や `wsl.exe` を直接使わない) ことを SH-032 の観点にする。死角は roadmap に新しい system-scope の項目として登録する (AD-038 D4 の死角 = verify.yml が `SCAN_FILES` に無いこととは別物) | Principle VI Verification |
| `playwright.perf.config.ts` | 読み込み時に `CI` が設定されていれば例外で止まる 1 行の機械ガード | AD-038 D3 |

## Risks / 未確定

| # | リスク | 対処 |
|---|---|---|
| RK-01 | 行の更新 (経過時間・直近の活動) で X-5 SC-003 の閾値を割る | 間引きを購読の手前に置く (research R-03)。SC-004 の E2E で確かめ、割ったら間引きの間隔を広げる (購読の手前なので間隔が効く。spec [ASSUMED] の範囲で調整) |
| RK-02 | 実 `claude` 10 本の負荷が E2E (200 件/秒) より桁違いに小さく、計測が意味を持たない | 有効な回の条件 (窓の中のメッセージ数の下限) で合否を守る。窓の中のメッセージ数を必ず記録し、E2E の負荷と並べて quickstart-results に書く。プロンプトを差し替えて増やせる (research R-07) |
| RK-03 | 実機計測でトークンと Provider の上限に当たる | 1 回 30 秒 × 3 回。プロンプトの繰り返しに上限回数を入れる。無効の回は理由キーを記録する (spec Edge Cases) |
| RK-04 | サイドバーの行の変化で日本語スクリーンショットの基準画像が変わる | 差分が出たら AD-038 D5 の承認手順 (PR で人間が承認) に従う (SH-091) |
| RK-05 | `thread-list.aui.tsx` の変更が R-2 のセッション一覧に波及する | 口を使わないときは現状のままにする。R-2 の一覧の既存テストを回帰として流す (FE-023) |
| RK-06 | live region の読み上げが多すぎる | 承認待ち・失敗に入ったときだけ、見ていないセッションに限り、同じ更新は 1 文にまとめる (research R-05)。目視は quickstart V-4 |
| RK-07 | 実機計測の後に WSL 内の `claude` が残る | `afterEach` (fixture の teardown) で全セッションを強制終了してから閉じ、期限を超えたら kill する (test 本体の `finally` はタイムアウトで動かない)。各回の後に `wsl.exe` と WSL 内の `claude` の数を確かめる (research R-07)。残ったら AD-043 Decision 5 の残余として X-6 に記録する |

## Project Structure

```text
src/renderer/src/
├─ App.tsx                                               # 変更: ナビにバッジを差し込む・live region を置く
├─ components/ui/badge.tsx                               # 新設: shadcn の公式 CLI で導入
├─ components/assistant-ui/elements/thread-list.aui.tsx  # 変更: 行の密度と属性の口 (語彙を持たない)
└─ features/session/
   ├─ running-session-types.ts     # 変更: statusSince / activity / receivedMessages / density / folderLabel
   ├─ running-session-store.ts     # 変更: 状態に入った時刻・直近の活動の間引き・受信件数・setDensity・selectNextAwaiting
   ├─ session-view.ts              # 変更: deriveActivity ほか導出
   ├─ useSessionClock.ts           # 新設: 1 秒の時計 (小さな store)
   ├─ SessionAttentionAnnouncer.tsx  # 新設: App の寿命の live region
   ├─ SessionNavBadge.tsx          # 新設: ナビの件数
   ├─ SessionScreen.tsx            # 変更: 起動時に表示名を渡す
   ├─ RunningSessionList.tsx       # 変更: 見出し・強調・密度・経過時間の子・観測点
   └─ labels.ts                    # 変更
e2e/
├─ support/input-probe.ts          # 新設: 計測の仕込みと集計 (E2E と実機で共有)
└─ multi-session.spec.ts           # 変更: SC-003 / SC-004
perf/
├─ real-sessions.spec.ts           # 新設: 実機計測 (CI 外)
└─ tsconfig.json                   # 新設: 型検査用
playwright.perf.config.ts          # 新設
eslint.config.mjs / .dependency-cruiser.js / .github/workflows/verify.yml  # 変更: perf/ の分離と型検査
docs/
├─ glossary.md / domains/session/charter.md / domains/ui/charter.md / domains/_overview.md / roadmap.md / discovery.md
```
