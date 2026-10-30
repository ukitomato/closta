# ui-coverage-reviewer Review: 起動設定の残りの軸 — 追加ディレクトリ・上限・セッション名 (X-6 の 2 本目)

**Run**: 2026-10-30
**Reviewer**: ui-coverage-reviewer
**Spec**: specs/024-session-launch-axes/spec.md
**Round**: 1 (pr-gate, system scope, trigger: src/agents/**)

## 初回読了 viewpoint

- FR/SC: UC 観点に関わるのは FR-006 (上限に達したときの表示は O-4 の失敗の理由のまま)、FR-013 (概要のタブに起動時の追加ディレクトリと上限を出す)、FR-017 (docs の追随。対応表は含まれない)、SC-006 (概要のタブ)、SC-009 (実機。未実施でマージする規則)。
- touched files に該当する charter / Confirmation:
  - 対応表の機械照合 (AD-044 Confirmation、項目 21) の対象は SDK の型・tool・制御要求の集合。diff に `package.json` / `pnpm-lock.yaml` の変更は無い。`claude-agent-sdk` の語が diff に出る 5 箇所はすべて spec / research / plan の文書内で、版は 0.3.270 のまま。
  - `docs/ui-coverage.md` は diff に含まれない (`.pr-gate.diff` の `diff --git` 一覧で確認)。
  - ui charter の Out of scope (他 domain の操作 UI は対応表の対象外) は、起動ダイアログと概要のタブの新しい行の扱いに関わる。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の範囲。本 reviewer は対応表の行ごとの判断だけを見る
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲 (ui-coverage スライス): Critical:0 High:0 Medium:0 Low:1
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (後述)

## スコープ要約

024 は起動設定に 4 軸 (追加ディレクトリ / `maxTurns` / `maxBudgetUsd` / `title`) を足す。`src/agents/sdk-agent-session.ts` と `session-core.ts` で SDK の query options に載せ、`LaunchDialog` / `PresetPanel` / `OverviewTab` で選択と表示を行う。`docs/ui-coverage.md` はこの diff で一切変わっていない。plan.md:89 と plan.md:159 と plan.md:164 は「対応表の行は増えない」と明示しており、analyze.md:61 も同じ判断である。

以下の UC 観点を順に確認した。判断の誤りは見つからなかった。

- **UC-1 (表示の追加・変更と対応表の更新)**: 該当なし。diff が足す表示は 2 つあり、どちらも SDK が emit する情報の表示ではない。
  - 起動ダイアログの軸 (`LaunchExtraAxes.tsx`)。利用者が選ぶ起動設定の入力である。
  - 概要のタブの起動値 3 行 (`OverviewTab.tsx` の追加ディレクトリ・ターン数の上限・費用の上限)。値は renderer の起動 `config` から読み、SDK のメッセージ・ブロック・tool から来る値ではない。
  - agents の変換の分岐 (`decodeLaunchOptions`) は入力側 (launch 指示の decode) で、SDK の emit を描く分岐ではない。
  - `convert.ts` / `thread.aui.tsx` / `tool-registry.aui.tsx` は diff に無い。
  - 逆に「`実装済み` にしたのに描く実装が無い」行は、今回は行を一切変えていないので生じない。
- **UC-2 (SDK の版を上げる PR)**: 該当なし。SDK の版は変わっていない。`docs/ui-coverage.md` 冒頭の `SDK: @anthropic-ai/claude-agent-sdk 0.3.270` と plan.md の記述が一致している。
- **UC-3 (割当の種類の妥当性)**: 該当なし。
  - 上限に達したときの SDK の emit (`SDKResultMessage` の `error_max_turns` / `error_max_budget_usd`) は、A 節の SDKResultMessage 行 (`docs/ui-coverage.md:52`) と D 節の launch-failure 行 (`:202`、理由キー 18。3 つの上限を含む) が既に `実装済み: FailureBanner` で受けている。
  - 経路の `実行中` は実装と一致する。`labels.ts:54-55` と `LivePane.failure.test.tsx:209-210` で、理由の表示と再起動の導線がテストされている。
  - 今回の変更で理由キーは増減していない (`src/domain/session/agent-session.ts` の diff は型の追加だけ)。上限が実際に起動の入口から付けられるようになり、既存の行が実際に届くようになっただけで、行の割当は正しいままである。
- **UC-4 (行の Tier)**: 該当なし。行も Tier も変更されていない。
- **UC-5 (後続 feature への割当)**: 該当なし。
  - `docs/ui-coverage.md` の `後続:` の行は 2 行だけで、どちらも `後続: I-3` (:199 の Tier A と :254 の Tier B)。X-6 を指す `後続` は残っていない。
  - `X-6` の語は :87 / :285 / :303 / :334 / :339 / :353 / :360 の備考と F 節にあるが、割当ではなく申し送りの記述である。今回の diff はこれらの記述を新しく足していない。
  - roadmap の X-6 の行の「対応表の割当 (O-2 から)」の範囲は diff で 024 の範囲と結論が追記されているが、対応表の行の追加は無く、整合する。
- **UC-6 (対応表の対象の範囲)**: 該当なし。
  - 起動ダイアログの追加ディレクトリ・上限・名前は session の操作 UI で、charter の Out of scope に当たる。行にしていないのは正しい。
  - 概要のタブの追加ディレクトリと上限 3 行は起動の値の再掲で、`SDKSessionInfo` 系 (凡例の「行にしないもの」) と同じ扱いである。`docs/ui-coverage.md:30` は O-7 の概要の再掲を行にしない例外として書いている。
  - SDK が emit する情報を「他 domain の画面」として行から外した事例も無い。
- **UC-7 (完了の判定)**: 該当なし。
  - spec の frontmatter は `status: reviewing` で、完了の PR ではない。
  - 024 に割り当てた `後続` の行は元から無い。
  - M3 の完了の主張も diff に無い。
  - X-6 の行は roadmap 上で「後続の項目は残す」と書かれており、完了にされていない。

H については、この観点を検出するテストを確認した。上限の理由 → 表示の対応は `labels.test.ts:106-107` と `LivePane.failure.test.tsx:209-210` と `live-signals.test.ts:158,641` がカバーし、既存の振る舞いに対する regression の根拠になっている。対応表そのものは項目 21 が CI で照合する (code-gate の `check:constitution` は exit_code 0)。

## Findings

### [Low] E 節の `initialize` / `rename_session` の備考が、起動時の `title` の経路を記録していない (L-001) (scope: feature)

- **観察**: `docs/ui-coverage.md:219` の `initialize` 行は `表示不要: 内部制御`、`:223` の `rename_session` 行は「セッション名。SDK の `renameSession()` で書く (X-6 / 023)」とだけ書く。一方、024 の research.md:16 は、起動時の `title` が SDK の初期化の control request (`sdk.mjs:221`) で届くと記録している。その名前は稼働中の行と中央のヘッダに出る (spec FR-008)。
- **同種事象探索**: `Grep "title" docs/ui-coverage.md` で 0 件。`Grep "initialize" docs/ui-coverage.md` で 1 件 (`docs/ui-coverage.md:219`)。
- **リスク/影響**: `initialize` 行の `表示不要` 自体は、利用者が自分で入力した値を送るだけなので判断として誤りではない。ただし備考に起動時の名前の経路が無く、将来 `initialize` の payload を見直す人が、名前が表示されている事実を対応表から辿れない。Tier A の情報を隠しているわけではなく、実害は無い。
- **推奨アクション**: 次に対応表を直す機会に、`rename_session` 行の備考へ「起動時の名前は `title` (初期化の要求) で渡し、稼働中の行と中央のヘッダに出る (024)」を 1 句足す。
- **根拠**: `docs/ui-coverage.md` 凡例の「備考」の趣旨 (取り込んだ経路を残す)。AD-044 Decision 2 (迷う行は備考に理由を書く)。
- **scope 根拠**: `docs/ui-coverage.md` は本 feature の touched files の外。機械照合の対象でもない。Low なので gate では直さない (AD-050)。

## 同種事象探索 cascade summary

Critical の指摘は無い。参考として Low の探索結果を記す。

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `title` / `initialize` in docs/ui-coverage.md | title:0 / initialize:1 | docs/ui-coverage.md:219 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 1

補足: 本 PR は SDK が emit する新しい情報を表示せず、SDK の版も上げていない。そのため `docs/ui-coverage.md` を変えないという plan.md:89 / :159 / :164 の判断は、行ごとに確かめて妥当だった。上限に達したときの SDK の emit は既存の A 節 SDKResultMessage 行と D 節 launch-failure 行で受けられており、割当・Tier・経路に矛盾は無い。項目 21 の機械照合は code-gate で PASS している。
