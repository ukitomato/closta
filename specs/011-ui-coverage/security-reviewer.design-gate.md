# security-reviewer Review: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Reviewer**: security-reviewer
**Spec**: specs/011-ui-coverage/spec.md
**Round**: 2 (design-gate)

## 初回読了 viewpoint

- FR/SC: FR-007 / FR-008 / FR-009 / FR-011 / FR-014、SC-003 / SC-004 / SC-006
- touched files に該当する charter / Confirmation: AD-041 (g) (`QUERY_OPTION_KEYS` は固定。BE-024 の pin)、AD-043 Decision 2 (本文は part ごとに `BODY_MAX_BYTES` で有界)、AD-034 Decision 1、session charter、ui charter
- A. 認可 / 認証 / secret 管理 / プロセス境界: Critical:0 High:0 Medium:0 Low:1
- B. 入力検証 / injection / XSS / CSP / 暗号: Critical:0 High:0 Medium:1 Low:2
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: 本 reviewer の担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:1 (A / B と同じもの。別には数えない)

## スコープ要約

R1 の改訂で、Hook は既定で出るものだけ・options は pin のまま、subtype とフィールドの許可リストは data-model §2 に一本化、`isEventPart` を両方の経路で `Object.hasOwn` で照合、`Bash` の要点のクォートの扱い、element の照合は web の読み取りだけ、が入った。残りは 4 点。

## Findings

### [Medium] 送り直す payload の「上限」が data-model に無い。「N² にならない」も確かめていない SDK の出し方を前提にしている (M-004 の残り) (scope: feature)

- **観察**: BE-024 と plan RK-02 は「payload が上限内」とするが、data-model §3 の上限は結果待ちの 256 件だけで、1 回の送り直しの合計バイトに上限が無い。research R-03 の「並列の結果は 1 つの user メッセージで来る」は根拠が無く、V-4 の記録項目にも無い。tool_use を N 個持つメッセージに結果が 1 つずつ別の user メッセージで来れば、最大 N×400KB を N 回送り直す
- **同種事象探索**: `payload の上限|上限内` で 2 件 (tasks.md:53、plan.md:178)。data-model の数値の定義 0 件
- **リスク/影響**: テストが固定する値が無い。renderer の `JSON.parse` と upsert が可用性の入口として残る (CWE-400)
- **推奨アクション**: (a) data-model §3 に 1 回あたりの合計の上限を数値で書き、超えたら `result` を切り詰めて `truncated` にするか `result:` に倒す。(b) quickstart V-4-1 に「並列の結果が user メッセージ 1 つで来るか」の記録を足す
- **根拠**: CWE-400 / AD-043 Decision 2

### [Low] 名前のある `task_updated` (`patch.description`) が、行の無い id に行を作る。FR-009 と食い違い、`skip_transcript` で隠した task が現れる (L-003 の残り) (scope: feature)

- **観察**: data-model §2 の合成は「行が無くても `next.name` が空でなければ行を作る」。`task_updated` は `patch.description` を読み `skip_transcript` を持たないので、隠した task でも description の更新で行ができる。FR-009 は「行の無い Hook / task への更新は捨てる」
- **推奨アクション**: 行を作れるのは `hook_started` / `hook_response` / `task_started` だけにし、`task_updated` / `task_notification` は行の無い id では捨てる。BE-021 / FE-012 に観点

### [Low] `Bash` の要点の文字種の判定を、`$(` / backtick / 区切りだけの語ですり抜けられる (L-102) (scope: feature)

- **観察**: `A=$( ghp_xxxx… ) cmd` を空白で区切ると最初の語がトークンそのもので、`^[A-Za-z0-9._+-]{1,64}$` にも合う。素のトークンが最初の語の場合も同じ
- **推奨アクション**: 代入の値に `$` / backtick / `(` があるときも出さない。既知の秘密の接頭辞 (`sk-` / `ghp_` / `gho_` / `glpat-` / `AIza` / `xox`) で始まる名前も出さない。FE-031 にケースを足す
- **根拠**: CWE-200 / CWE-532 / Constitution V

### [Low] 実行中の decoder が tool-call の `result` / `isError` / `truncated` の形を見ない。O-2 からこの経路に値が流れ始める (L-101) (scope: feature)

- **観察**: `isMessage` は part の `type` が文字列であることだけを見る (`session-event-decoder.ts:28-37`)。`convert.ts:65-66` は `result` / `isError` をそのまま渡す。今まで実行中の `result` は常に `null` だった
- **推奨アクション**: FE-010 で tool-call の part の `result` (`string | null`)・`isError` / `truncated` (boolean) を確かめ、外れた part を落とす。両方の経路で同じ関数
- **根拠**: CWE-20 / AD-043 Decision 2

## R1 指摘の判定

| R1 ID | 判定 |
|---|---|
| H-001 | resolved |
| M-001 | resolved (tool-call の part は L-101 として別) |
| M-002 | resolved (すり抜けの残りは L-102) |
| M-003 | resolved |
| M-004 | unresolved (一部。上の Medium) |
| L-001 / L-002 / L-004 | resolved |
| L-003 | unresolved (一部。上の Low) |

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-004 | `payload の上限\|上限内` / data-model の数値 | 2 / 0 | tasks.md:53, plan.md:178 |
| L-003 | `空でなければ行を作る\|行の無い` | 4 | data-model.md:79, spec.md:144, spec.md:191, tasks.md:48 |
| L-102 | `クォート\|バックスラッシュ` | 4 | data-model.md:112, research.md:81, spec.md:147, spec.md:210 |
| L-101 | `isEventPart\|isToolCallPart` | 3 (`event` だけ) | data-model.md:83, plan.md:138, tasks.md:59 |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 3
- Round inheritance: resolved from 1: 7 / unresolved: 2 (一部) / new: 2
