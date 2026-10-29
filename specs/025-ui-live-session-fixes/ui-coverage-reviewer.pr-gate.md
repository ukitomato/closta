# ui-coverage-reviewer Review: 起動中のセッションの UI の手直し (O-13 / 025)

**Run**: 2026-10-30
**Reviewer**: ui-coverage-reviewer
**Spec**: specs/025-ui-live-session-fixes/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC: FR-004 (docs/ui-coverage.md の F 節と E 節の書き直し)、FR-010 (SDK を上げる手順への名前の表の照合)、FR-005〜007 (list_models の割当)、FR-016〜018 (`/resume`。Composer slash commands の行)、FR-014〜015 (右のパネル。使用量の情報が落ちないか)、SC-003。
- touched files に該当する charter / Confirmation:
  - AD-044 Decision 1〜3 と Confirmation: 後続の行の増減なし、M3 の条件に影響なし。
  - ui charter の Out of scope: ResumePicker は他 domain の操作 UI なので行にしない。
  - Constitution Principle XII / XV。
- 次の 3 件はこの PR の diff に無い。
  - `package.json` の SDK の版の変更
  - `後続:` の新規行
  - UI 系 feature の completed 化 (status は `reviewing`)
- A. 認可 / 認証 / secret 管理: 該当なし: owner は security-reviewer
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner は security-reviewer
- C. 業務不変条件 / Charter drift: 該当なし: owner は architecture-reviewer
- D. Constitution / ADR drift: 該当なし: owner は architecture-reviewer。対応表の行ごとの判断だけを G で見た
- E. User Story / SC / AC / UX: 該当なし: owner は po-reviewer / ux-reviewer
- F. 命名 / module / lint hookup: 該当なし: owner は convention-reviewer
- G. optional reviewer 範囲 (SDK の emit と表示の対応表): Critical:0 High:0 Medium:0 Low:3
- H. テスト / coverage / observability / regression: 該当なし: 対応表の判断は機械照合 (項目 21) で CI が常に見る。判断の誤りを検出する単体テストは構造上書けない。code-gate が項目 21 を含む check:constitution を通している (`.gate-verdict-code.json` の tracks.lint-agent.detectors)。

## スコープ要約

diff の `docs/ui-coverage.md` の変更は次の 3 点である。

- 手順 5 の追加
- E 節 3 行の書き換え (`set_permission_mode` / `set_model` / `list_models`)
- F 節 4 行の備考の書き換え (Composer model picker / Composer slash commands / Model selector / Settings)

`docs/roadmap.md` は O-13 の行を足し、I-1〜D-1 の順を振り直した。I-3 の行にある `対応表の割当 (O-2 から)` の記述は残っており、`後続: I-3` の持ち主の範囲は壊れていない。

実装は次のとおり行の記述と合っている。

- `supportedModels` は `src/agents/sdk-agent-session.ts:182,792` にある。
- `list_models` を `実装済み` にした根拠は実在する。
- `PERMISSION_MODE_NAMES` は `CenterBanners.tsx:94`、`OverviewTab.tsx:112`、`session/labels.ts:432-434`、`LiveSettingsControls.tsx:273` から参照されている。A 節の `SDKStatusMessage` の行 (権限モードの行・警告の帯) の記述と食い違わない。
- 使用量のタブは dl の格子を作り直しただけで、費用・トークン・ターン数・モデル別・拒否の件数は残っている (`UsageTab.tsx:63-130`)。

観点ごとの結果は次のとおり。

- UC-1: 表示の追加は `list_models`・権限モードの置き場所・`/resume` の 3 つ。いずれも行が更新されており、逆に `実装済み` なのに実装が無い行も無い。F 節の 1 件だけ漏れがある (L-001)。
- UC-2: 該当なし。SDK の版は変わっていない。`package.json` と `pnpm-lock.yaml` は touched files に無い。
- UC-3: Tier A の行を `表示不要` に変えた箇所は無い。`list_models` は `表示不要` から `実装済み` へ直った (妥当な方向)。経路の列と割当の書式に誤りがある (L-002)。
- UC-4: 行の Tier の変更は無い。`list_models` は B のまま、`set_*` は B のまま。F 節の Model selector は A のまま `未使用` で、理由は参照だけで書かれている (L-003)。
- UC-5: 新しい `後続` の行は無い。roadmap の O-13 の行に「対応表の割当」の記述は無く、持ち主の範囲を食う延期も無い。
- UC-6: 他 domain の値を行にしていない。ResumePicker や PastResumeBar の過去のセッションの一覧は行にしておらず、ui charter の Out of scope と合う。
- UC-7: 該当なし。status は `reviewing` で completed の PR ではない。割当先が O-13 の行は 0 件 (下の cascade の Grep で確認)。M3 の完了の条件の件数は変わらない。

## Findings

### [Low] F 節 Empty state の使い道に ResumePickerDialog の空の状態が無い (L-001) (scope: feature)

- **観察**: `src/renderer/src/features/session/ResumePickerDialog.tsx:10,142` が `EmptyState` を使い、「同じフォルダに過去のセッションが無い」(US-5 AC4) を出す。`docs/ui-coverage.md:305` の Empty state の使い道は、置き場所を列挙する形 (本体・サイドバー・ヘッダの検索バー・palette・起動ダイアログのプリセット・設定のダイアログ) である。ResumePicker は含まれず、備考も 025 に触れていない。
- **同種事象探索**: `ResumePickerDialog|EmptyState` を `docs/ui-coverage.md` で Grep し 1 件 (`:305`。ResumePicker の記載は 0)。
- **リスク/影響**: 使い道の列が実際の使い道より狭い。SDK の emit の表示の漏れではなく、F 節の置き場所の記録の不足なので影響は小さい。
- **推奨アクション**: `:305` の使い道に「過去のセッションを選ぶダイアログ (`ResumePickerDialog`。025)」を足す。
- **根拠**: `docs/ui-coverage.md` の凡例「使い道」。AD-044 Decision 5。
- **scope 根拠**: touched files (`docs/ui-coverage.md`、`ResumePickerDialog.tsx`)。

### [Low] E 節の `list_models` / `set_model` / `set_permission_mode` で割当の書式と経路の列が実態と合わない (L-002) (scope: feature)

- **観察**:
  - `docs/ui-coverage.md:228` は `実装済み:` の後ろが element 名ではなく文章で、凡例の `実装済み: <element> (<経路>)` の `(<経路>)` を欠く。
  - `:220` / `:221` / `:228` はいずれも composer の周りの選択に出す実装済みの行なのに、経路の列が `なし` である。凡例の `なし` は「表示していない」の意味である。
  - `set_*` の 2 行の割当には `(実行中)` があるので割当と経路の列が食い違う。この食い違いは 023 からの既存で、本 PR が行を書き換えたのに直していない。
  - 項目 21 は割当の先頭 (`実装済み:` ＋非空) しか見ないので機械照合は通る。
- **同種事象探索**: E 節で `実装済み` かつ経路 `なし` の行を Grep し、`:220`・`:221`・`:223` (rename_session)・`:228` の 4 件。`:252` (elicitation) も経路 `なし` だが O-10 の既存の行で本 PR の範囲外。
- **リスク/影響**: 項目 21 の出力の経路の集計で、表示している行が「なし」に数えられる。判断を誤らせる経路ではない。
- **推奨アクション**: `:228` の割当を `実装済み: composer の周りのモデルの選択 (実行中)` の形にし、説明は備考へ移す。E 節で表示を持つ行の経路を `実行中` に揃える。
- **根拠**: 凡例の 割当 / 経路の定義。AD-044 Decision 1。
- **scope 根拠**: touched files。`:220` / `:221` / `:228` は本 diff で書き換えた行。

### [Low] F 節 Model selector (Tier A) が `未使用` のまま、理由が参照だけで書かれていない (L-003) (scope: feature)

- **観察**: `docs/ui-coverage.md:339` は Tier A の行で、備考は「element は取り込まない (023 U-7 / 025 R-11)」と参照だけを置く。取り込まない理由は `research.md` R-06 / R-11 にある。凡例は「使わないと決めた element は、備考に理由と決めた feature を書く」と定める。`:285` と `:360` も同じ形である。
- **同種事象探索**: `025 R-11` を `docs/ui-coverage.md` で Grep し 3 件 (`:285` / `:339` / `:360`)。
- **リスク/影響**: Tier A を `未使用` にした判断が、対応表だけでは追えない。
- **推奨アクション**: `:339` に理由を 1 句足す。例: 「registry の element は安全 3 値と確定の規則を持たないため」。
- **根拠**: 凡例「使い道」の `未使用` の規則。AD-044 Decision 2。
- **scope 根拠**: touched files。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `ResumePickerDialog\|EmptyState` (docs/ui-coverage.md) | 1 | docs/ui-coverage.md:305 |
| L-002 | E 節で `実装済み` かつ経路 `なし` | 4 (本 PR の書き換え 3 + 既存 1) | docs/ui-coverage.md:220, 221, 223, 228 |
| L-003 | `025 R-11` (docs/ui-coverage.md) | 3 | docs/ui-coverage.md:285, 339, 360 |
| (確認用) | `後続: ` (docs/ui-coverage.md) | 割当先が O-13 の行は 0 | docs/ui-coverage.md:199 (I-3), 254 (I-3)。24 行目は凡例 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 3
- Round inheritance: N/A (round 1)

補足 (範囲外で本 reviewer は指摘しない)

- `.specify/memory/constitution.md` の Sync Impact Report (v1.5.0) は「改定手順 2 (人間のレビュー) は別の PR」と書く。roadmap の O-13 の行も同様の記述がある。一方で Constitution の改定本体はこの diff に入っている。整合の判断は architecture-reviewer の範囲として申し送る。
- `docs/ui-coverage.md:286` の使い道 `D composer (候補)` は、D 節に該当する行が無い。O-10 からの既存。
