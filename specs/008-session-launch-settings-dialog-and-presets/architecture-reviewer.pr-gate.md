# architecture-reviewer Review: X-4 (pr-gate round 3)

**Run**: 2026-10-01
**Reviewer**: architecture-reviewer (default mode と `--scope adr-drift` mode の両方)
**Spec**: specs/008-session-launch-settings-dialog-and-presets/spec.md
**Round**: 3

## 初回読了 viewpoint

- **FR/SC**: FR-001〜FR-017 と SC-001〜SC-010 を照合した。Round 3 で重点的に見たのは次のとおり。
  - FR-008 / SC-008 と US-3 AC1 (spec.md:128, 216-217, 364)。越境 DTO の消費の修正を見た。
  - FR-002 / SC-001。取得中は Provider を「既定」だけにする挙動が退行していないかを見た。
  - FR-013。`NODE_EXTRA_CA_CERTS` の解除と denylist の位置づけを見た。
- **touched files に該当する charter / Confirmation**:
  - session charter (L116, 135, 150-151)
  - provider charter (L100, 122-124, 141)
  - runtime charter (L6 `last_reviewed: 2026-10-01`、L169-170 の「AD-041 記録 2」)
  - AD-041 の全文 (採択の経緯 L30、(e) 2・3 L78-97、(h) L132-150、記録 L171-188)
  - AD-042 の全文 (採択の経緯 L24、Decision 4 L44-59、Consequences L61-69)
  - AD-031 Decision 1 と訂正 2
  - AD-016 (例外なく提示する)
  - AD-025 §1 (解決結果 DTO が正本)
  - constitution L845
- A. 認可 / 認証 / secret 管理: 該当なし: owner は security-reviewer
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner は security-reviewer
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:1
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:1
- E. User Story / SC / AC / UX: 該当なし: owner は po-reviewer
- F. 命名 / module / lint hookup: 該当なし: owner は convention-reviewer
- G. optional reviewer 範囲: 該当なし: owner は database / a11y / ux の各 reviewer
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1
  - **M-001 の修正を検出するテストはある。**
    - 取得中は保留: `LaunchDialog.test.tsx:402-410`
    - 失敗時に注記: `:416-420`
    - probe 完了後に取り直す: `:425-453`。blocked → cross で呼び出しが 2 回
    - unreachable で起動不可: `:457-468`
  - **L-002 の経路を検出するテストは 0 件。** 対象は「停止中ランタイム × blocked DTO」。既定の mock は停止中でも `resolutionDto('native')` を返すので (`:138`)、この組み合わせを通らない。
  - **`infra/settings` → `infra/runtime` の再 import を止める depcruise ルールは、まだ 0 件 (`.dependency-cruiser.js`)。**
    - 現状、`infra/runtime` を import する本番コードは `composition-root.ts:20-22` の 1 箇所だけである。
    - Round 2 の System follow-up に持ち主として載っているので、ここでは数えない。
  - 既存 regression の根拠: invoker が報告した次の検証。
    - lint / typecheck (node・web・e2e) / depcruise / check:constitution
    - unit 1511 / build / E2E 8
    - test:rules: Round 2 以降は規則定義と fixture に変更が無いので、再実行していない。

## スコープ要約

対象は `.pr-gate-scope.txt` の 141 件である。Round 2 からの差分は次のとおり。

- **AD-041 / AD-042 の再採択。**
  - 決定の変更は Decision 本文に畳み込んだ。
  - 冒頭に「採択の経緯」を置いた。
  - AD-041 は事実を末尾の「記録」節に分けた。
  - AD-042 は残存リスクを Consequences に置いた。
- **`NODE_EXTRA_CA_CERTS` の禁止を解除した。**
  - `forward-env.ts:43-76`、AD-041:92
  - テストは許可側へ移した (`forward-env.test.ts:100`、`launch-spec.test.ts:235-240`)。
- **denylist の位置づけを明記した。** 「代表例を塞ぐもので、クラスを原理的に閉じない」(AD-041:95、`forward-env.ts:84-85`、glossary:297)。
- **LaunchDialog での越境 DTO の消費。**
  - キーに state と probeState を入れた (`:191-195`)。
  - 取得中は起動を保留する (`:244-247`)。
  - unreachable は起動不可にした (`:245-247, 613-621`)。
- **文書の追随。** quickstart / tasks (BE-040 / BE-041 / FE-040) / roadmap の X-6・X-7・I-1 行 / plan 行 21 / charter / 007 contracts / glossary。

5 層の依存方向は悪化していない。

## Round 2 指摘の判定

| R2 ID | 判定 | 根拠 |
|---|---|---|
| H-001 | **resolved** | 「追記」節は 0 件。0042:45 の「UI 通知は X-6」は消え、Decision 4 (0042:53-56) に「1 行表示は X-4、一覧と復元は X-6」と書かれた。roadmap.md:188 と plan.md:129 もこれに一致する。決定の変更 6 項目の行き先: 0041 (e) 2 → L82、(e) 3 → L84-97、(f) の読み替え → L113、(h) → L132-150、0042 の今後の規則 → L59。事実の記録は 0041:171-188 に分けた。旧「追記 N」への参照が残っていないことも確かめた (docs / src / spec・plan・tasks・quickstart で 0 件)。形式の残課題は L-001 に分けた |
| M-001 | **resolved** | (1) 取得中は `launchConfig = null` (`LaunchDialog.tsx:244-247`)。(2) キーに `selectedRuntimeState` と `selectedProbeState` を含めた (`:191-195`)。(3) unreachable は「不明」と分け、起動を止める (`:595-621`、labels.ts:183-184)。どれもテストがある (H を参照)。越境 (`cross`) の起動は止めておらず、FR-008 / SC-008 の「警告のみ」と整合する。DTO の値を正本として読み、規則を再定義していないので、AD-025 とも整合する。`reachability` の 3 値目 (`blocked`) の扱いは L-002 に分けた |
| L-001 | **resolved** | quickstart-results.md:28 は「renderer 単体で確認。E2E の stub は DTO を返さない」と事実どおりになった。:57-59 は X-7 の繰越への pointer になった。tasks.md:251, 254 も整合する |
| L-002 | **resolved** | roadmap.md:224 の I-1 行に和集合の作り直しが載り、AD-041 (h) L148-150 も同じ内容である。plan.md:129 と roadmap.md:188 は「件数表示は X-4、一覧と復元は X-6」になった。provider charter:122-124 と session charter:150-151 の本文に Related ADRs が入った。runtime charter の last_reviewed は 2026-10-01 になった |
| L-003 | **resolved** | 007 contracts provider-registration.md:22 に行を足した。契約の DTO 3 フィールドは `dto.ts:28-32` と一致する。tasks.md:264 に BE-040 がある |

## Findings

### [Low] 「未マージ ADR の再採択」と「記録」節が AD-031 に定義されておらず、根拠が 0041 / 0042 の本文にしか無い。frontmatter の `date` も初回採択日のまま (L-001) (scope: system)

- **観察**:
  - 0041:30 と 0042:24 は、「本 ADR は main に入る前なので、決定の変更は本文に畳み込んだ」と述べている。0041:173 は「記録」節について「AD-031 の区分に従う」と書いている。
  - しかし AD-031 (0031:99-107) が定義する区分は 2 つだけである。
    - 事実誤認の訂正 → in-place の「訂正」節
    - 決定の変更 → 後続 ADR
  - 次の 2 つは、どちらも AD-031 の表に無い。
    - **未マージの間は accepted ADR の Decision を書き換えてよい**という例外
    - **残存リスクと Confirmation の実施状況を記録する**節 (誤認の訂正ではない)
  - 「AD-031 の区分に従う」は、厳密には事実と合わない。
  - frontmatter はどちらも `date: 2026-09-30` のままで (0041:3、0042:3)、再採択日 (2026-10-01) は本文にしか書かれていない。
  - 再採択の中身は、Round 2 の最小案と決定者の選択に沿っている。0041 / 0042 は HEAD 9398450 に存在しないので、公開済みの決定履歴は書き換わっていない。**AD-031 の目的には反していない**ので、Low にとどめる。
- **同種事象探索**:
  - `採択の経緯|再採択` (docs/decisions): 2 件 (0041:30、0042:24)
  - `^## 記録` (docs/decisions): 1 件 (0041:171)
  - 既存の 0001-0040 には、どちらも 0 件
- **リスク/影響**:
  - 例外の条件 (「main に入る前」) が、適用した当の ADR の中にしか書かれていない。次の起票者や reviewer はこれを規則として参照できない。
  - その結果、マージ済みの ADR にも「再採択」が使われるか、毎回 gate で同じ議論が繰り返される。
  - frontmatter の `date` だけを見る集計では、再採択が見えない。
- **推奨アクション**:
  - **最小案 (本 PR、任意)**: 0041 / 0042 の frontmatter に再採択日を 1 行足す (例: `readopted: 2026-10-01`)。0041:173 の「AD-031 の区分に従う」は、「AD-031 の訂正節ではなく、決定を含まない事実の記録である」に言い換える。
  - **system follow-up**: AD-031 の後続 ADR (または reviewer-base L19-21 の注記) に、次の 2 点を明文化する。
    - 未マージの ADR は、決定者の再採択で本文を改めてよい。
    - 決定を含まない「記録」節を認める。
  - AD-031 自体は in-place で直さない (決定の変更にあたるため)。
- **根拠**: AD-031 Decision 1 と訂正 2、reviewer-base L19-21、ARCH-3。
- **scope 根拠**: 規則の正本 (AD-031 / reviewer-base) は本 PR の範囲外にある。本 PR で直せるのは frontmatter と文言 1 行だけである。

### [Low] 解決結果 DTO の `blocked` を「判定できませんでした。起動はできます」に畳んでいる。停止中ランタイムでは、同時に出る runtime-stopped blocker と矛盾する (L-002) (scope: feature)

- **観察**:
  - `LaunchDialog.tsx:595-606` は、`ready` かつ unreachable でなく、`boundary === 'unknown'` なら、`CROSS_BOUNDARY_LABELS.unknown` を出す。文言は labels.ts:180-181 の「…判定できませんでした…起動はできます」である。
  - `reachability: 'blocked'` の DTO はすべてこの条件に入る。`blocked` は `resolution.ts:46-58` で `boundary: 'unknown'` を持つためである。
  - **停止中の場合**:
    - 検出直後の WSL ランタイムは `pathMapping: null` で (`wsl-detector.ts:133`)、停止中は `blocked('distro-not-running', ['start-distro','rescan-runtimes'])` になる (`resolution.ts:143-144`)。
    - 同じ画面には、`resolveLaunchAxes` の `runtime-stopped` blocker が出る (`:623-630`)。
    - 「起動はできます」と「停止中で起動できない」が並んで表示される。
  - **probe 前で実行中の場合**:
    - `capabilities-not-probed` のときは起動ボタンが有効になる。
    - Windows フォルダなら、main の `resolveCwd` が `pathMapping === null` で null を返し、`launch-failed` になる (`composition-root.ts:397`、`launch-preparation.ts:126-127`)。
    - M-001 の修正で probe 完了後に取り直すようになったので、この窓は短くなっている。
  - DTO の `blockedReason` / `resolutionSteps` (AD-025 の正本) は、ダイアログでは読まれていない。
- **同種事象探索**:
  - `blockedReason|resolutionSteps` (LaunchDialog.tsx): 0 件
  - `reachability === 'blocked'` (LaunchDialog.tsx): 0 件
  - テストの `blockedDto()` は `capabilities-not-probed` の 1 種類だけで (`LaunchDialog.test.tsx:163-167`)、`distro-not-running` × 停止中ランタイムのケースは 0 件
- **リスク/影響**:
  - 実害は表示の矛盾にとどまる。停止中は blocker で起動が止まるので、誤って起動する経路は無い。
  - ただし `blocked` は、アプリ起動直後に全ランタイムが停止している、という恒常的に通る状態で現れる。M-001 で unreachable を「不明」から分けたのと同じ種類の取りこぼしである。
- **推奨アクション** (最小案):
  - `blocked` のときは `cross-boundary-unknown` を出さない。
    - `runtime-stopped` blocker が出ているときは何も出さない。
    - `capabilities-not-probed` / `probe-failed` のときは、`checking` 相当 (「確認しています…」) で起動を保留する。
  - 停止中ランタイム × `distro-not-running` DTO のテストを 1 本足す。
- **根拠**: AD-025 §1 (DTO が正本)、AD-016、spec FR-008。
- **scope 根拠**: LaunchDialog.tsx / labels.ts は touched files である。

## 依頼 2 点への回答 (要約)

1. **再採択の形と AD-031**:
   - 中身は AD-031 の境目に沿っている。決定の変更は Decision 本文にあり、事実だけが記録節にある。
   - 0042 の本文と旧追記の矛盾も解消した。
   - 0041 / 0042 は未マージなので、公開済みの決定履歴は書き換わっていない。
   - 残るのは形式面だけで、規則の正本 (AD-031) に「未マージの再採択」と「記録」節の定義が無い (L-001、Low、system)。
2. **越境 DTO の消費と FR-008 / AD-016 / AD-025**:
   - 取得中は保留、probe 後に取り直す、unreachable は起動不可、という 3 点は整合している。
   - 越境 (`cross`) の起動は止めておらず、FR-008 / SC-008 の「警告のみ」は保たれている。
   - unreachable を止めるのは越境の規則ではなく到達不可の扱いなので、FR-008 とは衝突しない。main は同じ組み合わせを `launch-failed` で拒否するので、renderer はその先回りになっている。
   - 取りこぼしは `blocked` の 1 値だけである (L-002)。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `採択の経緯\|再採択` (docs/decisions) | 2 | 0041:30 / 0042:24 |
| L-001 | `^## 記録` (docs/decisions) | 1 | 0041:171 |
| L-001 | 旧「追記 N」への参照 (docs / src / 008 の spec・plan・tasks・quickstart) | 0 | — |
| L-002 | `blockedReason\|resolutionSteps` / `reachability === 'blocked'` (LaunchDialog.tsx) | 0 / 0 | — |
| L-002 | `blockedDto` (LaunchDialog.test.tsx) | 1 (capabilities-not-probed のみ) | LaunchDialog.test.tsx:163-167 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 2
- Round inheritance: resolved from 2: 5 / unresolved: 0 / new: 2

主な参照ファイル:
- C:\dev\closta\docs\decisions\0041-x4-launch-config-on-x1-launch-gate.md
- C:\dev\closta\docs\decisions\0042-provider-type-refinement-and-d4-lapse.md
- C:\dev\closta\docs\decisions\0031-adr-in-place-corrections-and-principle-ix-scope.md
- C:\dev\closta\src\renderer\src\features\session\LaunchDialog.tsx
- C:\dev\closta\src\renderer\src\features\session\LaunchDialog.test.tsx
- C:\dev\closta\src\renderer\src\features\session\labels.ts
- C:\dev\closta\src\domain\workspace\resolution.ts
- C:\dev\closta\src\main\infra\runtime\wsl-detector.ts
- C:\dev\closta\src\domain\provider\forward-env.ts
- C:\dev\closta\specs\008-session-launch-settings-dialog-and-presets\quickstart-results.md
- C:\dev\closta\specs\008-session-launch-settings-dialog-and-presets\tasks.md
- C:\dev\closta\specs\007-provider-registration-and-reachability\contracts\provider-registration.md
- C:\dev\closta\docs\roadmap.md
