# security-reviewer Review: 権限モードの Auto (起動と実行中)

**Run**: 2026-11-01T00:00:00+09:00
**Reviewer**: security-reviewer
**Spec**: specs/026-session-live-auto-permission-mode/spec.md
**Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-004 (4 値化と、昇格 2 値への経路が 0 件)、FR-005 / FR-006 / FR-007 (確認と main の印の検査。A の中心)、FR-008 (帯の隔離の文。U-6 の手当て)、FR-012 (プリセット)。SC-002 / SC-003 (拒否率 100%)、SC-001
- touched files に該当する charter / Confirmation: session charter `:85` / `:188`、isolation charter (§11 で書き換え)、AD-066 Decision 2 と受け入れたリスク (`docs/decisions/0066-auto-permission-mode-with-confirmation.md:53`)、Constitution Principle III の改定文 (data-model §8.1)。送り元の検査 (`src/main/app/ipc.ts` の `isTrustedSender`) は変えない
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:1 Low:0
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:0 Low:0
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の範囲 (U-6 による Principle III の改定文を含む)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲: 該当なし: security-reviewer の範囲外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

Round 1 からの主な変更は 2 つ。
- U-6 を足した。`isAutoModeAllowed` が true でも確認を挟まないことを、利用者が受け入れたリスクとして記録した。記録先は spec.md:36、AD-066:53、data-model §1 :33 と §8.1
- data-model §6.2 で `autoAckRuntimeId` を消す条件を定めた (:152, :160-163)

U-6 は人間が承認した決定である。`autoModeSafe` / capability の意味は platform-boundary-reviewer の範囲なので、本 reviewer は蒸し返さない。

IPC の形は Round 1 から変わっていない (contracts C-1〜C-3)。検査は次のとおり。
- 3 つ目の引数は `=== true` のときだけ承諾とみなす
- `checkSetPermissionModeArgs` は引数 2 または 3 個だけを通す
- 実行中の切り替えでは、ランタイムを main の `Entry.axes.runtimeId` から引く
- ランタイムが見つからなければ fail-closed になる

preload は `ipcRenderer.invoke` に引数を 1 つ足すだけで (tasks.md:51 BE-011)、汎用のパススルーは増えない。B に新しい指摘は無い。

## Findings

### [resolved from prev] H-001 プリセットの適用で前の承諾が使い回される

- **観察**: 次の 3 か所が揃って直っている。Round 1 の手順 (承諾 → `default` → `auto` のプリセット → 起動) では、起動の前に `'launch'` の確認が出るようになった
  - `data-model.md:160-162`: 権限モードを `auto` 以外にしたとき、プリセットを適用したとき、ランタイムを変えたときに `autoAckRuntimeId = null` にする
  - `data-model.md:152`: mount ごとに `null` から始める。`lastConfig` の復元と再開の初期値の場合も含む
  - `tasks.md:64` FE-013: 上の手順のテストと、「承諾 → `default` → 起動で `ack` が `false`」のテストを持つ。`spec.md:63` の Edge Case と `quickstart.md:33` も同じ内容になっている
- `refetch` では印を消さない (`data-model.md:163`)。承諾はランタイムの id に結び付いていて、起動の時点で今のランタイムと照らす (`:164`)。capability が true に変わった場合は、そもそも確認が要らなくなる。どちらの場合も確認が省かれる経路にはならない

### [Medium] main の印の検査を「認可の境界」と読める書き方が残っていて、脅威モデルが書かれていない (M-001) (scope: feature) [unresolved from prev]

- **観察**: `docs/decisions/0066-auto-permission-mode-with-confirmation.md:65` は、退けた案の理由を今も「検証済みの IPC を直接呼ぶ経路で確認を飛ばせる」と書いている。しかし印は renderer の自己申告である (`contracts/ipc-auto-permission-mode.md:9`)。preload を呼べるコードなら `true` を載せられるので、IPC を直接呼ぶ経路は main の検査でも止まらない。data-model §4.2 (`data-model.md:77-87`) にも脅威モデルの 1 文が無い
- **同種事象探索**: `自己申告|直接呼ぶ|renderer の確認だけ|侵害` で探した。AD-066 で 1 件 (`:65`)。spec dir は過去の reviewer 出力を除くと 0 件
- **リスク/影響**: 今の実害は無い。renderer は送り元の検査と BrowserWindow の hardening の上にある。懸念は、I-3 が `bypassPermissions` の確認でこの印を「renderer が侵害されても守る防御」と取り違えて当てにすることである
- **推奨アクション**: data-model §4.2 の冒頭に次の 1 文を足し、AD-066:65 の理由も同じ趣旨に直す (AD-066 は proposed なので直せる)
  - 「印は renderer の自己申告で、renderer の侵害は防がない。防ぐのは、renderer の中で確認を通らない経路の取りこぼしと capability の食い違い」
- **根拠**: CWE-602、OWASP ASVS V1
- **scope 根拠**: 本 feature の proposed ADR と data-model で直せる

### [Medium] `auto-mode-unconfirmed` の拒否と、確認つき / 確認なしで受け付けた `auto` が main のログに残らない (M-002) (scope: feature) [unresolved from prev]

- **観察**: BE-010 (`tasks.md:49-50`) と data-model §4.2 に、ログの規定が今も無い
- **同種事象探索**: spec dir で `deps\.log|ログ|log\(` を探した。該当は `quickstart.md:22` (既存のログを参照するだけ) と過去の reviewer 出力だけで、規定は 0 件
- **リスク/影響**: U-6 で増えたものがある。確認なしで隔離されない `auto` が動く経路 (true のランタイム) である。利用者が「確認なしで Auto になった」と報告したとき、それが U-6 の経路か、renderer の取りこぼしかを事後に切り分ける記録が無い
- **推奨アクション**: BE-010 に 1 行ずつのログを足す。id や本文は含めない
  - 拒否: `op=<launch|resume|set>`
  - 受理: `op=… confirmed=<true|false-u6>`
- **根拠**: OWASP ASVS V7、reviewer-base H
- **scope 根拠**: 本 feature の touched file (`session-launch-service.ts`) で直せる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 (resolved) | `autoAckRuntimeId` (data-model / tasks) | 消す条件 3 行・テスト 2 件 | data-model.md:152, :160-163; tasks.md:63-64 |
| M-001 | `自己申告\|直接呼ぶ\|renderer の確認だけ\|侵害` (AD-066 + spec dir) | 1 | docs/decisions/0066-auto-permission-mode-with-confirmation.md:65 |
| M-002 | `deps\.log\|ログ\|log\(` (spec dir) | 規定 0 | quickstart.md:22 (参照のみ) |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 0
- Round inheritance: resolved from 1: 1 (H-001) / unresolved: 2 (M-001, M-002) / new: 0
