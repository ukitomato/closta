# ui-coverage-reviewer Review: 026 session-live-auto-permission-mode

**Run**: 2026-11-01
**Reviewer**: ui-coverage-reviewer
**Spec**: specs/026-session-live-auto-permission-mode/spec.md
**Round**: 1 (pr-gate, system scope)

## 初回読了 viewpoint

- FR/SC: 対応表に関わるのは FR-009〜FR-011 (記録。data-model §11 が ui-coverage の書き換えを指定) と FR-005 (確認)、FR-008 (Auto の帯の文)、SC-005 (実機。未実施)。実装の根拠は plan.md の XII の項、data-model.md:271、spec.md:101 (拒否の表示は既存のまま使う)。
- charter / Confirmation: AD-044 (割当の種類・Tier)、AD-020 Decision 1 (`SDKPermissionDeniedMessage` は `auto` 分類器の拒否も運ぶ。0020:51)、AD-066 (proposed)。ui charter の Out of scope と照らし、確認ダイアログ (`AutoModeConfirmation`) を行にしなかった判断を見た。
- A. 認可 / 認証 / secret 管理: 該当なし: owner 外 (security-reviewer)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner 外 (security-reviewer)
- C. 業務不変条件 / Charter drift: 該当なし: owner 外 (architecture-reviewer)
- D. Constitution / ADR drift: 該当なし: owner 外 (architecture-reviewer)。AD-066 が proposed のままである件は architecture 側の領域
- E. User Story / SC / AC / UX: 該当なし: owner 外 (po-reviewer)
- F. 命名 / module / lint hookup: 該当なし: owner 外 (convention-reviewer)
- G. optional reviewer 範囲 (ui-coverage スライス): Critical:0 High:0 Medium:0 Low:3
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0。項目 21 は code-gate の check:constitution と quickstart-results.md の記録で ok。表の書式の変更は割当の列の `AutoModeBanner` の追加だけで、書式は崩れていない。Auto の帯の表示条件は `CenterBanners.test.tsx` が diff 内で扱っている。実機の裏取り (SC-005) は未実施と明記されている。

## スコープ要約

diff の `docs/ui-coverage.md` は 5 行の変更である。A 節 `SDKSystemMessage` (備考)、A 節 `SDKStatusMessage` (割当に `AutoModeBanner`、備考)、D 節 `meter` (割当に `AutoModeBanner`)、E 節 `set_permission_mode` (備考)。割当の種類・Tier・SDK の版・行の増減は変えていない。表の変更は data-model §11 の指定どおりで、実装 (`CenterBanners.tsx` の `AutoModeBanner` / `AutoModeAnnouncer` / `PermissionModeBanners`) が diff に存在する。

## UC 観点ごとの判定

- UC-1 (表示の追加と対応表の同時更新): 該当なし。
- UC-2 (SDK の版): 該当なし。
- UC-3 (割当の種類の妥当性): 該当なし (Low の記述の不一致を除く)。Auto の分類器の拒否は `SDKPermissionDeniedMessage` の行 (DeniedNotice) が受ける (AD-020 0020:51)。実機確認は quickstart V-3 (未実施)。
- UC-4 (Tier): 該当なし。
- UC-5 (後続の持ち主の範囲): 該当なし。
- UC-6 (対象の範囲): 該当なし。`AutoModeConfirmation` を行にしない判断は ui charter の Out of scope と合う。
- UC-7 (完了の判定): 該当なし。

## Findings

### [Low] A 節 `SDKStatusMessage` の備考が、帯の置き場所を `UnsafeModeBanner` だけに帰属させたまま Auto の帯の話を挟んでいる (L-001) (scope: feature)

- **観察**: `docs/ui-coverage.md:56` の備考で、括弧の中に Auto の帯を挟んだため、`AutoModeBanner` の置き場所が読み取れない。実際は `CenterBanners.tsx` の `PermissionModeBanners` が両者を出し分ける。
- **同種事象探索**: `UnsafeModeBanner` in `docs/ui-coverage.md` で 3 件 (`:53`, `:56`, `:205`)。
- **推奨アクション**: `:56` の備考を「…の警告の帯 (`UnsafeModeBanner`)。利用者が選んだ `auto` のときは `AutoModeBanner` (026)。どちらも中央のヘッダの下、`CenterBanners.tsx` の `PermissionModeBanners` が出し分ける」の形に直す。
- **根拠**: AD-044 の凡例。

### [Low] `SDKStatusMessage` / `meter` の割当に `AutoModeAnnouncer` が element として挙がっていない (L-002) (scope: feature)

- **観察**: `CenterBanners.tsx` の `AutoModeAnnouncer` (`role="status"` / `aria-live="polite"`) は独立した表示だが、`docs/ui-coverage.md:56` / `:205` の割当は `AutoModeBanner` だけ。
- **同種事象探索**: `Announcer` in `docs/ui-coverage.md` で 1 件 (`:130` の `TranscriptAnnouncer`)。
- **推奨アクション**: `:56` の備考に「Auto への切り替えは `AutoModeAnnouncer` が読み上げる」を足す。
- **根拠**: AD-044 の凡例。

### [Low] E 節 `set_permission_mode` の経路が `なし` のまま、割当に (実行中) と書いている (L-003) (scope: system。既存の書き方)

- **観察**: `docs/ui-coverage.md:220`。E 節の `set_model` / `rename_session` / `list_models` も同じ形。
- **同種事象探索**: E 節の `実装済み` で経路が `なし` の行 6 件 (`:220`, `:221`, `:223`, `:228`, `:252` ほか)。
- **推奨アクション**: 026 では直さない。マイルストーンの棚卸しで凡例に 1 行足すか値を揃える。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `UnsafeModeBanner` in docs/ui-coverage.md | 3 | docs/ui-coverage.md:53, :56, :205 |
| L-002 | `Announcer` in docs/ui-coverage.md | 1 | docs/ui-coverage.md:130 |
| L-003 | E 節の経路 `なし` の `実装済み` 行 | 6 | docs/ui-coverage.md:220, :221, :223, :228, :252 ほか |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 3
