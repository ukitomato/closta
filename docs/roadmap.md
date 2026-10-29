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
- **design は次の 1 本だけ。** 依存先の feature が main に入るまで、次の feature の `/cl-design` を起こさない
  （前倒しの design は依存先の実装に合わせて作り直しになる。O-3〜O-5 の載せ直しが例）
- **feature の範囲と義務の正本は本書の行。** `/cl-design` のプロンプトには書かず、`/cl-spec` が行から読む
- **マイルストーンの終わりに棚卸しする。** そのマイルストーンの spec の gate の出力にある Medium / Low と、
  持ち主の feature が決まっていない申し送り (「次に X を触る feature」) を一覧にし、利用者が
  「直す / 次のマイルストーンの特定の feature に付ける / 捨てる」を決める。直すものは 1 本の整理の spec にまとめる
  ([AD-050](decisions/0050-gate-finding-handling-and-round-limit.md))
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
  composer の領域の基準画像は O-7 でも変えていない (右のペインを既定で畳んで composer の幅を保つ。本機の描画は main の基準画像と縦 1px の差を除いて一致した。
  経緯は [013 quickstart-results](../specs/013-ui-app-shell/quickstart-results.md))。全画面 (シェル) の基準画像を足すかは
  O-3 の design で判断するとしていた (サイドバーに検索を足し、シェルの日本語の並びが最初に変わる feature。持ち主のいない延期を残さない。
  O-7 pr-gate R1 architecture M-002)。**O-3 の結論 (2026-10-06。[012 spec](../specs/012-ui-thread-search/spec.md) FR-018)**:
  サイドバーの過去のセッションの区画の基準画像を 1 枚足す (`e2e/sidebar-screenshot.spec.ts`。基準画像は CI の artifact から取る)。
  全画面は撮らない (O-4〜O-6 が右のペインと中央のヘッダを変えるたびに取り直しになる)。シェルの残りの全角混在のレイアウトは、
  jsdom の component テストと quickstart の実機の目視で見る
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
- **lint と reviewer の発火条件の死角 (O-7 起点。code-gate convention L-002 / L-006 / L-010 / M-009。system-scope)** —
  (1) 使われない export を検出する規則が無い (`no-unused-vars` は局所変数だけ、depcruise の `no-orphans` はモジュール単位。O-7 で
  `ThreadListNew` などが参照 0 のまま残っていた)。knip などの追加を判断する (2) import の並びの規則が無い (eslint-plugin-import の
  `order` などを入れるか) (3) a11y / ux reviewer の `auto_invoke_patterns` が `*.tsx` だけで、文言の表 (`features/*/labels.ts`) だけを
  変える PR では起動しない (O-7 で `features/shell/labels.ts` と `panel-tabs.ts` だけは足した。session / session-list / chat の
  `labels.ts` は残る。ui-coverage-reviewer には O-7 の pr-gate R2 で `session/ApprovalCard.tsx` と `shell/labels.ts` を足した。D 節の
  文言の正本 `session/labels.ts`・`session-view.ts` は監視ビューと共有で文言だけの変更でも起動するので入れず、ファイルの側に
  「変えるときは対応表の行を見る」と書いた。機械で引く形は持ち主が判断する) (4) docs の制御文字 (ESC / TAB。PowerShell の二重引用符の文字列の backtick が化けたもの) を検出する検査が無い
  (O-7 で `docs/ui-coverage.md` の F 節の element 名が化け、名前で引けなくなっていた)。持ち主 = 本 E2E / 検証基盤 feature
- **O-7 の pr-gate R1 が見つけた system-scope の項目 (O-7 起点。記録)** — 持ち主 = 本 E2E / 検証基盤 feature (別に書いたものを除く)
  (1) **CSP の違反を E2E で集める仕組みが無い** (security M-001)。既存の Dialog (Radix) は開くたびに react-remove-scroll-bar の
  inline の `<style>` を差し込み、本番の CSP (`style-src 'self'`) がそれを弾く (失うのは scroll-lock の CSS だけ)。`launchApp` に
  `page.addInitScript` で `securitypolicyviolation` を集め、既知の 1 種だけであることを確かめる。違反そのものを消すには nonce の配信で
  `protocol.ts` を変える (別 spec か ADR)。**CSP を緩めて通さない** (AD-025 §7)
  (2) **主ウィンドウの `webviewTag: false` を明示し、`webPreferences` を機械で確かめる** (security L-005。AD-046 Decision 4。
  `window.ts` は今は既定に頼っている)
  (3) **`runtime-store.ts` の検出を束ねる (single-flight)** (platform-boundary M-001)。`list()` が進行中の検出を待たずにもう 1 本起こす
  ので、O-7 で起動直後にマウントされる 2 つの呼び出し元 (`RunningSessionsProvider` の `useRuntimes` と `useSessions`) の数だけ
  wsl.exe が増える (起動時に最大 9 本)。並行の `list()` と「`list()` の後の `snapshot()` が WSL の descriptor を含む」(FR-016 の main
  側の前提) のテストも足す。あわせて「`probeAll` の後に解決した `list()` が判定の結果を消さない」のテスト (R1 の推奨の (c)。遅れて
  終わった `detect()` は `byId` を丸ごと置き換え、`list()` の経路は `notify()` を呼ばない) も足す。single-flight を入れたら、過去の区画を
  マウントした状態で起動時の `probe-batch` を測る (O-7 では未計測。013 quickstart-results。pr-gate R2 platform-boundary M-001 / L-002)。
  持ち主 = 次に `runtime-store.ts` を触る feature (それまでは本 E2E / 検証基盤 feature)
  (4) **`session-service` の `onRuntimesChanged` / `onFoldersChanged` が初回の取得の前に「未取得の索引」(取得時刻 0) を publish する**
  (platform-boundary L-004)。O-7 は renderer の側で取得時刻 0 の通知を受けないようにした。main の側で `!loaded` のとき publish しない。
  main で止めたら `useSessions.ts` の取得時刻 0 の除外を外すか、残すなら「取得時刻 0 = 未取得」を `SessionIndexDTO.fetchedAt` の文書に書き
  `session-service.test.ts` で固定する。それまでは DTO と R-2 の契約に無い main と renderer の取り決め (生産側は `session-service.ts:189` の
  初期値。pr-gate R2 platform-boundary L-101 / architecture L-104)
  (5) **Constitution 検証の項目 8 が `navigator.*` を見ない** (platform-boundary L-003。001 R1 M-004・016 design-gate R2 L-105 と同じ。
  項目 8 の持ち主に送る)
  (6) **renderer の feature 間の向き (shell → 各 feature。逆は禁止) を機械で強制していない** (architecture L-004。AD-023 の「M3 で肥大
  したら再検討」の契機)。depcruise に `features-not-to-shell` を足すか、AD-023 の再検討として扱う
  (7) **composer の名前と placeholder が英語** (a11y L-007。Principle XV / WCAG 3.1.2。e2e の locator を同時に直す)。持ち主 = O-3
  (UI ラベルの i18n リソース化の判断を持つ)。**O-3 の結論 ([012 spec](../specs/012-ui-thread-search/spec.md) FR-014)**: 名前と
  placeholder を日本語にし、`features/chat/labels.ts` の文言の表から取る。E2E・component テスト・perf (文字列だけ。実行しない) の
  locator を同じ PR で直す。composer の他のボタンの英語の名前 (`Send message`・`Stop generating`・`Scroll to bottom`・音声入力) は
  (7) が名指していないので O-3 は直さない。持ち主 = composer を次に触る feature (O-10 と X-6 の早いほう。下の O-7 pr-gate R2 (1) と
  同じ持ち主。012 plan RK-08)。**O-5 の design で付け替えた** (2026-10-10 に利用者が承認。015 spec「義務の扱い」の Q2): O-5 は
  composer のスラッシュコマンドの候補を O-10 に送り (AD-048)、composer とその E2E・基準画像に触れないので、元の持ち主の「O-5」を「O-10」に替えた。**O-10 で閉じた** ([018 spec](../specs/018-session-answer-ui-and-composer-commands/spec.md) FR-013): composer のボタンの名前を日本語にし (`COMPOSER_LABELS`)、E2E の locator を同じ PR で直した
- **O-7 の pr-gate R2 が見つけた system-scope の項目 (O-7 起点。記録)** —
  (1) **表示中のセッションのターンが始まるたびに composer がフォーカスを奪う** (a11y M-101。WCAG 2.4.3 / 3.2 系)。`thread.aui.tsx:579-592`
  の `ComposerPrimitive.Input` は `unstable_focusOnRunStart` / `unstable_focusOnThreadSwitched` を上書きせず、ライブラリの既定 (どちらも
  true) のまま。外部ストアの runtime は `isRunning` が false → true に変わるたびに run の開始を出すので、キューに積んだ入力が送られると、
  サイドバー・右のペイン・中央のヘッダにいた利用者のフォーカスが composer に移る。O-7 で過去の一覧と右のペインが稼働中の会話と同じ画面に
  並ぶようになり、起きる場面が増えた。`LivePane` の composer で `unstable_focusOnRunStart={false}` にし、`unstable_focusOnThreadSwitched`
  (行の選択で入力へ移る) を保つかを判断して記録する。テストは「サイドバーの行にフォーカスがある間に表示中のセッションが idle から running に
  変わっても動かない」。持ち主 = composer を次に触る feature (M3 の O-10 (composer のスラッシュコマンドの候補) と X-6 (`set_model` /
  `set_permission_mode`。`docs/ui-coverage.md` の Settings の行のとおり Composer model picker を照合する) の早いほう。composer は ui charter の
  In scope。pr-gate R3 architecture L-204)。**O-5 の design で O-5 から O-10 に付け替えた** (上の (7) と同じ。015 spec の Q2)。**O-10 で閉じた** ([018 spec](../specs/018-session-answer-ui-and-composer-commands/spec.md) FR-014): `unstable_focusOnRunStart={false}` にし、`unstable_focusOnThreadSwitched` は既定のまま (行の選択で入力へ移る)
  (2) **押したボタンが自分ごと消えると、フォーカスが body に落ちる** (a11y R2 M-102 の行の経路・R3 M-201。WCAG 2.4.3)。どれも X-1 / X-2 /
  X-5 からある session の部品で、中央の中身 (`shown`) は替わらないので、O-7 の `useFocusRescue` (中央の中身の切り替えだけを拾う。013
  data-model §1) には当たらない:
  - サイドバーの稼働中の行の「閉じる」(`RunningSessionList.tsx:538-549`。行ごと消える) → 隣の行の Trigger か稼働中の区画の見出しへ
  - 承認カードの「許可」「拒否」(`ApprovalCard.tsx:45-50`。`respond` が同期で `pending: null` にしてカードが外れる。承認はこのアプリの
    主な操作) → composer へ
  - キューの拒否の告知の「閉じる」(`LivePane.tsx:341-348`)・積んだ入力の「キューから削除」(`LivePane.tsx:397-404`)・「表示を増やす」の
    最後の押下 (`LivePane.tsx:183-193`) → composer へ
  直し方の候補は 2 つ。各部品で消える前に行き先へ移すか、シェルの 1 か所 (`CenterPane` の `main`) で拾うか。後者は `focusout` では
  作れない — Chromium は要素の削除で blur / focusout を出さず、本文のクリックでも `relatedTarget === null` の focusout が出て入力欄へ
  奪ってしまう。`main` の中で最後にフォーカスを持った要素を覚え、`MutationObserver` の削除の通知で「その要素が切り離され、フォーカスが
  body にある」ときだけ移す形になる。テストは「承認待ちで『許可』を押した後、composer にフォーカスがある」。持ち主 = 監視ビューの行を
  触る次の feature (上の「`running-session-store.ts` の切り出し」の (3) の行の部品の切り出しとあわせる)
  **O-4 が持った** ([014 spec](../specs/014-ui-metering-and-limits/spec.md) FR-019 / data-model §8 / research R-10): 各部品で、消える操作の**前**に
  行き先へ移す形にした。行き先を探す処理は `features/session/focus-handoff.ts` の 2 つの関数 (行を閉じた後の行き先・composer) に集め、押した要素か
  その部品の中にフォーカスがあるときだけ移す。セレクタは固定の文字列だけ (外部由来の id を入れない)。シェルの 1 か所で拾う形は採らない
  (サイドバーの「閉じる」に届かない)。O-7 の `useFocusRescue` は変えていない
  (3) **「Provider」と「プロバイダ」の表記の揺れ** (ux R2 L-002 / R3 L-002)。設定の項目名は「プロバイダ」(R-2 の上部のタブから
  引き継いだ `SETTINGS_SECTION_LABELS.providers`)、起動の軸・概要・Provider の画面は「Provider」(X-3 / X-4)。glossary の `Provider` の
  日本語表記で 1 つに決め、`shell/labels.ts`・`session/labels.ts`・`provider/labels.ts` を揃える。持ち主 = provider の文言を次に触る feature
  (013 data-model §6 の受け入れた判断)
  **O-4 が持った** ([014 spec](../specs/014-ui-metering-and-limits/spec.md) FR-016 / research R-13): glossary の `Provider` に日本語表記 (英字のまま。
  カタカナの「プロバイダ」は使わない) と Detected synonyms を足し、`shell/labels.ts` の設定の項目名と `session/labels.ts` の起動ダイアログの案内を
  「Provider」にした。`src/renderer` と `e2e` に「プロバイダ」は 0 件 (E2E の locator は元から 0 件)。docs は glossary・ui charter・
  `docs/ui-coverage.md` の F 節を直し、accepted の ADR (AD-014 / AD-046) の字面は変えない
- **実機計測ハーネス (`perf/`) の ADR 化 (O-1 起点。pr-gate R1 architecture M-003。system-scope)** —
  O-1 は「CI 外・実資格情報・自動操作」の検証経路を、ADR を起こさず AD-038 D2 の類推として入れた (`specs/010-session-monitoring-view/plan.md`
  の ADR 節、`eslint.config.mjs` の ignores、`perf/tsconfig.json`)。決めごとが plan・コードの注記・`docs/discovery.md` に分散している。
  ADR (proposed) で決めるもの: 置き場 (src のグラフの外)、安全柵 (CI / `CLOSTA_E2E` の拒否、既定の権限モードの確認、成果物を repo の外に出す、
  失敗時の error-context を止める)、agent が実行してよい条件、`e2e/support` の共有 (O-7 で perf が `e2e/support/launch.ts` の
  `openLaunchDialog` も使うようになった。同じモジュールに `CLOSTA_E2E` を立てる `launchApp` がある。O-7 pr-gate R1 architecture L-008)、
  ESLint を ignore にするか override にするか
  (AD-038 D2 の字面は override)。上の `SCAN_ROOTS` / ESLint の項目からこの ADR を指す。accepted の AD-038 は書き換えない。
  持ち主 = 本 E2E / 検証基盤 feature。**ただし本 feature は M4 完了後に切るので、O-8 (M3。KPI の宿題で perf を変える) が先に着手したら O-8 が持つ** ([O-8 の義務 (O-1 から) (d)](#o3-kpi-smoothness))。
  O-3 は持たない — O-3 は perf の安全柵・出力・実行の条件を変えない (composer の locator の文字列だけを直し、perf は実行しない。
  [012 research R-06](../specs/012-ui-thread-search/research.md))。KPI の宿題は O-3 の design で O-8 に移した
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
  O-3 の i18n リソース化の前に済ませる (**O-3 はリソース化しないと決めた** — [AD-045](decisions/0045-ui-labels-no-i18n-resources.md)。
  切り出しは「リソース化の前に」の前提を失い、理由はファイルの大きさと型の依存の向きだけが残る)。**持ち主 = store に派生値を足すか、監視ビューの行を触る次の feature** (O-2 の design で
  付け替えた。USER 決定 2026-10-03。O-2 は store に派生値を足さず、直近の活動の導出 `deriveActivity` を変えるだけなので切り出しの
  理由が無い。O-3 の i18n リソース化はこの切り出しの後に行う)。**O-7 も当たらない** (USER 決定 2026-10-05。上の (1)〜(3) が名指す
  派生値の追跡と行の部品 (`RowStatusBadge` など) は変えていない。O-7 が変えたのは、区画の要素 (`nav` → `section`)・`ThreadListNew` を
  外す・選択の操作の通知 `selectionSeq`・共通の行の部品 `thread-list.aui.tsx` の選択の強調の有無と押下の通知 (選んだ行を押し直したときに
  中央を切り替えるため)・`nextAwaiting` / `selectNextAwaiting` の「見ているセッション」の引数・一覧の見出しの件数の印・
  起動の告知を消す公開の操作 `dismissLaunchNotice` (呼ぶのは ui のシェル)・`MonitorSummary` が `stores/ui.ts` の面の状態
  (`focus`・設定と起動ダイアログの開閉) を読んで `watchedIdOf` を導くこと。
  行数は `RunningSessionList.tsx` 531 → 552、`running-session-store.ts` 606 → 632。code-gate convention M-007 / pr-gate R2 architecture M-101)。
  **O-3 も当たらない** ([012 plan](../specs/012-ui-thread-search/plan.md) の申し送り #9。O-3 が変えたのは、ストアの起動の状態の
  `lastOrigin` と稼働中のセッションの `launchOrigin` (どちらも起動元の値で、派生値ではない)・`launch` の引数の起動元・窓をそのメッセージ
  まで広げる `RunningSessionsView.revealMessage` (`RunningSessionsProvider.tsx`)・`MonitorSummary` が `watchedIdOf` に渡す
  `paletteOpen` の 1 つ。派生値の追跡と間引き・行の部品は変えていない。行数は `RunningSessionList.tsx` 552 → 553、
  `running-session-store.ts` 635 → 650 (どちらも `wc -l`))
  **O-4 が持った** ([014 spec](../specs/014-ui-metering-and-limits/spec.md)「義務の扱い」/ FR-018 / data-model §7 / research R-11。O-4 は store に計量の枝
  `meters` を足し、監視ビューの行の短い理由と再ログインの導線を変えるので両方に当たる)。`meters` を足す前に、振る舞いを変えずに切り出した:
  (1) 派生値の追跡と間引きを `running-session-monitor.ts` (`createRunningSessionMonitor`) に (2) `SessionRowStatus` と `Elapsed` を
  `running-session-types.ts` に移し、labels は `Record<SessionRowStatus, string>` で検査する。`announcements` は名前の組を返す `attentionTransitions` に
  替え、文は `SessionAttentionAnnouncer` が `attentionAnnouncement` で組む (3) 行の部品と行の操作を `RunningSessionRow.tsx` に。既存のテストは
  書き換えずに通った (例外は `announcements` の単体だけ)。行数 (2026-10-08。切り出した直後。`wc -l` と同じ数え方): `running-session-store.ts`
  650 → 588、`RunningSessionList.tsx` 553 → 217、`RunningSessionRow.tsx` 347 (新設)、`running-session-monitor.ts` 112 (新設)
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
- **O-5 が送った Constitution 検証の項目 (O-5 起点。記録。system-scope)** — どちらも O-5 は字面の範囲だけを直し、正の形は持ち主に送る
  ([015 research R-06](../specs/015-ui-mcp-elicitation-commands/research.md) / plan の申し送り #15 / #19)
  (1) **項目 16 の P3 を正の形 (`Query` のメソッドは `interrupt` 以外を違反) にし、`queryHandle` の型を絞る** (AD-036 §4 P3)。O-5 は
  denylist の `QUERY_MUTATION_METHODS` を 6 → 21 に広げ、集合の pin テスト (`tests/docs/query-mutation-methods.test.ts`)・`keyof Query` の
  型の網羅 (`sdk-agent-session.ts`)・計算キーの検出で固定したが、denylist は将来の SDK のメソッドを漏らす。型の網羅の「呼ばない読み取り」7 個
  (`close` を含む) は呼び出しを禁じず、項目 16 の検査の対象外である。分割代入・`.call` / `.apply`・
  変数のキーの呼び出しは grep で追っていない (`tests/rule-fixtures/expected.mjs` の `UNDETECTED_NOTES`)。項目 16 の持ち主に送る
  (2) **項目 14 がすべての import 文・再 export・動的 import を読む** (O-5 R1 platform-boundary M-003)。項目 14 は最初の `import {…}` しか
  読まない。O-5 は SDK の import 文を 1 つに保って当たらないようにした。項目 14 の持ち主に送る (M1 の「R-3 への申し送り」#3 と同じ死角)

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
| X-6 | 起動設定の拡張軸とセッション操作 | `session` | X-5 | **対応表の割当 (O-2 から)**: 実行中のセッションの操作 — 制御要求 `set_permission_mode` / `set_model` / `set_max_thinking_tokens` / `rename_session` (`docs/ui-coverage.md` で `後続: X-6` の行。**X-6 の完了の PR で対象の行を `実装済み` / `表示不要` に書き換える** — 書き換えずに完了にすると Constitution 検証の項目 21 が落ちる) / `SessionLaunchConfig` の残りの軸 (追加ディレクトリ / 上限 / セッション名) / fork・rename・tag・delete (**Win32Runtime の直接起動は X-8、resume と失敗したセッションの再開は X-9 に切り出した**。2026-10-19 に利用者が承認。AD-041 (h) が X-6 に指名した 2 項目の持ち主は X-8 / X-9) / providers.json・presets.json の退避ファイル一覧・復元・版不一致の UI (件数の 1 行表示は X-4 で実装済み。AD-042 Decision 4) / 同一内容の `.bak` の重複抑止 / claudePath の形の判定 (shebang 形の案内。AD-041 記録 2) / settings store 3 種の読み取り失敗・非配列 root・mutation 直列化の是正 (X-4 code-gate db H-001 / M-002 / M-003 の provider・folder 分) / セッションスレッド内のプロンプトキューが上限を超えたときの通知 (X-5 から繰越) / /clear の後の会話の id の扱い (O-6 から。O-6 は `conversation_reset` の `new_conversation_id` を読まず、境界の表示だけにした。/clear の後に過去ログの一覧で会話が分かれるかは O-6 の quickstart V-3 で確かめる項目で、**未確認**。確かめた結果は 016 の `quickstart-results.md`) / ツール実行中に Worker だけが異常終了したときの孤児の実機観測 (X-5 は claude がアイドルのときだけ観測。残るなら AD-043 Decision 5 の回収経路を作る。X-5 pr-gate R1 platform-boundary M-001) / **023 の範囲 (2026-10-27。[023 spec](../specs/023-session-launch-axes-and-operations/spec.md) の U-1)**: 実行中のセッションの操作だけ — 制御要求 4 つ (`set_max_thinking_tokens` は `表示不要`) と対応表の `後続: X-6` の行の書き換え、F 節の Settings / Model selector / Composer model picker の照合。rename は動いているセッションの分だけ。上の残りの項目は X-6 の後続の分割に残す。**023 の結論 (2026-10-28)**: U-1〜U-10 を夜間の規則で推奨案を採用・[AD-062](../decisions/0062-live-session-permission-mode-model-and-rename.md) (accepted)。実行中の権限モード (安全 3 値の中)・モデル・名前の変更を実装し、対応表の `後続: X-6` の行を書き換えた。quickstart V-1〜V-6 の実機の記録は [quickstart-results.md](../specs/023-session-launch-axes-and-operations/quickstart-results.md) (行えなかった V は「未実施 (利用者の実機に残す)」)。後続の項目: Command palette からの名前の変更 (023 申し送り #29)。RK-02 (ターンの実行中の切り替えで中断した)・RK-03 (JSONL が壊れた)・RK-06 (過去の一覧に出ない) に当たれば利用者に返す |
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
| 10 | O-1 | セッション監視ビュー | `session` | X-5 | — / design-gate R2 PASS / code-gate PASS / pr-gate R2 PASS (Critical 0) / **完了** (PR #10。[010 spec](../specs/010-session-monitoring-view/spec.md)。稼働中セッション一覧の拡張。実機計測 SC-005 は有効な回 0 件で、利用者が 2026-10-02 に閉じた (spec FR-012 の改訂の行)。残した宿題は [O-8 の「義務 (O-1 から)」](#o3-kpi-smoothness) (i18n の判断は O-3。滑らかさの実機計測は O-3 の design で O-3 から O-8 に移した)) |
| 11 | O-2 | `docs/ui-coverage.md` の確立（**SDK の型と機械照合**。割当の確定）+ Tier B/C 再棚卸し + 実行中の tool の結果と Hook / Background task の行 + transcript の情報密度 | `ui` | O-1 | SPIKE-12 **完了** / design-gate R2 PASS / code-gate PASS / pr-gate R3 PASS (Critical 0) / **完了** (PR #11。[011 spec](../specs/011-ui-coverage/spec.md)。表示の実装の残りは O-4 / O-5 / O-6 に割り当てた。P-4 (ui-coverage-reviewer) を含む) / **義務 (O-1 から)**: (1) Hook / Background task の表示の割当と、状態の保持が要る場合の持ち主 domain の判断 (session は含めないと決めた。AD-020 Consequences) (2) Tool group の既定 open 化 (AD-035 の「O-1 候補」) (3) transcript の情報密度の切替 (監視ビューの行の密度は O-1 が持つ) (4) 直近の活動の tool ごとの整形 (対象のファイル名やコマンドの先頭語だけを出す。tool 入力の先頭に秘密が出うる点も扱う) |
| 12 | O-7 | アプリのシェル (タブのビューを廃し、サイドバー・中央・右のペインの 3 面に) | `ui` | O-2 | — / [AD-046](decisions/0046-app-shell-layout.md) / design-gate R1 PASS / code-gate PASS / pr-gate R1 PASS (Critical 0。High を直して R2 で再検証) / pr-gate R2 PASS (Critical 0 / High 0) / pr-gate R3 PASS (R2 の修正の差分。Critical 0 / High 0) / **完了** (PR #13。[013 spec](../specs/013-ui-app-shell/spec.md))。quickstart V-3 (AD-046 Confirmation・SC-008 の実機の目視) は利用者が 2026-10-05 に全項目 OK と確かめた。V-3b (R2 / R3 の修正の見た目と US-3 AC4 の通し) は 2026-10-06 に全項目 OK。PR #13 の CI は verify (node 24) と e2e が緑 (composer の基準画像は CI の artifact から取り直し、過去の区画に残す高さを 6rem にした。quickstart-results)。右のペインは枠・タブの表・「概要」まで (他のタブは O-4〜O-6 と OPT-panel)。**`running-session-store.ts` / `RunningSessionList.tsx` の切り出し (上の system-scope) の持ち主には当たらない** (USER 決定 2026-10-05。O-7 が変えたものの一覧は切り出しの項目に書いた) |
| 13 | O-3 | Thread 検索と探す操作 | `ui` | O-2 / O-7 | — / design-gate R4 PASS ([012 spec](../specs/012-ui-thread-search/spec.md))。**範囲 (U-1。2026-10-05 に利用者が承認)**: 「探す」(Thread search・会話内検索・Command palette・Empty state) と下の義務。conversation map・message timing・活動の heat graph は O-9 に、義務 (O-1 から) (2) は O-8 に分けた / **義務 (O-7 から)** の結論 (2026-10-06 の利用者の回答。012 spec FR-017 / FR-018。[013 data-model §3](../specs/013-ui-app-shell/data-model.md) の問いへの答え): (i) 過去の区画の高さ — 「列挙の結果」を全部が成功なら 1 行に要約し、区画の上端に固定するのは見出しと検索欄だけにする (取得の時刻・列挙の結果・絞り込みは行と一緒にスクロールする)。最小の高さは 6rem のまま (上げると 768px の画面で O-1 SC-003 を壊す。O-7 pr-gate R1 ux M-008) (ii) グループは region をやめ `role="group"` にする (ランドマークは区画の 1 つだけ。a11y L-006) (iii) サイドバーの過去の区画の基準画像を 1 枚足し、全画面は撮らない (architecture M-002。上の E2E / 検証基盤の項目) (iv) 過去の行にも稼働中の行と同じツールチップ (`renderTooltip`) を渡す (a11y R3 M-006) / **義務 (X-4 から)** の結論: session charter KPI「再利用率」の計測経路を作る (AD-041 (h)。012 spec US-4 / FR-009〜FR-013)。起動元 (`preset` / `manual`) を起動の IPC の入力に足し、main が日ごとの回数だけを `launch-usage.json` に 90 日分持ち、プリセットの欄に直近 30 日の内訳を出す / **義務 (O-1 から)** の結論: (1) UI ラベルは i18n リソース化しない ([AD-045](decisions/0045-ui-labels-no-i18n-resources.md)。accepted。`target-finder.ts` の 2 本は infra の例外として据え置く (Decision 3))。Constitution XV を O-3 の PR で MINOR で改める (2) 並列時の滑らかさの実機計測は [O-8](#o3-kpi-smoothness) に移した (O-3 には残さない) |
| 14 | O-4 | 計量と制限の表示 | `ui` | O-2 / O-7 | — / **右のペインのタブの候補 (O-7 から)**: Context display・Cost meter (AD-046 のタブの表に足す。最初に右のペインのタブを足す feature なので、タブのテストは `features/shell/AppShell.test.tsx` (O-7 で 700 行を超えた) に追記せず、共通の setup を `test-support/` に出して分ける。O-7 code-gate convention M-008 で分割を見送った分。**2 つ目のタブを足すときに tablist に矢印キーと roving tabindex を入れる** (WAI-ARIA APG の Tabs pattern。O-7 pr-gate R1 a11y M-004)) / **対応表の割当 (O-2 から)**: `result` の**失敗の理由** (subtype の区別・`errors`。今は全部「Provider の認証/接続」と出る。理由ごとの文言のテストを足す。**session の契約の拡張を伴う** — `session-core.ts` の `ResultTermination` (`complete` / `provider-error`) と失敗の理由キーを広げる。X-1 FR-030 (認証の失敗を黙って完了にしない) を保つ。持ち主の確認は O-4 の design で session charter と合わせて行う)・費用・使用量・ターン数・`permission_denials`、`rate_limit_event` (Quota banner)、`api_retry`、`status` (権限モードの変化・圧縮中・圧縮の失敗)、`thinking_tokens`、`tool_progress` (tool の経過時間)、コンテキストの使用量 (`get_context_usage`。Context display)、Cost meter (`get_session_cost` / `get_usage`)、task の進捗 (`task_progress`)。対象の行は `docs/ui-coverage.md` で `後続: O-4` の行 / **O-4 の結論 ([014 spec](../specs/014-ui-metering-and-limits/spec.md) / [AD-047](decisions/0047-session-meter-and-failure-reasons.md))。上の割当の字面との差**: `ResultTermination` は広げず、失敗の理由のキーを足した (`LaunchFailureReason` 10 → 18。`classifyResultFailure` が `subtype`・`api_error_status`・同じターンの主ループの assistant の `error` から決める)。`errors` は運ばない (U-5)。字面の「X-1 FR-030」は 005 spec に無く、FR-020 (と US-4 AC6) の誤り (どの失敗も黙って完了にしない規則は保った)。Context display は右のペインのタブではなく中央のヘッダの目盛り (右のペインを畳んでいても見える。US-3 AC2)、Cost meter は右のペインの「使用量」のタブ (と中央のヘッダの費用の目盛り)。制御要求 `get_context_usage` / `get_session_cost` / `get_usage` は呼ばず `表示不要` にした (U-3)。タブのテストの分割と tablist のキーボード操作は入れた (014 spec FR-017) / **quickstart V-4 のうち、O-4 の PR までに確かめていない項目** (実機の目視。本番ビルド。利用者の作業。014 SH-014 の時点で V-4 の 10 項目はどれも未確認): とくに #1 認証切れ・課金のエラーの形 (subtype / `api_error_status` / assistant の `error`)・#2 `modelUsage` のキーの形 (alias・`[1m]`)・#3 `/context` との差 (±10%)・#4 `utilization` / `resetsAt` の単位・#5 権限モードの変化が `status` と `init` のどちらで届くか。結果は 014 の `quickstart-results.md` に書き、data-model §1 / §2 / §4 を直すかは利用者の確認の後に決める / **本番で知らない形を後から知る観測点を足すかの判断** (014 plan RK-14): 今は `provider-error` に倒れた失敗と decoder が捨てた `meter` をアプリの中で後から知る手段が無い (agents の記録の出力は 0 件。AD-043 Decision 6)。足すなら運ぶ値 (数と列挙だけ)・出す条件 (開発ビルドだけ)・出し先の設計が要る (Principle V)。O-4 では足さず、判断は利用者に残す |
| 15 | O-5 | MCP・プラグイン・コマンドの表示 | `ui` | O-2 / O-7 / O-4 | — / **右のペインのタブの候補 (O-7 から)**: Server panel / **対応表の割当 (O-2 から)**: セッションの構成 (`init` の `model` / `tools` / `slash_commands`)、MCP の Server panel (`init` の `mcp_servers`・MCP 系の組み込み tool `RefreshMcpTools`・MCP の制御要求 `mcp_status` / `mcp_call` / `mcp_message` / `mcp_set_servers` / `mcp_reconnect` / `mcp_toggle`・MCP の resource の tool)、Elicitation form (`elicitation_complete`・制御要求 `elicitation`)、`AskUserQuestion` の応答 UI (Elicitation とともに**応答を session の control 経路で返す** — session の契約の拡張を伴う)、`request_user_dialog`、`plugin_install` / `reload_plugins` / `reload_skills`、`commands_changed` (slash command の一覧)、`auth_status`、MCP の tool の表示、Tier C の Data table / Chart / Timeline / Diagram を MCP の結果に転用するかの判断。**操作画面 (MCP サーバーの追加・削除など) は含めない**。対象の行は `後続: O-5` / **O-5 の結論 ([015 spec](../specs/015-ui-mcp-elicitation-commands/spec.md) / [AD-048](decisions/0048-session-config-display-and-answer-ui-split.md))。上の割当の字面との差**: 問いに答える UI (`AskUserQuestion` の回答・Elicitation・`request_user_dialog`・`elicitation_complete`) と composer のスラッシュコマンドの候補は O-10 に分けた (U-1 / U-6。AD-048 Decision 1)。題から Elicitation を外し、構成を O-4 の `meter` で運ぶので依存に O-4 を足した。MCP の tool (`mcp__*` と組み込みの 4 tool) は `McpToolCall`、`AskUserQuestion` は読み取り専用の表示と承認カードの注記 (許可しても回答は届かない)。Server panel は右のペインの「構成」のタブ (Claude Code が報告したモデル・MCP サーバーと状態・tool・スラッシュコマンド・スキル・プラグイン) と畳んだ帯の注意の印 (`meter` の `init-report` / `commands`。AD-048 Decision 3)。`auth_status` / `plugin_install` はシステムイベントの行。MCP・プラグイン・スキルの制御要求は呼ばず `表示不要` にし (AD-048 Decision 2)、Constitution 検証の項目 16 の P3 を広げた。Tier C の Data table / Chart / Timeline / Diagram は MCP の結果に転用しない (AD-048 Decision 4)。registry の element (MCP server panel・Question flow ほか) は採らなかった (015 research R-03) / **quickstart V-3 のうち、O-5 の PR までに確かめていない項目** (実機の目視。本番ビルド。利用者の作業): 最初のターンの `init` の MCP サーバーの状態が `pending` で届くか・`needs-auth` の案内に従って直るか (Provider が `CLAUDE_CONFIG_DIR` を指定している場合を含む。015 plan RK-05)・`AskUserQuestion` を承認カードで許可したときの tool_result の中身 (O-10 の材料)。結果は 015 の `quickstart-results.md` に書く |
| 16 | O-6 | 会話の境界と tool の専用表示の第 2 弾 | `ui` | O-2 / O-7 / O-4 / O-5 | — / **以下の割当の字面は O-2 の時点の記録。範囲の分け方と結論は末尾の「O-6 の結論」が正本** / **右のペインのタブの候補 (O-7 から)**: TodoList・Background task / **対応表の割当 (O-2 から)**: コンパクション境界の専用 element (実行中を含む)、`file` part の File element、Checkpoints (`files_persisted` / `rewind_files`)、モデルの拒否 (`model_refusal_*`)、`notification` / `informational` / `local_command_output` / `memory_recall` / `prompt_suggestion` / `conversation_reset` / `mirror_error` / `tool_use_summary` / `active_goal`、`background_tasks_changed` と制御要求 `background_tasks` / `stop_task` / `get_hooks_listing`、`TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` の TodoList 表示 (TodoWrite と同じ計画・進捗)、`Read` / `Glob` / `Grep` の File tree、Web search / fetch (`server_tool_use` / `web_search_tool_result` を含む)、Agent plan の markdown (AD-035 D6)、実行中の subagent の入れ子 (`parent_tool_use_id`・`getSubagentMessages`)、**一般の Hook の表示と `includeHookEvents` を足す ADR** (AD-041 (g) の読み替え)、実行中の Background task の一覧の要否 (要るなら持ち主の domain を人間に諮る)、後から背景に移った task の行、対応表 B 節 (中身のブロック) の機械照合。**O-2 の pr-gate R2 から**: tool の表示の「結果待ち」と「結果不明」(結果が来ないまま終わった。システムイベントの行と同じ考え方) の印 / Hook・task の状態の変化と tool のエラーを支援技術に読み上げる announcer (WCAG 4.1.3) / Bash の Background task 同士を秘密を出さずに見分ける手がかり / ToolFallback の見出しの日本語化。**O-2 の実機の目視 (quickstart V-4) の結果の反映**: `hook_name` がコマンドの文字列を含むなら `hook_event` だけを出す / 過去ログに Hook・task の行が残るなら対応表の経路を「両方」に / 実行時の subagent の tool 名 (`Agent` / `Task`) / 並列の tool の結果の届き方 (送り直しの回数。O-2 research R-03)。対象の行は `後続: O-6` / **O-4 から ([014 data-model §3](../specs/014-ui-metering-and-limits/data-model.md))**: O-4 は実行中のコンテキストの圧縮を transcript の 1 行 (`compaction` の行。圧縮中 → 成功 / 失敗。`compact_error` は出さない) で出した。この行は圧縮の進み具合で、`compact_boundary` の境界の element は会話の区切り。O-6 が実行中の境界の element を足すときに、この行と統合するか並べるかを決める / **O-6 の結論 ([016 spec](../specs/016-ui-boundaries-and-tool-displays/spec.md) / [AD-049](decisions/0049-boundaries-retraction-and-o11-split.md)。上の割当の字面との差)**: 範囲を Tier A の 14 行と tool の結果の状態 (結果待ち・結果不明・読み上げ・ToolFallback の見出しの日本語化) に絞り、Hook・背景の task・実行中の subagent の入れ子と知らせの類は新しい **O-11** (順 20) に送った (U-1)。表示するもの: 圧縮の境界 (O-4 の `compaction` の行とは並べ、統合しない。失敗は行だけが残る)・`conversation_reset`・モデルの拒否 (置き換えられた応答は `meter` の種類 `retraction` で稼働中のストアから外す。拒否の説明は伏せ字を通して出す)・`informational` (伏せ字を通して出す。O-2 の「Hook の出力本文を出さない」の例外。過去ログの `system` の本文にも伏せ字を当てた)・`Read` / `Glob` / `Grep` / `WebFetch` / `WebSearch` / `TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList`・Agent plan の markdown (AD-035 Decision 6 の読み替え)。パスは会話由来の本文として出す。右のペインのタブ (TodoList・Background task) は足さず O-11 の判断に送った。task・チェックポイントは操作せず (`rewind_files` / `stop_task` / `background_tasks` は `表示不要`)、Constitution 検証の項目 16 の `QUERY_MUTATION_METHODS` に `readFile` を足した (21 → 22)。拒否の後の「編集して再試行」は O-10 に送った。対応表の `後続: O-6` の行は 0 になった / **quickstart V-3 のうち、O-6 の PR までに確かめていない項目** (実機の目視。本番ビルド。利用者の作業): `/compact` で `compact_result` と `compact_boundary` の届く順・`/clear` と plan モードの終了で境界が出るか (`/clear` の後に過去ログの一覧で会話が分かれるか)・`Glob` / `Grep` の結果の text の形 (絶対か相対か。FE-020 の fixture の元)・「結果待ち」「結果不明」の見え方・読み上げ (ナレーター)・承認カードで拒否した後や中断した後の tool の結果が `is_error` で届くか・`informational` の `level` ごとの頻度・モデルの拒否の起き方 (置き換えた応答が消えてから拒否の行が出るまでの間・拒否の説明の見え方。起こせなければ未確認)・過去ログに `informational` / 拒否 / 会話の作り直しが残るか (O-11 の過去ログの変換の材料)。結果は 016 の `quickstart-results.md` に書く |
| 17 | O-8 | 並列時の滑らかさの実機計測 | `session` | O-7 | — / O-3 の design で足した ([012 spec](../specs/012-ui-thread-search/spec.md) の U-1。2026-10-05 に利用者が承認)。O-3 の「探す」と独立に進められる / <a id="o3-kpi-smoothness"></a>**義務 (O-1 から。O-3 から移した)**: **session charter KPI「並列時の滑らかさ」の実機計測の宿題** (X-5 → O-1 → O-3 と繰り越し、O-1 では有効な回 0 件で利用者が閉じた。[O-1 quickstart-results V-3](../specs/010-session-monitoring-view/quickstart-results.md)): (a) `perf/` の出力に窓の終わりの行の状態の内訳 (応答待ち・承認待ち・失敗) を足す — **SC-005 の出力の許可リストの変更なので利用者の承認が要る** (b) 10 本が窓のあいだ応答を流し続けるように、プロンプトか有効な回の条件を見直す (c) 行の切り替え (charter Journey 3 の手順 3。O-1 の 1〜3 回目で 100〜275ms の long task) も含めて測り直す。**O-9 は `message` の数え方を変えない。地図のタブを開いている間は右のペインの再描画が 500ms に 1 回まで増える** (017 plan。比較の基準として並べる)。**O-7 から行の切り替えはシェルの中央の切り替え (稼働中と過去の会話のあいだを含む) になり、サイドバーに過去のセッションの一覧が常に並ぶ** ので、O-1 / X-5 の値と比べるときはこの基準の変化を並べて書く (O-7 のビルドでの E2E の値は [013 quickstart-results](../specs/013-ui-app-shell/quickstart-results.md) に記録した)。**O-7 で perf の起動と行の選択の locator を直したが、perf は実行していない** — 直した手順を実機で確かめるのも本義務を引き継ぐ feature (O-7 pr-gate R1 po L-003)。E2E の 50ms 超の long task が X-5 の 0〜10 件から O-1 で 33 件に増えた点も比較の基準として並べる。**観測点 `receivedMessages` は O-2 から tool の結果の送り直しと Hook / task の行の作成・更新も数える** (O-2 data-model §6) ので、O-1 / X-5 の値と比べるときはこの基準の変化を並べて書く。**O-3 で過去の区画に検索欄が入り、区画の並び (固定の見出しと検索欄・スクロールする領域・「列挙の結果」の要約) が変わった** (012 spec FR-001 / FR-017) ので、O-3 の後のビルドで測るなら、これも基準の変化として並べる。**O-4 の計量 (`SessionEvent` の `meter`) は `receivedMessages` に数えず、O-4 の新しい行 (API の再試行・コンテキストの圧縮・権限モード・task の進み具合の更新) は `message` なので数える** ([014 data-model §2](../specs/014-ui-metering-and-limits/data-model.md)「renderer の保持」) ので、O-4 の後のビルドで測るなら、これも基準の変化として並べる。**O-5 の新しい行 (認証とプラグインの行。category `auth` / `plugin`) は `message` なので数え、構成 (`meter` の `init-report` / `commands`) は `meter` なので数えない** ([015 data-model §2 / §4](../specs/015-ui-mcp-elicitation-commands/data-model.md)) ので、O-5 の後のビルドで測るなら、これも基準の変化として並べる。**O-6 の新しい行 (圧縮の境界・会話の作り直し・モデルの拒否・知らせ) は `message` なので数え、取り消し (`meter` の `retraction`) は `meter` なので数えない** ([016 data-model §1](../specs/016-ui-boundaries-and-tool-displays/data-model.md)「観測」) ので、O-6 の後のビルドで測るなら、これも基準の変化として並べる。**O-12 の新しい行 (知らせの類・Checkpoints の category 7 つ) は `message` なので数える** ([022 data-model §1](../specs/022-ui-notices-checkpoints-and-content-blocks/data-model.md)。`server-tool-call` と `unsupported-block` は part で、行ではない) ので、O-12 の後のビルドで測るなら、これも基準の変化として並べる。**O-10 の `elicitation_complete` の行 (category `elicitation`) は `message` なので数え、`elicitation-request` は数えない** ([018 data-model「観測」](../specs/018-session-answer-ui-and-composer-commands/data-model.md)。承認カードの答える部品・コマンドの候補・「編集して再試行」は数に影響しない) **O-11 の一般の Hook (`includeHookEvents`) の行と subagent の本文の行 (入れ子の `children`) は `message` なので数え、`background-tasks` は `meter` なので数えない** ([019 data-model](../specs/019-ui-hooks-tasks-subagents-and-notices/data-model.md)) ので、O-11 の後のビルドで測るなら、これも基準の変化として並べる (観測した値があれば 019 の `quickstart-results.md` の V-7 に記録する) (d) 着手時に上の system-scope の「実機計測ハーネス (`perf/`) の ADR 化」が未了なら、O-8 で proposed の ADR を起こしてから perf の安全柵・出力を変える (O-1 pr-gate R2 architecture L-101)。(a) は利用者の承認が要り、(d) の ADR が先に要り、計測そのものは実機でしか行えない |
| 18 | O-9 | 会話の時間と活動の可視化 | `ui` | O-3 | — / O-3 の design で足した ([012 spec](../specs/012-ui-thread-search/spec.md) の U-1。2026-10-05 に利用者が承認) / **範囲**: conversation map・message timing・活動の heat graph と、`docs/ui-coverage.md` の F 節で O-3 に預けていた Activity graph / Heat graph / Message timing / Trace waterfall の判断 (O-3 が F 節の備考を O-9 に付け替えた。012 spec FR-015) / **message timing の前提**: メッセージの時刻 (`createdAt`) は今は過去ログ・実行中とも `null` で、agents / domain の変換で埋める必要がある。**`createdAt` を埋める変換の変更は session の契約の拡張を伴う。持ち主の確認は O-9 の design で session charter と合わせて行う** / **O-3 から預かった判断**: transcript の本文を横断する検索の要否 (O-3 の Thread search は要約行のフィールドだけを探す。本文の横断は全セッションの transcript を読み直すので、列挙と取得の経路 (R-2 / R-3) の負荷の判断を伴う。012 spec Out of Scope)。あわせて、一覧の大規模件数向けの描画最適化 (仮想化) が要るかも見る (002 spec / 010 plan の「必要なら O-1 / O-3」。O-3 は一覧の仮想化を足さず、件数の多さは先に検索で絞る。012 plan の申し送り #26) / **O-9 の結論 ([017 spec](../specs/017-ui-conversation-time-and-activity/spec.md) / [AD-051](decisions/0051-message-time-source-and-display-only.md)。2026-10-17 に利用者が承認)**: (U-1) `createdAt` を埋める変換の持ち主は O-9 (ui) で、session charter に記録した (DTO の形は同じ) / (U-2) 過去ログの時刻は `getSessionMessages` の返りの型に無い `timestamp` から読む / (U-3) 実行中は SDK の `timestamp`、無ければ agents の受信時刻、利用者の入力は renderer の送信時刻 / (U-4) 活動の帯は開いている会話 1 つの時間の区間 (セッション横断の暦にしない) / (U-5) 右のペインの新しいタブ「会話の地図」に地図と帯を置く / (U-6) Message timing と Heat graph は照合して表示の行を書き (element は取り込まず自作)、Activity graph と Trace waterfall は使わない / (U-7) 本文の横断検索・過去の一覧の仮想化・会話内検索の対象の拡大はしない / (U-8) 実行中のターンの所要時間は renderer の受信時刻で両端をそろえる。**012 spec FR-004 の預かり (会話内検索の対象を広げるか) は広げない**。**V-3 (実機の目視) は全 12 項目が未実施 (利用者の実機に残る)。とくに**: #1 過去ログの `getSessionMessages` の返りに `timestamp` があるか (**AD-051 の Confirmation。U-2 の前提**。無ければ過去ログの時刻と地図の時刻が出ず、決定を見直す)・#4 実行中の SDK のメッセージが `timestamp` を持つか (画面から見分けられず、無ければ受信時刻に倒れる)・#3 圧縮の要約が地図の 1 ターンに数えられる見え方・#12 assistant のメッセージごとの時刻の密度・#11 012 の V-3 の絞り込み (過去のセッション 50 件以上で語 1〜2 個で目当てを絞れるか。悪ければ U-7 の再検討)。他の項目 (#2 / #5〜#10) も同じく未実施 ([017 quickstart-results](../specs/017-ui-conversation-time-and-activity/quickstart-results.md)) |
| 19 | O-10 | Claude Code からの問いに答える UI と composer のコマンドの候補 | `session` | O-5 | — / O-5 の design で足した ([015 spec](../specs/015-ui-mcp-elicitation-commands/spec.md) の U-1 / FR-013。2026-10-05 に利用者が承認。[AD-048](decisions/0048-session-config-display-and-answer-ui-split.md) Decision 1)。domain は `session` (境界の ADR と制御の経路の持ち主)、表示の部品は `ui` が持つ / **design の前に ADR を 2 つ起こす**: AD-036 Decision 4 の読み替え (承認の応答の `updatedInput` に回答を足す) と AD-041 (g) の読み替え (`onElicitation` / `onUserDialog` を渡す) / **範囲と義務 (015 spec FR-013)**: (1) `AskUserQuestion` の回答 — 承認の応答の `updatedInput` は、agents の `canUseTool` の中で SDK が渡した元の `input` に `answers` だけを足して組む。renderer から受けるのは回答だけで、キーは元の問いの文と照合し、値の長さを制限する。tool 名は SDK の値で判定する。射影の関数は `toPermissionResult` の隣に置き、キーの集合を pin テストで固定する (2) Elicitation の form / URL (`onElicitation`) と `request_user_dialog` (`onUserDialog`。`supportedDialogKinds` は allowlist)。Elicitation の入力は永続化しない・ログに出さない。URL は既存の `openExternalIfHttp` だけを通す (3) `elicitation_complete` の表示と、composer のスラッシュコマンドの候補 (U-6。IME の変換中は出さない。一覧は O-5 の `meter` の `commands` と `init-report` の `slashCommands`) / **対応表の割当 (O-5 から)**: `elicitation_complete`・`AskUserQuestion`・制御要求 `elicitation` / `request_user_dialog`。対象の行は `後続: O-10` / **O-5 から**: system-scope の composer の 2 項目 (英語の名前の残り・ターンの開始のフォーカスの奪取。持ち主 = O-10 と X-6 の早いほう)、O-5 の quickstart V-3 の `AskUserQuestion` を許可したときの tool_result の中身 / **O-6 から ([016 spec](../specs/016-ui-boundaries-and-tool-displays/spec.md))**: モデルの拒否 (`model_refusal_no_fallback`) の後の「編集して再試行」(`refused_user_message_uuid`)。composer の操作の拡張なので、O-10 の composer の設計と合わせる (O-6 は拒否の行に「言い直して送り直せる」と書くだけで、再試行の操作は持たない) / **O-10 の結論 ([018 spec](../specs/018-session-answer-ui-and-composer-commands/spec.md) / [AD-052](decisions/0052-ask-user-question-answer-projection.md) / [AD-053](decisions/0053-elicitation-callback-and-user-dialog.md)。2026-10-17 に利用者が U-1〜U-10 と 2 つの ADR を承認。上の字面との差)**: `AskUserQuestion` の回答のキー (問いの文) は renderer ではなく agents が元の入力から決め、renderer は回答の文字列の列だけを送る (`PermissionDecision.answers`)。`request_user_dialog` は `supportedDialogKinds` を空の allowlist のまま `onUserDialog` を渡さない (AD-053 Decision 4)。Elicitation の応答は新しいチャネル `respondElicitation` で返す (`respondPermission` の引数には載せない)。`elicitation_complete` は category `elicitation` の行、拒否の後の「編集して再試行」は status `no-fallback-retry` の行から composer に文を戻すだけ (送らず巻き戻さない)。composer の英語の名前は日本語にし、`unstable_focusOnRunStart={false}` でターンの開始のフォーカスの奪取を止めた。registry の element は取り込まず primitive 直接 + 自作 (research SH-002 の結論)。**quickstart V-3 (実機の目視。利用者の作業) は未実施**: `AskUserQuestion` の回答が実機の Claude Code に届くか・Elicitation の form / URL の実機での往復・`elicitation_complete` の届き方・composer の候補と IME の見え方は、利用者が確かめるまで残る |
| 20 | O-11 | Hook・背景の task・実行中の subagent と知らせの類の表示 | `ui` | O-6 | — / O-6 の design で足した ([016 spec](../specs/016-ui-boundaries-and-tool-displays/spec.md) の U-1。2026-10-05 に利用者が承認。[AD-049](decisions/0049-boundaries-retraction-and-o11-split.md) Decision 1)。domain は `ui` (表示が主)。ADR の義務は session の境界にあるので、O-11 の ADR は session charter にも記録する / **範囲**: 一般の Hook の表示と `get_hooks_listing`・`hook_name` にコマンドの文字列が入るかの確認 (V-4 の未記録の項目)・実行中の Background task の一覧の要否 (`background_tasks_changed`。要るなら持ち主の domain を人間に諮る。右のペインのタブ (TodoList・Background task) の要否もここで判断する)・後から背景に移った task の行・シェルの Background task を秘密を出さずに見分ける手がかり・実行中の subagent の入れ子 (`parent_tool_use_id`・`getSubagentMessages`。入れ子の中の divider を含む) と Agent handoff・Tier B の知らせの類 (`notification` / `local_command_output` / `memory_recall` / `prompt_suggestion` / `mirror_error` / `tool_use_summary` / `active_goal`)・Checkpoints の表示 (`files_persisted`。巻き戻しはしない)・`user/document` の File element・`server_tool_use` / `web_search_tool_result`・対応表の B 節 (中身のブロック) の機械照合・過去ログへの本 feature の行 (`informational`・拒否・会話の作り直し) と Hook / task の行と O-10 の `elicitation_complete` の行 (category `elicitation`) の変換 (O-6 の V-3 と O-2 の V-4 の記録による)・`TaskCreate` などをまとめた計画の一覧の要否・伏せた Hook 名の見分け (O-2 pr-gate ux L-102)・O-11 の domain 間の依存 (session の無害化・query の options に触れる。O-2 pr-gate arch L-201) / **design の前に ADR を起こす (AD-049 Decision 1。FR-015)**: `includeHookEvents` ([AD-041](decisions/0041-x4-launch-config-on-x1-launch-gate.md) (g) の読み替え)、`getSubagentMessages` ([AD-035](decisions/0035-tier-a-tool-display-and-subagent-nesting.md) Decision 3 の読み替えと Agent SDK の呼び出しの許可リストの追加)、`get_hooks_listing` を呼ぶなら [AD-036](decisions/0036-single-session-launch-process-and-live-stream.md) §4 P3 の読み替え / **対応表の割当 (O-6 から)**: D 節の `後続: O-11` の 3 行 (一般の Hook・後から背景に移った task・実行中の subagent の入れ子。Tier A。M3 の完了の条件に数える) と、Tier B の残り。**O-11 の完了の PR で対象の行を書き換える** (書き換えずに完了にすると項目 21 が落ちる) / **O-11 の結論 ([019 spec](../specs/019-ui-hooks-tasks-subagents-and-notices/spec.md) / [AD-054](decisions/0054-query-options-hook-events-and-subagent-text.md) / [AD-055](decisions/0055-subagent-messages-for-past-transcripts.md) / [AD-056](decisions/0056-o11-scope-background-task-list-and-o12-split.md)。2026-10-17 に利用者が U-1〜U-11 と 3 つの ADR を承認。上の字面との差)**: 範囲を一般の Hook・背景の task・実行中の subagent の入れ子 (対応表 D 節の Tier A 3 行とその義務) に絞り、Tier B の表示の類は **O-12** に送った (U-1)。(U-2) 一般の Hook は `includeHookEvents: true` をリテラルで渡して出し、`get_hooks_listing` は呼ばない (AD-036 §4 P3 の読み替えは起こさない)。(U-3) 背景の task の一覧は作る。表示と feature の持ち主は `ui`、保持は session の契約 (`meter` の種類 `background-tasks`。AD-056 Decision 2。右のペインのタブ「背景の task」)。(U-4) 計画の一覧 (TodoList のタブ) は作らない。(U-5) 実行中の入れ子は stream の `parent_tool_use_id` から組み (`forwardSubagentText: true`)、過去ログは `getSubagentMessages` で補う。(U-6) ui の feature が session の契約を広げ、session charter に記録した。(U-7) Agent handoff の element は使わない。(U-8) 過去ログの agentId は `listSubagents` で列挙し `parent_tool_use_id` で親と結ぶ (`AGENT_SDK_ALLOWED_CALLS` は 5 つ)。(U-9) 帰属つきの system のメッセージは `compact_boundary` 以外を主ループの行にする。(U-10) 実行中の入れ子が上限に当たったら以後の子を足さず切り詰めの印を出す。(U-11) 入れ子の user は tool_result だけを読む。**O-12 に送った項目**: Tier B の知らせの類・Checkpoints の表示・`user/document` の File element・`server_tool_use` / `web_search_tool_result`・対応表の B 節の機械照合・過去ログへの O-6 の行 (`informational`・拒否・会話の作り直し) と O-10 の `elicitation_complete` の行 (category `elicitation`) の変換 (AD-056 Decision 1)。**quickstart で確かめられなかった項目 (実機の目視。本番ビルド。利用者の作業。結果は 019 の `quickstart-results.md`)**: V-1〜V-7 は利用者に残る。とくに RK-06 (`task_updated` の `patch.is_backgrounded` が実データで届くか。V-3)・RK-07 (`listSubagents` が入れ子の subagent のファイルを列挙するか。V-6)・RK-11 (subagent の system の行が帰属つきで届くか。V-5)。**D 節の 3 行は V-1 / V-3 / V-4 が「届いた」の記録のときだけ `実装済み` にする** (記録が無ければ `後続: O-11` のまま) |
| 21 | X-8 | Win32Runtime の直接起動 | `session` | X-5 | — / X-6 から切り出して前に出した (2026-10-19 に利用者が承認)。**M3 の完了の条件に数えない** / **範囲**: `Win32Runtime` (R-1 が検出だけを実装) でホストの `claude` を直接起動する (X-1 research R-05 / plan B-4。AD-041 (h) が X-6 に指名した項目)。Windows の作業フォルダ (例 `C:\dev\closta`) で Closta から Claude Code を回せるようにする。WSL の `--exec` 形の claudePath の判定 (AD-041 記録 2) は X-6 に残す。/ **結論 (020 / [AD-058](decisions/0058-win32-direct-launch-contract-and-process-tree-stop.md))**: U-1〜U-4 は 2026-10-19 に利用者が承認済み。実装はマージ済み (単体・E2E はローカルで検証。「完了」ではない: V-1 / V-3 (AD-058 の Confirmation・SC-001 / SC-004 の実機の計測) は未実施で、利用者の実機に残る)。**未確認 (利用者の実機に残る)**: quickstart V-0〜V-9 の全部 (V-1 = SC-001 と V-3 = SC-004 を含む。2026-10-21 の夜間の規則で「未実施」としてマージ)。V-3〜V-7 の実機の記録は未取得。V-4 で孫が残れば X-6 の行に足す (RK-02)、V-5 で子孫が残れば利用者に返す (RK-03)、V-6 で窓が出れば Claude Code 側の挙動として書く (RK-09)、V-7 で読めなければ X-9 に送る (RK-10) |
| 22 | X-9 | セッションの再開 (resume) | `session` | X-8 | — / X-6 から切り出して前に出した (2026-10-19 に利用者が承認)。**M3 の完了の条件に数えない** / **範囲**: 過去・停止したセッションの resume (AD-041 (h) が X-6 に指名した fork / resume / rename / tag / delete のうち resume だけ)・失敗したセッションの再開 (X-5 FR-013 は自動で再開しない。X-6 から移した)・session charter Journey 4 の軸の引き継ぎ (フォルダ / ランタイム / Provider は引き継ぎ、モデル / effort / 権限モードは選び直せる。引き継ぐ軸を変えるのは fork で X-6 に残す)。/clear の後の会話の id の扱いは X-6 に残す。/ 前提 (`Win32LaunchSpec` と transcript の場所) は X-8 (020) で満たした / **結論 (021 / [AD-059](decisions/0059-session-resume-query-option-and-conversation-id.md) (accepted))**: U-1〜U-8 は承認済み。実装は完了 (単体・依存グラフ・Constitution 検証・型検査・rule fixture・ビルド・E2E はローカルで検証。E2E の 1 件 `composer-screenshot.spec.ts:28` は本機の基準画像の揺れで main でも同じく落ちる既知の状態)。**未実施 (利用者の実機に残る)**: quickstart V-1 / V-2 / V-9 (実機の確認の条件) と V-0 / V-3〜V-7 (2026-10-21 の夜間の規則で「未実施」としてマージ。結果は [quickstart-results.md](../specs/021-session-resume/quickstart-results.md))。V-3 で `conversation-id-changed` が出れば利用者に返す (RK-02)、V-4 の終わり方が §6.4 と合わなければ記録して条件を直すか利用者に返す (RK-07)、V-2 で Win32 の記録が読めなければ利用者に返す (RK-06)、V-9 で実効の権限モードが昇格していれば利用者に返す (RK-10)、V-7 の記録は X-6 の申し送りとして書く |
| 23 | O-12 | 知らせの類・Checkpoints・中身のブロックの表示 | `ui` | O-11 | — / O-11 の design で足した ([019 spec](../specs/019-ui-hooks-tasks-subagents-and-notices/spec.md) の U-1。2026-10-17 に利用者が承認。[AD-056](decisions/0056-o11-scope-background-task-list-and-o12-split.md) Decision 1)。**Tier B と、実行中の経路で `実装済み` の行の過去ログの経路だけなので M3 の完了の条件に数えない** / **範囲**: Tier B の知らせの類 (`notification` / `local_command_output` / `memory_recall` / `prompt_suggestion` / `mirror_error` / `tool_use_summary` / `active_goal`)・Checkpoints の表示 (`files_persisted`。巻き戻しはしない)・`user/document` の File element・`server_tool_use` / `web_search_tool_result` (Sources / Inline citation の判断し直しを含む。O-6 U-5)・対応表の B 節 (中身のブロック) の機械照合・過去ログへの O-6 の行 (`informational`・拒否・会話の作り直し) と O-10 の行 (`elicitation_complete`。category `elicitation`) の変換 (O-6 の quickstart V-3 と O-10 の quickstart V-3 の記録による)。対象の行は `docs/ui-coverage.md` で `後続: O-12` の行 / **結論 (2026-10-23。実装: [022](../specs/022-ui-notices-checkpoints-and-content-blocks/spec.md)・[AD-060](decisions/0060-content-block-verification-and-unsupported-block-mark.md))**: 夜間の規則で推奨案を採用した (spec の U-1〜U-13)。`prompt_suggestion` は `promptSuggestions` を渡さず `表示不要` (U-1)。`active_goal` は `SDKMessage` の型の外で `default:` の型ガードで受ける (U-13)。対応表の B 節は 33 行で機械照合する (項目 21。`@anthropic-ai/sdk` の版の行を足した)。割当先が O-12 の行は 0。**quickstart V-1〜V-5 (実機の確認) は未実施** (`quickstart-results.md`): 7 つの知らせの種類が実機で届くか・`files_persisted` が届く条件・`server_tool_use` が主ループに現れるか・過去ログに行が残るか・`document` が過去ログに残るか。A 節の経路は未確認のため `(実行中)` とし、実機で「残る」と分かった行だけ「両方」に直す (data-model §4.4)。**持ち越し**: Constitution Principle XII の Verification (Automated) を「A・B・C・E 節」に改める改定 (v1.5.0。MINOR) は、改定手順 2 の人間レビューを夜間の自走で満たせないので本 PR に含めず (U-12)、別の PR で行う |
| 24 | O-13 | 起動中のセッションの UI の手直し | `ui` | O-12 / X-6 (023) | — / 2026-10-29 に利用者が実機で報告した問題を 1 本にまとめて足した (利用者が承認)。**M3 の完了の条件に数えない** / **範囲**: (1) 停止ボタンを目立たなくし、Esc で止める (2) 権限モードの名前を Claude Code の表記にそろえ、以後も追従する (選べる値は AD-062 の安全 3 値のまま。Principle XV の例外を伴う) (3) 右のパネルのタブの折り返しと使用量の値の崩れ (幅の可変化は 013 の判断のまま) (4) モデルと権限モードの選択を中央のヘッダから composer の周りに移す (023 U-7 の見直し) (5) 既定の Provider のセッションでのモデルの切り替え (X-6 の後続の項目。023 U-10 から移す。一覧は Claude Code に聞く) (6) composer の `/resume` で同じフォルダの過去のセッションを選び、X-9 の再開ダイアログに進む。[025 spec](../specs/025-ui-live-session-fixes/spec.md)。左のサイドバーの再設計とサブエージェントの枠は範囲外 (モック → ADR → spec で別に扱う) / **結論 (2026-10-29。実装: [025](../specs/025-ui-live-session-fixes/spec.md)・[AD-065](decisions/0065-live-model-list-and-claude-code-permission-mode-names.md) (accepted))**: 夜間の規則で推奨案を採用した (spec の U-1〜U-7)。6 項目はすべて実装した。(5) は `supportedModels` を Claude Code に聞く読み取り (`QUERY_MUTATION_METHODS` は 20 のまま) で閉じ、**023 U-10 の「既定の Provider のセッションでのモデルの切り替え」はここで閉じた** (X-6 の行は 024 の枝が書き換え中なので触れない)。(2) の権限モードの名前の表は Constitution Principle XV の Exceptions と同じ別の PR (人間のレビュー待ち。RK-08)。**quickstart V-1〜V-9 (実機の確認) は未実施 (利用者の実機に残る。[quickstart-results.md](../specs/025-ui-live-session-fixes/quickstart-results.md))**。V で RK-02 / RK-03 / RK-09 に当たれば利用者に返す |

O-4〜O-6 は O-2 で足した。M4 / M5 の順はそれに合わせて振り直した (O-2 design-gate R2 architecture L-105)。D-1 の依存は O-3 のままで、M3 の完了 (O-4〜O-6・O-11) は待たない。

O-8 / O-9 は O-3 の design で足した (012 spec の U-1。入力の表示 7 種と義務 3 つを 1 spec に入れると FR 20 を超えるため)。M4 / M5 の順はそれに合わせて振り直した。D-1 の依存は O-3 のまま。

O-10 は O-5 の design で足した (015 spec の U-1。権限ゲートの例外の設計を表示と同じ spec に混ぜず、FR 20 も超えないため。[AD-048](decisions/0048-session-config-display-and-answer-ui-split.md) Decision 1)。M4 / M5 の順はそれに合わせて振り直した。

O-11 は O-6 の design で足した (016 spec の U-1。Tier A 14 行と表示の状態に絞らないと FR が 20 を超え、`includeHookEvents` などの ADR の判断が表示と混ざるため。[AD-049](decisions/0049-boundaries-retraction-and-o11-split.md) Decision 1)。M4 / M5 の順はそれに合わせて振り直した。D-1 の依存は O-3 のまま。O-11 の Tier A 3 行は対応表の D 節に `後続: O-11` で立て、M3 の完了はそれを待つ。

O-12 は O-11 の design で足した (019 spec の U-1。Tier A 3 行を出す Hook・task・subagent の表示と Tier B の知らせ・ブロックの表示が別々に確かめられる機能で、1 つの spec では FR が 20 を超えるため。[AD-056](decisions/0056-o11-scope-background-task-list-and-o12-split.md) Decision 1)。O-12 は Tier B と過去ログの経路だけなので M3 の完了の条件に数えない。M4 / M5 の順はそれに合わせて振り直した (I-1 が 22 から)。D-1 の依存は O-3 のまま。

X-8 / X-9 は X-6 から切り出し、O-12 の前に置いた (2026-10-19 に利用者が承認)。Closta で Closta を開発できるのは O-11 と、この 2 本の後だからである (Windows の作業フォルダでの直接起動と、そのセッションの再開)。接頭辞は M2 の「走らせる」能力なので X のまま。M3 の完了の条件には数えない。O-8 は順 17 のままだが、実機の計測で利用者の作業なので X-8 / X-9 を待たせない。M3 の O-12 と M4 / M5 の順はそれに合わせて振り直した (O-12 が 23、I-1 が 24 から)。D-1 の依存は O-3 のまま。ADR は起こさない (順の変更で、AD-041 (h) の 2 項目の持ち主を X-8 / X-9 と本 roadmap と session charter に書く)。

O-13 は 2026-10-29 に利用者が実機で報告した問題をまとめて O-12 の後に足した (利用者が承認)。M3 の完了の条件には数えない。M4 / M5 の順はそれに合わせて振り直した (I-1 が 25 から)。X-6 の後続の項目のうち「既定の Provider のセッションでのモデルの切り替え」(023 U-10) の持ち主は O-13 である (X-6 の行は 024 の枝が書き換え中なので、ここに書く)。

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
| 25 | I-1 | `DockerRuntime` と endpoint 抽象 + `sessionStore` | `isolation` | X-5 | SPIKE-10 **完了** / SPIKE-11（再定義） / 作業領域戦略の軸 AD-017 (X-4 から付け替え。AD-041 (d)) / 転送禁止キーの登録時検証を transport の和集合として作り直す (AD-041 (e) 3・(h)) |
| 26 | I-2 | コンテナライフサイクルと隔離可視化 **+ volume 孤児回収** | `isolation` | I-1 | — / **義務 (O-1 から)**: 監視ビュー (稼働中セッション一覧) の compact の行にも隔離バッジを出す (O-1 FR-008 が置き場を残した) / **O-4 から ([014 data-model §4](../specs/014-ui-metering-and-limits/data-model.md))**: O-4 の権限モードの警告の帯の隔離の文言は暫定で、ランタイムの `autoModeStatus` から導く (`unavailable` だけ「このランタイムには隔離がありません」、それ以外は「このセッションの隔離をアプリは確かめていません」)。セッションの隔離状態 (隔離バッジ) が定義されたら置き換える |
| 27 | I-3 | sandbox capability 判定と権限モードのゲート | `isolation` | I-2 | — / **義務 (X-4 から)**: 昇格モードの capability 連動提示、承認の `scope: 'capability'` 永続化 (AD-041 (c)) / **対応表の割当 (O-2 から)**: Permission grant (承認の capability 付与の表示)、制御要求 `list_permission_rules`。対象の行は `docs/ui-coverage.md` で `後続: I-3` の行 (**I-3 の完了の PR で書き換える。書き換えずに完了にすると項目 21 が落ちる**。Tier A だが M4 なので M3 の完了の条件には数えない。AD-044) / **O-4 から**: (1) 実行中に権限モードが安全 3 値の外になったのを観測したときの強制 (中断・失敗にする) の要否。O-4 は原因を断定しない警告の帯 (`role="alert"`) で知らせるだけで、強制しない (014 spec U-6 / [AD-047](decisions/0047-session-meter-and-failure-reasons.md) Decision 5) (2) 警告の帯の隔離の文言は暫定で、ランタイムの `autoModeStatus` から導く (`unavailable` 以外は「このセッションの隔離をアプリは確かめていません」)。セッションの隔離状態 (I-2 の隔離バッジ) が定義されたら置き換える ([014 data-model §4](../specs/014-ui-metering-and-limits/data-model.md)) |

I-1 では **`wsl:<distro>` endpoint（WSL 内 Docker Engine）を第一に検証する。**
主開発ホストに Docker Desktop は入っていない。`/mnt/c` 越し bind mount の実効速度もここで実測し、
遅ければ §13.2 のリポジトリ配置方針を見直す。

## M5: 配れる

**達成状態**: 自分以外が使える。

| 順 | ID | feature | domain | 依存 | 前提 SPIKE |
|---|---|---|---|---|---|
| 28 | D-1 | パッケージングと Windows インストーラ | `runtime` | O-3 | **SPIKE-13**（本格確認） / **D-1 の design で確かめる (O-3 から)**: [AD-045](decisions/0045-ui-labels-no-i18n-resources.md) (UI の文言を i18n リソース化しない) の再検討の条件 (b)「D-1 (配布) の前」に当たるので、配布の前に AD-045 を見直す (AD-045 Confirmation) |

## Optional scope

どのマイルストーンも待たない。やる価値はあるが critical path に乗らない。

| ID | feature | domain | 着手の目安 |
|---|---|---|---|
| OPT-mac | macOS 対応（`DirectRuntime` / Seatbelt / IME 検証） | `runtime` | M5 の後、必要になったら |
| OPT-pty | PTY フォールバックタブ | `ui` | SDK 経路で足りない対話 TUI に出会ったら |
| OPT-panel | 右のペインのタブ: Changes / PR の Webview / Files / Browser (O-7 から。**Terminal は OPT-pty**) | `ui` (main / infra 側の作業 (git・ファイルの監視・別の WebContents) の domain は OPT-panel の design で人間に諮る) | O-3〜O-6・O-11・O-12 の後、必要になったら (O-11 が右のペインのタブ「背景の task」を足したため。O-12 が足しうるタブも見る)。Browser / PR の Webview は [AD-046](decisions/0046-app-shell-layout.md) Decision 4 の境界の**すべて**に従う (主ウィンドウの `webviewTag` を有効にしない・main が管理する `WebContentsView` に独立した partition と CSP で載せる・モーダル (設定・起動・承認) を開いている間は外部のビューを隠すか外す・renderer が報告する配置の矩形は main で検証する・タブの表の `Content` では表さない・アプリの CSP を緩めない。O-7 pr-gate R1 security L-004) |

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
