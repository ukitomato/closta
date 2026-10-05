---
status: needs-human-review
last_updated: 2026-09-15
generated_by: human (PLAN.md を素案として再導出)
---

# Roadmap

`/cl-design` を実行していく順序と、各 feature の依存・前提 SPIKE を定義する。
feature の定義と domain 帰属は [docs/domains/_overview.md](domains/_overview.md) を正とする。
各 feature に投げる実際のプロンプトは [docs/prompts.md](prompts.md) にある。

## 原則

- **1 feature = 1 branch = 1 spec。** 各 feature は単体で動作確認できる垂直スライスとする（Principle XI）
- **SPIKE は feature ではない。** 対応する feature の spec 着手**前**の調査タスクとして扱い、
  結果は `docs/decisions/` に ADR として起票する
- **マイルストーンは「できるようになること」で定義する。** 完了判定を漸近線にしない

## 着手前に片付けること（Pre-flight）

M1 に入る前に必要。いずれも feature ではない。

| # | 作業 | 状態 | 理由 |
|---|---|---|---|
| P-1 | `pnpm` のインストールと `nodeLinker: hoisted` の設定 | **完了** | pnpm 12.4.1 導入済み。`pnpm-workspace.yaml` に `nodeLinker: hoisted` を配置済み |
| P-2 | Constitution を `active` に昇格する | **完了** | v1.0.0 批准 (2026-09-13)。15 Principle。`constitution.draft.md` は削除済み |
| P-3 | Principle VI の検証条件を書き直す | **完了** | 文字列 grep をやめ、モジュール境界で縛る形に変更済み |
| P-4 | `/cl-add-reviewer ui-coverage-reviewer` | **完了 (O-2)** | 検査対象の `docs/ui-coverage.md` を作る O-2 で追加した (pr-gate のみ。機械照合は Constitution 検証の項目 21) |
| P-5 | `/cl-add-reviewer platform-boundary-reviewer` | **完了** | 作成・両レジストリ登録済み。観点は lint / tsc が見られない領域のみ（PB-1〜PB-7） |
| P-6 | `docs/discovery.md` を人間レビューし `status: active` へ | **完了** | revision 2 (2026-09-13)。scan 以降に変わった事実を更新したうえで active に昇格 |

### P-7 の補足: アーキテクチャは着手前に確定済み

[AD-023](decisions/0023-application-architecture.md) で `app` / `ui` / `agents` / `infra` / `domain` の
5 レイヤ構成を確定した。R-1 の最初のコミットで固定されるため、着手前に決める必要があった。
UseCase レイヤは作らず、状態の有無で純粋関数と Service を使い分ける。
依存規則は ESLint（編集時）と dependency-cruiser（CI・推移的依存）の両方で強制する。

### P-5 の補足: reviewer に何を持たせるか

Constitution Principle I / II / VII は **ESLint** で、VI は **CI の grep** で、
`HostPath` / `RuntimePath` の取り違えは **tsc** で機械的に検出される。
これらを reviewer に重複して持たせると、同じ検査を高いコストで遅く回すことになる。

`platform-boundary-reviewer` には **lint と型検査が構造的に見られない領域**だけを担当させた。
IPC / 永続化境界での型の消失、単一インスタンス仮定、capabilities の虚偽表明、
権限ゲートの迂回、多段パス変換の欠落、grep に掛からない永続化、
そして **lint ルール自体の穴**（ルールの複製ではなく、ルールの網羅性を見る）。

機械的な検査は **R-1 のスコープ**に含めた（ESLint ルールと CI の grep スクリプト）。

### P-1 の補足: pnpm と Electron の非互換

Electron のパッケージングツールチェーンは `node_modules` が npm と同じ形で**物理的に**
配置されていることを要求する。pnpm 既定のシンボリックリンク方式とは非互換であるため、
`nodeLinker: hoisted` の指定が要る（[Electron 公式チュートリアル](https://www.electronjs.org/docs/latest/tutorial/tutorial-first-app)）。

pnpm 10 以降は設定の置き場が `.npmrc` から `pnpm-workspace.yaml` に移っている。
本リポジトリでは後者に配置済み。**`packages:` キーを持たないため monorepo ではない** —
`pnpm-workspace.yaml` の存在だけを monorepo の目印にするツールがあるので、
workspace として扱われていたら `packages:` の有無を先に確認すること。

## M1: 読める

**達成状態**: WSL 内の過去セッションを Windows の assistant-ui で読める。
**ここで軸 1 の方針を確定する。** 結果次第では `ui` charter と本ロードマップを見直す。

**進捗 (2026-09-15)**: R-1 の実装が完了した（`/cl-code-gate` 以降は未通過）。
検出・登録・解決と、5 レイヤの依存規則の機械強制、CI、SPIKE-13 の第 1 段階までが入っている。
**プロセス起動はまだどこにも無い** — R-1 は Agent SDK を依存として入れただけで呼び出していない。

| 順 | ID | feature | domain | 依存 | 前提 SPIKE |
|---|---|---|---|---|---|
| 1 | R-1 | フォルダ登録とランタイム検出 **(実装完了 / gate 未通過)** | `runtime` | — | SPIKE-8 / SPIKE-9 **完了** |
| 2 | R-2 | セッション列挙（読み取り専用） | `session` | **R-1 の US-1〜US-3** | SPIKE-1 **完了** |
| 3 | R-3 | transcript の基本表示 | `ui` | R-2 | SPIKE-2 / SPIKE-14 **完了** |
| 4 | R-4 | Tier A tool 表示 **(design 完了 / 実装中。spec `004-ui-tier-a-tool-display`)** | `ui` | R-3 + **R-3 の実機一次判断 (下記。tracked debt 化)** | — |
| — | — | *(SPIKE-9 / SPIKE-13 は R-1 までに実施)* | — | — | — |

**R-3 の完了時点で見栄えの一次判断ができる。** R-4 まで待たない。

> **R-4 着手の前提 (pr-gate R-3 Round 1 / H-002)**: R-3 の done は SC-010 rubric 判定表の**記録**までを必須とし、
> 実機の視覚的一次判断 (とくに rubric-a=markdown ハイライト / rubric-b=日本語行送り) は人間 deferred。
> **R-4 (Tier A tool 表示) の spec 着手前に、`quickstart-results.md` の rubric-a/b を実機で埋め「一次判断」結論を記す。**
> いずれかが NG なら charter「見た目の判断を先送りしない」に従い charter / PLAN.md §4 の見直しを別 task で起票する
> (R-4 は R-3 の土台の上に積むため、視覚的方向性の確定を R-4 前に置く)。持ち主は R-3 (下記申し送り #7)。
>
> **更新 (2026-09-25 / R-4 design-gate C-001)**: R-4 の positioning を緩和し、「M1 完了 / 軸 1 の正式な方針確定」を
> R-4 done の合否条件にしないと確定した (人間承認 (a))。したがって **R-3 実機一次判断 (rubric-a/b) の記入と
> 軸 1 の正式確定は R-4 done をブロックしない tracked debt (別ステップ)** である。R-4 の spec/plan/実装は R-3 の
> 描画基盤 (実在) の上で進めた。R-4 自身の SC-010 rubric (Terminal / Code diff / Todo / Subagent / Agent plan) も
> 同じ扱い。NG 判定時の charter / PLAN.md §4 見直しは引き続き別 task。
>
> **tracked debt (R-4 / design-gate PR-H-3)**: **Agent plan の markdown 整形**。R-4 は plan を plain text で描画する
> (`MarkdownText` が text-part context 依存で任意文字列を安全に受けられないため。AD-035 D6)。見出し/箇条書きの整形は
> plan を text part 化する将来課題 (X-1 の live streaming か O-2 の ui-coverage で判断)。security posture (生 HTML 非描画・inert link) は plain text で維持。

#### R-3 への申し送り (pr-gate Round 4 / 2026-09-23)

**持ち主のいない延期を残さない** (AD-028 §5 が確立した規範)。R-2 が先送りした判断はここが持ち主である。

| # | 申し送り | 根拠 |
|---|---|---|
| 1 | **Principle IX の再評価** — 列挙応答のパースを main に残す判断。R-3 が transcript 本文を運ぶ時点で「数 MB の `tool_result`」が実際に現れるので、構造体 `postMessage` への移行を判断する。**→ R-3 で構造的に解決 ([AD-034](decisions/0034-transcript-read-path-and-process-boundary.md)): `MessageChannelMain` の port transfer で取得プロセス↔renderer 直通にし、main を本文経路から外した。ただし到達集合検査 (composition-root からの自動証明) は未構築であり、その持ち主は下記「E2E / 検証基盤 feature」に登録する** (Constitution v1.2.6) | [AD-031](decisions/0031-adr-in-place-corrections-and-principle-ix-scope.md) Decision 2 / [AD-034](decisions/0034-transcript-read-path-and-process-boundary.md) |
| 2 | **`createLineAssembler` の行長上限** — 現状パース対象のバイト列に上限が無い。#1 と同時に判断する。**→ R-3 で構造的に解消 (AD-034): 本文は行区切りではなく `MessageChannelMain` の別チャネルで運ぶため、行アセンブラを本文に使わない。列挙メタデータの行経路 (R-2) は据え置き** | AD-031 訂正 (2026-09-23) / AD-034 |
| 3 | **検証項目 13 / 14 の構造化** — 項目 13 は別名 1 つ (`const f = ops.toUnc`) で無効化され、項目 14 は default / 動的 import など **5 形を素通し**する (どちらも A/B 実測済み)。項目 13 は「`agents → path-api` の import 0 件」を depcruise で、項目 14 は `matchAll` + 動的 import 検出で置き換える | pr-gate Round 4 / C4-007 / C4-008 |
| 4 | **デバイス名前空間の綴りの再評価** — `\\?\UNC\` / `\\.\UNC\` / `\\?\C:\` は**実機で解決する**が、実測 0 件のため解析していない。R-3 までに実測が増えたら判断し直す | [AD-032](decisions/0032-unc-shape-classification-by-separator-count.md) |
| 5 | ~~`opaque-unc` を spec の Edge Cases に記録~~ **→ Round 5 の指摘に応じ Round 6 で実施済み** (spec.md Edge Cases / Key Entities)。持ち主の二重記録 (AD-032 申し送りと本表) を解消 | pr-gate Round 4 / PO4-006 |
| 6 | **`src/agents/` の 2 役の線引き** — 「列挙プロセス」と「親子共有プロトコル」が同一ディレクトリに同居し、検証項目 13 / `UNC_FORBIDDEN_IN` が両者を区別しない。後続 ADR で規則の対象を「ディレクトリ」でなく「子で評価されるモジュール」に定義し直すか `protocol.ts` を共有層へ出す | pr-gate Round 4 / M4-14・M-005 |
| 7 | **quickstart (SH-089) の実機再実行** — 2026-09-18 の証跡は pr-gate Round 4/5 の実装変更前。V-1 件数表記 / V-3 出自 / V-4 導線 / V-6 先頭ページ / V-8 空状態が変わった。実機操作のため人間 deferred。**→ 持ち主は R-3 (本 spec の SH-068)。R-3 の quickstart V-1〜V-9 実機と SC-010 見栄え一次判断に合流させる。実機操作は人間 deferred のままだが、判定表 (`quickstart-results.md`) の記録は R-3 の done 必須** | pr-gate Round 5 / PO4-004 / C4-016 |
| 8 | **`isValidDistroName` の bidi 対応 + `dto-mapper` 関門の被覆** — 制御文字判定器が 4 定義あり bidi を見るのは 2 つだけ。`isValidDistroName` を `hasControlCharacter` と揃え、`dto-boundary.test` に無 gate フィールド (cwd / cwdKey / location) の汚染ケースを足す。**到達可能な実害経路は upstream (`build.ts`) で封止済みの defense-in-depth**。R-2 Round 6 で人間が対象外と決定 | pr-gate Round 5 / S4-003 (H-D2) / M5-01 |
| 9 | **`programmatic` の値域検査** — `boolean` 型宣言のまま無検査で境界を渡り実測で `"yes"` が素通り。`decodeResponse` / normalize 層で値域検査するか parse 側で boolean 化する | pr-gate Round 5 / PB4-006 (PB5-007) |

#### E2E / 検証基盤 feature (持ち主 = 未定。**M4 完了後に切る**)

以下の延期された自動検証はすべて**同一の E2E / 検証基盤 feature** が持ち主である
(「持ち主のいない延期を残さない」。AD-028 §5)。M4 完了後にこの feature を立て、まとめて載せる。

- **Principle VIII の Automated 2 項目** — composer の IME テスト / 日本語スクリーンショット比較
  (AD-024 #18。R-3 も composer 送信経路を開けないため未発火)。
  **→ X-2 ([AD-037](decisions/0037-japanese-ime-composer-behavior.md) D3) が引き取り済み。持ち主 = X-2。**
  E2E ハーネス ([AD-038](decisions/0038-e2e-screenshot-harness.md)) を立て、**(A) IME E2E・(B) 日本語スクリーンショット比較とも
  実装・搭載済み・local 緑** ((A) `e2e/ime.spec.ts` の idle / running+queue / 変換中マウス送信の 3/3。(B)
  `e2e/composer-screenshot.spec.ts` が同梱 Noto Sans JP (OFL) を FontFace + CSSOM で CSP 非破壊注入し基準画像と比較。
  verify.yml の e2e job)。**残るは人間の実機 IME 目視と基準画像の最終 aesthetic 承認 (quickstart V-1〜V-5) のみ**。
  Constitution VIII は v1.2.7 で (A)(B) 搭載に追随済み (T024)。
  **(B) の延期条件「目標レイアウト ADR が accepted」(AD-024 / AD-028 §5) は O-7 の [AD-046](decisions/0046-app-shell-layout.md) の accepted で満たされた。**
  composer の領域の基準画像は O-7 で撮り直した (右のペインを既定で畳んで composer の幅は保ち、左端の位置の変化によるアンチエイリアスの差だけ。
  利用者の見た目の承認は [013 quickstart-results](../specs/013-ui-app-shell/quickstart-results.md))。全画面の基準画像を足すかは決めていない
- **Constitution VI 検証スコープの実装追随 (X-2 起点。design-gate M-101 / AD-038 D4。system-scope)** —
  `scripts/constitution/allowlists.mjs` の `SCAN_FILES` に `.github/workflows/verify.yml` を追加し、
  check.mjs 項目 1 が CI 定義 (E2E の font provisioning 等) を走査する。X-2 が初めて verify.yml に実行系ステップを
  持ち込むため「Constitution VI Verification が CI 定義を含めると宣言しているのに実装が走査しない」乖離が実害面を持つ。
  持ち主 = 本 E2E / 検証基盤 feature
- **`e2e/` / `perf/` が check.mjs の走査範囲の外にある (O-1 起点。design-gate R2 platform-boundary M-001。system-scope)** —
  `scripts/constitution/allowlists.mjs` の `SCAN_ROOTS` は `['src', 'scripts']` で、`e2e/` と O-1 が足した `perf/`
  (実 `claude` を動かす実機計測。CI では実行しない) は Principle VI の項目 (プロセス起動・`wsl.exe` の引数・特権コマンド) の
  走査対象にならない。**上の AD-038 D4 の項目 (verify.yml を `SCAN_FILES` に足す) とは別の死角である。**
  `SCAN_ROOTS` に足すか、足さない理由を ADR で決める (`allowlists.mjs:4` は追加に ADR を要すると定める)。
  当面は perf が子プロセスを自ら起こさないこと (Playwright 経由でアプリを起動するだけ) を O-1 の観点として守る。
  **ESLint も `e2e/` と `perf/` を見ていない** (`eslint.config.mjs` の ignores。型検査だけ)。つなぎの案は `files: ['e2e/**/*.ts', 'perf/**/*.ts']`
  の flat config ブロックで `child_process` / `node:child_process` の `no-restricted-imports` を掛けること (O-1 code-gate convention M-003 /
  platform-boundary M-001)。あわせて、`.dependency-cruiser.js` の `not-to-test` (e2e / perf) には発火を確かめる違反サンプルが無い
  (`scripts/rules` / `tests/rule-fixtures`。O-1 code-gate platform-boundary L-003)。
  O-1 の pr-gate R1 の対応で `perf/run-judgement.ts` とその Vitest (`perf/*.test.ts`。node project の include) が入り、perf/ は CI で回る
  純関数も持つようになった。ESLint の ignores の判断の前提が変わったので、あわせて見直す (O-1 code-gate R2 convention L-002)。
  持ち主 = 本 E2E / 検証基盤 feature
- **renderer の `dangerouslySetInnerHTML` を lint で禁じる (O-1 起点。design-gate R1 security L-005。system-scope)** —
  O-1 で会話由来の文字列 (直近の活動) を表示する箇所が増えた。XSS 境界はテスト (要素 0 件) と注記で守っているが、
  `react/no-danger` 相当の機械強制が無い。持ち主 = 本 E2E / 検証基盤 feature
- **実機計測ハーネス (`perf/`) の ADR 化 (O-1 起点。pr-gate R1 architecture M-003。system-scope)** —
  O-1 は「CI 外・実資格情報・自動操作」の検証経路を、ADR を起こさず AD-038 D2 の類推として入れた (`specs/010-session-monitoring-view/plan.md`
  の ADR 節、`eslint.config.mjs` の ignores、`perf/tsconfig.json`)。決めごとが plan・コードの注記・`docs/discovery.md` に分散している。
  ADR (proposed) で決めるもの: 置き場 (src のグラフの外)、安全柵 (CI / `CLOSTA_E2E` の拒否、既定の権限モードの確認、成果物を repo の外に出す、
  失敗時の error-context を止める)、agent が実行してよい条件、`e2e/support` の共有、ESLint を ignore にするか override にするか
  (AD-038 D2 の字面は override)。上の `SCAN_ROOTS` / ESLint の項目からこの ADR を指す。accepted の AD-038 は書き換えない。
  持ち主 = 本 E2E / 検証基盤 feature。**ただし本 feature は M4 完了後に切るので、O-3 (M3。KPI の宿題で perf を変える) が先に着手したら O-3 が持つ** ([O-3 の義務 (2)(d)](#o3-kpi-smoothness))
- **直近の活動の不可視文字の残り (O-1 起点。pr-gate R2 security L-001。記録のみ)** —
  O-1 の `normalizeLine` (`session-view.ts`) はゼロ幅文字・語結合子・タグ文字を除くが、U+00AD / U+034F / U+FE00-FE0F / ハングルの埋め字
  (U+115F / U+1160 / U+3164 / U+FFA0) は残り、先頭 1024 コードユニットを不可視文字で埋めた行は空として飛ばされる。並びを入れ替える文字ではなく
  偽装の力は弱い。transcript 本文と承認カードの集合 (domain の `sanitizeBody`) も同じなので、足すなら domain 側とあわせて決める。
  持ち主 = 次に `sanitizeBody` か直近の活動を触る feature (O-2 の義務 (4) の tool ごとの整形が候補)。
  **O-2 の後の状態**: O-2 の整形 (`summarizeToolInput`) は tool の入力の大半を直近の活動に出さなくなった (ファイル名・コマンドの名前・
  subagent の種類だけで、どれも安全な文字に限る) ので、この経路の影響は小さくなった。`sanitizeBody` の集合は O-2 では変えていない。持ち主は変えない
- **`running-session-store.ts` の切り出しと、行の状態の型の置き場 (O-1 起点。code-gate convention M-002 (CM-02) / pr-gate R1 architecture L-002)** —
  (1) `running-session-store.ts` が O-1 で 587 行になった。派生値の追跡と間引き (`trackDerived` / `scheduleActivity`) を
  `running-session-monitor.ts` のような小さなモジュールに切り出す (O-1 tasks SH-004)。(2) `SessionRowStatus` と `Elapsed` の型が文言の表
  (`labels.ts`) にあり、ストアの型と純粋な導出が UI ラベルに依存している (依存の向きが逆)。型は `running-session-types.ts` か
  `session-view.ts` に移し、labels 側は `Record<SessionRowStatus, string>` で検査する。`announcements` は表示名の組を返し、文は呼び出し側が組む。
  (3) `RunningSessionList.tsx` も O-1 の pr-gate R1 の対応で 500 行を超えた (code-gate R2 convention M-001)。行の部品
  (`RowStatusBadge` / `ElapsedTime` / `RowActivity` / `SessionRowMeta` / `RowTooltip`) を `RunningSessionRow.tsx` などに切り出す (I-2 の隔離バッジの前に)。
  O-3 の i18n リソース化の前に済ませる。**持ち主 = store に派生値を足すか、監視ビューの行を触る次の feature** (O-2 の design で
  付け替えた。USER 決定 2026-10-03。O-2 は store に派生値を足さず、直近の活動の導出 `deriveActivity` を変えるだけなので切り出しの
  理由が無い。O-3 の i18n リソース化はこの切り出しの後に行う)。**O-7 も当たらない** (行の部品と派生値を変えない。区画の要素を
  `nav` から `section` にし、`ThreadListNew` を外し、選択の操作の通知 `selectionSeq` を足すだけ)
- **E2E stub の production-inert 性の自動 backstop (X-2 起点。pr-gate arch-M-002。system-scope)** —
  `createE2eCapability` (`src/main/app/e2e-capability.ts`) の配線ゲート `!app.isPackaged && CLOSTA_E2E==='1'` が env 単独ゲートへ
  退行しても CI が落ちる回帰検査が無い (Vitest は electron `app` を mock しにくく、index.ts の分岐を直接 assert できない)。
  ADR-vs-コード整合 (AD-038 D3) と Constitution 版番号整合の自動検査も無く手動 review に依存。**当面は platform-boundary/architecture
  reviewer の手検証 (pr-gate で clean) で守り**、静的検査 (`!app.isPackaged` を伴わない CLOSTA_E2E ゲートの禁止 lint 等) の追加を
  検討する。持ち主 = 本 E2E / 検証基盤 feature
- **charter KPI「スクロールの安定」の E2E 計測** — R-3 は Vitest (マウント数 / 位置飛び) + quickstart 実機で暫定代替
- **Principle IX の到達集合検査** — composition-root から main で評価されるモジュールを導く自動検査
  (R-3 / [AD-034](decisions/0034-transcript-read-path-and-process-boundary.md) は port transfer の構造検査 + 手動レビューで暫定担保。Constitution v1.2.6)。
  **R-4 ([AD-035](decisions/0035-tier-a-tool-display-and-subagent-nesting.md)) は `toTranscriptMessages` に subagent グルーピングを足し変換を重くした** —
  到達集合検査の優先度判断の材料。取得プロセス側で走る点は不変 (main 非経路)
- ~~**Principle IX の Automated の改定**~~ — **Constitution v1.2.9 (2026-10-02) で完了**。以下は経緯。字面「`src/agents/` の外に stream の `JSON.parse` 処理が存在しないこと」は、
  X-5 ([AD-043](decisions/0043-single-supervisor-session-threads-and-session-limit.md) Decision 2) で renderer が中継された本文
  (`BODY_MAX_BYTES` で有界) を復元する形 (`session-event-decoder.ts`) と食い違い、同じ節の X-5 の Good example とも食い違う。
  禁じる対象は main process と調停役スレッドでの stream の解釈 (AD-006 の読み替え)。改定は人間の承認を要する (PATCH 相当)。
  **持ち主 = 次の Constitution 改定 (人間の承認を得た時点)**。それまでは AD-043 Decision 2 と check.mjs 項目 18 (調停役スレッドの `JSON.parse` 0 件) で守る
  (X-5 pr-gate R1 / R2 architecture H-001)

**Principle XV (i18n) の棚卸しへの申し送り**: `src/main/infra/session/target-finder.ts` の
`候補 #N` / `名前 (#N)` は **`infra` が生成する日本語**であり、「訳出は `ui`」(FR-031 / FR-047) の例外である。
一意性を境界の手前で決める必要があるため現状はここに置いている
(移すと `EnumerationTarget` + DTO 2 本にフィールドが増える)。
**M3 までの i18n リソース化の判断でこの 2 本を必ず含めること** (pr-gate Round 4 / A4-006)。

#### R-2 の依存は R-1 の全体ではない

R-2 が要るのは **US-1（ランタイム検出）/ US-2（フォルダ登録）/ US-3（組み合わせの解決）**である。
これらが揃った時点で「どのディストロのどのフォルダを見るか」が決まり、
セッションの列挙先（`<config-dir>/projects/<encoded-cwd>/`）を組み立てられる。

R-1 の残り 2 つは R-2 をブロックしない。

| R-1 の US | R-2 への関係 |
|---|---|
| US-4（依存規則違反がその場で止まる） | Foundational だが R-2 の入力ではない。**先に入れておく価値は「R-2 以降のコードが最初から規則下に置かれる」こと**にある |
| US-5（リポジトリを訪れた人が現状を把握できる） | R-2 の入力ではない。Polish |

**R-1 の US-3 完了時点で R-2 に着手してよい。**

### M2 の前提は先に潰してある

**SPIKE-5**（`spawnClaudeCodeProcess` による WSL 起動）は M1 に先立って実施済み
（[AD-018](decisions/0018-wsl-process-control.md)）。ここが通らないと M2 が成立しないため
早く潰した。結果として stdin / stdout の疎通、中断機構、大きな tool_result の扱いは確定している。

## M2: 走らせられる

**達成状態**: 起動条件を選んで複数セッションを回せる。日本語で誤送信しない。

| 順 | ID | feature | domain | 依存 | 前提 SPIKE |
|---|---|---|---|---|---|
| 5 | X-1 | 単一セッション起動とストリーミング | `session` | R-4 | SPIKE-5 / SPIKE-3 **完了** |
| 6 | X-2 | 日本語 composer | `ui` | X-1 | **SPIKE-4** |
| 7 | X-3 | Provider 登録と到達可能性判定 | `provider` | X-1 | SPIKE-7 **完了** / design-gate PASS ([AD-040](decisions/0040-provider-settings-constrained-projection.md) で C-001 調停) / R-02 = **awsCredentialExport 化** (AWS SDK 依存なし・一時資格の実体を持たない) / **ADR follow-up (pr-gate R2 D-L-101/102)**: R-02 が [AD-039](decisions/0039-credential-delegation-verified.md) D4「アプリが一時資格を扱う唯一の例外」を失効させ、[AD-005](decisions/0005-provider-as-registrable-value.md) の型を `CredentialRef`/`configDir: HostPath\|WslUncPath` に精緻化した (007 data-model §2)。→ **[AD-042](decisions/0042-provider-type-refinement-and-d4-lapse.md) で記録済み (X-4, 2026-09-30)** |
| 8 | X-4 | 起動設定ダイアログとプリセット | `session` | X-3 | SPIKE-6 **完了** / 越境警告 AD-016 / 権限モードは**安全 3 値** (AD-020 の危険度表。[AD-041](decisions/0041-x4-launch-config-on-x1-launch-gate.md) (a)) / 作業領域戦略 AD-017 は I-1 へ付け替え (AD-041 (d)) / design-gate R3 PASS |
| 9 | X-5 | supervisor 分離とマルチセッション | `session` | X-4 | SH-000 の実機確認 **完了** (Worker 内で SDK と spawn が動く / port は Worker へ渡せないため本文は調停役が文字列で中継 / どの終わり方でも孤児なし) / 単一 supervisor + セッションスレッド・上限 10 ([AD-043](decisions/0043-single-supervisor-session-threads-and-session-limit.md)) / design-gate R3 PASS / **完了** (PR #9) |

**M2 の後続 (critical path 外)**: X-4 の design-gate (2026-09-30) で範囲から外した項目の持ち主。M2 の達成状態を待たせない。

| ID | feature | domain | 依存 | 内容 |
|---|---|---|---|---|
| X-6 | 起動設定の拡張軸とセッション操作 | `session` | X-5 | **対応表の割当 (O-2 から)**: 実行中のセッションの操作 — 制御要求 `set_permission_mode` / `set_model` / `set_max_thinking_tokens` / `rename_session` (`docs/ui-coverage.md` で `後続: X-6` の行。**X-6 の完了の PR で対象の行を `実装済み` / `表示不要` に書き換える** — 書き換えずに完了にすると Constitution 検証の項目 21 が落ちる) / `SessionLaunchConfig` の残りの軸 (追加ディレクトリ / 上限 / セッション名) / Win32Runtime 直接起動 / fork・resume・rename・tag・delete / providers.json・presets.json の退避ファイル一覧・復元・版不一致の UI (件数の 1 行表示は X-4 で実装済み。AD-042 Decision 4) / 同一内容の `.bak` の重複抑止 / claudePath の形の判定 (shebang 形の案内。AD-041 記録 2) / settings store 3 種の読み取り失敗・非配列 root・mutation 直列化の是正 (X-4 code-gate db H-001 / M-002 / M-003 の provider・folder 分) / セッションスレッド内のプロンプトキューが上限を超えたときの通知 (X-5 から繰越) / 失敗したセッションの再開 (X-5 FR-013 は自動で再開しない) / ツール実行中に Worker だけが異常終了したときの孤児の実機観測 (X-5 は claude がアイドルのときだけ観測。残るなら AD-043 Decision 5 の回収経路を作る。X-5 pr-gate R1 platform-boundary M-001) |
| X-7 | aws-assume-role helper の生成と CloudTrail 追跡 | `provider` | X-4 | `RoleSessionName` 付き helper をアプリが生成する (roleArn / region / profile の登録スキーマ、`check.mjs` 項目 6 の file sink 拡張、helper の完全性)。X-4 までは X-3 のユーザ供給 helperPath 方式。POSIX helperPath に所属 distro を持たせる (AD-042 残存リスク)。api-key / oauth-token / aws-profile / env-passthrough に固有の `forwardKeys`、Bash tool からの秘密 env の可視性、helper のシェル実行方式を実機で観測する (X-4 から繰越。AD-041 記録 3)。extraEnv を名前の allowlist にするかを検討する (AD-041 (e) 3) |

X-2 を X-1 の直後に置いたのは、**日本語入力が壊れたままでは以降の feature を自分で使えない**ため。
Principle VIII は製品の採否条件であり、後回しにすると検証が遅れる。

**R-3 からの申し送り (SH-052 / live streaming)**: transcript 本文の markdown は R-3 では
`@assistant-ui/react-markdown` の `MarkdownText` (`smooth` 付き) で描画する。**live streaming で真価を発揮する
Streamdown (未完 markdown の構文修復 / CJK の分割耐性) の採否は X-1 (単一セッション起動とストリーミング) /
X-2 (日本語 composer) で判断する** — R-3 は過去ログの表示であり逐次生成がないため導入コストに見合わない
(research R-04)。**ただし XSS 境界 (生 HTML 非描画・URL allowlist) は R-3 で固めており、X-1 で描画ライブラリを
差し替える場合もこの境界を回帰させないこと** ([AD-034](decisions/0034-transcript-read-path-and-process-boundary.md) / FR-020)。

## M3: 差配できる

**達成状態**: 10 セッションを俯瞰でき、未表示情報がゼロ。**「未表示ゼロ」は [AD-044](decisions/0044-ui-coverage-assignment.md) の M3 の完了の条件 (Tier A の後続のうち割当先が M3 の feature の行が 0。Constitution 検証の項目 21 の出力で読む) で判定する** (O-2)。

| 順 | ID | feature | domain | 依存 | 前提 SPIKE |
|---|---|---|---|---|---|
| 10 | O-1 | セッション監視ビュー | `session` | X-5 | — / design-gate R2 PASS / code-gate PASS / pr-gate R2 PASS (Critical 0) / **完了** (PR #10。[010 spec](../specs/010-session-monitoring-view/spec.md)。稼働中セッション一覧の拡張。実機計測 SC-005 は有効な回 0 件で、利用者が 2026-10-02 に閉じた (spec FR-012 の改訂の行)。残した宿題は O-3 の「義務 (O-1 から)」) |
| 11 | O-2 | `docs/ui-coverage.md` の確立（**SDK の型と機械照合**。割当の確定）+ Tier B/C 再棚卸し + 実行中の tool の結果と Hook / Background task の行 + transcript の情報密度 | `ui` | O-1 | SPIKE-12 **完了** / design-gate R2 PASS / code-gate PASS / pr-gate R3 PASS (Critical 0) / **完了** (PR #11。[011 spec](../specs/011-ui-coverage/spec.md)。表示の実装の残りは O-4 / O-5 / O-6 に割り当てた。P-4 (ui-coverage-reviewer) を含む) / **義務 (O-1 から)**: (1) Hook / Background task の表示の割当と、状態の保持が要る場合の持ち主 domain の判断 (session は含めないと決めた。AD-020 Consequences) (2) Tool group の既定 open 化 (AD-035 の「O-1 候補」) (3) transcript の情報密度の切替 (監視ビューの行の密度は O-1 が持つ) (4) 直近の活動の tool ごとの整形 (対象のファイル名やコマンドの先頭語だけを出す。tool 入力の先頭に秘密が出うる点も扱う) |
| 12 | O-7 | アプリのシェル (タブのビューを廃し、サイドバー・中央・右のペインの 3 面に) | `ui` | O-2 | — / [AD-046](decisions/0046-app-shell-layout.md) / design-gate R1 PASS ([013 spec](../specs/013-ui-app-shell/spec.md))。右のペインは枠・タブの表・「概要」まで (他のタブは O-4〜O-6 と OPT-panel)。**`running-session-store.ts` / `RunningSessionList.tsx` の切り出し (上の system-scope) の持ち主には当たらない** (行の部品と派生値を変えない。区画の要素を `section` にし、選択の操作の通知 `selectionSeq` を足すだけ) |
| 13 | O-3 | Thread 検索と observability | `ui` | O-2 / O-7 | — / **義務 (X-4 から)**: session charter KPI「再利用率」の計測経路 (起動元 `preset` / `manual` のローカル利用ログ。AD-041 (h)) / **義務 (O-1 から)**: (1) UI ラベルの i18n リソース化の判断 (Constitution Principle XV の期限 M3。`target-finder.ts` の 2 本を含める) (2) <a id="o3-kpi-smoothness"></a>**session charter KPI「並列時の滑らかさ」の実機計測の宿題** (X-5 → O-1 と繰り越し、O-1 では有効な回 0 件で利用者が閉じた。[O-1 quickstart-results V-3](../specs/010-session-monitoring-view/quickstart-results.md)): (a) `perf/` の出力に窓の終わりの行の状態の内訳 (応答待ち・承認待ち・失敗) を足す — **SC-005 の出力の許可リストの変更なので利用者の承認が要る** (b) 10 本が窓のあいだ応答を流し続けるように、プロンプトか有効な回の条件を見直す (c) 行の切り替え (charter Journey 3 の手順 3。O-1 の 1〜3 回目で 100〜275ms の long task) も含めて測り直す。**O-7 から行の切り替えはシェルの中央の切り替え (稼働中と過去の会話のあいだを含む) になり、サイドバーに過去のセッションの一覧が常に並ぶ** ので、O-1 / X-5 の値と比べるときはこの基準の変化を並べて書く。E2E の 50ms 超の long task が X-5 の 0〜10 件から O-1 で 33 件に増えた点も比較の基準として並べる。**観測点 `receivedMessages` は O-2 から tool の結果の送り直しと Hook / task の行の作成・更新も数える** (O-2 data-model §6) ので、O-1 / X-5 の値と比べるときはこの基準の変化を並べて書く (d) 着手時に上の system-scope の「実機計測ハーネス (`perf/`) の ADR 化」が未了なら、O-3 で proposed の ADR を起こしてから perf の安全柵・出力を変える (O-1 pr-gate R2 architecture L-101) |
| 14 | O-4 | 計量と制限の表示 | `ui` | O-2 / O-7 | — / **右のペインのタブの候補 (O-7 から)**: Context display・Cost meter (AD-046 のタブの表に足す) / **対応表の割当 (O-2 から)**: `result` の**失敗の理由** (subtype の区別・`errors`。今は全部「Provider の認証/接続」と出る。理由ごとの文言のテストを足す。**session の契約の拡張を伴う** — `session-core.ts` の `ResultTermination` (`complete` / `provider-error`) と失敗の理由キーを広げる。X-1 FR-030 (認証の失敗を黙って完了にしない) を保つ。持ち主の確認は O-4 の design で session charter と合わせて行う)・費用・使用量・ターン数・`permission_denials`、`rate_limit_event` (Quota banner)、`api_retry`、`status` (権限モードの変化・圧縮中・圧縮の失敗)、`thinking_tokens`、`tool_progress` (tool の経過時間)、コンテキストの使用量 (`get_context_usage`。Context display)、Cost meter (`get_session_cost` / `get_usage`)、task の進捗 (`task_progress`)。対象の行は `docs/ui-coverage.md` で `後続: O-4` の行 |
| 15 | O-5 | MCP・Elicitation・プラグイン・コマンドの表示 | `ui` | O-2 / O-7 | — / **右のペインのタブの候補 (O-7 から)**: Server panel / **対応表の割当 (O-2 から)**: セッションの構成 (`init` の `model` / `tools` / `slash_commands`)、MCP の Server panel (`init` の `mcp_servers`・MCP 系の組み込み tool `RefreshMcpTools`・MCP の制御要求 `mcp_status` / `mcp_call` / `mcp_message` / `mcp_set_servers` / `mcp_reconnect` / `mcp_toggle`・MCP の resource の tool)、Elicitation form (`elicitation_complete`・制御要求 `elicitation`)、`AskUserQuestion` の応答 UI (Elicitation とともに**応答を session の control 経路で返す** — session の契約の拡張を伴う)、`request_user_dialog`、`plugin_install` / `reload_plugins` / `reload_skills`、`commands_changed` (slash command の一覧)、`auth_status`、MCP の tool の表示、Tier C の Data table / Chart / Timeline / Diagram を MCP の結果に転用するかの判断。**操作画面 (MCP サーバーの追加・削除など) は含めない**。対象の行は `後続: O-5` |
| 16 | O-6 | 会話の境界と tool の専用表示の第 2 弾 | `ui` | O-2 / O-7 | — / **右のペインのタブの候補 (O-7 から)**: TodoList・Background task / **対応表の割当 (O-2 から)**: コンパクション境界の専用 element (実行中を含む)、`file` part の File element、Checkpoints (`files_persisted` / `rewind_files`)、モデルの拒否 (`model_refusal_*`)、`notification` / `informational` / `local_command_output` / `memory_recall` / `prompt_suggestion` / `conversation_reset` / `mirror_error` / `tool_use_summary` / `active_goal`、`background_tasks_changed` と制御要求 `background_tasks` / `stop_task` / `get_hooks_listing`、`TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` の TodoList 表示 (TodoWrite と同じ計画・進捗)、`Read` / `Glob` / `Grep` の File tree、Web search / fetch (`server_tool_use` / `web_search_tool_result` を含む)、Agent plan の markdown (AD-035 D6)、実行中の subagent の入れ子 (`parent_tool_use_id`・`getSubagentMessages`)、**一般の Hook の表示と `includeHookEvents` を足す ADR** (AD-041 (g) の読み替え)、実行中の Background task の一覧の要否 (要るなら持ち主の domain を人間に諮る)、後から背景に移った task の行、対応表 B 節 (中身のブロック) の機械照合。**O-2 の pr-gate R2 から**: tool の表示の「結果待ち」と「結果不明」(結果が来ないまま終わった。システムイベントの行と同じ考え方) の印 / Hook・task の状態の変化と tool のエラーを支援技術に読み上げる announcer (WCAG 4.1.3) / シェルの Background task 同士を秘密を出さずに見分ける手がかり / ToolFallback の見出しの日本語化。**O-2 の実機の目視 (quickstart V-4) の結果の反映**: `hook_name` がコマンドの文字列を含むなら `hook_event` だけを出す / 過去ログに Hook・task の行が残るなら対応表の経路を「両方」に / 実行時の subagent の tool 名 (`Agent` / `Task`) / 並列の tool の結果の届き方 (送り直しの回数。O-2 research R-03)。対象の行は `後続: O-6` |

O-4〜O-6 は O-2 で足した。M4 / M5 の順はそれに合わせて振り直した (O-2 design-gate R2 architecture L-105)。D-1 の依存は O-3 のままで、M3 の完了 (O-4〜O-6) は待たない。

順 12 (O-7) は O-7 の design で O-3 の前に足し、以降の順を 1 つずつ振り直した。O-3〜O-6 は検索・palette・Context display・Server panel・TodoList の置き場所 (サイドバー / 中央のヘッダ / 右のペインのタブ) がシェルの分割で決まるので、O-7 の後に置く ([AD-046](decisions/0046-app-shell-layout.md))。D-1 の依存は O-3 のまま。

**O-2 で対応表そのものを成果物にする。** これが揃うまで Principle XII は検証不能である。

**X-1 からの申し送り (ui-coverage / 2026-09-26)**: X-1 が新設した 2 経路を **O-2 の `docs/ui-coverage.md` 対象に繰り越す** —
(1) **承認カード** (`SessionEvent` の `permission-request` → Approval card)、(2) **聞かれずに拒否された操作**
(`SDKPermissionDeniedMessage` → `permission-denied` 表示)。X-1 は最小表示 (承認 allow/deny・拒否リスト) で成立させたが、
SDK メッセージ型と表示の対応表は O-2 が正本にする。持ち主は O-2 (持ち主不在の延期を残さない。AD-028 §5 / AD-031)。

## M4: 任せられる

**達成状態**: Auto / `bypassPermissions` を隔離内で安全に回せる。

| 順 | ID | feature | domain | 依存 | 前提 SPIKE |
|---|---|---|---|---|---|
| 17 | I-1 | `DockerRuntime` と endpoint 抽象 + `sessionStore` | `isolation` | X-5 | SPIKE-10 **完了** / SPIKE-11（再定義） / 作業領域戦略の軸 AD-017 (X-4 から付け替え。AD-041 (d)) / 転送禁止キーの登録時検証を transport の和集合として作り直す (AD-041 (e) 3・(h)) |
| 18 | I-2 | コンテナライフサイクルと隔離可視化 **+ volume 孤児回収** | `isolation` | I-1 | — / **義務 (O-1 から)**: 監視ビュー (稼働中セッション一覧) の compact の行にも隔離バッジを出す (O-1 FR-008 が置き場を残した) |
| 19 | I-3 | sandbox capability 判定と権限モードのゲート | `isolation` | I-2 | — / **義務 (X-4 から)**: 昇格モードの capability 連動提示、承認の `scope: 'capability'` 永続化 (AD-041 (c)) / **対応表の割当 (O-2 から)**: Permission grant (承認の capability 付与の表示)、制御要求 `list_permission_rules`。対象の行は `docs/ui-coverage.md` で `後続: I-3` の行 (**I-3 の完了の PR で書き換える。書き換えずに完了にすると項目 21 が落ちる**。Tier A だが M4 なので M3 の完了の条件には数えない。AD-044) |

I-1 では **`wsl:<distro>` endpoint（WSL 内 Docker Engine）を第一に検証する。**
主開発ホストに Docker Desktop は入っていない。`/mnt/c` 越し bind mount の実効速度もここで実測し、
遅ければ §13.2 のリポジトリ配置方針を見直す。

## M5: 配れる

**達成状態**: 自分以外が使える。

| 順 | ID | feature | domain | 依存 | 前提 SPIKE |
|---|---|---|---|---|---|
| 20 | D-1 | パッケージングと Windows インストーラ | `runtime` | O-3 | **SPIKE-13**（本格確認） |

## Optional scope

どのマイルストーンも待たない。やる価値はあるが critical path に乗らない。

| ID | feature | domain | 着手の目安 |
|---|---|---|---|
| OPT-mac | macOS 対応（`DirectRuntime` / Seatbelt / IME 検証） | `runtime` | M5 の後、必要になったら |
| OPT-pty | PTY フォールバックタブ | `ui` | SDK 経路で足りない対話 TUI に出会ったら |
| OPT-panel | 右のペインのタブ: Changes / PR の Webview / Files / Browser (O-7 から。**Terminal は OPT-pty**) | `ui` (main / infra 側の作業 (git・ファイルの監視・別の WebContents) の domain は OPT-panel の design で人間に諮る) | O-3〜O-6 の後、必要になったら。Browser / PR の Webview は [AD-046](decisions/0046-app-shell-layout.md) Decision 4 の境界 (主ウィンドウの `webviewTag` を有効にしない・main が管理する `WebContentsView`・アプリの CSP を緩めない) に従う |

## SPIKE 一覧

| ID | 内容 | いつ | 所要 |
|---|---|---|---|
| SPIKE-8 | ランタイム検出とパス変換の確定。**docker endpoint の検出手段を含む** | R-1 の前 | **完了 (2026-09-13)** → [AD-015](decisions/0015-wsl-access-strategy.md) |
| SPIKE-1 | `listSessions()` と `CLAUDE_CONFIG_DIR` の関係 | R-2 の前 | **完了 (2026-09-13)** → [AD-021](decisions/0021-session-store-and-enumeration.md)。config dir は引数で取れない。子プロセス方式が本線 |
| SPIKE-2 | assistant-ui Elements の導入コスト実測 | R-3 の前 | **完了 (2026-09-24)** → [AD-033](decisions/0033-assistant-ui-elements-introduction-cost.md)。導入は R-1 で払い済み、残りは仮想化とデータ配線 |
| SPIKE-5 | `spawnClaudeCodeProcess` による WSL 起動 | X-1 の前 | **完了 (2026-09-13)** → [AD-018](decisions/0018-wsl-process-control.md) |
| SPIKE-3 | `claude` プロセスの実メモリ測定 | X-1 の前 | **完了 (2026-09-13)** → [AD-001](decisions/0001-adopt-electron-over-tauri.md) に追記。idle 225MB / 並列でも変わらず |
| SPIKE-4 | 日本語 IME の composer 挙動 | X-2 の前 | 1〜2時間 |
| SPIKE-7 | 認証委譲機構の確認 | X-3 の前 | **完了 (2026-09-29)** → [AD-039](decisions/0039-credential-delegation-verified.md)。委譲は SDK 0.3.270 で成立。helper 設定は per-session `settings` で渡せる。`env` は置換。`aws-assume-role` のみアプリが一時資格を扱う |
| SPIKE-6 | SDK 型定義からの選択肢確定 | X-4 の前 | **ほぼ完了 (2026-09-13)** → [AD-020](decisions/0020-sdk-emitted-message-inventory.md)。`SandboxSettings` の詳細のみ I-3 前に残す |
| SPIKE-9 | **`/mnt/c` 越し bind mount の実効速度** | R-1 の前 | **完了 (2026-09-13)** → [AD-016](decisions/0016-cross-filesystem-performance-cliff.md) |
| SPIKE-10 | `docker exec -i` 疎通 / 非 root × bypassPermissions | I-1 の前 | **完了 (2026-09-13)** → [AD-022](decisions/0022-docker-exec-process-control.md)。疎通 OK、**kill は孤児化**、非 root 必須を確認 |
| SPIKE-11 | **再定義**: `SessionStoreEntry` の型と SQLite スキーマ設計（ミラー手段自体は AD-021 で解決） | I-1 の前 | 1〜2時間 |
| **SPIKE-14** | **assistant-ui の element 実在確認** | R-3 の前 | **完了 (2026-09-13)** → [AD-019](decisions/0019-assistant-ui-element-inventory.md) |
| SPIKE-12 | SDK が emit する型・tool 名・システムイベントの全列挙 | O-2 の前 | **完了 (2026-09-13)** → [AD-020](decisions/0020-sdk-emitted-message-inventory.md)。`SDKMessage` は 39 型 |
| SPIKE-13 | `asarUnpack` とネイティブバイナリの同梱可否 | **R-1 で薄く試す** / D-1 の前に本格確認 | **第 1 段階 完了 (2026-09-15)** → [AD-026](decisions/0026-packaging-first-pass.md)。`claude.exe` (227 MB) が asar 外に実行ビット付きで展開され、インストーラ (約 176 MB) が生成できた。**第 2 段階（署名・公証・自動更新）は D-1** / 半日 |

各 SPIKE の結果は `docs/decisions/` に ADR として起票する（PLAN.md §3 ではない）。

### SPIKE-9 を前倒しする理由

[AD-012](decisions/0012-docker-control-via-cli.md) では「I-1 で実測する」としていたが、
**これは PLAN.md §13.2 の「リポジトリを Windows 側 NTFS に置く」という根本方針を覆しうる**論点である。

WSL 内 Docker Engine に `/mnt/c` 越しで bind mount する構成が実用にならない速度なら、
選択肢は「リポジトリを WSL 側に置く」か「コンテナ内で作業フォルダを別管理する」になる。
**M4 まで待つと、それまでに積み上げた配置前提がすべてひっくり返る。**
R-1 に着手する前に潰しておくべきである。

### SPIKE-12 と SPIKE-6 の違い

SPIKE-6 は `SessionLaunchConfig` の**選択肢の値**（`PermissionMode` の列挙値、`effort` の段階）を
確定するもの。SPIKE-12 は **UI が表示すべき情報の全集合**（メッセージ型 / tool 名 / システムイベント）を
列挙するもので、`docs/ui-coverage.md` の行そのものになる。別物なので分けてある。

### SPIKE-13 を 2 段階にする理由

`asarUnpack` でネイティブバイナリが動く形で同梱できるかは「やってみないと分からない」典型で、
**D-1（M5）で初めて詰まると配布経路ごと失われる**。R-1 でプロジェクトを初期化する時点で
Agent SDK を 1 つ入れて `electron-builder` を 1 回通すだけでも、致命的な非互換は早期に見つかる。

**第 1 段階で実際に 2 つ見つかった。** いずれもホストのセキュリティ製品との相互作用で、
素の `electron-builder` ではインストーラが生成できなかった
（[AD-026](decisions/0026-packaging-first-pass.md) §3）。D-1 で初めて踏んだ場合、
配布経路の問題とビルド環境の問題の切り分けから始めることになっていた。

あわせて **インストーラの大半が SDK 同梱バイナリである**ことが分かった。
D-1 で配布サイズを議論する際、削減余地はアプリ側のバンドルではなくそこにある。

## 1 feature のワークフロー

```
/cl-design "<docs/prompts.md の該当プロンプト>"
      ├─ /cl-spec        spec.md        (drafting)
      ├─ /cl-plan        plan.md        (→ planning)
      ├─ /cl-tasks       tasks.md       (→ tasking)
      └─ /cl-design-gate Critical=0 で   (→ implementing)
/cl-implement        ← auto-chain で code-gate
/cl-code-gate        ← PASS で reviewing へ
/cl-pr-gate          ← Critical=0 で done を許可
/cl-done             ← PR 提出、completed へ
```

**`/cl-design` が Design フェーズ 4 ステップを 1 コマンドで完走する。** 個別起動も可能。

gate が fail したら status を進めない。Critical を解消してから再実行する。
design-gate が FIX_REQUIRED のときは status が `tasking` に留まり（`implementing` からは降格）、
`/cl-design --spec-dir <dir> --from gate` で再開する。
