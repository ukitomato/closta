# a11y-reviewer Review: フォルダ登録とランタイム検出 (R-1)

**Run**: 2026-09-16
**Reviewer**: a11y-reviewer
**Spec**: `specs/001-runtime-folder-registration-runtime-detection/spec.md`
**Round**: 2 (pr-gate Round 2 / 前 round は code-gate iteration 2)
**Diff scope**: `git diff main...HEAD` (207 files / +41,799 / -183) 全域。UI は `src/renderer/**` + `src/renderer/index.html`、加えて pr-gate scope として `src/main/app/window.ts` / `eslint.config.mjs` / `.specify/memory/constitution.md` / `manual-checklist.md` / `quickstart-results.md` を見た

> **本ファイルの保存経緯**: `a11y-reviewer` は reviewer-base §5 の read-only 規定により
> `Read` / `Grep` / `Glob` のみを持ち `Write` を持たない。reviewer の最終報告を pr-gate が保存した。

## 初回読了 viewpoint

- FR/SC: FR-047 (日本語第一言語)、FR-013 / FR-017 / FR-018 / FR-019 (登録 UI 導線)、FR-028 / FR-030 / FR-031 (選択肢と越境案内)、FR-009 (不足依存の導線)、FR-010 (再検出は明示操作)、SC-004 / SC-006 / SC-007 / SC-011 / SC-013 / SC-015 が renderer 側の表示要件。**a11y 固有の FR / SC は spec に 1 件も無い** (WCAG への言及ゼロ) — 本レビューは Constitution Principle VIII の Manual 検証者としての立場で行う
- touched files に該当する charter / Confirmation: `docs/domains/ui/charter.md`、Constitution **Principle VIII** (NON-NEGOTIABLE。Verification の Manual に `a11y-reviewer` を名指し)、**Principle XIII** (独自デザイントークンを足さない)
- A. 認可 / 認証 / RLS: 該当なし: security-reviewer の Owner 範囲
- B. 入力検証 / injection / 暗号: 該当なし: security-reviewer の Owner 範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の Owner 範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の Owner 範囲。N-003 は同 cat の**観察事実提供**として出すが severity 判定の owner は architecture に譲る
- E. User Story / SC / AC / UX: 該当なし: po-reviewer / ux-reviewer の Owner 範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の Owner 範囲。a11y lint は G / H で扱う
- G. DB / API / **a11y** / perf / OpenAPI / UX state: Critical:0 High:3 Medium:9 Low:5
- H. テスト / coverage / observability / regression: Critical:0 High:2 Medium:2 Low:1

## スコープ要約

依頼の前提 (「直近 3 コミットは `src/renderer/` を 1 ファイルも触っていない」) を**独立に検証し、正しいと確認した**。したがって前回 17 件の再掲はせず解消判定の表に畳み、pr-gate scope で新たに見えるものに注力した。**Critical は 0 件**。新規 High 3 件はいずれも「Principle VIII (NON-NEGOTIABLE) を守っているのは Manual の 2 者だけ」という状態の帰結であり、うち N-001 は**実コードの欠陥**、N-002 は**検証の不在**、N-003 は**adoption metadata が HEAD で偽**である。

---

## 0. 前提検証 — UI は code-gate iteration 2 時点から変わっていない

`git` を叩けない (Bash 無し) ため、**前回報告した `path:line` を HEAD の実ファイルで 1 件ずつ突き合わせる**方法で検証した。全 17 findings の引用箇所が**行番号まで一致**する。

| 検証した箇所 | HEAD の実測 | 一致 |
|---|---|---|
| `components/ui/button.tsx:7` の `focus-visible:ring-ring/50` | 同一 (cva 1 本のまま) | ✓ |
| `assets/main.css:104` `--ring: oklch(0.705 …)` / `:130` dark 側 | 同一 | ✓ |
| `WorkspaceFoldersScreen.tsx:341` / `:349-351` / `:398-417` / `:432` / `:470` | 同一 (`aria-busy` のまま、`key={entry.path.value}`、フォーカス移送なし) | ✓ |
| `App.tsx:38` / `:57-63` / `:66-70` | 同一 | ✓ |
| `ChatScreen.tsx:42` / `:45-54` / `:64-75` | 同一 | ✓ |
| `index.html:7` (`<html lang="ja">`) | 同一 | ✓ |
| `thread.aui.tsx:118,238,280,285,334,340,460` / `dialog.tsx:74` の英語文字列 | 同一 (8 件すべて残存) | ✓ |
| `ResolutionScreen.tsx:54` / `:76` / `:287` | 同一 | ✓ |
| `error-state.tsx:78` / `loading-state.tsx:56` | 同一 | ✓ |
| `RuntimeListScreen.tsx:125` `label="判定中"` / `:179` | 同一 (前回 `:124` と書いたのは 1 行ずれの誤記) | ✓ |
| `eslint.config.mjs` / `package.json` の `jsx-a11y` / `axe` | **0 件** | ✓ |

**結論: 前提は正しい。** 直近 3 コミットの成果物は `scripts/rules/run.mjs` / `scripts/constitution/check.mjs` / `tests/rule-fixtures/**` / gate 成果物であり、UI に届いていない。

---

## 1. 前回 (code-gate iteration 2) findings の解消判定 — 17 件すべて未解消

**解消 0 件 / 未解消 17 件。** 上表の一致がその根拠であり、1 件ずつの再掲はしない。

| ID | 前回 severity | 判定 | 本 round での扱い |
|---|---|---|---|
| H-001 フォーカスリング ≒1.5:1 | High | **未解消** | High 継続。`features/` の `<Button>` 15 件が `button.tsx:7` の cva 1 本を経由する構造も不変 |
| H-002 ブラウズ移動時のフォーカス喪失 | High | **未解消** | High 継続。`:349-351` のコメントは依然「解決した」と宣言しているが、`:398` の `key={entry.path.value}` による全 `<li>` 差し替えは不変 |
| M-001 `lang="ja"` 下の英語文字列 | Medium | **未解消** (8 件全残) | **Medium 維持**。理由は §3-(2) |
| M-002 `h1` 不在と見出し階層 | Medium | **未解消** | Medium 継続 |
| M-003 RuntimeList / Resolution に live region 無し | Medium | **未解消** | Medium 継続 |
| M-004 入力欄の境界 ≒1.2:1 | Medium | **未解消** | Medium 継続 |
| M-005 `BoundaryBadge` の「同一」が 4.5:1 未満 | Medium | **未解消** | Medium 継続 |
| M-006 `ErrorState` 詳細文 ≒2.7:1 | Medium | **未解消** | Medium 継続 |
| M-007 ファイル項目が `<button disabled>` | Medium | **未解消** | Medium 継続 |
| M-008 a11y 回帰の自動経路 0 件 | Medium | **未解消** | Medium 継続 + **N-005 を付帯条件として追加** |
| M-009 画面切替でフォーカス移動も通知も無し | Medium | **未解消** | Medium 継続 |
| L-001 composer と `role="note"` が未結合 | Low | **未解消** | Low 継続 |
| L-002 `role="alert"` の複数同時 mount | Low | **未解消** | Low 継続 |
| L-003 テーマ切替ラベル | Low | **未解消** | Low 継続 |
| L-004 `GenerationLoader` ラベル ≒4.4:1 | Low | **未解消** | Low 継続 |
| L-005 同一文言エラーの再読み上げ | Low | **未解消** | Low 継続 |
| L-006 IME 回帰テストが自明に通る | Low | **未解消** | **Low 維持**。§3-(1) で追加検証あり (格上げはしない) |

---

## 2. Findings (pr-gate scope の新規)

### [High] `--font-mono` に CJK フォールバックが無く、Principle VIII の ✗ Bad 例に該当する表示経路が 8 箇所ある (N-001) (scope: feature)

- **観察**: `src/renderer/src/assets/main.css:45-46` —
  - `:45` `--font-sans: system-ui, 'Segoe UI', 'Yu Gothic UI', 'Hiragino Sans', 'Noto Sans JP', sans-serif` — **日本語 3 ファミリを意図して足している**
  - `:46` `--font-mono: ui-monospace, 'Cascadia Mono', 'Consolas', monospace` — **CJK 等幅が 1 つも無い**

  `surfaces.tsx:45` が `export const mono = "font-mono text-[11px] tracking-tight"` を定義し、これを**日本語を含みうるパス / ディストロ名の表示に 8 箇所**適用している: `WorkspaceFoldersScreen.tsx:141` (登録済みフォルダのパス) / `:341` (ブラウズ中の現在地) / `:520` (復元できなかった登録のパス) / `RuntimeListScreen.tsx:120` (runtime id) / `:232` (`issue.rawName` — 列挙できなかったディストロの生の名前) / `ResolutionScreen.tsx:88` (推奨配置先) / `:118` (解決後パス) / `RuntimeListScreen.tsx:81` (文書パス)。
- **同種事象探索**: `font-mono|--font-mono|mono,` (`src/renderer/src`) で **26 件**、うち `mono` トークンの適用は features 配下 8 件 + 生成物 (`data-table.tsx` / `file-tree.tsx` / `markdown-text.tsx`) 6 件。`main.css` は `GENERATED_FILES` (`eslint.config.mjs:73-77`) に**含まれない**ため、`:45-46` は**プロジェクトが手で書いた行**である (ファイル冒頭 `:6-7` が「Next.js 固有のフォント変数だけを外し OS の標準スタックに置き換えている」と明記)。
- **リスク/影響**: `Cascadia Mono` / `Consolas` は CJK グリフを持たない。CSS のフォントマッチングは**グリフ単位でフォールバック**するため、`C:\Users\…\確認用 フォルダ 日本語` のようなパスは ASCII 部分が等幅、全角部分が別ファミリ (Windows 11 なら Yu Gothic / Meiryo) で描かれる。`text-[11px]` + `tracking-tight` (負の letter-spacing) が重なるため、全角の字送りは等幅の桁と一致しない。これは Constitution Principle VIII の **✗ Bad 例 3 番目「等幅フォント指定で全角文字の桁幅が崩れる」にそのまま該当する形**である。さらに悪いことに、**この 8 箇所は SC-011「日本語・非 ASCII を含むフォルダ名が UI 上でそのまま表示される」の計測経路そのもの**であり、`quickstart-results.md:118` はその項目 (2-2) を**未実施**と記録している。
  - **観察の限界を明示する**: 崩れの「程度」はスクリーンショットで実測していない。実測手段 (Principle VIII の Automated (B) 日本語スクリーンショット比較) が `constitution.md:441` により**延期**されているため、本 round で撮る経路が無い。観察事実として確定しているのは「CJK 等幅が font stack に無い」「その stack を日本語表示が要件の 8 箇所に当てている」「`--font-sans` 側では同じ問題を意図的に塞いである」という**非対称性**である。
- **推奨アクション**: `main.css:46` を `:45` と対称にする 1 行。`--font-mono: ui-monospace, 'Cascadia Mono', 'Consolas', 'BIZ UDGothic', 'MS Gothic', monospace;` (macOS を見るなら `'Osaka-Mono'` を併記)。**Principle XIII の妨げにならない** — トークンを足すのではなく、既に手で書き換えた行の値を対称にするだけであり、`:45` に前例がある。あわせて `mono` トークンの `tracking-tight` が全角に当たる点は、`text-[11px]` のままにするなら `lang` 混在部分だけ `tracking-normal` に戻すのが最小。
- **根拠**: Constitution **Principle VIII** (NON-NEGOTIABLE) の Statement「全角混在時のレイアウト崩れを許容しない」+ Examples の ✗ Bad 3 番目 / spec **SC-011** / **FR-047**
- **scope 根拠**: `src/renderer/src/assets/main.css` は touched files にあり、1 行で直る

### [High] Principle VIII の Manual 検証が実体として空であり、`/cl-done` 時点で観察証拠が 0 件になる (N-002) (scope: feature)

- **観察**:
  - `constitution.md:437-443` — Verification の Automated は 2 項目とも**載っていない**。`:443` は「それまで本 Principle を守るのは **Manual の 2 者**と上記のテスト 1 本だけである」と明記。Manual の 2 者は `ux-reviewer` と `a11y-reviewer` (`:438`)
  - `manual-checklist.md` 全 4 節・約 90 チェックボックス — **キーボード単独操作の項目 0 件 / スクリーンリーダの項目 0 件 / IME で日本語を入力する項目 0 件**。日本語**表示**の目視は 1-1 (`:81-82`) と 2-2 (`:169`) の 2 件だけ
  - `quickstart-results.md:33` V-1 = 「**画面の目視確認と手動照合は未実施**」 / `:118` = 「2-2 の日本語・空白を含むフォルダ (SC-011) — 用意した `確認用 フォルダ 日本語` が**未登録**」 → **日本語表示を目視した項目は 1 件も実行されていない**
- **同種事象探索**: `manual-checklist.md` を `キーボード|Tab|フォーカス|読み上げ|スクリーンリーダ|支援技術|IME|変換|全角` で検索 — **0 件**。`quickstart.md` も同様に 0 件。`spec.md` の FR / SC に WCAG / a11y の語 — **0 件**
- **リスク/影響**: Principle VIII の Statement は 3 節ある — (i) IME 変換確定時の誤送信、(ii) フォント崩れ、(iii) 全角混在時のレイアウト崩れ。**composer 封鎖が覆うのは (i) だけ**である。(ii)(iii) の検証は Automated (B) = 延期、Manual = 打ち切りで未実施、という二重の空振りになっている。加えて**構造的な問題**がある: Manual に名指しされた 2 者は `Read` / `Grep` / `Glob` だけを持つ source reviewer であり、**フォント崩れとレイアウト崩れは原理的に観察できない**。「Manual: `ux-reviewer`, `a11y-reviewer`」という記述は (ii)(iii) については**履行不能な割り当て**である。N-001 はまさにその死角で生じている。
- **Critical にしない理由 (明示)**: pr-gate の Critical 定義のいずれにも当たらない。また severity 判定の禁則により、**「検証していない」は「破綻を観察した」ではない**。observation は検証経路の不在であり、破綻の実測ではないため High が上限である。
- **推奨アクション**: R-1 で閉じられる最小形は `manual-checklist.md` への 1 節追加 + 実施。(a) キーボード単独で「ランタイム → 作業フォルダ → ブラウズ 3 階層 → 表示名入力 → 登録」を Tab のみで完走する項目 (H-001 / H-002 がここで必ず顕在化する)、(b) **表示名欄に IME で「確認用 フォルダ 日本語」を変換入力する**項目 (R-1 で唯一の生きた IME 入力面。N-004 参照)、(c) `mono` を当てた 8 箇所に日本語パスを表示して桁送りを目視する項目 (N-001)。これを実施せずに `/cl-done` に進むなら、**Principle VIII について観察証拠が 0 件であることを `pr-gate.md` に逸脱として記録する**。Constitution 本文側の「Manual に source reviewer を割り当てている」記述の訂正は architecture-reviewer / Constitution amendment の領域。
- **根拠**: Constitution **Principle VIII** Verification / `quickstart-results.md:113`
- **scope 根拠**: `manual-checklist.md` は本 spec の成果物であり、項目追加と実施は feature 内で完結する

### [High] Principle VIII の `bad_pattern_grep` は HEAD で 2 件を返し、`existing_violations: 0` が偽である (N-003) (scope: feature / cat D-H 境界)

- **観察**: `constitution.md:420-422` の adoption metadata は `existing_violations: 0` / `violation_threshold: 0` / `bad_pattern_grep: grep -rnE "onKeyDown|key === 'Enter'" src/ | grep -v "isComposing"`。この grep を `src/` に対して実行した結果、**HEAD には 2 件の一致行がある**:
  - `src/renderer/src/components/image.tsx:320` — `onKeyDown={(e) => {` (`:321` が `if (e.key === "Enter")`)
  - `src/renderer/src/components/assistant-ui/elements/attachment.aui.tsx:171` — 同形
  どちらの行にも `isComposing` は無いので `grep -v` で落ちない。
- **同種事象探索**: `onKeyDown|key === 'Enter'|key === "Enter"|isComposing` (`src/`) で **6 件** — `onKeyDown` 2 件 / `key === "Enter"` 2 件 / `compositionStart`・`compositionEnd` 2 件 (`ChatScreen.test.tsx:36-37`)。**`isComposing` はリポジトリ全体で 0 件**。あわせて `<form` / `onSubmit` / `type="submit"` を `src/renderer/src` で検索し **0 件**を確認した。
- **リスク/影響**: `violation_threshold: 0` に対して実測 2 件なので、**Constitution 自身の規定によれば HEAD は閾値超過の状態**である。さらに `constitution.md:442` が v1.2.2 で足した説明文「`isComposing` ガードがリポジトリに 1 件も無くても **0 件を返す**」は、**この grep について事実として偽**である (2 件返る)。つまり metadata は「合格と見分けられない」よりもう一歩悪く、**数値そのものが誤り**である。
  - **実害の程度は正確に言う**: 2 件はいずれも `<div role="button" tabIndex={0}>` の Enter/Space ハンドラであり、**テキスト入力ではないので IME 誤送信の危険は無い** — grep の false positive である。したがって「誤送信の穴が 2 つある」という指摘ではない。問題は、**`existing_violations: 0` が (a) 実測と合わず (b) 合っていたとしても false positive しか拾わない**という二重の無意味さで、NON-NEGOTIABLE Principle の唯一の機械的な数値がこれである点にある。
  - なお両箇所の `role="button"` + `tabIndex={0}` + Enter/Space 処理は**私の観点としては正しい実装**であり、そこは指摘しない。
- **推奨アクション**: (a) `existing_violations` を実測値に合わせる (2) か、**grep 式をテキスト入力面に限定する** かのどちらかを選び、選んだ理由を `:442` の枠に書く。(b) いずれにせよ `:442` の「0 件を返す」という記述は実測と入れ替える。(c) `image.tsx` / `attachment.aui.tsx` は `GENERATED_FILES` 配下の生成物であり**手を入れない**のが正しい — false positive を「直す」方向に進めないこと。
- **根拠**: Constitution **Principle VIII** adoption metadata / pr-gate Round 1 **architecture H-001** への**追加事実**。同 finding は「`existing_violations: 0` が合格と見分けられない」という一般論だったが、本 round で**具体的な反例 2 件**が観察された。**severity を格上げする申立てではない**。
- **scope 根拠**: `.specify/memory/constitution.md` は touched files にあり metadata 2 行で直る。ただし **Constitution drift の severity 判定 owner は architecture-reviewer** なので、本件は観察事実の提供として扱う

### [Medium] R-1 で唯一の生きた IME 入力面は表示名欄であり、composer 封鎖の免除根拠はそこを覆っていない (N-004) (scope: feature)

- **観察**: `constitution.md:440` と `ChatScreen.test.tsx:6-20` はいずれも **composer だけ**を論じ、「送信経路を `isDisabled: true` で閉じた」ことを Automated (A) の代替としている。しかし HEAD の renderer にはもう 1 つ**編集可能な面**がある — `WorkspaceFoldersScreen.tsx:431-438` の表示名 `<input>`。ここは日本語フォルダ名を入れることが要件 (FR-047 / SC-011) であり、**IME の変換が必ず走る**。
- **同種事象探索**: `<input|<textarea|Textarea|contentEditable` (`src/renderer`) で **6 件** — 生きているのは `WorkspaceFoldersScreen.tsx:431` の 1 件のみ。`components/ui/textarea.tsx:6` の `<textarea>` は `tool-fallback.aui.tsx:492` からのみ使われ、これは tool call の描画経路なので `messages: []` の R-1 では到達しない。thread の composer は `disabled`。
- **リスク/影響**: **誤送信の経路は無い** — `<form` / `onSubmit` / `type="submit"` が renderer に 0 件なので、この input で Enter を押しても暗黙送信は起きず、`onKeyDown` も無い。したがって不具合の指摘ではない。問題は**記録の正確さ**である: 「composer を閉じたので IME 検証の対象が無い」という読み方をすると、**HEAD に実在する IME 入力面が 1 件、検証の視野から外れる**。`constitution.md:440` は「対象が無いのではなく送信経路を閉じた」と丁寧に訂正した箇所なので、同じ精度で「composer 以外に編集可能な面が 1 件あり、そこには送信経路が無いことを確認した」と書けるはずである。
- **推奨アクション**: (a) `constitution.md:440` の (A) に 1 文足す — 「R-1 の編集可能な面は表示名欄 1 件で、`<form>` / `onSubmit` / Enter ハンドラを持たないため送信経路が無い」。(b) より強く固定するなら renderer 単体テストを 1 本 — 表示名欄に `compositionStart` → `compositionEnd('日本語')` → `keyDown Enter` を送り、`register` が呼ばれないことと value が保たれることを assert する。(c) N-002 の manual 項目 (b) と合わせると人手側でも覆える。
- **根拠**: Constitution **Principle VIII** Statement (i) / **FR-047** / **SC-011**
- **scope 根拠**: touched files 内

### [Medium] `jsx-a11y` を入れるとき `GENERATED_FILES` の扱いを先に決める必要がある — a11y findings の多数がその配下に集まっている (N-005) (scope: feature / cat H)

- **観察**: `eslint.config.mjs:73-77` の `GENERATED_FILES` は `src/renderer/src/components/**` / `hooks/**` / `lib/**`。`:403-414` がその集合に対し体裁・React 系ルールを `off` にしている。一方 `eslint-plugin-react` / `react-hooks` / `react-refresh` は既に導入済みで、**plugin を足す配線自体は 3 行で済む**。
- **同種事象探索**: 本 round で継続中の 17 findings のうち、**指摘箇所が `GENERATED_FILES` 配下にあるもの 6 件** — H-001 (`components/ui/button.tsx:7`) / M-001 (`thread.aui.tsx` 7 件 + `dialog.tsx:74`) / M-006 (`error-state.tsx:78`) / L-001 (`thread.aui.tsx:279-286`) / L-004 (`loading-state.tsx:56`) / M-004 の一部。つまり **a11y の指摘が最も濃い領域が、lint 設定上「体裁ルールを掛けない」慣行の領域と重なっている**。
- **リスク/影響**: M-008 の推奨をそのまま実行すると、既存の緩和ブロックの慣行に引かれて `GENERATED_FILES` でも無効化される流れになりやすい。そうなると**新ルールは最も違反が集まる場所を見ない**。
- **推奨アクション**: `eslint.config.mjs:69-70` が既に方針を書いている — 「**レイヤ規則と禁止 import は掛け続ける** — こちらは上流の体裁ではなく本プロジェクトの不変条件だからである」。`:400` も「一括で無効にすると生成物に紛れた本当の問題も見えなくなる」と書いている。**a11y は「上流の体裁」ではなく Principle VIII 由来の不変条件**なので、この 2 つの方針文に従えば `GENERATED_FILES` でも掛け続ける側になる。M-008 を実施するときに `:403-414` のコメント枠に**その判断を明記する**こと。AD-025 の「ルールは違反サンプルで発火してから信用する」に従い、`thread.aui.tsx` の英語 `aria-label` か `img` の alt 欠落で発火を確かめてから固定する。
- **根拠**: Constitution **Principle VIII** Verification / **AD-025** / `eslint.config.mjs:69-70` `:400` の自己記述
- **scope 根拠**: `eslint.config.mjs` は touched files 内

---

## 3. 依頼された 3 問への回答

### (1) `ChatScreen` の composer 封鎖は Principle VIII の Verification 免除根拠として成立しているか

**成立している。ただし覆っているのは Statement 3 節のうち 1 節だけであり、pr-gate の Critical には当たらない。**

- **事実として真である**ことを独立に確認した: `ChatScreen.tsx:42` の `isDisabled: true` → `ChatScreen.test.tsx:29` が `expect(input).toBeDisabled()` で固定 → `disabled` な `<textarea>` は IME の入力先にならない。代替送信経路も無い (`<form` / `onSubmit` / `type="submit"` が renderer に **0 件**、`onNew` は `:53` で throw)。`constitution.md:440` の「対象が無いのではなく送信経路を閉じている」という書き方は、`Thread` が実際に mount され composer が描画される事実と整合している。
- **pr-gate の Critical 定義に照らすと Critical ではない**: (a) データ漏洩 / 権限昇格 / サービス停止のいずれでもない。むしろ「未接続なのにモデルが答えたように見える」誤認を**閉じる**方向の変更である。(b) **accepted ADR drift でもない** — AD-024 #18 と Constitution v1.2.2 は**同一内容で同期している**。
- **L-006 は Low のまま維持する** (格上げしない)。追加で検証した事実: `ChatScreen.test.tsx:43` の `fireEvent.keyDown` は **`disabled` な要素に対する dispatch** であり、IME ガードの有無・`onNew` の結線状態のいずれとも独立に `not.toThrow()` を満たす。したがって `constitution.md:443` が数える「テスト 1 本」の実効的な assertion は **`:29` の `toBeDisabled()` 1 つ**である。これは前回の指摘の範囲内で、**新たな観察ではないので Round 間格上げの根拠にならない**。推奨は前回どおりテスト名の修正。
- **本当の問題は免除の「範囲」である** → N-002 (Statement (ii)(iii) が無検証) と N-004 (IME 入力面は composer だけではない)。免除根拠の当否ではなく、**免除が覆っていない範囲が記録されていない**ことが High である。

### (2) `lang="ja"` 下の英語文字列 (WCAG 3.1.2) の pr-gate scope での severity

**Medium 維持。格上げしない。** 理由は 3 つ。

1. **影響面が pr-gate Round 1 の chat 画面 spec drift に従属している**。M-001 の 8 箇所のうち 7 箇所 (`thread.aui.tsx` の 7 件) は chat 画面専用であり、その drift が**chat 画面を R-1 から外す方向で解決すると 7 箇所が消える**。いま `thread.aui.tsx` に prop を通す改修を必須化すると、捨てる作業になりうる。
2. **結果と無関係に残るのは `dialog.tsx:74` の `<span className="sr-only">Close</span>` 1 件だけ**である。dialog は `WorkspaceFoldersScreen` の登録解除確認で R-1 の主要導線に乗る。ここは「閉じる」に直す 1 行で済み、Closta 側部品なので registry 更新との衝突も小さい。**pr-gate として必須化するのはこの 1 件に絞るのが妥当**。
3. **WCAG 3.1.2 は AA だが、代替の最小手当が `lang="en"` 属性で足りる**。文字列そのものを日本語化しなくても適合させられるため、「規約違反リスク」の程度が High に達しない。

よって: **`dialog.tsx:74` を Medium として据え、`thread.aui.tsx` 側は chat 画面の決着に従属させる**。

### (3) a11y 回帰の自動経路 0 件 + Manual 検証者が 2 名だけという状態の評価

**High (N-002)。ただし「reviewer が 2 名」自体ではなく「その 2 名が観察できないものを検証に割り当てている」ことが High である。**

- 自動経路の実測は **0 件**: `jsx-a11y` / `axe` が設定ファイル・`package.json` に 1 件も無い。`pnpm-lock.yaml` に現れる `aria-query` / `aria-hidden` は `@testing-library/dom` と radix の推移依存であり a11y 検査ではない。
- Manual 側の実測は **成果物 0 件**: `manual-checklist.md` にキーボード / スクリーンリーダ / IME の項目が 0 件、日本語表示の目視 2 項目は `quickstart-results.md:33,118` で**未実施**。
- したがって Principle VIII の 3 節は現状 **(i) テスト 1 assertion / (ii) 検証なし / (iii) 検証なし** である。`constitution.md:443` の自己申告は、**2 者が source reviewer であるという事実と組み合わせると (ii)(iii) について空**になる。N-001 がその空白で実際に生じた欠陥であることが、この評価の裏取りになっている。
- **Critical にはしない**: 禁則に照らして「検証経路の不在」は「実害の観察」ではない。
- **最小の閉じ方**: (a) N-002 推奨の manual 3 項目を追加して実施する (人手 30 分程度、H-001 / H-002 / N-001 が同時に顕在化する)。(b) M-008 + N-005 で `jsx-a11y` を入れる。(c) どちらも R-1 でやらないなら、**Principle VIII について観察証拠 0 件のまま `/cl-done` に進むことを `pr-gate.md` に逸脱として記録する**。**記録せずに通すことには反対する**。

### 付随して検証した非 finding

- `src/main/app/window.ts:30` `autoHideMenuBar: true` — メニューバーは Alt まで不可視だが `Menu.setApplicationMenu(null)` は `src/main` に **0 件**なので既定メニューが残り、ズームのアクセラレータは有効。**WCAG 1.4.4 Resize text は満たしている** → 指摘しない。
- `image.tsx:317-331` / `attachment.aui.tsx:163-181` の `<div role="button" tabIndex={0}>` + Enter/Space + `onKeyUp` — 観点として**正しい実装** → 指摘しない。
- `prefers-reduced-motion`: `motion-reduce:*` が一貫。**Motion は問題なし**。
- `index.html` — `<html lang="ja">` / `<title>Closta</title>` が残存。MF-006 の解消は維持されている。

---

## 4. 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| N-001 | `font-mono\|--font-mono\|mono,` (`src/renderer/src`) | **26** (うち `mono` トークン適用 14、features 配下 **8**) | `assets/main.css:45,46` / `surfaces.tsx:45` (定義) / features 適用: `WorkspaceFoldersScreen.tsx:141,341,520` / `RuntimeListScreen.tsx:81,120,232` / `ResolutionScreen.tsx:88,118` |
| N-002 | `キーボード\|Tab\|フォーカス\|読み上げ\|スクリーンリーダ\|支援技術\|IME\|変換\|全角` (`manual-checklist.md` / `quickstart.md`) | **0** | 該当なし。日本語**表示**の目視のみ `manual-checklist.md:82,169` の 2 件で、`quickstart-results.md:33,118` が両方 未実施と記録 |
| N-003 | `onKeyDown\|key === 'Enter'\|key === "Enter"\|isComposing` (`src/`) | **6** (`isComposing` は **0**) | `image.tsx:320,321` / `attachment.aui.tsx:171,172` / `ChatScreen.test.tsx:36,37`。**`bad_pattern_grep` の実行結果は 2 行**であり metadata の `0` と不一致 |
| N-004 | `<input\|<textarea\|Textarea\|contentEditable` (`src/renderer`) | **6** (生きている編集面は **1**) | `WorkspaceFoldersScreen.tsx:431` (**唯一の生きた IME 入力面**) / `textarea.tsx` + `tool-fallback.aui.tsx` (R-1 では到達しない) |
| N-004 (副) | `<form\|onSubmit\|type="submit"` (`src/renderer/src`) | **0** | 暗黙送信の経路なし |
| N-005 | `GENERATED_FILES` の定義と適用 (`eslint.config.mjs`) | **3 パターン / 2 適用** | `:73-77` (定義) / `:404-413` (緩和) / `:69-70` `:400` (方針文)。継続中 17 findings のうち **6 件**が同配下 |
| V-4 (M-008 再検証) | `jsx-a11y\|axe\|a11y` (`*.{mjs,json,ts,yml,yaml,js}`) | **0** (a11y 検査として) | reviewer 名のみ |
| V-5 (前提検証) | 前回 17 findings の引用 `path:line` を HEAD で全件突き合わせ | **17/17 一致** | §0 の表を参照 |

---

## Verdict

- Critical: **0**
- High: **5** (継続 2: H-001 フォーカスリング contrast / H-002 ブラウズ時のフォーカス喪失 ‖ 新規 3: N-001 `--font-mono` に CJK 無し / N-002 Principle VIII の Manual 検証が空 / N-003 `bad_pattern_grep` の実測と metadata の不一致)
- Medium: **11** (継続 9 / 新規 2: N-004 表示名欄が唯一の IME 面 / N-005 `GENERATED_FILES` の扱い)
- Low: **6** (継続 6。格上げ 0 件)
- Round inheritance: **resolved from code-gate iteration 2: 0 / unresolved: 17 / new: 5**

**pr-gate Round 1 の Critical 2 件の修正は UI に一切触れていないため、a11y の指摘は 1 件も解消していない。** 前提の確認は §0 で独立に済ませてある。

**Critical 0 件の理由を明示する**: 新規 High 3 件はいずれも pr-gate の Critical 定義に当たらない。N-003 は Constitution metadata の誤りだが、AD-024 #18 と Constitution v1.2.2 は同期しており **ADR drift ではない**。N-001 / N-002 は「検証していない」「崩れる仕組みが揃っている」ことの観察であり、**破綻の実測ではない**ため禁則により High が上限である。

**Round 2 で必須にすべきものの優先順 (a11y track の意見)**:
1. **N-001** — `main.css:46` の 1 行。Principle VIII の ✗ Bad 例に該当し、SC-011 の表示経路そのもの。修正コストが最小で影響が最大
2. **H-001** — `button.tsx:7` または `main.css:104` の 1 箇所。`<Button>` 15 件に一括で効く
3. **N-002** — `manual-checklist.md` に 3 項目追加 + 実施。ここを通すと H-002 / N-001 が実測で確認でき、Principle VIII の観察証拠 0 件が解消する
4. **N-003** — metadata 2 行 (architecture の同 finding と同時に処理するのが自然)
5. **H-002** — フォーカス移送 + `:341` を live region に。1 ファイル内で閉じる

**M-001 は `dialog.tsx:74` の 1 件に絞って Medium、`thread.aui.tsx` 側は chat 画面の決着に従属させること** (§3-(2))。
