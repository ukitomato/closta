---
status: accepted
date: 2026-10-04
id: AD-047
deciders: ukitomato
tags: [session, ui, sdk, contract]
supersedes: []
superseded-by: []
---

# AD-047: セッションの計量 (`meter`) と失敗の理由のキーを session の契約に足す

## Context

O-4 ([spec 014](../../specs/014-ui-metering-and-limits/spec.md)) は、SDK が emit する計量と制限の情報 (`result` の費用・使用量・失敗の理由、`rate_limit_event`、`api_retry`、`status`、`thinking_tokens`、`tool_progress`、`task_progress`) を表示する。`docs/ui-coverage.md` で `後続: O-4` の行で、Tier A が 5 行ある (AD-044 の M3 の完了の条件)。

今の session の契約では次の 2 つが足りない。

- SDK の `result` の失敗は、すべて `provider-error` (「Provider の認証/接続」) になる (`session-core.ts` の `classifyResult` と `sdk-agent-session.ts` の `fail('provider-error')`)。レート制限でも再ログインを案内してしまう
- 計量はトランスクリプトのメッセージでも状態でもない。`SessionEvent` (`agent-session.ts:167-189`) の 7 種類のどれにも当たらない

O-2 は `SessionEvent` の種類を増やさず、Hook / Background task を `message` の経路のシステムイベントの行で通した ([AD-044](0044-ui-coverage-assignment.md)・011 SC-004)。計量は行ではないので同じ形にできない。

本 ADR は O-4 が夜間の自走で起こした。ui の feature が session の契約を広げるので持ち主の判断を利用者が行い、2026-10-05 に本 ADR と spec 014 の U-1〜U-6 を承認した。

### 読み替える箇所

- X-1 ([spec 005](../../specs/005-session-launch-and-streaming/spec.md)) の FR-020 / US-4 AC6 / Edge case と 005 data-model §6 は「未ログイン・認証切れ・クレジット不足・rate limit・API 到達不可を `provider-error` に保つ」と定めた (コードの注記では V-11)。本 ADR はこれを Decision 1 の理由のキーに分ける。**終わり方 (失敗にする・黙って完了にしない) は変えない**
- glossary の「FailureReason (起動系)」を「起動とターンの失敗」に改める
- AD-044 Decision 6 (Hook / Background task の状態を保持しない) は変えない。task の進み具合は既存の行の更新として流す

## Decision

1. **失敗の理由のキーを足す。** `LaunchFailureReason` に `max-turns` / `max-budget` / `structured-output-retries` / `execution-error` / `auth-failed` / `billing` / `rate-limited` / `api-error` を足す (10 → 18)。分類は agents の純関数 (`classifyResultFailure`) で、材料は result の `subtype` / `api_error_status` と同じターンの assistant の `error` (列挙)。条件と再ログインの導線の正本は spec 014 data-model §1。`classifyResult` (完了か失敗か) は変えない — X-1 FR-020 / US-4 AC6 (認証の失敗を黙って完了にしない) を保つ。知らないものは今の `provider-error`。失敗の文字列 (`errors`) は運ばない
2. **`SessionEvent` に種類 `meter` を 1 つ足す。** 数・真偽・列挙・モデルの id だけを運ぶ (許可リストの正本は spec 014 data-model §2)。会話由来の文字列・エラー文・パスを運ばない。port (AD-034 / AD-043) を通り、状態通知 (`SessionStatusUpdate`) には載せない (X-5 FR-004)。高頻度のもの (`thinking_tokens` / `tool_progress`) はセッションスレッドで 1 秒に 1 回までに間引く
3. **transcript の行になる出来事は O-2 の経路を使う。** API の再試行・圧縮・権限モードの変化はシステムイベントの行の category を足し、背景の task の進み具合は既存の task の行の更新にする。part の形 (`TRANSCRIPT_PART_FIELDS`) は変えない。行の組み立ては agents に置き、過去ログの変換には足さない
5. **権限モードの昇格を観測したとき** (AD-041 の「昇格経路 0 件」の逸脱の信号): 原因を断定しない警告の帯で知らせる。強制 (中断・失敗) はしない。強制の要否は I-3 (権限モードのゲート) が決める。昇格値のリテラルは domain だけに置き、Constitution 検証の項目 16 に例外を足さない
4. **制御要求を呼ばない。** `get_context_usage` / `get_session_cost` / `get_usage` を呼ばず、毎ターンの `result` の値 (`total_cost_usd` / `modelUsage` / `usage` / `contextWindow`) から Cost meter と Context display (推定) を出す。Agent SDK の呼び出しの許可リスト (`AGENT_SDK_ALLOWED_CALLS`。Constitution 検証の項目 14) と query の options のキー (AD-041 (g)) は変えない

## Consequences

- `SESSION_EVENT_KINDS` (7 → 8) と `LAUNCH_FAILURE_REASONS` (10 → 18) の固定テストを直す。renderer の decoder に `meter` の検証を足す
- 失敗の理由のキーは状態通知 (X-5 FR-004 が許す理由キー) で main を経由する。フィールドは変わらず、値の集合だけが広がる (`isLaunchFailureReason` が追随し main のコードの差分は 0)。`SessionLaunchRejectReason` (`LaunchFailureReason` を含む) の値の集合も広がる
- `meter` は観測点 `receivedMessages` (O-1) に数えない。新しい行は数える (KPI「並列時の滑らかさ」の比較の基準の変化)
- session charter に失敗の理由のキーと `meter` を session の契約として記録する
- 失敗の後の終わり方 (セッションを「失敗」にする) は変えない
- カテゴリ別のコンテキストの内訳とプランの全窓の利用率は出さない。要るようになったら制御要求の許可リストの追加とともに ADR を起こす
- 対応表の `get_context_usage` (Tier A) は `表示不要` (Context display は result の推定で実装済み) になる

## Alternatives

- **状態通知に載せる** — main を経由し、X-5 FR-004 (状態通知に会話由来の文字列を載せない) の検査の範囲が広がる。計量は main が使わない
- **すべてシステムイベントの行にする** — 計量は行ではなく、最新の値だけが要る。行が増え、transcript が埋まる
- **制御要求を呼ぶ** — カテゴリ別の内訳を出せるが、項目 14 の許可リストの追加と呼び出しの時期 (毎ターン / 手動) の設計が要る
- **session の feature に切り出す** — O-4 の表示がその feature を待つ

## Confirmation

- spec 014 の SC-001 / SC-002 / SC-006 (分類の純関数・変換の単体・固定テスト)
- 状態通知の全フィールドの走査 (X-5) で、状態通知のフィールドの差分が 0

## 訂正: Decision 2・4・5 の字面と採択の時点の設計の差 3 つ (2026-10-08 / O-4 design-gate R2 HG-01 / HG-04)

採択 (2026-10-05) の後の O-4 の design-gate R2 (HG-01 / HG-04) で、Decision 2・4・5 と Consequences の字面が、採択の時点で既にあった設計
(spec 014 の data-model・research) と 3 か所で食い違っていると分かった。2026-10-08 に利用者が、3 つとも訂正として扱うと決めた (AD-031 の
訂正の規則。読み手が同じ決定に至る)。**決定 (制御要求を呼ばない・会話由来の文字列・エラー文・パスを運ばない・Constitution 検証の項目 16 に
例外を足さない) は変えない。** Decision と Consequences の本文は書き換えない。各項目の根拠の正本は spec 014 の plan の ADR 節である。

1. **Decision 4 と Consequences (最後の行) の Context display の材料**: 主ループの最後の assistant の 1 回の API 呼び出しの入力側の usage
   (入力 + キャッシュの読み込み + キャッシュの作成) と、result の `modelUsage[].contextWindow` である。result の `usage` は読まない (ターン内の
   往復の合算でありうる)
   - 根拠: 採択の前の design-gate R1 (2026-10-04。spec 014 の `design-gate.md.20261004T063000`) の H-05 (po H-003) の手当てで、コンテキストの
     推定の材料を最後の assistant の usage に替えていた (spec 014 research R-04)
2. **Decision 2 の運ぶ値**: 数・真偽・列挙・モデルの id に加え、形を検証した tool の id (`tool-elapsed` の `toolUseId`) を含む。同じ Decision 2 が
   `tool_progress` を間引いて運ぶと定めており、tool の id なしでは成り立たない
   - 根拠: 採択の前の design-gate R1 (2026-10-04) の security M-002 の手当てで、`toolUseId` の形の検証 (`^[A-Za-z0-9_-]{1,128}$`) を足していた
     (spec 014 data-model §2「値の検証」)
3. **Decision 5 の「昇格値のリテラルは domain だけに置く」**: 「`src/agents/` (項目 16 の走査範囲) に置かない。値域は domain
   (`src/domain/session/meter.ts`)、表示名は renderer の文言の表 (`features/chat/labels.ts` の `PERMISSION_MODE_NAMES`) に置く」の書き誤りである
   - 根拠 (採択の時点の設計): renderer に昇格値を key にした表示名を置く設計は採択の時点からあった。記録は承認の commit `c89b423`
     (2026-10-05。branch `014-ui-metering-and-limits-old`) の data-model.md:178 (§5 の chat の文言の表「権限モードの名前」。`acceptEdits` /
     `bypassPermissions` / `auto` を key にする) と spec.md:134 (US-4 AC1「権限モードが {モード} に変わりました」)
   - 根拠 (利用者の判断): 同じ版の data-model.md:76 の「昇格値のリテラルは domain の `meter.ts` だけに置き」は agents と対比した字面で、§5 の
     表と食い違っていた。Decision 5 の字面と R1 の手当ての記録の「昇格値は domain だけ」はこの :76 から来ている。2026-10-08 に利用者が、これを
     書き誤りと判断した (design-gate R3 MG-11)

spec 014 の U-3 の字面も同じ日に 1. と同じ形に直した (決定は変えない)。

本文の Decision 5 と 4 は書いた順が逆で、Decision は番号で引く (4 = 制御要求を呼ばない、5 = 権限モードの昇格を観測したとき。Markdown の表示では連番に振り直されて 4 と 5 が入れ替わって見える。2026-10-09 / O-4 pr-gate R1 M-002)。

## 訂正: AD-048 への参照 (2026-10-10 / O-5)

**Decision 2 の運ぶ値は [AD-048](0048-session-config-display-and-answer-ui-split.md) Decision 3 が読み替える** (形の検査を通った未信頼の名前と、
無害化して切り詰めた説明。`meter` の種類 `init-report` / `commands`。形の検査の正本は
[spec 015 data-model §2](../../specs/015-ui-mcp-elicitation-commands/data-model.md))。

AD-048 の「読み替える箇所」は、本 ADR が proposed のうちに Consequences へ AD-048 への参照を足すとしていたが、本 ADR は参照を持たないまま
accepted になった。その参照を、accepted の後に訂正として足す (AD-031 Decision 1。2026-10-10 に利用者が承認。spec 015 FR-014 / Q1)。
Decision と Consequences の本文は書き換えない。AD-048 の本文も変えない。

## 訂正: AD-049 への参照 (2026-10-14 / O-6)

**Decision 2 の運ぶ値は [AD-049](0049-boundaries-retraction-and-o11-split.md) Decision 2 が読み替える** (`meter` の種類 `retraction`。
message の id の列を運び、形の検査を通った 128 件までを 1 つの更新にし、O-4 の上限・間引き・`finish()` の破棄に掛けない。
検査の正本は [spec 016 data-model §1](../../specs/016-ui-boundaries-and-tool-displays/data-model.md))。

AD-049 の「読み替える箇所」は AD-047 Decision 2 を名指しているが、本 ADR は参照を持たないまま accepted になった。
その参照を、AD-048 のときと同じ形で、accepted の後に訂正として足す (spec 016 FR-016 / SH-010)。
Decision と Consequences の本文は書き換えない。AD-044 / AD-046 / AD-049 の本文も変えない。
