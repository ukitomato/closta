# architecture-reviewer Review: Win32Runtime の直接起動 (X-8)

**Run**: 2026-10-21T00:00:00+09:00
**Reviewer**: architecture-reviewer
**Spec**: specs/020-session-win32-direct-launch/spec.md
**Mode**: default + ADR-drift
**Round**: 1 (pr-gate)

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-016、SC-001〜SC-006 (SC-001 / SC-004 は実機 V-1 / V-3 で決まる)
- 対象 files に当たる charter / Confirmation: session charter (:339-343)、runtime charter、AD-058 Decision 1〜7 と Confirmation、AD-036 §3 / §6、AD-018 §3 / §4、AD-043 Decision 5、AD-041 (e)、AD-025、AD-031、Constitution I / II / III / IV / V / VI / VII / XIV / XV
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:1 Low:1
- D. Constitution / ADR drift: Critical:0 High:1 Medium:1 Low:1
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当 (SC-001 / SC-004 の完了条件は D の H-001 で ADR 側から扱う)
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: database / a11y / ux / ui-coverage reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (ADR Confirmation の単体部分にはテストがある。WSL の回帰は 3660 passed、既存テストは書き換えていない。観測点は `[tree-stop]` / `[runtime-settings]` の固定の語)

## スコープ要約

`RuntimeLaunchSpec` を `WslLaunchSpec | Win32LaunchSpec` の和にし、main の infra/runtime が Win32 の起動の値・env・停止の指示を組み、agents は domain の定数と述語で検査して実行するだけ。AD-058 (accepted) を新設し、既存 ADR は「読み替える箇所」の表で読み替えた。**accepted の既存 ADR を in-place で書き換えた差分は 0 件**。レイヤの配置は AD-058 Decision 1 と Principle II / VII に合う。閉じる (`killSession`) とアプリの終了 (supervisor の `kind: 'kill'`, `supervisor-core.ts:225`) はどちらも `terminateNow()` → `stopTree()` に入る。

## Findings

### [High] AD-058 Confirmation と spec SC-001 / SC-004 は「V-1・V-3 は完了の前に必須」と書いている。一方で roadmap と _overview には「完了」と書いてあり、tasks.md の読み替えだけでこの必須の条件を外している (H-001) (scope: feature)

- **観察**: `docs/decisions/0058-win32-direct-launch-contract-and-process-tree-stop.md:68` (accepted)「V-1 と V-3 は完了の前に必須」、`spec.md:204` / `:207` も同じ。`tasks.md:96` (SH-012) は夜間の規則で「未実施と書いてマージしてよい」に読み替え、`quickstart-results.md:20` は V-0〜V-9 すべて未実施。それでも `docs/domains/_overview.md:72`「完了: 020 / AD-058」、`docs/roadmap.md:385`「実装は完了 …『未実施』としてマージ」。同じ PR に「必須」の字面が残る: `tasks.md:9` / `:109`、`plan.md:203`、`quickstart.md:6`。
- **同種事象探索**: 13 件 (上記)。
- **リスク/影響**: SC-004 と Decision 3 の「止まる」の行は単体テストでは順序と引数しか確かめていない。実機を確かめないまま「完了」と書くと、X-9 (roadmap:386) にとって前提済みとして固定される。正本 (AD-058 / spec) と記録 (roadmap / _overview) が逆のことを言っている。
- **推奨アクション**:
  1. (最小) `_overview.md:72` と `roadmap.md:385` の「完了」を「実装済み・マージ済み (AD-058 Confirmation の V-1 / V-3 は未充足)」に直し、merge 後の `completed` コミットは V-1 / V-3 が通るまで出さない。AD-058 と SC を変えずに夜間の規則と両立する
  2. V-1 / V-3 なしで完了にすることを利用者が選ぶ場合は後続 ADR (または利用者承認つきの SC の改定) に置く。AD-058 の Confirmation の in-place 書き換えは AD-031 が許さない
  3. tasks.md:9 / :109、plan.md:203、quickstart.md:6 の字面と食い違いが残らないことを確かめる
- **根拠**: AD-058 Confirmation、spec SC-001 / SC-004、AD-031、Constitution「改定手順」1
- **scope 根拠**: Critical にしないのは、実害の経路が無く、マージを許す利用者の決定が tasks.md:96 に記録されているため

### [Medium] AD-058 Decision 3 が X-6 に渡した「Win32 の保証しない行の実機観測」が、持ち主の X-6 の行に書かれていない (M-001) (scope: feature)

- **観察**: AD-058 Decision 3 は保証しない行の実機観測を X-6 に渡すが、`docs/roadmap.md:355` (X-6 の行) は Win32 / AD-058 に触れていない。
- **推奨アクション**: roadmap.md:355 に「Win32 (AD-058 Decision 3 の保証しない行。X-8 から)」の 1 句を足す。

### [Medium] `ResolvedCredential.configDirRuntimePath` の名前が RuntimePath と言いながら HostPath を持つ (M-002) (scope: feature)

- **観察**: `src/domain/provider/types.ts:153-154` を `HostPath | RuntimePath` に広げた。`helper-path.ts:72` の `ConfigDirResolution` も同様。
- **リスク/影響**: Principle XIV / AD-004 の取り違えの温床。
- **推奨アクション**: glossary の Counterexamples に注記を足す (最小) か、名前を改める。

### [Low] composition-root の transport の述語は 'win32' 以外の kind をすべて WSL の述語に倒す (L-001) (scope: feature)

- `composition-root.ts` の `isTransportForbiddenKey`。`switch` + `assertNever` にする。

### [Low] glossary の frontmatter が追随していない (L-002) (scope: feature)

- `docs/glossary.md:3` `last_updated: 2026-10-17`、`:5` `total_terms: 104` (見出しは 118 件)。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `完了の前に必須\|/cl-done\` の前に必須\|「未実施」としてマージ\|完了: 020` (docs/**/*.md, spec_dir/*.md) | 13 | docs/decisions/0058-…md:68 / spec.md:204, :207 / tasks.md:9, :96, :109 / plan.md:203 / quickstart.md:6 / docs/domains/_overview.md:72 / docs/roadmap.md:385 |
| M-001 | `Worker だけが異常終了` (docs/roadmap.md) | 1 | docs/roadmap.md:355 |
| M-002 | 未実行 (差分で見ただけ) | — | src/domain/provider/types.ts:153-154, src/domain/provider/helper-path.ts:72 |
| L-001 | 未実行 (差分で見ただけ) | — | src/main/app/composition-root.ts |
| L-002 | `^#### \*\*` (docs/glossary.md) | 118 | docs/glossary.md:3, :5 |

ADR-drift の要点: accepted の既存 ADR の in-place 編集は 0 件 (AD-031 に適合)。AD-058 Decision 1〜7 の内容の違反は無し。違反は Confirmation (H-001) と X-6 への引き渡し (M-001)。

## Verdict

- Critical: 0
- High: 1
- Medium: 2
- Low: 2
