# ui-coverage-reviewer Review: 実行中のセッションの操作 (X-6 の最初の分割 / 023)

**Run**: 2026-10-28
**Reviewer**: ui-coverage-reviewer
**Spec**: specs/023-session-launch-axes-and-operations/spec.md
**Round**: 1 (pr-gate)

## 初回読了 viewpoint

- FR/SC:
  - FR-008 / FR-013 / FR-015 / FR-016 と SC-005 / SC-007 が対応表に影響する。
  - FR-003 / FR-007 は表示の元の値の決め方で、対応表の A・D 節の備考と関係する。
  - FR-012 (名前の表示) は対応表の行ではない。
- touched files に該当する charter / Confirmation:
  - `docs/ui-coverage.md` の E 節 4 行 (:219-222) と F 節 3 行 (:284 / :338 / :359)。
  - `docs/ui-coverage.md` の A 節 SDKStatusMessage (:55)・SDKSystemMessage (:52)・SDKConversationResetMessage (:86) と、D 節 meter (:204)。
  - roadmap の X-6 の行 (`docs/roadmap.md:355`)。
  - ui charter の Out of scope。session の操作 UI は行にしない。
  - AD-044 の Decision 2 (Tier) と Decision 4 (機械照合の範囲)。
- A. 認可 / 認証 / secret 管理: 該当なし: owner は security-reviewer
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner は security-reviewer
- C. 業務不変条件 / Charter drift: 該当なし: owner は architecture-reviewer
- D. Constitution / ADR drift: 該当なし: owner は architecture-reviewer
- E. User Story / SC / AC / UX: 該当なし: owner は po-reviewer
- F. 命名 / module / lint hookup: 該当なし: owner は convention-reviewer
- G. optional reviewer 範囲 (ui-coverage スライス): Critical:0 High:0 Medium:3 Low:3
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0
  - 項目 21 が E 節の行の集合と `後続: X-6` の 0 件を CI で見る。code-gate verdict は PASS。
  - 観測点として `quickstart-results.md` に項目 21 の出力の記録がある。
  - 下の Medium の 3 件 (備考と経路の列) は、機械照合 (項目 21) が見ない列なので、検出するテストは無い。

## スコープ要約

023 は `docs/ui-coverage.md` の E 節で `後続: X-6` だった 4 行を書き換えた。
- `set_permission_mode` / `set_model` / `rename_session` は `実装済み` (中央のヘッダの選択・「名前を変更」)。
- `set_max_thinking_tokens` は `表示不要` (SDK が deprecated。思考量は起動時の effort の軸、AD-041 (g))。
- F 節の Settings / Model selector / Composer model picker の備考に、照合の結果を足した。

`後続: X-6` はリポジトリの docs から 0 件になった (残りは M4 の I-3 の 2 行)。Tier は 1 行も変えていない (UC-4)。

コードとの対応 (UC-1):
- ヘッダの選択と名前の編集は `CenterHeader.tsx` / `LiveSettingsControls.tsx` に実装がある。
- `live-signals.ts` の `onPermissionModeApplied` は `meter` と権限モードの行を出す。
- `OverviewTab.tsx` は「現在のモデル」の行を足す。

したがって、`実装済み` と書いた行に描く実装が無い矛盾 (UC-1 の逆) は無く、割当の書き換えは妥当である。指摘は、行の割当そのものではなく、**周辺の行の備考と経路の列が実装に追随していない**ことに限られる。

## Findings

### [Medium] 新たに `実装済み` にした E 節 3 行の経路の列が `なし` のまま (M-001) (scope: feature)

- **観察**:
  - `docs/ui-coverage.md:219` / `:220` / `:222` は、割当が `実装済み: ... (実行中)` なのに、経路の列が `なし` のまま。
  - 凡例 (`docs/ui-coverage.md:28`) では、経路 `なし` は「表示していない」である。
  - 3 行とも中央のヘッダに実行中だけ表示する。`interrupt` (:216) と `can_use_tool` (:217) は、同じ形の `実装済み (実行中)` で経路が `実行中` になっている。
- **同種事象探索**: `実装済み: .*\(実行中\) \| なし` を `docs/ui-coverage.md` で探すと 4 件。
  - :219 / :220 / :222 は本 PR の 3 行。
  - :251 `elicitation` は O-10 からの既存で、同じ不一致を持つ。
- **リスク/影響**: 経路の列で「表示していない行」を数える読み手が、これら 3 行を未表示と誤読する。項目 21 は経路の列と割当の整合を見ない (AD-044 の機械照合の範囲外) ので、機械では落ちない。
- **推奨アクション**: :219 / :220 / :222 の経路を `実行中` に直す。`elicitation` の :251 は別の feature (O-10) の行で、本 PR の範囲外である。直すなら同時に。
- **根拠**: `docs/ui-coverage.md` の凡例 (経路)、UC-3。
- **scope 根拠**: 本 PR が書き換えた 3 行。

### [Medium] A 節 SDKStatusMessage / D 節 meter の備考が「アプリ自身の切り替え」という新しい発生源を書いていない (M-002) (scope: feature)

- **観察**:
  - `src/agents/live-signals.ts` の `onPermissionModeApplied` (diff 3577-3584 / 3590-3592) は、`setPermissionMode` の成功だけで `meter` の `permission-mode` と権限モードの行を出す。Claude Code の `status` / `init` が来る前に出るので、発生源が増えた。
  - 対応表の `SDKStatusMessage` (`docs/ui-coverage.md:55`) は、権限モードの行とヘッダの表示を Claude Code が報告した `permissionMode` の変化にだけ結び付けて書いている。
  - D 節 `meter` (`docs/ui-coverage.md:204`) の「A 節の result・assistant・rate_limit_event・status / init・thinking_tokens・tool_progress から運ぶ」にも、アプリ側の切り替えが入っていない。
  - 二重に出ない仕組み (基準との比較) も、備考に残っていない。
- **同種事象探索**: `permission-mode|権限モード` を `docs/ui-coverage.md` で探すと、:52 / :55 / :204 が権限モードの発生源を書く。いずれも 023 の発生源 (アプリが切り替えた成功) を書いていない (3 件)。
- **リスク/影響**:
  - 対応表は「この行の表示はどの出来事から出るか」の正本である。次に対応表を見る人が、発生源が Claude Code の報告だけと読む。
  - O-4 の quickstart V-4 #5 (`setPermissionMode` の後に `status` が来るか。未確認) の判断と、権限モードの行が二重にならない根拠が追えなくなる。
- **推奨アクション**: :55 の備考に「X-6 (023): 実行中の切り替えの成功も `meter` と権限モードの行を出す (`onPermissionModeApplied`。Claude Code の報告と基準を共有し、同じ値は二重に出さない)」を 1 文足す。:204 の発生源の列挙にも同じ参照を足す。
- **根拠**: UC-1 (表示の変更と対応表の更新)、AD-044。
- **scope 根拠**: 本 PR が `live-signals.ts` を変えている。

### [Medium] 構成のタブの `model` が、モデルを切り替えた後も起動のままで、中央のヘッダ・概要の「現在のモデル」と食い違う (M-003) (scope: feature)

- **観察**:
  - `src/renderer/src/features/shell/InitReportTab.tsx:138-139` は `report.model` (init の値。meter の `init-report`) を出す。
  - 本 PR は `live-signals.ts` で init-report のモデルを更新しておらず、`InitReportTab.tsx` も touched files に無い。
  - 一方、ヘッダ (`CenterHeader.tsx` の `currentModelId`) と概要のタブ (`OverviewTab.tsx` diff 8552-8559 の「現在のモデル」の行) は、切り替え後のモデルを出す。
  - 対応表の `SDKSystemMessage` (`docs/ui-coverage.md:52`) は、`model` を構成のタブに出すと書くだけで、切り替え後の扱いを書いていない。
- **同種事象探索**: `init-report-model|report\.model` を `src/renderer/src` で探すと、`InitReportTab.tsx:138-139` の 1 件。ほかにモデルを出す箇所は、本 PR が直したヘッダ (`CenterHeader.tsx` の `modelId` / `currentModelId`) と `OverviewTab.tsx`。
- **リスク/影響**:
  - 利用者がモデルを切り替えた後、右のペインの「構成」の「モデル」だけが古い値を出す。同じ画面で「現在のモデル」と食い違う。
  - 見出しは Claude Code が init で報告した構成なので、誤りとは言い切れない。ただし、そう読める印も備考もない。
  - 切り替えのたびに利用者が判断を誤る箇所ではないので、Tier A の情報の隠蔽 (Critical) ではない。
- **推奨アクション**: 次のどちらか。
  - (a) 構成のタブの `model` に「起動時のモデル」の見出しを付け、概要のタブの扱いと揃える。
  - (b) `docs/ui-coverage.md:52` の備考に「`model` は init の値で、実行中の切り替え (X-6 / 023) では更新しない。現在のモデルは中央のヘッダと概要のタブ」と書き、扱いを明示する。
  - 実機で `setModel` の後に init が再送されるなら、備考にその確認結果を書く (quickstart は未実施)。
- **根拠**: UC-3 (要素はあるが中身が最新でない)。Principle XII。
- **scope 根拠**: モデル切り替えの導入に伴う表示の整合。本 PR の範囲。

### [Low] F 節 Settings の備考に、古い「照合する」の句が残り、`set_max_thinking_tokens` の扱いを書いていない (L-001) (scope: feature)

- **観察**:
  - `docs/ui-coverage.md:359` の備考は「実行中のモデル・thinking の切り替え (E set_model / set_max_thinking_tokens。X-6) の候補 — X-6 で ... 合わせて照合する」を残したまま、末尾に「X-6 (023) で照合した」を足している。
  - 結果の文はモデルの切り替えの分だけを言う。thinking は E 節で `表示不要` と決めたのに、この行は触れていない。
- **同種事象探索**: `X-6 で .* 照合する` を `docs/ui-coverage.md` で探すと 2 件。
  - :302 Edit message — 本 PR の範囲外 (L-003 で扱う)。
  - :359 Settings — 本 PR の行。
- **リスク/影響**: 照合が完了した行に「これから照合する」が残り、読み手が未完了と誤読する。
- **推奨アクション**: 「候補 — X-6 で ... 照合する」を過去形に直し、「thinking は E `set_max_thinking_tokens` で `表示不要` (023 U-4)」と一言添える。
- **根拠**: 凡例の「備考: 取り込んだ element に手を入れたときは、何を変えたか」。
- **scope 根拠**: 本 PR が書き足した行。

### [Low] `実装済み` にした 3 行の備考に、実機未確認の旨がない (L-002) (scope: feature)

- **観察**:
  - `quickstart-results.md` (diff 2743-2745) は V-0〜V-6 を未実施 (SC-009) にしている。
  - ターンの実行中に権限モードを切り替えても中断しないこと (RK-02)、JSONL が壊れないこと (RK-03)、過去の一覧に出ること (RK-06) は未確認で、E 節の 3 行の備考にその旨がない。
  - 同じく実機の確認が未実施の O-12 の行は、備考に「実データに残るかは 022 quickstart V-4 (未実施)」と書いている (`docs/ui-coverage.md:58-60` ほか)。
- **同種事象探索**: `未実施` を `docs/ui-coverage.md` で探すと、O-12 の行に多数ある。本 PR の E 節の 3 行には 0 件。
- **リスク/影響**: 備考が実機で確認済みと読める。未確認の項目は `quickstart-results.md` と roadmap の X-6 の行にあるので、情報の欠落ではなく、書き方の揃えの問題である。
- **推奨アクション**: 3 行の備考に「実機の確認は 023 quickstart V-1〜V-3 (未実施)」を足す。
- **根拠**: 既存の備考の書き方に揃える。UC-3。
- **scope 根拠**: 本 PR の行。

### [Low] F 節の Edit message / Regenerate menu / Message branches の照合の持ち主が、roadmap の X-6 の行から見えない (L-003) (scope: feature)

- **観察**:
  - `docs/ui-coverage.md:302` / `:333` / `:352` は「fork と合わせて X-6 で照合する」「fork (X-6)」と書く。
  - 023 の spec (義務の扱い) は、この照合を X-6 の後続の分割に残すと決めた (diff 3114)。
  - しかし `docs/roadmap.md:355` の X-6 の行には、`Edit message` / `Regenerate menu` / `Message branches` の語が無い。`fork・rename・tag・delete` の中の fork として読めるだけである (roadmap に 3 語の出現は 0 件)。
- **同種事象探索**: `Regenerate|Edit message|Message branches` を `docs/roadmap.md` で探すと 0 件。
- **リスク/影響**: 後続の分割を起こす人が、F 節の 3 行の照合も自分の担当と気付けない恐れがある (AD-028 §5 の趣旨)。これらは `後続` の割当ではなく、項目 21 の機械照合の外の備考なので、重さは Low。
- **推奨アクション**: roadmap の X-6 の行の「上の残りの項目」に、「F 節の Edit message / Regenerate menu / Message branches の fork との照合」を 1 句足す。
- **根拠**: UC-5 の趣旨、AD-028 §5。
- **scope 根拠**: 本 PR が roadmap の X-6 の行を書き換えている。

## UC の確認 (該当なしの記載)

- UC-1: 表示の追加と対応表の更新は同じ PR にある。E 節 3 行の `実装済み` に対応する実装 (`CenterHeader.tsx` / `LiveSettingsControls.tsx` / `rename-session.ts`) が diff にある。周辺の備考の追随漏れは M-002 / M-003。
- UC-2: 該当なし: `@anthropic-ai/claude-agent-sdk` の版を上げる変更が diff に無い (`package.json` / `pnpm-lock.yaml` は touched files に無い)。
- UC-3: 上の M-001 / M-003 / L-002。`表示不要` の `set_max_thinking_tokens` の理由は、SDK の deprecated と effort の軸という二重の根拠があり、隠している Tier A の情報は無い。
- UC-4: 該当なし: 4 行とも Tier B のまま。diff に Tier の変更が 0 行 (`docs/ui-coverage.md` の hunk を読んだ)。
- UC-5: `後続` の新規の割当は無い。F 節の持ち主の記述は L-003。
- UC-6: 該当なし: 名前・権限モード・モデルは session の操作 UI で行にしていない。`SDKSessionInfo` の `customTitle` を行にしていない。
- UC-7: 該当なし: X-6 は完了にしていない (roadmap の X-6 の行は「最初の分割」の結論を足しただけ)。M3 の件数は、`quickstart-results.md` に項目 21 の `後続: X-6` が 0 と記録がある。

## 同種事象探索 cascade summary

Critical は 0 件なので、cascade_enforce の対象は無い。参考として Medium の探索を記録する。

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `実装済み: .*\(実行中\) \| なし` | 4 | docs/ui-coverage.md:219, :220, :222, :251 |
| M-002 | `permission-mode\|権限モード` (発生源の記述) | 3 | docs/ui-coverage.md:52, :55, :204 |
| M-003 | `init-report-model\|report\.model` | 1 | src/renderer/src/features/shell/InitReportTab.tsx:138-139 |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 3
- Round inheritance: 初回 (Round 1)。前 Round の指摘なし。
