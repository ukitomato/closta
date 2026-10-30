# po-reviewer Review: 起動設定の残りの軸 — 追加ディレクトリ・上限・セッション名 (X-6 の 2 本目)

**Run**: 2026-10-30T00:00:00+09:00
**Reviewer**: po-reviewer
**Spec**: specs/024-session-launch-axes/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC: FR-001 / FR-002 / FR-003 (追加ディレクトリ: LaunchDialog.tsx, LaunchExtraAxes.tsx, launch-resolution.ts, launch-preparation.ts)、FR-004 / FR-005 / FR-006 (上限: launch-extra-axes.ts, validate.ts, session-core.ts)、FR-007 / FR-008 (名前: session-launch-service.ts:531, launch-preparation.ts:109)、FR-009 / FR-010 / FR-011 (プリセット: PresetPanel.tsx, preset-record.ts, preset-store.ts)、FR-012 (resume-action.ts, LaunchDialog.tsx の再開の分岐)、FR-013 (OverviewTab.tsx)、FR-014〜FR-017 (記録)。SC-001〜SC-008 は自動テスト。SC-009 は quickstart-results.md で V-0〜V-6 がすべて「未実施」(spec の「合否の扱い」に沿っていて、マージは許される)
- touched files に該当する charter / Confirmation: session charter の User Journey 3 / 5、Key concepts のプリセット (`PresetLaunchConfig`)、KPI「再利用率」(charter.md:217-226)、AD-064 Decision 1-5
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲 (上限・名前の 2 段検証は E の観点で AC との対応だけを見た)
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の範囲
- E. User Story / SC / AC / UX: Critical:0 High:1 Medium:1 Low:1
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲: 該当なし: ux-reviewer / a11y-reviewer の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

起動ダイアログの軸を 6 から 9 に増やす (追加ディレクトリ 0〜10 件・ターン数と費用の上限・起動時のセッション名)。プリセットは名前を除く 9 キーを持つ版 2 にする。X-9 の再開では追加ディレクトリと上限を選び直せる軸にし、名前は出さない。E の観点では、各 US の AC が renderer の状態遷移でどう満たされるかを中心に見た (LaunchDialog の draft / effective / 入力文字列の 3 層、プリセットの保存元、reset の通知)。design-gate の High 5 件 (H-003 の lastConfig からの入力欄の初期化を含む) は実装で解消されていることを確かめた (LaunchDialog.tsx:285-297、E2E の launch-extra-axes.spec.ts:104-135)。design-gate の Medium / Low は AD-050 に従い重ねて挙げない。

## Findings

### [High] 依存解決で外した追加ディレクトリが下書きに残るため、10 件の上限 (FR-001 / US-1 AC5) を UI から超えられ、「外しました」と通知した項目が黙って戻る (H-001) (scope: feature)

- **観察**:
  - 依存解決は外した項目を `effective` (resolution.draft) から除くだけ (`src/domain/session/launch-resolution.ts:172-188`)。`update()` が追加ディレクトリの変更で書き戻すのは `next` そのもので、外した id は `draft.additionalDirectoryIds` に残る (`src/renderer/src/features/session/LaunchDialog.tsx:487-503`)
  - 「フォルダを追加」を押せるかの判定 `full` は `effective` の件数で決まる (`LaunchDialog.tsx:896`)。一方 `onAdd` は `draft.additionalDirectoryIds` に追加する (`LaunchDialog.tsx:897-903`)
  - `resolveLaunchAxes` と `toLaunchConfig` は件数の上限をかけない (`launch-resolution.ts:167-227`。renderer で `MAX_ADDITIONAL_DIRECTORIES` を参照するのは `LaunchDialog.tsx:896` だけ)
  - 再現の手順: WSL-A の追加ディレクトリを 2 件選ぶ → ランタイムを Win32 に切り替える (2 件が外れ、`effective` は 0 件) → Windows のフォルダを 9 件足す (`draft` は 11 件、`effective` は 9 件) → ランタイムを WSL-A に戻す。`effective` は 11 件になる (WSL から Windows のフォルダは越境で警告は出るが外れない)。起動ボタンは有効のままで、main の `isValidLaunchConfig` (`src/domain/session/launch-config.ts:165`) が `invalid-config` で拒否する。拒否の後は `lastConfig` (11 件) から開き直るので同じ状態がまた出る。拒否の文言は件数の超過に触れない
  - もう 1 つの現象: WSL-A → Win32 → WSL-A と切り替えると、「追加ディレクトリ X はこのランタイムから使えないため外しました」(`LaunchDialog.tsx:935-947`) と通知した項目が、選び直さなくても一覧に戻る
- **同種事象探索**: `MAX_ADDITIONAL_DIRECTORIES` で 6 件 (`src/agents/session-core.ts:10`, `:208` / `src/domain/session/launch-config.ts:111`, `:165` / `src/renderer/src/features/session/LaunchDialog.tsx:11`, `:896`)。renderer で件数を制限するのは `:896` の 1 か所だけで、`effective` の件数しか見ていない
- **リスク/影響**: FR-001「0〜10 個を選べなければならない」と US-1 AC5 が renderer で守られない。UI が有効と示した設定を main が理由の分からない拒否で返し、回復の手がかりが無い (PO-4 / PO-6)。外したはずの項目が黙って戻ると、FR-002 の「外して通知」と通知の文言が事実と食い違い、利用者が外れたと思っているディレクトリを Claude に扱わせたまま起動しうる
- **推奨アクション**: 次のどちらかにする。
  - (a) 追加ディレクトリの段で外した項目を下書きにも書き戻す。model / effort と同じく、1 回だけ通知して消す
  - (b) `full` と `onAdd` の判定を `draft.additionalDirectoryIds.length` にそろえ、`toLaunchConfig` (または `launchConfig` の条件) で件数が 10 を超えたら起動を保留する

  あわせて LaunchDialog.test.tsx に「外れた項目がある状態で追加 → ランタイムを戻す」の表のテストを足す
- **根拠**: spec FR-001 / FR-002 / US-1 AC3 / AC5、data-model §2.3
- **scope 根拠**: touched files (`LaunchDialog.tsx` / `launch-resolution.ts`) の中で直せる

### [Medium] 上限の入力が不正な間も、プリセットの保存には直前の有効な値が黙って使われる (M-001) (scope: feature)

- **観察**: `PresetPanel` に渡しているのは `current={config}` (`LaunchDialog.tsx:662`)。`config` は下書きから組み立てる (`:385-400`)。上限の入力が不正なときに下書きは更新されない (`:920-932`)。起動ボタンは `launchConfig` (`:445-455` の `limitsInvalid`) で止まるが、プリセットの保存は `config` が non-null であれば押せる。例: 「300」の後に「3000」(範囲外) にすると、画面には 3000 と範囲の文言が出たまま、保存されるのは 300
- **同種事象探索**: `current=\{config\}` で 1 件 (`LaunchDialog.tsx:662`)
- **リスク/影響**: FR-009 の保存値が画面と食い違い、後で適用したときに意図しない上限で起動する
- **推奨アクション**: `limitsInvalid` のときは `PresetPanel` に `null` を渡す、または保存ボタンを止めて理由を出す。テストに「不正な入力の間は保存できない」を足す
- **根拠**: spec FR-009、US-4 AC1
- **scope 根拠**: touched file (`LaunchDialog.tsx`) の中で直せる

### [Low] セッション名だけを変えた起動が、起動元の判定 (KPI「再利用率」) で「軸を手で変えた」に数えられない (L-001) (scope: feature)

- **観察**: `onSessionNameChange` は `update()` を通らないので `axisEdited` が立たない (`LaunchDialog.tsx:911-914`)。`lastConfig` が `preset` 起動だった場合に名前だけを変えて起動すると、起動元は `preset` を引き継ぐ (`:557`)。charter.md:226 の「軸を手で変えたら manual」と照らすと、名前を軸に含めるかどうかが文書で決まっていない
- **同種事象探索**: `setAxisEdited` で 1 件 (`LaunchDialog.tsx:489`)
- **推奨アクション**: 「名前は起動元の判定に数えない」と data-model か charter に 1 行書いて閉じる
- **根拠**: session charter KPI「再利用率」

### H (テスト / regression)

- H-001 / M-001 を検出するテストは無い。LaunchDialog.test.tsx:1697 は「10 件で押せない」の単純な場合だけ
- 実機の SC-009 は未実施 (quickstart-results.md:27-37)。spec の規則どおりなので新しい指摘にはしない

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `MAX_ADDITIONAL_DIRECTORIES` | 6 | src/agents/session-core.ts:10, :208; src/domain/session/launch-config.ts:111, :165; src/renderer/src/features/session/LaunchDialog.tsx:11, :896 |
| M-001 | `current=\{config\}` | 1 | src/renderer/src/features/session/LaunchDialog.tsx:662 |
| L-001 | `setAxisEdited` | 1 | src/renderer/src/features/session/LaunchDialog.tsx:489 |

## Verdict

- Critical: 0
- High: 1
- Medium: 1
- Low: 1
