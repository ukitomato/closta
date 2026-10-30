# architecture-reviewer Review: 起動設定の残りの軸 — 追加ディレクトリ・上限・セッション名 (X-6 の 2 本目)

**Run**: 2026-10-30T00:00:00+09:00
**Reviewer**: architecture-reviewer
**Spec**: specs/024-session-launch-axes/spec.md
**Mode**: pr-gate Round 1 (default + ADR-drift). base main / head 98db185

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-017 と SC-001〜SC-009 がすべて本 PR の対象。ARCH 観点で中心になるのは FR-003 (main の起動ゲートでの変換と拒否)、FR-005 / FR-007 (2 段の検証)、FR-011 (presets 版 2、write/read 対称)、FR-012 (再開時は `sessionName: null`)、FR-015 (AD-064 と pin テスト)、FR-016 (`ui-path-concat`)、FR-017 (glossary / charter / roadmap)
- touched files に該当する charter / Confirmation:
  - session charter の In scope (起動・再開・軸の依存解決・プリセット)、業務ルールの「上流の軸を変更したら下流を既定に戻して通知」、KPI「依存解決の正しさ (計測経路: E2E)」、Journey 2 / 4
  - AD-064 Confirmation 1〜4。16 キー pin、decoder の WSL-Windows パス拒否、起動ゲートの invalid-config、preset-store の版 1 読み替え / 名前を持つレコードの拒否は、テストがあることを確認済み
  - 読み替え対象の AD-041 (g)(h)、AD-042 D4、AD-059 D4、AD-062 Consequences、AD-036 §4 (P1 の正の構成)、AD-031 (訂正節の規則)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の owner
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:1 Low:2
- D. Constitution / ADR drift: Critical:0 High:1 Medium:0 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の owner
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner
- G. optional reviewer 範囲: 該当なし: presets.json 版 2 の互換性は database-reviewer (DB-2/3) の owner
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

`SessionLaunchConfig` を 6 キーから 10 キーに広げ、4 キーを追加する: `additionalDirectoryIds` / `maxTurns` / `maxBudgetUsd` / `sessionName`。同時に `QUERY_OPTION_KEYS` を 12 から 16 にする。AD-064 は本 PR で新規に作られ、accepted になったうえで 2026-10-30 の訂正節を持つ。

レイヤごとの配置は ADR と plan に沿っている (domain: 述語と依存解決 / agents: decoder と `buildQueryOptions` の assert / main: 起動ゲートで `resolveFolderRuntime` による変換と拒否、`checkResumeRequest` の `sessionName === null`、`checkPreset` は 9 キーの述語 / infra: preset-record の版 1/2 読み替えを store の内側に閉じた (AD-042 D4) / renderer: folder id だけを扱う)。AD-041 (h) の `ui-path-concat` に当たらないことは `tests/rule-fixtures/expected.mjs:801` に記録されている。

grep で確認: renderer の新しいモジュール 2 つは `@domain` と `@/components` だけを import / agents から main / renderer への import は無い / 失敗の理由の分類 (AD-047) は変更なし / AD-040 の settings の 2 キー射影は変更なし。

レイヤ違反は見つからなかった。指摘は、ADR の文面に残った事実の矛盾と、用語の数え方のずれに集中している。

## Findings

### [High] AD-064 の Decision 2 に「書き込みは今どおり権限モードと承認で決まる」が残り、同じ ADR の訂正節と research R-02a に矛盾する (H-001) (scope: feature)

- **観察**:
  - `docs/decisions/0064-launch-config-additional-directories-limits-and-title.md:37` (Decision 2) は「書き込みは今どおり権限モードと承認で決まる」と書いている
  - 同じファイル `:55` の訂正節は「skills の `allowed-tools` は、その skill が動いている間の承認を省く」を事実として認めている
  - 訂正節 `:52` は「Context の 2 つ目と Decision 2 の根拠の事実誤認を正す」と範囲を宣言しているが、`:37` のこの文は直していない
  - 同じ矛盾が次の 3 箇所にもある
    - `specs/024-session-launch-axes/research.md:28`: 「安全 3 値のどれでも、追加ディレクトリの中の書き込みが承認なしで通るようにはならない」(同じ行の末尾で allowed-tools を含む skills が読み込まれると書いている)
    - `specs/024-session-launch-axes/spec.md:54`: 「承認の経路 (`canUseTool`)・tool の集合を変えない。書き込みは今どおり権限モードと承認で決まる」
    - `specs/024-session-launch-axes/plan.md:77` (Constitution Check III)
- **同種事象探索**: Grep `allowed-tools` を specs/024 の *.md に対して 4 件 (research.md:28, research.md:49, quickstart.md:23, security-reviewer.design-gate.md:47)。Grep `書き込みは今どおり` は ADR:37 / spec:54 / plan:77 / research:28
- **リスク/影響**: AD-036 §4 は `allowedTools` を権限昇格面として名指しし、正の構成 (P1) で閉じた。skill の `allowed-tools: Bash(...)` / `Write` は承認なしの書き込みを開ける。`additionalDirectories` を加えたことで、作業フォルダの外の登録フォルダからその面が新しく入る。判断そのもの (U-10) は記録されているが、accepted ADR の Decision 本文が言い切ったままなので、後続の reviewer や I-3 の設計者が誤った前提から Principle III を評価することになる。決定の変更ではなく、事実誤認の訂正漏れである
- **推奨アクション**:
  - AD-064 の訂正節に 1 項を足し、Decision 2 の最後の文を次の趣旨に正す (AD-031 の訂正の範囲で書ける): 「書き込みは権限モードと承認で決まる。ただし追加ディレクトリの skills の `allowed-tools` は、作業フォルダの skills と同じく、その skill の実行中の承認を省く」
  - 同じ文言で `research.md:28`、`spec.md:54`、`plan.md:77` を直す
  - quickstart V-1 の手順 8 / 9 の扱いは今の記載のままでよい
- **根拠**: AD-031 Decision 1、AD-036 §4、AD-064 訂正節、Constitution Principle III の解釈
- **scope 根拠**: ADR と spec / plan / research はすべて本 PR の touched files

### [Medium] 「起動軸の数」の内訳が glossary と spec / AD-064 で食い違っている (M-001) (scope: feature)

- **観察**: どれも「9」と書くが内訳が違う
  - `docs/glossary.md:547` (Launch axis): 9 つ = X-4 の 6 + 追加ディレクトリ / ターン数の上限 / 費用の上限。「セッション名は軸ではなく起動のときの入力」
  - `spec.md:26` と `docs/decisions/0064-…md:17`: 「6 から 9 に増やす (追加ディレクトリ・ターン数と費用の上限・セッション名)」
  - `spec.md:201` (FR-007): 「「セッション名」の任意の軸を足し」
  - `docs/glossary.md:1053` (Session name の Counterexamples): 「軸」と呼びながら軸ではないと書いている
  - `docs/glossary.md:211` / `:220`: 選び直せる軸を 6 つ
- **リスク/影響**: Principle XIV の Ubiquitous Language の一貫性が崩れる
- **推奨アクション**: glossary の Launch axis を正本にし、spec Summary / FR-007 の「軸」を「入力」に、AD-064 Context の括弧を内訳に合わせて (訂正節で) 直す
- **根拠**: Constitution Principle XIV、glossary Launch axis

### [Medium] charter KPI「依存解決の正しさ」の計測経路 (E2E) に、追加ディレクトリの reset が入っていない (M-002) (scope: feature)

- **観察**: `docs/domains/session/charter.md:216` は KPI「依存解決の正しさ — 計測経路: E2E」。024 は依存解決に `directoryResets` の段と通知を足したが、`e2e/launch-extra-axes.spec.ts` の 4 本はどれも項目が外れて通知される経路を通らない
- **同種事象探索**: Grep `追加ディレクトリ|directoryReset` を e2e/ で 7 件、reset の文言への assert は 0 件
- **リスク/影響**: KPI の計測経路が新しい段を測っていない。SC-002 は unit 表で満たしているのでマージは止めない
- **推奨アクション**: E2E にランタイムを Win32 に切り替えて追加ディレクトリが外れ通知が出る手順を足す。偽の capability で足りないときは次の棚卸しに回す
- **根拠**: session charter KPI、spec US-1 AC3

### [Low] charter の Journey 4 の手順 2 が、選び直せる軸に追加ディレクトリを含めていない (L-001) (scope: feature)

`docs/domains/session/charter.md:136`。glossary Resume と spec FR-012 は含めている。「/ 追加ディレクトリ」を足す。FR-017、Principle XIV。

### [Low] roadmap の X-6 の行で「024 の範囲」が「(AD-064 予定)」のまま残っている (L-002) (scope: feature)

`docs/roadmap.md:355`。同じ行の結論は「AD-064 (accepted)」。

### [Low] 同じ未マージ PR で作った ADR に、訂正節を足して直している (L-003) (scope: system)

AD-064 は本 PR で新規作成なのに訂正節を足している。AD-041 `:31` は本文に畳み込んだ先例。規則は AD-031 の後続として未明文化。本 PR では今の形のままでよい。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `allowed-tools` (specs/024 *.md) と `書き込みは今どおり` | 4 + 4 | research.md:28, research.md:49, quickstart.md:23, security-reviewer.design-gate.md:47 / ADR 0064:37, spec.md:54, plan.md:77, research.md:28 |
| M-001 | `6 から 9\|9 つ\|の軸` | 5 | spec.md:26, spec.md:201, ADR 0064:17, glossary.md:547, glossary.md:1053 |
| M-002 | `追加ディレクトリ\|directoryReset` (e2e/) | 7 (reset の assert 0) | e2e/launch-extra-axes.spec.ts |

## Verdict

- Critical: 0
- High: 1
- Medium: 2
- Low: 3
