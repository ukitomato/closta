# ux-reviewer Review: 起動設定の残りの軸 — 追加ディレクトリ・上限・セッション名 (024)

**Run**: 2026-10-30
**Reviewer**: ux-reviewer
**Spec**: specs/024-session-launch-axes/spec.md
**Round**: 1 (pr-gate, system scope)

## 初回読了 viewpoint

読んだもの: spec.md 全文、charter 全文、`.gate-verdict-code.json`、`.pr-gate-scope.txt`、UI 実装 (`LaunchExtraAxes.tsx`、`launch-extra-axes.ts`、`LaunchDialog.tsx` 全文、`PresetPanel.tsx`、`OverviewTab.tsx`、`labels.ts` の該当節)、`LaunchDialog.test.tsx` の上限・名前・追加ディレクトリの describe。

読んでいないもの: plan.md、tasks.md、contracts/、data-model.md、research.md、quickstart.md。`docs/decisions/` の各 ADR (Principle XV と AD-045 の参照だけ確認)。実機・実行はしていない。

- FR/SC: FR-001 / FR-002 / FR-003 / FR-004 / FR-005 / FR-007 / FR-009 / FR-010 / FR-012 / FR-013、SC-005 / SC-006
- charter / Confirmation: Journey 2 手順 3、Journey 4 手順 2、「上流の軸を変更したとき、無効になった下流の値は既定に戻し、UI で通知する」、Principle XV (AD-045)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当で、UX の範囲外
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当。UX の入力検証の観点は G に記載
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当。Principle XV の直書きは L-005 に記載
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当。実装の UX 完成度は G に記載
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲 (ux): Critical:0 High:1 Medium:3 Low:6
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

起動ダイアログに 3 軸 (追加ディレクトリ・ターン数と費用の上限・セッション名) を足し、プリセットと再開の形・概要のタブにも反映した変更。

良い点: 範囲外の入力は欄の直下に `role="alert"` と `aria-invalid` で範囲を示し起動を止める。IME の変換中の Enter を抑える。拒否・失敗の後に開き直したとき前回の値を戻す。追加ディレクトリは登録フォルダの id だけで選ぶ。

一方で、プリセットの保存が入力エラーを素通りして古い値を保存する。これは費用の上限という新しい軸の目的に直結するため High。そのほか、main 拒否の文言、無効化された欄の理由、越境警告の文言に Medium がある。Critical は無い。

## Findings

### [High] 入力が不正なままプリセットを保存すると、画面に出ている値ではなく直前の有効値が黙って保存される (H-001) (scope: feature)

- **観察**:
  - `src/renderer/src/features/session/LaunchDialog.tsx:920-932` は、不正な入力のとき下書きを更新しない (`if (parsed.ok) update(...) else setConfirming(false)`)。
  - `LaunchDialog.tsx:660-664` は `PresetPanel` に `current={config}` を渡す。`config` は下書き (`effective`) から作った値で、不正入力で `null` になる `launchConfig` (:445-455) ではない。
  - `PresetPanel.tsx:165` の保存ボタンは `current === null || normalized.length === 0` でしか無効にならない。上限の入力が不正でも押せる。
  - 例: 「ターン数の上限」に `5000` を入れてエラー文言が出ている間にプリセット保存を押すと、`maxTurns` は直前の下書きの値 (既定なら `null` = 上限なし) で保存される。保存後の `saved` 通知にも差異の手がかりは無い。
  - `LaunchDialog.test.tsx:1961-1976` は不正入力で「起動」が無効になることだけを検証。プリセット保存との組み合わせのテストは無い。
- **同種事象探索**: `current=` を `LaunchDialog.tsx` で 1 件 (:662)。入力文字列と下書きが分かれているのは `maxTurnsInput`/`maxBudgetInput` の 2 欄。セッション名はプリセットに入らないため影響しない。再開の形でも同じ `config` を使う (:387-398)。
- **リスク/影響**: 「費用の上限で暴走を止める」が本 spec の目的 (US-2)。ユーザは上限つきのプリセットを保存したつもりで、実際は上限なしのプリセットを毎日使う可能性がある。画面と保存内容の食い違いに後から気づく手段がほぼ無い。
- **推奨アクション**: `limitsInvalid` のとき `PresetPanel` の `current` を `null` にして保存を無効にし、`presetSaveUnavailable` と同じ流儀で理由の 1 行を足す (または `launchConfig` を渡し、保存できない理由を出し分ける)。回帰テストを `LaunchDialog.test.tsx` に足す。
- **根拠**: spec FR-004 / FR-009 / US-4 AC1。UX-4。
- **scope 根拠**: touched files (`LaunchDialog.tsx`) 内で直せる。

### [Medium] main が追加ディレクトリで拒否したときの文言が追加ディレクトリに触れず、原因が分からない (M-001) (scope: feature)

- **観察**: `src/main/app/launch-preparation.ts:170-171,189,281-282,300` は追加ディレクトリの外れ・変換不能をすべて `reject('invalid-config')` にする。表示文言 `labels.ts:76-77` は「(カタログに無いモデル・非対応の effort・組み合わせの不一致など)」のまま。renderer が「判定できません」で起動を許した場合、`directoryUnknownItems` (LaunchDialog.tsx:995-1004) は起動を止めないため、同じ設定で再度起動して同じ拒否になる循環があり得る。
- **同種事象探索**: `invalid-config` を renderer session 非テストで 2 件 (`labels.ts:27,76`)。
- **推奨アクション**: 文言に「追加ディレクトリが現在のランタイムで使えない場合も含みます。追加ディレクトリを外して再度お試しください」を足す。
- **根拠**: UX-2。FR-003。

### [Medium] 「フォルダを追加」の select が、候補なし・10 件到達で理由を示さず無効になる (M-002) (scope: feature)

- **観察**: `LaunchExtraAxes.tsx:136` `disabled={full || choices.length === 0}`。理由を示す文や helper が無い。登録フォルダが作業フォルダの 1 件だけのとき、先にフォルダを登録するという次の一手が示されない。10 件到達のテスト (`LaunchDialog.test.tsx:1697-1708`) は `toBeDisabled` だけ。
- **推奨アクション**: `LAUNCH_EMPTY_STATE_LABELS` に空と満杯の 2 状態の文言を足して出す。
- **根拠**: UX-1、U-2。

### [Medium] 追加ディレクトリの越境・確認中の警告が「作業フォルダ」の文言のまま流用され、項目ごとに繰り返される (M-003) (scope: feature)

- **観察**: `labels.ts:583-586` の `directoryCrossBoundaryLabel` は「追加ディレクトリ <名前>: 」に作業フォルダ用の本文 (`CROSS_BOUNDARY_LABELS.lead` :646、`checking` :651、`unknown` :650) を連結する。10 件すべて越境なら同じ長文が 10 段並ぶ (LaunchDialog.tsx:982-994)。`directory-checking` (:1005-1009) は `directoryItems[0]` の名前を出し、実際に確認中の項目とは限らない。
- **同種事象探索**: `directoryCrossBoundaryLabel` 呼び出し 3 件 (LaunchDialog.tsx:989,1002,1007)。
- **推奨アクション**: 追加ディレクトリ専用の文言を持ち、複数件は 1 行にまとめ、チェック中は実際に確認中の項目名を出す。
- **根拠**: UX-9 / UX-7、AD-016。

### [Medium] 上限・追加ディレクトリの UX を検出するテストが足りない (M-004) (scope: feature) (H 観点)

H-001 のプリセット保存と不正入力の組み合わせ、M-002 の空・満杯の理由表示、再開の形で名前の部品が出ないこと、複数件の越境警告のテストが見つからない。`LaunchExtraAxes.test` は 0 件。SC-005。

### [Low] 画面の説明文が新しい軸を言わない (L-001) (scope: feature)

`LaunchDialog.tsx:638` と `labels.ts:113-114` の `RESUME_LABELS.description` が更新されていない。UX-9。

### [Low] 追加ディレクトリの「外す」で押したボタンが消え、フォーカスの行き先が無い (L-002) (scope: feature)

`LaunchExtraAxes.tsx:147-163`。014 FR-019 の `focus-handoff` が既に扱っている種類。a11y-reviewer と重複。

### [Low] 費用の入力を打っている途中で `role="alert"` が点滅する (L-003) (scope: feature)

`launch-extra-axes.ts:28`。UX-4。

### [Low] 範囲の hint が入力前に無い (L-004) (scope: feature)

`EXTRA_AXES_LABELS.unlimitedPlaceholder` は「上限なし」だけ。プリセットがセッション名を保存しないこと (FR-010) を示す記述も無い。UX-4。

### [Low] 新規の aria-label が直書きになっている (L-005) (scope: feature)

`LaunchDialog.tsx:939` の `aria-label="外した追加ディレクトリ"` は `labels.ts` 外の直書き。AD-045 / Principle XV。UX-6。

### [Low] 概要のタブで、登録フォルダの一覧の取得失敗時に追加ディレクトリの行が黙って消える (L-006) (scope: feature)

`OverviewTab.tsx:135`。Provider の失敗時は「取得できませんでした」を出す (:82-83) のと不整合。UX-9。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `current=` / `limitsInvalid` (`LaunchDialog.tsx`) | 1 / 3 | `LaunchDialog.tsx:662`、`:290,452,...` |
| M-001 | `invalid-config` (renderer session 非テスト) | 2 | `labels.ts:27,76` |
| M-002 | `choices.length === 0` の理由表示 | 0 | (`LaunchExtraAxes.tsx:136`) |
| M-003 | `directoryCrossBoundaryLabel` | 3 | `LaunchDialog.tsx:989,1002,1007` |
| M-004 | `LaunchExtraAxes.test` | 0 | - |

## Verdict

- Critical: 0
- High: 1
- Medium: 4
- Low: 6
- Round inheritance: new: 11 (Round 1 のため引き継ぎなし)
