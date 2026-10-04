# Research: 会話の境界と tool の専用表示の第 2 弾 (O-6)

調べた日: 2026-10-04 (夜間の自走)

## R-01 範囲の分割 (U-1)

- 対応表の `後続: O-6` は 30 行 (Tier A 14: `compact_boundary`・`model_refusal_fallback`・`model_refusal_no_fallback`・`informational`・`conversation_reset`・`Read`・`Glob`・`Grep`・`WebFetch`・`WebSearch`・`TaskCreate`・`TaskGet`・`TaskUpdate`・`TaskList`)。O-2 の quickstart-results V-1 の件数 (O-6 30 [Tier A 14])
- roadmap の O-6 の行には、さらに O-2 の pr-gate R2 / R3 の 4 項目と V-4 の 4 項目がある
- **Decision**: Tier A 14 行と表示の状態 (結果待ち・結果不明・読み上げ・見出し) を O-6 に、残りを O-11 に (AD-049 Decision 1)
- **Rationale**: M3 の完了の条件は Tier A の行だけで判定する (AD-044 Decision 3)。O-11 の大半は Tier B で、3 つの ADR の判断を伴う

## R-02 V-4 の結果

- `specs/011-ui-coverage/quickstart-results.md` の V-4: 利用者の判定は「いい感じ」。transcript の追従の不具合を R-3 由来と特定して直した (PR「fix(ui): follow transcript bottom with default turn anchor」)。📝 の 4 項目 (並列の結果の届き方・`hook_name` の値・`Agent` / `Task`・過去ログの Hook / task の行) は**未記録**
- **Decision**: 未確認として扱う。本 feature に関わる 2 つ (並列の結果・`Agent` / `Task`) は両方の形に耐える規則にする。残り 2 つ (`hook_name`・過去ログの Hook / task) は O-11

## R-03 SDK の型 (0.3.270)

- `compact_boundary`: `compact_metadata.trigger` (`manual` / `auto`)・`pre_tokens`・`post_tokens?`・`preserved_*` (再開のときの relink の情報。表示に要らない)
- `conversation_reset`: `new_conversation_id` だけ
- `model_refusal_fallback`: `direction`・`scope` (`session` / `local`)・`fallback_model`・`api_refusal_category` (開いた文字列)・`api_refusal_explanation` (「Unstable human prose — display only」)・`retracted_message_uuids` (「remove these messages from transcript state on receipt」)
- `informational`: `content`・`level`・`tool_use_id` (同じ tool の進み具合の重複を除く)・`prevent_continuation`
- tool の入力: `Read` (`file_path`・`offset`・`limit`・`pages`)、`Glob` (`pattern`・`path`)、`Grep` (`pattern`・`path`・`glob`・`output_mode` ほか)、`WebFetch` (`url`・`prompt`)、`WebSearch` (`query`・ドメインの制限)、`TaskCreate` (`subject`・`description`・`activeForm`)、`TaskUpdate` (`taskId`・`status` (`pending` / `in_progress` / `completed` / `deleted`) ほか)

## R-04 取り消しの運び方

- O-2 の行の `name` / `detail` は 120 コードポイントで切り詰める (011 data-model §2) ので、id の列を運べない
- **Decision**: O-4 の `meter` に `retraction` を足す (AD-049 Decision 2)。`SessionEvent` の種類は増えない

## R-05 element (Principle XIII)

- F 節: File tree (A)・Tool call (A)・Web search (A) の使い道を本 feature に。Inline citation / Sources は WebSearch の結果の形を推測しないので使わない (U-5)
- Compaction boundary: registry に専用の element があるかを実装の最初に確かめる。無ければ既存の divider の見た目を広げる
