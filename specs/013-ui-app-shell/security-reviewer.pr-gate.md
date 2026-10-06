# security-reviewer Review: アプリのシェルを目標レイアウトにする (O-7)

**Run**: 2026-10-06 (pr-gate Round 3)
**Reviewer**: security-reviewer
**Spec**: specs/013-ui-app-shell/spec.md
**Round**: 3 (R2 の修正の差分 `a78a291..bcd6aa4`)

結論: Critical 0 / High 0 / Medium 0 / Low 1 (L-003 の持ち越し。`/cl-done` で対応する予定)。R2 の指摘 4 件のうち 3 件は解消。R2 の修正による新しいセキュリティの問題は無い。

## 初回読了 viewpoint

- FR/SC: FR-001 (`AppShell.tsx:26` は research R-04 を参照。R-04 が正本 (research.md:54)。`protocol.ts` と CSP は不変) / FR-003・FR-004 (入れ子の provider の負の経路のテストが前提を確かめる。AppShell.test.tsx:989, :997) / FR-007 (`useDialogReturnFocus` は型付きの定数のセレクタで `querySelectorAll` し、隠れた印を飛ばす) / FR-008・US-3 AC2 (秘密のテストが閉じる前に値を確かめる。:880-883。設定のダイアログは閉じると unmount。`forceMount` は src/renderer/src に 0 件) / FR-015・US-4 AC5 (tasks FE-042 は双方向制御文字を domain が持つと書く) / SC-001 (`src/main/**`・`src/preload/**` は変更 0。新しい IPC・依存 0)
- touched files に該当する charter / Confirmation: ui charter の CSP の基線と AD-025 §7 (L-101)。AD-046 Decision 4 (`docs/prompts.md:94` の OPT-panel の起動文は厳しくなっただけで緩めていない)。Constitution Principle V (L-102)
- A. 認可 / 認証 / secret 管理 / プロセス境界の hardening: Critical:0 High:0 Medium:0 Low:0
- B. 入力検証 / injection / XSS / CSP / 暗号: Critical:0 High:0 Medium:0 Low:0
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当 (AD-025 §7 の CSP の文言は B で確認)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: security-reviewer は G を持たない
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

R2 の修正は renderer だけ (src 21 ファイル + reviewers.yml + docs/specs)。確かめた事実 (指摘にはしない):

1. `focusCenter` (`AppShell.tsx:79-85`) は定数の id を引き、定数の `tabindex="-1"` を付け、1 回の `blur` で外す。外部の値は DOM に届かない。クリックは今も `preventDefault` (ハッシュの遷移なし)
2. `useDialogReturnFocus.ts:54` のセレクタは `ShellAnchor` の union (`'settings' | 'new-session'`) だけから組む。呼び出し元は 2 つともリテラル。`CenterPane.tsx:43` の行き先は定数 `[data-center-primary]` で、空の状態のボタンにしか移らない (承認カードの許可 / 拒否には移らない)
3. 新しい `title`: `SessionListScreen.tsx:137` / `:403` は React の属性 (エスケープされ HTML の sink ではない)。子のテキストと同じ値で、新しく見せるものは無い。`cwdDisplay` は `normalize.ts:40-43` で双方向制御文字を除いた値。`SessionNavBadge` の `title` は件数と固定の文言だけ、`context` は定数。足した行に `dangerouslySetInnerHTML` / `innerHTML` / `openExternal` / `window.open` / `localStorage` / `ipcRenderer` / `console.` / `eval(` / `.style.` は 0 件
4. サイドバーを `hidden` でマウントしたままにした: 長く残るのは過去の区画の絞り込み・開いたグループ・スクロール・稼働中の行。`features/session-list` (テスト以外) に secret / password / token / apiKey は 0 件。Provider の秘密は設定のダイアログだけが持ち、閉じると unmount。Tailwind ^4.3.3 の preflight は `[hidden]` を `display:none !important` にするので、`flex` が上書きせず、隠れたボタンにはフォーカスも押下も届かない
5. テストの harness: `sendMock` は `sendPrompt` そのもので、`running-session-store.ts:485` が同期で呼ぶので `not.toHaveBeenCalled()` は意味がある。`'sk-plain'` は偽の値。`PointerEventsCheckLevel` は既存の `@testing-library/user-event` から
6. FE-042 が引く場所は実在する: `src/domain/session/build-normalize.test.ts:68` と `:112-128`、`src/domain/validation.ts:42-63`
7. reviewers.yml: 変えたのは ui-coverage-reviewer の pattern だけ。security-reviewer の行は不変

## R2 の指摘ごとの判定

| R2 ID | 判定 | 事実 |
|---|---|---|
| L-101 (AppShell.tsx:26 の CSP の文言) | **resolved** | 「失う CSS は research R-04」。research.md:51,54 が正本で、spec.md:160・roadmap.md:166 と一致 |
| L-102 (負の経路のテストの前提) | **resolved** | (1) :883 で `typed.value === 'sk-plain'` (2) :989 で外側の composer が `toBeEnabled()` (3) :997 で `sendMock` が `not.toHaveBeenCalled()` |
| L-002 (U+202E のテスト / FE-042 が完了のまま) | **resolved** (R2 の最小案) | tasks.md FE-042 は domain の正規化と入口の検査が持ち、シェルは DTO の値をテキストとして描くだけと書く。引いている場所とテストは実在 |
| L-003 (vitest-axe 0.1.0 の SEC-8 の結果が PR の説明に無い) | **unresolved** (予定) | PR の説明はまだ無い。`/cl-done` で確かめる |

## Findings

### [Low] (R1 から持ち越し) vitest-axe 0.1.0 の SEC-8 の確認結果が、まだ PR の説明に書かれていない (L-003) (scope: feature)

- **観察**: R2 の修正は package.json と lockfile を変えていない。PR の説明はまだ無い
- **同種事象探索**: 差分に新しい依存は 0 (r3-files.txt に package.json は無い)
- **リスク/影響**: 依存を承認した理由が PR に残らない
- **推奨アクション**: `/cl-done` で PR の説明に確認結果 (推移的な依存・install script が無いこと・使うのは `results.violations` だけ) を書く
- **根拠**: OWASP A06:2021、AD-023
- **scope 根拠**: 本 PR の説明で直す

## H 節

- 既存の境界は退行していない (preload / ipc / window / protocol の差分 0、新しい IPC 0)
- 秘密の寿命: 設定のダイアログは閉じると unmount し、テストが前提を確かめる (:880-893)。サイドバーをマウントしたままにしても、長く残る秘密は無い
- 入れ子の provider: 過去ログの確認の前に外側の composer が有効なことを確かめ、`sendPrompt` が呼ばれないことを確かめる (:989, :997)
- スキップリンク: `tabindex` の付け外しのテストがある。遷移を止めることのテストは今も無いが、止め損ねても main の window の規則で無害 (R2 と同じ)
- observability: CSP の違反を集める観測点は roadmap の system-scope (1) に持ち主付き (不変)

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-003 | (依存の差分) r3-files.txt の package.json | 0 | — |
| (L-101 の確認) | `失う` (src/renderer, specs/013, roadmap) | 4 | AppShell.tsx:26 (参照) / research.md:51,54 / spec.md:160 / roadmap.md:166 |
| (L-002 の確認) | `202[A-Ea-e]\|206[6-9]\|bidi\|双方向` (src/domain) | 多数 | validation.ts:42-63 / build-normalize.test.ts:68,112-128 / normalize.ts:40-43 |
| (確認) | `^\+.*(title=\|setAttribute\|removeAttribute\|querySelector)` (r3-src.patch) | 7 | SessionListScreen.tsx:137,403 / SessionNavBadge の title / AppShell.tsx:82-83 / CenterPane.tsx:44 / useDialogReturnFocus.ts:54 / テスト :358 |
| (確認) | `^\+.*(dangerouslySetInnerHTML\|innerHTML\|openExternal\|window\.open\|localStorage\|ipcRenderer\|console\.\|eval\(\|\.style\.\|href=)` (r3-src.patch) | 0 | — |
| (確認) | `forceMount\|keepMounted` (src/renderer/src) | 0 | — |
| (確認) | `password\|secret\|apiKey\|token` (features/session-list、テスト以外) | 0 | — |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 1
- Round inheritance: resolved from 2: 3 (L-101 / L-102 / L-002) / unresolved: 1 (L-003) / new: 0

(invoker 注: reviewer は英語で返したので、保存の際に日本語に直して要約した。ID・severity・file:line・根拠は原文のまま)
