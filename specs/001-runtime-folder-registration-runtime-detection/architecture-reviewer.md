# architecture-reviewer Review: フォルダ登録とランタイム検出 (R-1)

**Run**: 2026-09-16
**Reviewer**: architecture-reviewer
**Spec**: specs/001-runtime-folder-registration-runtime-detection/spec.md
**Round**: 1 (pr-gate)
**Mode**: default + `--scope adr-drift` の両方 (ADR 全文読了済み)

> **Write ツールが無いため `architecture-reviewer.round1.md` を書けませんでした。** 本文をそのまま報告します。呼び出し側で `specs/001-runtime-folder-registration-runtime-detection/architecture-reviewer.round1.md` として保存してください。

## 初回読了 viewpoint

**読了**: `reviewer-base.md` / Constitution v1.2.2 全文 (Principle I〜XV + Governance + Amendment trail + Existing violations summary) / `docs/decisions/` の `status: accepted` 全 27 件のうち本 feature に関係する AD-003 / AD-004 / AD-009 / AD-010 / AD-012 / AD-015 / AD-016 / AD-019 / AD-023 / AD-024 / AD-025 / AD-026 を全文、他は Decision Outcome まで / `runtime` / `ui` / `_overview` charter 全文 / `glossary.md` / spec.md / plan.md / tasks.md (該当節) / design-gate の `architecture-reviewer.md` / `code-gate.md` + `.gate-verdict-code.json` / 実装 (`src/domain/**`, `src/main/app/**`, `src/main/infra/**`, `src/renderer/src/**` の主要ファイル) / `eslint.config.mjs` / `.dependency-cruiser.js` / `scripts/constitution/{allowlists,scan}.mjs` / `.github/workflows/verify.yml` / `package.json` / `electron-builder.yml` / `docs/discovery.md`

**本 PR で実装/影響される FR / SC のうち本 reviewer の owner 範囲に触るもの**

- FR-001 — ホスト OS の判定をランタイム実装の内側で行う → L-003
- FR-015 / FR-025 — UNC を `infra` に閉じる / パス操作をパス API に限定 → 適合 (指摘なし。`validate.ts:77` / `wsl-fs.ts:102` / `path-api.ts` 1 ファイル限定を実測)
- FR-033 — 本 feature では chat 用の Element を採用しない → H-002 (不適合)
- FR-034 / FR-035 — 5 レイヤと依存規則の二重強制 → C-001 / M-003
- FR-037 — Principle VI 検証スコープに CI 定義を含める → H-003 (不適合)
- FR-038 — `electron` は `app` と `infra/secrets/` のみ → 適合 (8 箇所すべて許可範囲。実測)
- FR-042 — 配布メタデータ (AD-023 の表) → 適合 (`appId` / `productName` / `executableName` / `name` / `publish` 削除 / `setAppUserModelId` 一致)
- FR-046 — 用語を glossary に反映 → M-006 (一部不適合)
- SC-008 / SC-009 — 違反サンプルの全数検出 / 違反 0 件 → C-001 (services ルールに対象と fixture が 0 件)
- SC-016 — CSP / プロトコル封じ込め → 適合 (`CSP_FILES` / `CSP_DECLARATION_MARKERS` / `app.isPackaged` ゲート。security-reviewer の owner 範囲なので詳細は触らない)

**touched files に該当する charter / Confirmation**

- `docs/domains/runtime/charter.md` — In/Out scope・業務ルール・KPI・Open Question → H-002 / L-002
- `docs/domains/ui/charter.md` — In scope 41-48 / Out of scope 59-66 (design-gate M-001 の修正先) → H-002
- `docs/domains/_overview.md` — Cross-domain invariants / R-1 行 → H-002 / M-001
- `.specify/memory/constitution.md` — Principle VIII / Existing violations summary → H-001 / M-005
- AD-023 §7 §8 / AD-024 #14 #18 / AD-025 §4 §8 §9 / AD-026 — Decision Outcome 照合 → C-001 / H-001 / H-004 / M-003
- `docs/glossary.md` (Principle XIV) → M-006
- `docs/discovery.md` (reviewer / lint-agent の SSoT) → M-002

**viewpoint 集計**

- A. 認可 / 認証 / RLS: 該当なし: `security-reviewer` の owner 範囲 (IPC 送信元検証・トークン束縛・origin 定数はすべて security 側)
- B. 入力検証 / injection / 暗号: 該当なし: 同上 (`validate.ts` の未信頼入力表は security owner)
- C. 業務不変条件 / Charter drift / cross-domain invariant: Critical:0 High:1 Medium:2 Low:1
- D. Constitution Principle drift / accepted ADR drift / layering: Critical:1 High:3 Medium:3 Low:2
- E. User Story 価値 / SC 計測可能性 / UX: 該当なし: `po-reviewer` / `ux-reviewer` の owner 範囲
- F. 命名 / module 配置 / lint hookup: 該当なし: `convention-reviewer` が code-gate iteration 2 で 23 件出している領域 (M-001 `GENERATED_FILES` / C-002 接尾辞除外 / C-005 `WslAvailability` 等)。重複させない
- G. DB / API / a11y / perf / OpenAPI / UX state: 該当なし: DB / HTTP API が存在せず、a11y / ux / perf は optional reviewer が code-gate で担当済み
- H. テスト戦略 / coverage / observability / regression: Medium:1 (M-005。自 owner 範囲 = NON-NEGOTIABLE の検証経路そのものに限定)

**重複抑制の確認**: code-gate iteration 1 の MUST_FIX 7 件 (MF-001〜MF-007) の resolved 箇所は再指摘していません。`ChatScreen.test.tsx` と `.specify/memory/constitution.md` には触れますが、いずれも **origin が異なる** — MF-001 は「事実誤認の訂正が入ったか」、本 reviewer は「訂正後の論法が NON-NEGOTIABLE の検証経路として成立するか (H-001)」と「番人として指名されたテストの実効性 (M-005)」です。同一行の再判定ではありません。

## スコープ要約

R-1 は project 初期化 + `runtime` domain 最下層を同時に立てる 199 files / +37,337 の feature。5 レイヤ (`app` / `ui` / `agents` / `infra` / `domain`) の実体、branded path types の 3 名前空間化、到達可能性 3 値と越境判定、ESLint + dependency-cruiser + `scripts/constitution/check.mjs` の三重強制、AD-024 / AD-025 / AD-026 の起票、Constitution v1.1.0 → v1.2.2 の 3 段改定を含む。**レイヤ境界そのものの実装品質は高い** — `electron` は 8 箇所すべて許可範囲、`domain` の標準モジュール到達は `path-api.ts` の `node:path` 1 件のみ、`ui → domain` は DTO と純粋関数のみ、`unc:` は境界で拒否 (`validate.ts:77` / `validate.test.ts:119`)、`platform-ok` 注記は AD-023 が予告した 2 箇所だけ、配布メタデータは AD-023 の表と完全一致。design-gate の 3 件 (M-001 `ui` charter / M-002 X-1 申し送り / M-003 `.claude/agents/`) は **全件閉鎖を実文で確認** (後述)。残る問題は「**accepted な決定が自らに課した条件が、その条件を発火させた当の feature で履行されていない**」類型に集中している。

## Findings

### [Critical] AD-023 §7 の `services ✗→ I/O モジュール直接` が R-1 で不在のまま、AD-025 §9 の「R-1 に対象が無い」が HEAD で成立していない (C-001) (scope: feature)

- **観察**:
  - AD-025 §9 (accepted) は「`services` に当たるディレクトリが存在しない」「**対象が無いルールを書いて「強制した」とは言えない**」として、**「最初の調停クラス (状態を持ち I/O をインタフェース経由で扱うクラス) を作る feature で、`from` セレクタを実名で定義する」**と定めている (`docs/decisions/0025-workspace-folder-carries-location.md:168-174`)。
  - HEAD にはその調停クラスが **2 つ**ある。`src/main/app/runtime-store.ts:46` の `createRuntimeStore` は自身の docstring で `**状態を持つ調停は結線層が担う**` (`:20-23`) と宣言しており、AD-023 §5 が Service として実名で挙げた `RuntimeRegistry` そのものである。`src/main/app/folder-service.ts:90` の `createFolderService` は `folders` / `sessions` / `verifiedCache` / `listeners` を保持し、I/O を `store` / `fs` / `hostFs` / `detector` のインタフェースで注入されている (`:78-88`) — AD-025 §9 の括弧内定義に文字どおり一致する。
  - それにもかかわらず `from` セレクタは **定義されていない**。`.dependency-cruiser.js` の `forbidden` 22 ルールに services 系は 0 件、`eslint.config.mjs` の `boundaries/dependencies` policies 10 件にも 0 件。
  - さらに、その調停クラスが **I/O モジュールを直接 import している** — `src/main/app/folder-service.ts:1` `import { randomUUID } from 'node:crypto'`。同ファイルは `:81` で `hostFs` を「**`app` が `node:fs` を直接触らないために注入する**」と書いており、同じファイルの中で方針が割れている。`node:crypto` を I/O と見なすのはこのリポジトリ自身の語彙である — `src/domain/workspace/registry.ts:62` が「**`domain` は I/O を持たないため `crypto` を import できない**」として乱数源を引数で受け取っている。
- **同種事象探索**:
  - `grep -rnE "調停|export function create[A-Z]\w+" src/` → **14 件**。うち「状態を持ち I/O をインタフェース経由で扱う」= 調停クラスは **2 件** (`src/main/app/runtime-store.ts:46` / `src/main/app/folder-service.ts:90`)。残り 12 件は infra の薄いアダプタ (`wsl-fs.ts:65` / `host-fs.ts:19` / `folder-store.ts:54` / `wsl-cli.ts:141` / `wsl-detector.ts:63` / `win32.ts:15`)、app の組み立て (`composition-root.ts:37` / `window.ts:23` / `measure.ts:67`)、domain の値構築 (`verified-running.ts:33` / fixtures) であり対象外。
  - `grep -nE "service|Service|registry|Registry|store|Store" .dependency-cruiser.js` → **0 件**。`grep -nE "service|Service|Registry" eslint.config.mjs` → **0 件**。**ルールは 1 行も存在しない。**
  - `grep -rnE "from ['\"]node:[a-z/]+['\"]" src/` → **7 件**。うち調停クラスからの直接 import は **1 件** (`folder-service.ts:1`)。`protocol.ts:1` (`node:fs/promises`) は AD-025 §8 が実名で許した経路、`infra/**` の 4 件は `infra` が OS 境界なので正当、`path-api.ts:1` は Principle I の許可ファイル。
  - `tests/rule-fixtures/` の違反サンプル 20 件に services 経路のものは **0 件** (`a-direct/` 8 件 / `b-equivalent/` 12 件を全件確認)。`pnpm test:rules` が 20/20 一致しても本ルールは検査対象にすらなっていない。
- **リスク/影響**:
  1. **accepted ADR が自ら発火条件を書いた履行義務が、その条件を発火させた当の feature で未履行**である。AD-025 §9 は「次の feature でやる」と書いたのではなく「最初の調停クラスを作る feature でやる」と書いており、その feature は R-1 である。AD-025 が accepted になった時点で `folder-service.ts` / `runtime-store.ts` は既に存在していたため、これは実装の遅れではなく **ADR 本文の前提が accepted 時点で既に偽だった**ことになる。
  2. AD-023 §5 は `services ✗→ I/O` を「**God Service への唯一の歯止めであり、下記 7 で機械検証する**」と位置づけている。歯止めが 0 件の状態で `folder-service.ts` は 400 行を超え、すでに直接 import 1 件が入った。X-1 (`SessionService`) / X-3 (`ProviderService`) / I-2 (`ContainerService`) はいずれも AD-023 §5 が実名で挙げた Service であり、規則不在のまま 3 つ増える。
  3. AD-024 の Context が名指した反パターン (「検証条件が実在しないパスを指していると、**違反が 0 件なのではなく検査が 0 件になる。これは「合格」と見分けがつかない**」) と同型である。`.gate-verdict-code.json` の `depcruise: 0 violations` は本ルールについて何も示していない。
- **推奨アクション** (最小案から順に):
  1. **最小**: `.dependency-cruiser.js` に 1 ルール追加 — `name: 'services-not-to-io'` / `from: { path: '^src/main/app/(folder-service|runtime-store)[.]ts$' }` / `to: { dependencyTypes: ['core'], path: coreRe(ALL_CORE.filter(n => !['assert','util','events'].includes(n))) }`。あわせて `folder-service.ts:1` の `randomUUID` を `deps.newId: () => string` として注入する (`domain/workspace/registry.ts` が既に `makeFolderId(gen)` の形を持っているので `composition-root.ts` で 1 行渡すだけで済む)。
  2. `tests/rule-fixtures/a-direct/service-io-import.ts.fixture` を 1 件足し、`expected.mjs` に期待検出器を書いて `test:rules` を 20 → 21 件にする (SC-008 が「ルールが直接見ている形のすべて」を全数検出と定めているため、ルールを足す以上 fixture が要る)。
  3. AD-025 §9 の扱いを決める — **AD-025 は accepted なので本文を書き換えず**、(a) ルールを実装して §9 の条件を履行した事実を `AD-025 の申し送り` ではなく **新規 ADR または plan の Post-design re-check に記録**する、もしくは (b) AD-025 §9 の Open Question「`services` に当たる調停クラスをどのレイヤに置くか」(`:304-305`) を閉じる ADR を起こす。**ADR の in-place 改変は採らない** (H-004 と同じ理由)。
- **根拠**: AD-023 §5 / §7 (accepted) / AD-025 §9 + Open Questions (accepted) / spec FR-035 / SC-008 / SC-009 / Constitution Governance「Principle と ADR が食い違う場合は Constitution を正とし、ADR 側を追随させるか改定手続きを踏む」
- **scope 根拠**: `.dependency-cruiser.js` / `eslint.config.mjs` / `src/main/app/folder-service.ts` はいずれも本 PR の touched files (199 件) に含まれ、feature 内で修正可能。
- **Critical にした理由と降格の可否**: severity 表が「accepted ADR drift」を Critical に列挙しているため Critical とした。**「実装済みの防御に対する二重防御提案」ではない** — 当該ルールは 0 行であり、すでに 1 件の違反形 (`node:crypto` 直接 import) が入っている。ただし利用者への実害経路ではないため、gate が「enforcement gap は High 上限」と判定するなら **High への降格に異議はない**。降格しても推奨アクション 1 は変わらない。

---

### [High] Principle VIII の `existing_violations: 0` が、v1.2.2 が自ら認めた「0 は遵守の証拠ではない」と矛盾したままゲートの入力になっている (H-001) (scope: feature)

**caller の問い「『送信経路を閉じたから検証対象が無い』は Principle VIII (NON-NEGOTIABLE) の免除根拠として成立するか」への回答を含む。**

- **観察**:
  - v1.2.2 の論法そのものは **v1.2.1 より明確に正しい**。`ChatScreen.tsx:36-55` は `useExternalStoreRuntime` に `isDisabled: true` を渡し、`onNew` は到達時に `throw` する。`thread.aui.tsx:279` の `ComposerPrimitive.Input` は `:109` の `!s.thread.isDisabled` を通るため入力が閉じる。**「composer が無い」(v1.2.1) は偽、「送信経路を閉じている」(v1.2.2) は真**である。ここは訂正として妥当。
  - 成立しないのはその先である。Constitution `:419-421` は Principle VIII の Adoption metadata を `existing_violations: 0` / `violation_threshold: 0` のままにしている。一方で同ファイル `:442` と `:704-706` は「**`existing_violations: 0` は `bad_pattern_grep` が送信経路 (`@assistant-ui/react` の内側) を見られないことの結果であって、遵守の証拠ではない**」と明記する。**意味を持たないと自ら宣言した値が、metadata の欄には「0 件」として座り続けている。**
  - このプロジェクトは同じ問題に対する解を既に持っている。Principle VI の Verification `:366-368` が「**結果は 3 状態で報告する — `ok` / `violation` / `pending` (検査対象がまだ存在しない)。`pending` を `ok` に混ぜると「まだ書いていないから通った」と「検証したから通った」が区別できなくなる**」と定め、`check:constitution` は実際に項目 5 を「検査対象なし」として分離している (`code-gate.md:121-123`)。R-1 の Principle VIII は定義上この `pending` — 送信経路を閉じている間は検査対象が発生していない — であって `ok` ではない。にもかかわらず 3 状態の扱いが Principle VIII には適用されていない。
  - 補助 grep の実測も metadata と合わない。`grep -rnE "onKeyDown|key === 'Enter'" src/ | grep -v "isComposing"` は HEAD で **2 件返す** (`src/renderer/src/components/assistant-ui/elements/attachment.aui.tsx:171` / `src/renderer/src/components/image.tsx:320`。どちらも `e.key === "Enter"` の起動ハンドラで `isComposing` ガードなし)。実害はほぼ無い (テキスト入力ではなく `role="button"` タイルの活性化) が、**`existing_violations: 0` はこの 2 件の triage を経た値ではない** — どこにも記録がない。
  - 免除の射程も metadata と合わない。Principle VIII の Statement は義務を 3 つ持つ (`:427`) — (1) IME 誤送信、(2) フォント崩れ、(3) 全角混在レイアウト崩れ。「送信経路を閉じた」が答えているのは (1) だけである。(2)(3) は R-1 で **現に生きている** (全画面が日本語ラベル、SC-011 が日本語・非 ASCII のそのまま表示を要求) のに、Automated (B) は R-2 に延期され、`:443` が「守るのは Manual の 2 者とテスト 1 本だけ」と述べている。Governance `:728-729` は Manual のみの運用を許しているので **延期は違反ではない**。問題は、その状態が metadata では「違反 0 / 閾値 0」= 合格と区別できない形で表されていることである。
- **同種事象探索**:
  - `grep -n "existing_violations" .specify/memory/constitution.md` → **13 件** (Principle I〜XIII)。値はすべて `0`。うち「Automated が 1 項目も載っていない」と本文が明言しているのは **Principle VIII のみ** (`:439`)。Principle III も `bad_pattern_grep` が困難と書くが (`:245`) 「E2E で検証する」という Automated 経路を持ち、`resolution.test.ts` / `capabilities.ts` の `isAutoModeAllowed` 単一判定点で実質守られている。**同型は 1 件 = VIII のみ。**
  - `grep -rnE "onKeyDown|key === 'Enter'" src/ | grep -v isComposing` → **2 件** (上記)。`grep -rn "isComposing" src/` → **0 件** (テストの `compositionEnd` 1 件を除く)。
  - `grep -rn "pending" scripts/constitution/check.mjs` → 3 状態報告は実装済み。**Principle VIII の metadata に同じ 3 状態が適用された箇所は 0 件。**
- **リスク/影響**:
  1. 改定手順 step 5 (`:155`) は「NON-NEGOTIABLE 採用 / 強化時は `## Existing violations` を生成し、**件数 > 0 なら `overall_status: fail`**」と定める。VIII の欄が構造的に 0 である限り、このゲートは VIII について永久に発火しない。v1.2.2 は「強化」ではないので今回 enumeration 義務は無かったが、**次に VIII を触るとき (R-2 で (A) を載せるとき) も同じ 0 が入力になる。**
  2. AD-024 `:222-226` が自ら書いた失敗経路 — 「検証免除が成立しない前提に乗ったまま X-1 でモデルに繋ぐと、**一度も検証していない送信経路**が本番の経路になる」 — に対する唯一の機械的な歯止めは metadata ではなく `ChatScreen.test.tsx` 1 本になっている (その実効性は M-005)。
  3. v1.2.1 → v1.2.2 で **同じ 1 項目の根拠が 2 回書き換わっている**。1 回目は事実誤認 (composer が無い)、2 回目は範囲の取り違え ((1) の免除で (A) 全体を説明)。NON-NEGOTIABLE の Verification を短期間に 2 度書き換える事象自体が、記述ではなく構造 (= 検証対象の状態を表す語彙が欠けている) に原因があることを示している。
- **推奨アクション** (最小案を先に):
  1. **最小 (1 行 + 1 節)**: Principle VIII の Adoption metadata を `existing_violations: pending (検査対象なし。composer の送信経路を `isDisabled: true` で閉鎖中)` / `violation_threshold: 0` に改め、`## Existing violations summary` の Principle VIII 節 (`:699-706`) に「**3 状態のうち `pending`。`ok` ではない**」を 1 行足す。Principle VI が既に採っている語彙をそのまま流用するだけで、指針は一切変えないため **PATCH (v1.2.3)** で足りる。
  2. `bad_pattern_grep` の 2 件 (`attachment.aui.tsx:171` / `image.tsx:320`) を「非 composer の活性化ハンドラであり Statement (1) の対象外」として **同節に実名で triage 記録**する。`existing_violations` に数字だけ置いて根拠を残さない形をやめる。
  3. Statement (2)(3) について「R-1 は Manual のみ」であることを metadata 側にも見えるようにする (現在は本文 `:439-443` にしか無い)。
  4. **本質的な最小案**: そもそも (A) の免除論が必要になったのは、R-1 が計画外の chat 画面を持ったからである (H-002)。chat 画面を R-3 へ移せば Principle VIII (1) は R-1 の対象から自然に外れ、NON-NEGOTIABLE の Verification を 2 度書き換える必要も無かった。**この選択肢を検討した記録がどこにも無い** — AD-024 / AD-025 / plan のいずれにも「chat 画面を R-1 に置かない」案の棄却理由が書かれていない。
- **根拠**: Constitution Principle VIII `:419-443` / Principle VI Verification `:366-368` (3 状態) / 改定手順 step 5 `:155` / Existing violations summary `:699-706` / Governance `:728-729` / AD-024 `## 訂正:` `:213-236`
- **scope 根拠**: `.specify/memory/constitution.md` は touched file。Principle 本文の指針は変えず metadata の状態語彙のみを直すので feature 内で完結する。

---

### [High] `runtime` / `_overview` charter が R-1 の UI を「操作 UI 3 画面」に限定しているのに、HEAD は 4 画面目の chat を持ち `ui` charter の In scope を侵している (H-002) (scope: feature)

- **観察**:
  - `docs/domains/runtime/charter.md:53-55` は Out of scope に「**transcript / tool 表示の element 選定と見た目 → `ui` domain。ただし本 domain の操作 UI (ランタイム一覧・フォルダ登録・組み合わせ選択) は本 domain が持つ**」と書く。`docs/domains/_overview.md:49` の R-1 行も「操作 UI (ランタイム一覧 / フォルダ登録 / 組み合わせ選択) を含む」と 3 つを実名で列挙する。
  - `docs/domains/ui/charter.md:34-37` の In scope は「assistant-ui の Elements / Tool UI の実装」「transcript の表示」「**composer (日本語 IME、message queue、draft restore…)**」であり、`:59-66` の Out of scope は **操作 UI (一覧・登録・選択画面) だけ**を各 domain に渡している。chat 画面は「操作 UI」ではない。
  - HEAD の `src/renderer/src/App.tsx:18-23` は **4 画面**を登録する — `runtimes` / `folders` / `resolution` / **`chat`**。`:32` `const isChat = screen === 'chat'` でレイアウトまで分岐し、`:40-55` のナビに 4 つ目のタブとして常設される。中身は `ChatScreen.tsx:78` `<Thread />` = `thread.aui.tsx` (composer / tool-fallback / reasoning / attachment を含む runtime 接続型 element 群)。
  - spec 側の記述と正面から食い違う。**FR-033 `spec.md:373-374`「本 feature では chat 用の Element を採用しない」**、`## Assumptions`「**[ASSUMED] 本 feature の UI は 3 画面**。transcript 表示は R-3」、`plan.md:150` の Project Structure も `features/{runtime-list,workspace-folders,folder-runtime-resolution}/` の 3 つだけ。
  - **tasks.md に対応タスクが 0 件**。`grep -nE "chat|Chat|Thread|composer" tasks.md` → **No matches**。4 画面目・14 element ファイル・`ChatScreen.test.tsx` のいずれも、どの task ID にも紐づいていない。
  - 唯一の記録は AD-025 §6 (b) `:119-129` の「**人間判断により「最初から Element も入れ、チャットの runtime / backend は繋がない」方針を採った**」である。これは *element を入れる* (design system 導入手段の読み替え) の記録であって、**chat 画面を 1 つ持つ / ナビに常設する / `Thread` を mount する**ことの記録ではない。`docs/discovery.md:59` も「design system と element を入れただけ」と書いており、mount している事実と齟齬がある。
- **同種事象探索**:
  - `grep -rn "features/" src/renderer/src/App.tsx` → 画面 **4 件**、うち charter / spec / tasks が認めているのは **3 件**、未記録は **1 件** (`features/chat/`)。
  - `grep -nE "chat|Chat|Thread|composer" specs/001-.../tasks.md` → **0 件**。同 spec.md → FR-033 の「採用しない」と `[ASSUMED] 3 画面` の **2 件のみ** (いずれも反対方向)。
  - `grep -rn "3 画面" specs/001-.../*.md docs/` → **5 件** (spec Assumptions / plan `:130` `:96` / `_overview.md:49` / AD-025 `:261`)。**全件が 3 画面前提**。4 画面と書いた SSoT は AD-025 `:263`「R-1 は上部ナビの 4 画面として実装している」の 1 件だけで、それは「目標レイアウトの共有」節 (= 決定ではない、と自ら書いている節) の中にある。
  - `ls src/renderer/src/components/assistant-ui/elements/` → **11 element + surfaces/utils**。うち chat 専用 (`thread.aui` / `tool-fallback.aui` / `tool-group.aui` / `reasoning.aui` / `attachment.aui` / `follow-up-suggestions.aui`) が **6 件**。
- **リスク/影響**:
  1. **domain 帰属が SSoT から決まらなくなる。** R-3 (transcript 表示、`ui` domain) は、`runtime` feature が作った chat シェル・element コピー・`useExternalStoreRuntime` 結線の上に乗ることになる。`_overview.md:39-40` が警告する「各 domain に表示責務を散らすと Principle XII の持ち主がいなくなる」がまさに起きており、`ui` charter が Principle XII の持ち主であることを明確化した SH-050 の修正 (design-gate M-001 の成果) を、実装側が別方向に崩している。
  2. **Principle XII の N/A 判定の土台が薄くなる。** `plan.md:122` は XII を「対象は Claude Code が emit する情報を表示する feature であり、本 feature は emit 情報を表示しない」として N/A にした。HEAD は `tool-fallback.aui.tsx` / `reasoning.aui.tsx` (= SDK の tool_use / thinking の表示実装そのもの) をリポジトリに入れ、`Thread` を mount している。messages が常に空なので実行時には何も表示されないが、`docs/ui-coverage.md` (O-2) の行を持たない表示実装が 6 件先に入った状態である。
  3. **Principle VIII を NON-NEGOTIABLE のまま 2 度書き換える原因になった** (H-001 と同根)。計画外の成果物のために不変原則の検証記述が動く形は順序が逆である。
  4. 副作用は code-gate でも観測されている — ux H-003 「未接続を日本語で告知した直後に `<h1>How can I help you today?</h1>` が主見出しとして出る」、a11y M-001 「`lang="ja"` 宣言により `thread.aui.tsx` の英語文字列が WCAG 3.1.2 の対象として顕在化」、convention C-008 「上流の英語 accessible name `'Message input'` が唯一のセレクタ」。**3 reviewer が独立に同じ 1 つの計画外成果物を指している。**
- **推奨アクション** (最小案を先に):
  1. **最小 (実装を消さない案)**: `_overview.md:49` の R-1 行と `runtime` charter `:53-55` に「**assistant-ui の導入検証を目的とした chat 画面 1 つを含む。transcript / composer の実装責務は `ui` domain (R-3 / X-2) にあり、R-1 は送信経路を閉じた表示部品の実載せに限る**」を追記し、`ui` charter Out of scope にも同じ限定を 1 行入れて **所有関係を明示**する。あわせて spec の FR-033 と `[ASSUMED] 3 画面` を実体に合わせる (spec は本 PR の touched file であり、`## Assumptions` の `[USER]` / `[ASSUMED]` 記法で追記できる)。tasks.md に事後タスク (`FE-0xx`) を 1 本立ててトレーサビリティを回復する。
  2. **より整合する案**: `features/chat/` とナビの 4 つ目を R-3 へ送り、element のコピーだけを残す (= AD-025 §6 (b) の文面どおりの状態に戻す)。この場合 Principle VIII (1) は R-1 の対象から外れ、H-001 の (A) 免除論・M-005 の番人テストがいずれも不要になる。**Constitution を触らずに閉じる唯一の案**である。
  3. どちらを採るかは人間判断 (AskUserQuestion gated — domain 帰属の変更に当たる)。**reviewer は 2 を推すが 1 でも drift は閉じる。**
- **根拠**: `docs/domains/runtime/charter.md:53-55` / `docs/domains/ui/charter.md:34-37` `:59-66` / `docs/domains/_overview.md:39-40` `:49` / spec FR-033 + `## Assumptions` / plan `:130` `:150` / AD-025 §6 (b) `:119-129` / Principle XII / XI
- **scope 根拠**: charter 3 ファイル・spec・tasks・`src/renderer/src/App.tsx` はすべて touched files。

---

### [High] Principle VI / FR-037 が検証スコープに実名で挙げた「CI 定義」が走査対象に入っておらず、`.github/workflows/verify.yml` は一度も検査されていない (H-003) (scope: feature)

- **観察**:
  - Constitution Principle VI の Verification `:362-365` は「**検証スコープは `src/` に限らない。`scripts/` とビルド構成 (`package.json` の scripts / CI 定義 / パッケージング設定) を含める。除外はファイル単位の明示リストとし、ディレクトリ単位で除外してはならない — そこに後から実行可能コードが増えたときに検証が構造的に届かなくなる**」と定める。FR-037 `spec.md:389-391` も同文。
  - `scripts/constitution/allowlists.mjs:12` `SCAN_ROOTS = ['src', 'scripts']`、`:18-24` `SCAN_FILES = ['package.json', 'electron.vite.config.ts', 'electron-builder.yml', 'eslint.config.mjs', '.dependency-cruiser.js']`。**CI 定義が無い。** `:56` `EXCLUDED_FILES = []` なので「明示的に除外した」記録も無い。
  - `scripts/constitution/scan.mjs:50-65` `collectFiles()` は `SCAN_ROOTS` を walk し `SCAN_FILES` を足すだけである。`grep -rn "github|workflow" scripts/` → **0 件**。したがって `.github/workflows/verify.yml` (86 行、`run:` ステップ 9 本、`runs-on: windows-latest`) は **11 項目すべての検査を一度も受けていない**。
  - 構造が要求と逆になっている。Constitution は「**全部見て、除外だけをファイル単位で列挙せよ**」と言い、実装は「**5 ファイルだけ見る包含リスト**」である。`scan.mjs:57` のコメント「未作成のビルド構成は『対象なし』として扱う」により、`SCAN_FILES` の項目がリネーム・削除されても **黙って対象から消える**。
  - 現時点で verify.yml 自体に違反は無い (`pnpm` 経由の 9 コマンドのみ)。したがってこれは「今の違反」ではなく「**違反が 0 件なのか検査が 0 件なのかを区別できない**」状態である — AD-024 の Context `:32-34` が本 ADR を起こした理由として名指した、まさにその形。
- **同種事象探索**:
  - `grep -rn "github|workflow|SCAN_FILES|SCAN_ROOTS|EXCLUDED_FILES" scripts/` → **8 件**、うち CI を指すものは **0 件**。
  - 実行されるのに走査されていないリポジトリルートの構成ファイル: `.github/workflows/verify.yml` (CI 定義。**Constitution が実名で要求**)、`vitest.config.ts` (実行される JS。プロセス起動が書ける)、`pnpm-workspace.yaml` (`allowBuilds` — パッケージング設定に該当)、`components.json`、`tsconfig*.json` の **計 5 種**。`EXCLUDED_FILES` は空なので 5 件すべてが「除外の記録なしに対象外」。
  - 走査されている `scripts/` 配下は `constitution/{allowlists,check,scan}.mjs` / `rules/run.mjs` / `build/package.mjs` の **5 ファイル**で、AD-024 `:166-170` のとおり `PROCESS_SPAWN_MODULES` に実名で載せる形で処理済み。**同じ扱いが CI にだけ及んでいない。**
- **リスク/影響**:
  1. `run: choco install ...` / `sudo apt-get install ...` / `wsl --import` / `docker build` を CI に足しても `check:constitution` は ok を返す。項目 1 (特権コマンド) の許可リストには `choco` / `winget` / `apt-get` が実名で入っている (`allowlists.mjs:88-128`) のに、CI ファイルだけがその網の外にある。
  2. CI は「環境を構築する場所」であり、Principle VI (永続環境を構築・変更しない) が最も破られやすい場所である。R-1 は CI を新設した feature であり (SH-022)、**新設と同じ PR でスコープに入れる機会を逃している**。
  3. `pnpm check:constitution → 違反 0 / ok 10 / 検査対象なし 1` (`code-gate.md:116`) の「ok 10」に、CI について見た項目は 1 つも含まれていない。
- **推奨アクション** (最小):
  1. `allowlists.mjs:18` の `SCAN_FILES` に `'.github/workflows/verify.yml'` を追加する (1 行)。`SCAN_EXTENSIONS` に `.yml` は既に入っているので他の変更は不要。追加後に `pnpm check:constitution` を通し、`runs-on: windows-latest` の既定シェルが pwsh であることは文字列として現れないため項目 1 に掛からないことを確認する。
  2. 同時に `vitest.config.ts` / `pnpm-workspace.yaml` も足す (実行される構成 / `allowBuilds` を持つパッケージング設定)。
  3. **構造の反転**: `SCAN_FILES` を包含リストから「ルート直下の `SCAN_EXTENSIONS` 一致ファイルを全件走査 + `EXCLUDED_FILES` で明示除外」に変える。Constitution の文言 (「除外はファイル単位の明示リスト」) に一致し、次に構成ファイルが増えたとき自動で入る。`scan.mjs:57` の「黙って対象なし」も、存在しない `SCAN_FILES` を warn 出力に変える。
  4. FR-037 は「**内容の変更には ADR を要する**」を許可リストに課している。`SCAN_FILES` はスコープ定義であって許可リストではないが、同じファイルに同居しているため、今回の追加は ADR ではなく本 PR の修正で足りる (スコープを**広げる**変更であるため)。
- **根拠**: Constitution Principle VI Verification `:347-375` (特に `:362-365`) / FR-037 / SC-009 / AD-024 Context `:32-34` + Consequences `:166-170`
- **scope 根拠**: `scripts/constitution/allowlists.mjs` / `scan.mjs` / `.github/workflows/verify.yml` はすべて touched files。

---

### [High] accepted 後の AD-024 を in-place で改変しており、その結果 Open Questions の閉鎖理由が訂正前の誤認を保持して内部矛盾している (H-004) (scope: feature)

- **観察**:
  - `docs/decisions/0024-constitution-verification-paths.md` は `status: accepted` / `date: 2026-09-14`。本 PR はこれを **accepted 後に本文改変**している — `:53` の見出しが「改定項目 (**18 件**)」に、`:74` に #18 行が追加され、`:213-236` に新節 `## 訂正: R-1 に composer は存在する。根拠は「対象が無い」ではなく「送信経路を閉じた」` が入った。
  - **改変が内部矛盾を生んでいる。** `:249-251` の Open Questions は依然として
    `- [x] ~~Principle VIII の Automated 検証…~~ — …**(A) は対象が無く**、(B) は R-2 の E2E 基盤に相乗りする`
    と書いている。「**(A) は対象が無く**」は、同じファイルの `:213-216` が「**これは事実ではない**」と否定した当の記述である。閉鎖理由が訂正前の誤認のまま残り、`## 訂正:` 節と正面から食い違う。
  - `:184-186` にも「AD-025 **#9** の「対象が無い」扱いは当たらない」という参照があるが、AD-025 に #9 として「対象が無い」を述べている項は `### 9. AD-023 §7 の services ✗→ I/O モジュール直接は R-1 に対象が無い` であり、composer とは無関係の項である。**訂正節が誤った相互参照を新たに 1 件持ち込んでいる** (C-001 の対象でもある項を指している点で、誤読の連鎖が起きうる)。
  - このプロジェクトは accepted ADR を immutable として扱う先例を自ら作っている — AD-025 `:65` 「**AD-004 は immutable なので本文は変更せず、本 ADR を読み替えの根拠とする**」、AD-024 #13 「**immutable な ADR は読み替え対象として列挙する**」。同じ原則を AD-024 自身には適用していない。
  - 項目数も SSoT 間で割れた。AD-024 `:53` = 18 件、Constitution `:55` (v1.2.0 Sync Impact) = 「AD-024。**17 項目**」、plan `:190-212` = 17 行の表、tasks `:85` `:415` = 「**17 項目**」。
  - 併せて accepted ADR 2 件が Open Questions 閉鎖のため改変されている — AD-015 `:217` `:222-223`、AD-016 `:107` `:114`。こちらは plan `:25` が宣言した作業であり、**Decision Outcome を変えず `- [ ]` → `- [x]` に閉じるだけ**なので本指摘の対象としない (区別して扱う)。
- **同種事象探索**:
  - `grep -rn "status: accepted" docs/decisions/ | wc` → **27 件**。本 PR の touched files に含まれる accepted ADR は **5 件** (AD-015 / AD-016 / AD-024 / AD-025 / AD-026)。うち AD-025 / AD-026 は本 feature で新規起票、AD-015 / AD-016 は Open Question の閉鎖のみ、**Decision / 根拠そのものを accepted 後に書き換えたのは AD-024 の 1 件**。
  - `grep -n "対象が無" docs/decisions/0024-*.md` → **3 件** (`:184` 訂正節内の参照 / `:251` Open Questions / `:181` 表内は「送信経路を閉じた」に更新済み)。**未追随は `:251` の 1 件。**
  - `grep -rn "17 項目\|18 件\|17 件" .specify/memory/constitution.md docs/decisions/0024-*.md specs/001-*/plan.md specs/001-*/tasks.md` → **5 件**、うち 18 は AD-024 のみ、17 が 4 件。
- **リスク/影響**:
  1. **ADR が 2 つの結論を同時に持っている。** Principle VIII の免除根拠を後続 feature (R-2 / X-1) が確認するとき、`## 訂正:` を読むか Open Questions を読むかで反対の理解に至る。Open Questions は `- [x]` で閉じているため「結論はここ」と読まれやすい。AD-024 `:222-224` 自身が「誤認が実害を持つのは Principle VIII が NON-NEGOTIABLE だから」と書いており、その誤認が同じファイルに残っている。
  2. **改定履歴が追えない。** Constitution には Amendment trail (`:750-756`) と SemVer があるが、ADR には無い。in-place 改変を許すと「accepted 時点で何が決まっていたか」が git log しか根拠にならなくなり、Constitution 改定手順 step 1 (「ADR で議論を記録」) の記録価値が落ちる。
  3. 項目数の不一致 (17 / 18) は、`architecture-reviewer` の design-gate 出力が「意図的に報告しなかったもの」に挙げた項目 (`architecture-reviewer.md:68`) が、その後の in-place 改変で **実害のある不一致に変わった**ケースである。
- **推奨アクション** (最小):
  1. **最小 (1 行)**: AD-024 `:251` を「(A) は **composer は描画されるが送信経路を `isDisabled: true` で閉じており**、(B) は R-2 の E2E 基盤に相乗りする」に直す。これだけで内部矛盾は消える。
  2. `:184-186` の「AD-025 #9」参照を正しい項番 (AD-025 §6 (b)) に直す。
  3. 項目数を 1 つに揃える — AD-024 が 18 件を正とするなら Constitution `:55` / plan `:190` の表 / tasks `:85` `:415` を 18 に追随させる。Constitution は本文改定ではなく Sync Impact Report コメント内の記述なので PATCH 不要。
  4. **今後の方針を決める** (人間判断): accepted ADR の事実誤認を訂正する経路を (a) 新 ADR + `supersedes` / (b) 本文に `## 訂正:` 節を許す、のどちらにするかを **1 箇所に明文化**する。現状は AD-004 には (a)、AD-024 には (b) が適用されており規約が存在しない。`docs/decisions/` の README か Constitution 改定手順の隣が置き場。
- **根拠**: AD-024 `:53` `:74` `:181-186` `:213-236` `:249-251` / AD-025 `:65` / AD-024 #13 / Constitution 改定手順 `:147-155` + Governance `:717-738` / `reviewer-base.md`「accepted 後 immutable な ADR を修正する spec があれば High 以上」
- **scope 根拠**: `docs/decisions/0024-*.md` は touched file。1〜3 は feature 内で閉じる。4 は out-of-scope 寄り (新規の governance 規約) だが 1〜3 だけで本指摘は閉じる。

---

### [Medium] `_overview.md` の Cross-domain invariant (Principle II) が `platform-ok` 例外を含まず、HEAD の 2 箇所と字義上食い違う (M-001) (scope: feature)

- **観察**: `docs/domains/_overview.md:123` は Cross-domain invariants 表に「**プラットフォーム分岐は `src/main/infra/runtime/` の内側に閉じる** | II | すべて」と例外なしで書く。HEAD には `app` レイヤに 2 件ある — `src/main/index.ts:95` (`window-all-closed`) / `src/main/app/window.ts:31` (Linux の `icon`)。どちらも Constitution Principle II `:216-230` の `platform-ok:` 注記の要件 (同一行末尾・`const` に受ける) を正しく満たしており、**Principle II には違反していない**。`allowlists.mjs:259` の `PLATFORM_BRANCH_DIRS = ['src/main/infra/runtime/']` + `:283` `PLATFORM_OK_MARKER` も整合している。食い違っているのは `_overview.md` の文言だけである。
- **同種事象探索**: `grep -rnE "process\.platform|os\.platform|os\.type" src/` → **3 件** (2 件が `platform-ok` 注記付きの実コード、1 件は `folder-store.test.ts:22` のコメント)。`grep -rn "platform-ok" docs/domains/` → **0 件**。同表の他行も照合: Principle I 行 `:122` は AD-024 #14 の新文言に追随済み ✓ / III `:124` は `!== true` 前提の charter 修正済み ✓ / VI / X 行は R-1 の実体と矛盾なし。**未追随は II 行の 1 件のみ。**
- **リスク/影響**: `_overview.md` は cross-domain invariant の SSoT であり、`architecture-reviewer` / `platform-boundary-reviewer` が照合先として読む。字義どおり照合すると `app` の 2 件が毎 round 偽陽性になり、逆に「例外が 2 件ある」ことを知っている reviewer は表を読まなくなる。design-gate M-003 が「reviewer 定義本文に旧条件が残ると I-3 のゲートが素通りする」と指摘したのと同じ経路の裏返し。
- **推奨アクション**: `:123` を「プラットフォーム分岐は `src/main/infra/runtime/` の内側に閉じる (**ホスト OS のアプリ規約に限り同一行の `platform-ok:` 注記で例外化。Principle II / AD-024 #8**)」に 1 行改める。
- **根拠**: Constitution Principle II `:201-234` / AD-023「公式 scaffold と本プロジェクトの規約が食い違う 2 点」/ AD-024 「Principle II の例外注記に『整形器が動かさない位置』を加える」/ `allowlists.mjs:259` `:283`
- **scope 根拠**: `docs/domains/_overview.md` は touched file。

---

### [Medium] `docs/discovery.md` の「R-1 時点の実測値」が HEAD と食い違い、reviewer / lint-agent の SSoT が古い値を示している (M-002) (scope: feature)

- **観察**: `docs/discovery.md:151-160` の表「### R-1 時点の実測値 (2026-09-15)」は `depcruise` = **114 modules / 395 dependencies**、`pnpm test` = **11 files / 213 passed** と書く。HEAD の実測は `code-gate.md:116` / `:135-136` のとおり **118 modules / 416 dependencies** / **15 files / 264 passed** である (lint-agent が「更新を要するか要判断」として verdict に残した 4 番目の事実)。同ファイル `:64` の「**R-1 の変更はまだ未コミットである。**」、`:63` の「追跡ファイル 374 件」も HEAD では偽 (4 コミット確定済み)。
- **同種事象探索**: `grep -nE "実測値|114|395|118|416" docs/discovery.md` → 該当表 1 つ + 前後記述。同ファイル冒頭 `:11-16` が「**旧記述を残したままにすると、lint コマンドを『存在しない』と判断して検査が丸ごと飛ぶ**」と自ら警告している。他の SSoT 側 — Constitution `:668` の Existing violations summary も **114 modules / 395 dependencies / 11 files 213 passed** のまま (v1.2.1 時点の enumeration と明記されているので、こちらは「時点が明記された過去の記録」として整合。**discovery.md 側は「R-1 時点」と称して現在値のふりをしている点が異なる**)。R-1 完了時点の再 enumeration を要求するタスクは tasks.md に SH-023 として存在するが、実行結果は v1.2.1 時点で止まっている。
- **リスク/影響**: (a) `reviewer-base.md:17-20` は「アプリケーション種別 / 言語 / DB / CI を `docs/discovery.md` の Tech Stack から取得」と定めており、本ファイルは全 reviewer の起動時入力である。数値の陳腐化自体の実害は小さいが、「R-1 時点」と称する表が R-1 の HEAD と違うと、次 feature の reviewer が回帰の基準線を誤る。(b) Constitution `:660-676` の Existing violations enumeration は「AD-024 改定後の条件で全検証を実行した (SH-023)」という**改定手順 step 5 の成果物**であり、モジュール数が 114 → 118 に増えた後の再実行結果が無い。改定手順は「NON-NEGOTIABLE 強化時」に enumeration を要求しており今回は義務ではないが、**表の数字が「いつの測定か」でしか整合しない状態**は避けたい。
- **推奨アクション**: (1) `discovery.md:151` の見出しを「R-1 **完了時点** (2026-09-16)」に改め、表を 118 / 416 / 15 files / 264 passed に更新。(2) `:63-64` の「未コミット」「374 件」を現況に直す。(3) Constitution `:660-676` の表は **時点表記を保ったまま** (v1.2.1 時点の記録として正しい)、`## Existing violations summary` に「R-1 完了時点の再実行結果」を 1 行足すか、SH-023 を再実行して差し替える。どちらでもよいが「どの時点の数字か」が読める形にする。
- **根拠**: `docs/discovery.md:11-16` (自己警告) / `:151-160` / `:63-64` / Constitution `:656-676` / `reviewer-base.md:17-20` / `code-gate.md:129-130`
- **scope 根拠**: `docs/discovery.md` は touched file。

---

### [Medium] `domain` が ui 到達可能 / 不可能の 2 層に暗黙分裂しており、AD-025 §4 が根拠に挙げた「越境判定を ui からも呼びたい」が実体として成立していない (M-003) (scope: feature)

- **観察**:
  - AD-025 §4 `:78-91` は「`ui` は `domain` から型と純粋関数だけを取る。**越境判定や接頭辞照合のような表示に必要な規則は `ui` からも呼びたいため、`domain` を参照させる**」「接頭辞照合を標準モジュールに依存しない別モジュール (`workspace/prefix-match.ts`) に置いているのはこのためである」と述べる。`plan.md:174-175` も「**解決関数は `ui` から呼べる必要があり、標準モジュールに依存させられない**」と書く。
  - HEAD では越境判定の本体 `src/domain/workspace/resolution.ts:3` が `import { runtimePathOps } from '@domain/runtime/path-api'` を持ち、`path-api.ts:1` は `node:path` を import する。したがって `resolution.ts` は `.dependency-cruiser.js:240-247` の `ui-not-to-core` (`from: ^src/renderer/`, `to: coreRe(ALL_CORE), reachable: true`) により **`ui` から到達禁止**である。**AD-025 §4 が設計の動機として挙げた当の関数が、ui から呼べない側に落ちている。**
  - 実際の renderer は DTO と `shouldSuggestUnregister` (`folder.ts`、標準モジュール非到達) しか取っておらず (`WorkspaceFoldersScreen.tsx:19-20` 他、全 17 import を確認)、越境判定は main 側 (`folder-service.ts:176` / `:393`) で実行して `FolderRuntimeResolutionDTO` として渡す設計になっている。**この形自体は健全** (SC-006 / SC-007 の計測経路とも一致) だが、ADR / plan の記述と食い違う。
  - 境界の見え方にも穴がある。`ui → domain` は eslint `boundaries` では**常に許可**されるため (`eslint.config.mjs:269-272`)、renderer が `resolution.ts` を import してもエディタは何も言わず、`pnpm depcruise` で初めて落ちる。Complexity #1 が「片方だけにすると編集時のフィードバックが失われる」と書いた状況が、この 1 経路では実際に起きている。
- **同種事象探索**:
  - `grep -rn "from '@domain" src/renderer/` → **17 件**、参照先は `@domain/capability` / `runtime/dto` / `runtime/capabilities` / `runtime/descriptor` / `workspace/dto` / `workspace/folder` の **6 モジュール**。全件が標準モジュール非到達 ✓ (import グラフを手で辿って確認)。
  - `src/domain/**` の全 import を列挙 (`grep -rnE "^import|from '" src/domain/`) し `node:path` への到達を判定 → 到達する = **ui から呼べない domain モジュールは 4 件** (`runtime/path-api.ts` / `workspace/resolution.ts` / テスト 2 件)。到達しない = ui 可 は **10 件**。**この 2 分割を示す記述・命名規約・コメントは 0 件** (`grep -rn "ui から" src/domain/` → 1 件のみ = `path-api.ts:222` の「`prefix-match` が標準モジュールに依存しないことが `ui` の builtin 非到達の前提である」。`resolution.ts` 側には無い)。
- **リスク/影響**: R-3 / R-4 (`ui` domain) が越境の表示を実装するとき、`resolution.ts` を import するのが自然だが depcruise で落ちる。そのとき取る手は (a) main 経由の DTO に寄せる (正解) か (b) `path-api` 依存を `resolution.ts` から剥がす か (c) ルールを緩める (最悪) であり、**どれが意図された設計かが SSoT から読めない**。AD-025 §4 を字義どおり読むと (c) が正当化されうる。
- **推奨アクション** (最小):
  1. `src/domain/workspace/resolution.ts` の冒頭 docstring に「**本モジュールは `path-api` 経由で `node:path` に到達するため `ui` から import できない** (`ui-not-to-core`)。renderer へは `FolderRuntimeResolutionDTO` として渡す」を 1 行入れる (`path-api.ts:222` と対になる記述)。
  2. AD-025 は accepted なので本文を変えず、**plan.md `:174-175` の「解決関数は `ui` から呼べる必要があり」を実体に合わせる** (plan は touched file)。あわせて `runtime` charter の業務ルールか `_overview.md` の Principle I 行に「`ui` が `domain` から取れるのは標準モジュール非到達のモジュールに限る」を明示する。
  3. 可能なら `domain/workspace/` 側に `resolution` の純粋部分 (`prefix-match` 利用のみ) と `path-api` 依存部分を分ける案も残るが、**現状の main 側実行で SC-006 / SC-007 は満たしているため分割は要求しない** (最小案は 1 + 2)。
- **根拠**: AD-025 §4 `:78-91` + Consequences `:183-185` / plan `:174-175` / `.dependency-cruiser.js:240-247` / `eslint.config.mjs:269-272` / plan Complexity #1
- **scope 根拠**: `src/domain/workspace/resolution.ts` / `plan.md` は touched files。

---

### [Medium] plan.md の Constitution Check が v1.1.0 基準のままで、VIII 行が v1.2.2 で偽と確定した「composer は X-2」を保持している (M-004) (scope: feature)

- **観察**: `plan.md:100` 「`.specify/memory/constitution.md` **v1.1.0** に基づく」。HEAD の Constitution は v1.2.2 で、その間に **Principle I / III の NON-NEGOTIABLE 改定 (#13 / #14) と VIII の Verification 2 度の改定**が入っている。とくに `plan.md:113` の VIII 行は「**composer は X-2**。該当は日本語を含む名前の表示と出力デコード (SC-011)。CI 構築時期の再確認条件が本 feature で発火する」と書くが、AD-024 `:213-221` と Constitution v1.2.2 `:756` は「**`ChatScreen` は `Thread` を mount しており composer は描画される**」= この前提は事実でないと確定させた。
- **同種事象探索**: `grep -nE "v1\.1\.0|v1\.2" specs/001-*/plan.md` → **1 件** (`:100`)。`grep -n "composer" specs/001-*/plan.md` → **1 件** (`:113`)。Constitution Check 表の他 14 行を v1.2.2 本文と逐条照合 → I 行 `:106` は AD-024 #14 を参照しており改定後と整合 ✓ / III 行 `:108` は安全側解釈の単一判定点で整合 ✓ / VII / IX / XI / XIII / XV は `Post-design re-check` `:348-357` で AD-024 の accepted を到達条件にしており追随済み ✓。**未追随は `:100` の版数と `:113` の VIII 行の 2 箇所。**
- **リスク/影響**: (a) plan.md は `.specify/templates/plan-template.md` と対で R-2 以降の全 plan の書式基準になる (AD-024 Consequences `:161-163` が「放置すると R-2 以降の全 plan が旧文言で Constitution Check を行う」と警告した経路そのもの)。SH-047 は template と `PLAN.md` を対象にしたが、**当の plan.md 自身の版数表記は対象外だった**。(b) VIII 行が残ると、R-2 の実装者が「R-1 の plan は composer を X-2 と判定していた」を根拠に IME テストの必要性を読み違える。
- **推奨アクション**: `:100` を「v1.2.2 に基づく」に、`:113` の VIII 行を「**✅ 該当 (条件付き)** — composer は描画されるが `isDisabled: true` で送信経路を閉じ、`ChatScreen.test.tsx` が前提を固定する。Automated 2 項目は R-2 の E2E 基盤に相乗り (AD-024 #18 + 訂正節)。該当は日本語を含む名前の表示と出力デコード (SC-011)」に改める。**判定記号は変えなくてよい** (根拠だけを実体に合わせる)。
- **根拠**: Constitution v1.2.2 frontmatter + `:756` (Amendment trail) / AD-024 `:213-236` / AD-024 Consequences `:161-163` / plan `:100` `:113`
- **scope 根拠**: `specs/001-.../plan.md` は touched file。

---

### [Medium] Principle VIII の「番人」として Constitution / AD-024 が指名した 2 ケースのうち 1 つが、退行を捕まえられない形になっている (M-005) (scope: feature)

**MF-001 の再指摘ではない。** MF-001 は「v1.2.1 の事実誤認が訂正されたか」で resolved。本指摘は **訂正後に「唯一の番人」として指名された機構の実効性**という別 origin (D / H) の観察である。

- **観察**:
  - Constitution `:706` 「守るのは Manual の 2 者と `ChatScreen.test.tsx` の **2 ケース**である」、AD-024 `:232-234` 「この前提は文章ではなく `ChatScreen.test.tsx` が守る。入力が無効であること、**変換確定直後の Enter が送信経路に届かない**ことの 2 ケースである。`isDisabled` が外れた瞬間にここが落ちる」、テスト自身 `:16` 「**ここがその唯一の番人である**」。
  - ケース 1 (`ChatScreen.test.tsx:23-30`) は `expect(input).toBeDisabled()` であり **`isDisabled` の退行を確実に落とす** ✓。番人として機能しているのはこのケースである。
  - ケース 2 (`:32-45`) は 2 点で主張を満たしていない。
    (a) **`isComposing` を立てていない。** `fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })` が生成する `KeyboardEvent` の `isComposing` は false であり、直前の `compositionStart` / `compositionEnd` はこの keydown に紐づかない。Principle VIII の Statement が禁じる「変換確定の Enter」は `e.nativeEvent.isComposing === true` の Enter であり (Constitution `:432` の Good 例そのもの)、**テスト名が主張する条件を再現していない**。
    (b) **負の検証を同期 throw に依存している。** `expect(() => fireEvent.keyDown(...)).not.toThrow()` は、`onNew` が dispatch 内で同期的に投げた場合しか捕まえられない。`isDisabled` を外す退行が入ったとき、送信は `@assistant-ui/react` 内部の非同期経路 (`composer.send()` → append → `onNew`) を通るため、`onNew` の `throw` は **unhandled rejection** になり `not.toThrow()` は通る。code-gate の ux H-002 が「`unhandledrejection` ハンドラが 0 件のまま意図的な `throw` だけ増えた」と指摘した状況と同じ根である。
  - 結果として「2 ケース」の実効は **1 ケース**である。幸い残る 1 件 (ケース 1) が `isDisabled` の退行を捕まえるので、AD-024 が守ろうとした最悪経路 (検証していない送信経路の黙った復活) は塞がっている。**過大なのは主張であって、防御は 0 ではない。**
- **同種事象探索**: `grep -rn "isComposing" src/` → **0 件** (テストの `compositionEnd` 1 件を除く)。`grep -rn "unhandledrejection\|ErrorBoundary" src/` → **0 件** (ux H-002 と一致)。Principle VIII を検証すると称するテストは `ChatScreen.test.tsx` の **1 ファイル / 2 ケース**のみで、他に同型は無い。
- **リスク/影響**: R-2 で `isDisabled` を外す変更が入ったとき、ケース 1 が落ちるので気付ける (= 最悪経路は防げている)。ただし「変換確定の Enter が送信にならない」を **R-1 のうちに一度も確かめていない**のに、Constitution と ADR は確かめた側に読める記述を持つ。AD-024 の延期条件 `:195` は「`isDisabled: true` を外す変更が入った時点で本項は必須になる」と書いており、その必須化の起点はケース 1 に依存している — ケース 2 は起点にならない。
- **推奨アクション** (最小):
  1. ケース 2 を実効化する。`fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', isComposing: true })` を渡し (jsdom の `KeyboardEvent` init は `isComposing` を受ける)、判定を同期 throw ではなく `onNew` の spy 呼び出し回数 0 に変える (`ChatScreen` に `onNew` を注入できないなら、`vi.spyOn(console,'error')` ではなく **`window.addEventListener('unhandledrejection')` を張って 0 件を確認**する形でもよい)。
  2. Constitution `:706` と AD-024 `:232-234` の「2 ケース」を、実効を正しく述べる形に直す (例: 「入力が無効であることを固定する 1 ケースと、変換確定 Enter の非送信を固定する 1 ケース。後者は R-2 で E2E に載せ替える」)。**H-001 の推奨 1 と同じ PATCH で閉じられる。**
- **根拠**: Constitution Principle VIII `:427` `:432` `:440` `:706` / AD-024 `:228-236` / `src/renderer/src/features/chat/ChatScreen.test.tsx:32-45` / `ChatScreen.tsx:45-54`
- **scope 根拠**: テストと Constitution / AD-024 はすべて touched files。

---

### [Medium] glossary の分類が二重になっており、spec の Key Entity と domain 型の一部が canonical 見出しを持たない (M-006) (scope: feature)

- **観察**:
  - `docs/glossary.md:146-155` は `Location` を **Canonical Terms** の L 節に定義している (AD-025 参照つき、良い記述)。同時に `:309` の **Candidate Terms** 表にも `Location` が「Proposed canonical」として残っている。Principle XIV `:608` は「**Candidate Terms section の用語は使用前に canonical 昇格レビュー必須**」と定めるので、同じ語が両節にあると昇格済みか未済かが判定できない。
  - FR-046 「本 feature で導入・変更する用語を `docs/glossary.md` に反映」に対し、未反映が 2 件ある。(a) **`FolderRuntimeResolution`** — spec `## Key Entities:455` が実名で挙げるエンティティで、`domain/workspace/dto.ts` の `FolderRuntimeResolutionDTO` として code / IPC / renderer を貫く語。glossary に **0 件**。(b) **`VerifiedRunning`** — `domain/runtime/verified-running.ts` の型で、Constitution `:696-697` の「機械検証で捕まらない残余」表が「`infra` の入口が `checkVerified` で一致を検証する」と依存している概念。glossary では `:57` の Browse session 項の括弧内に 1 度現れるだけで、canonical 見出しが無い。
  - `total_terms: 31` (frontmatter) と実際の canonical 見出し数の一致は未検証 (見出しを数えると A〜W で 31 前後。断定しない)。
- **同種事象探索**: `grep -nE "Reachability|WorkspaceFolder|VerifiedRunning|WslUncPath|FolderRuntimeResolution|PathDTO|BrowseSession" docs/glossary.md` → **6 件**。canonical 見出しを持つ: `Reachability:197` / `WorkspaceFolder:282` / `WslUncPath:292` ✓。持たない: `FolderRuntimeResolution` (**0 件**) / `VerifiedRunning` (本文中 1 件) / `PathDTO` (0 件。ただし Constitution `:696` が「IPC が返す型を `PathDTO` に固定」と依存)。Candidate 表との重複は `Location` の **1 件のみ** (`AgentRuntime` / `supervisor` / `Isolation` / `Disposable container` は canonical 側と表記が異なる注意書きなので重複ではない)。**convention-reviewer C-005 (`WslAvailability` が glossary に 0 件) と同じクラスの事象であり、そちらは重複計上しない。**
- **リスク/影響**: `FolderRuntimeResolution` は R-1 が確定させた判定表の名前そのもので、X-4 / I-1 が同じ表を拡張すると `_overview` / AD-025 が明言している。canonical でないまま 3 feature が触ると同義異語 (解決結果 / 組み合わせ / resolution) が分岐する。Principle XIV は同義異語を禁止しており、glossary が SSoT である以上ここで止めるのが最も安い。
- **推奨アクション**: (1) `:309` の Candidate 表から `Location` 行を削除 (canonical 昇格済み)。(2) `FolderRuntimeResolution` / `VerifiedRunning` / `PathDTO` を Canonical Terms に追加 (各 4〜6 行、`Definition` / 日本語表記 / `Domain: runtime` / `Ref: AD-025 / data-model §6 §8`)。(3) `total_terms` を実数に更新。
- **根拠**: Constitution Principle XIV `:605-613` / FR-046 / spec `## Key Entities` / `docs/glossary.md:146-155` `:304-310` / Constitution `:691-697`
- **scope 根拠**: `docs/glossary.md` は touched file。

---

### [Low] AD-024 の項目数が本文 18 件 / 他 SSoT 17 項目で割れている (L-001) (scope: feature)

- **観察**: AD-024 `:53` 「改定項目 (**18 件**)」に対し Constitution `:55` 「(AD-024。**17 項目**)」/ plan `:190-212` の表は 17 行 / tasks `:85` `:415` 「**17 項目**」。#18 が v1.2.1 で後から加わったための不一致。
- **同種事象探索**: `grep -rnE "17 項目|18 件" .specify/memory/constitution.md docs/decisions/0024-*.md specs/001-*/{plan,tasks}.md` → **5 件** (18 = 1 / 17 = 4)。
- **リスク/影響**: SH-017 の完了判定 (「17 項目をまとめて改める」) が 18 件目を含まない読み方を許す。実害は小 (#18 は v1.2.1 / v1.2.2 で実施済み)。
- **推奨アクション**: 4 箇所を 18 に揃えるか、AD-024 側を「17 項目 + #18 (v1.2.1 で追加)」と書く。**H-004 の推奨 3 と同一作業。**
- **根拠**: AD-024 `:53` / Constitution `:55` / tasks `:85` `:415`
- **scope 根拠**: すべて touched files。

### [Low] plan が「charter 側を改める」と宣言した 3 件のうち 2 件が runtime charter に残置され、追随表にも無い (L-002) (scope: feature)

- **観察**: `plan.md:15-19` 「本 feature が満たさない In scope (**charter 側を改める**)」= (a) docker endpoint → `isolation`、(b) `AgentRuntime` の起動契約 → `session` (X-1)、(c) 配布 → D-1。`runtime` charter で追随したのは (a) のみ (`:50-52` に移動済み ✓)。(b) は `:36` 「`AgentRuntime` インタフェースと**起動契約**」、(c) は `:41` 「アプリのパッケージングと配布」として In scope に残る。`plan.md:337` の追随表も (a) 相当しか挙げていない。
- **同種事象探索**: `grep -n "起動契約\|パッケージングと配布" docs/domains/runtime/charter.md` → **2 件**。plan 追随表 + tasks で対象化しているものは **0 件**。
- **リスク/影響**: **domain の In scope としては (b)(c) を `runtime` が持つのが正しい** (起動契約の定義は最下層、配布は `_overview.md:81` が `runtime` と明記) ため、charter が誤っているとは言えない。問題は plan が「改める」と宣言した 3 件の処理が 1/3 で止まり、`Post-design re-check` の「charter 整合」行も何をもって到達とするかが曖昧なこと。
- **推奨アクション**: `plan.md:15-19` を「**feature としては満たさない (charter の domain scope は変えない)**」と書き分けるか、charter `:36` `:41` に「(R-1 は `descriptor` / `path` まで。起動契約は X-1、配布は D-1)」を括弧で補う。どちらでも閉じる。
- **根拠**: plan `:15-19` `:337` `:358` / `runtime` charter `:36` `:41` / `_overview.md:81`
- **scope 根拠**: plan / charter はどちらも touched file。

### [Low] FR-001 の「ホスト OS の判定はランタイム実装の内側で行う」に対応する判定が 0 件 (L-003) (scope: feature)

- **観察**: FR-001 は「**ホストが Windows の場合**、`Win32Runtime` 1 件と…を列挙する。ホスト OS の判定はランタイム実装の内側で行う」。`src/main/infra/runtime/win32.ts:15` `createWin32Descriptor(now)` は **無条件**に descriptor を返し、`infra/runtime/` にホスト OS を見る式は 1 つも無い (`grep -rnE "process\.platform|os\.platform|os\.type" src/main/infra/` → **0 件**)。つまり「ホストが Windows のとき」という前件が実装に存在しない。
- **同種事象探索**: プラットフォーム判定は HEAD 全体で 2 件のみ (`index.ts:95` / `window.ts:31`。どちらも `app` の Electron 規約、`platform-ok` 済み)。ランタイム選択のための判定は **0 件**。
- **リスク/影響**: R-1 の Target Platform は Windows 11 + WSL2 に限定され (`plan.md:80`)、macOS / Linux は OPT-mac として明示的に Out of Scope なので **現時点の実害は無い**。むしろ判定を持たないことが Principle II に最も適合する形である。ただし OPT-mac 着手時、非 Windows ホストで `Win32Runtime` を 1 件表明する経路が残っており、FR-003「能力がないものを『ある』と表明してはならない」に最初に当たるのはここである。
- **推奨アクション**: 実装は変えず、`win32.ts` の docstring か `research.md` の申し送り表に「**ホスト OS の判定を持たないのは Windows 専用出荷 (OPT-mac 前) の既定である。OPT-mac で `DirectRuntime` を足す時点で、列挙側 (`wsl-detector` / `composition-root`) にホスト判定を 1 箇所だけ置く**」を 1 行残す (`research.md:399-410` の申し送り表と同じ形式)。
- **根拠**: spec FR-001 / FR-003 / plan `:80` / Constitution Principle II / `docs/domains/_overview.md:70` (OPT-mac)
- **scope 根拠**: `src/main/infra/runtime/win32.ts` / `research.md` は touched files。

## design-gate 指摘 (architecture-reviewer.md round 4) の解消状況

| design ID | 要求 | HEAD の実証 | 判定 |
|---|---|---|---|
| **M-001** `ui` charter が追随表に無い | 追随表に `ui/charter.md` 追加 + SH-050 (In scope の限定 / Out of scope に「他 domain の操作 UI」) + plan の XII 判定根拠差し替え | `plan.md:344` に `ui/charter.md` 行あり / `tasks.md:366` に **SH-050 `[x]`** / `ui/charter.md:41-48` が「基盤そのものではない。renderer の配信プロトコル・CSP 基線・検証項目 10 は R-1 が `app` レイヤで固定した」+ 緩和手続き (nonce/hash か ADR) を明記 / `:59-66` に Out of scope 追加 + Principle XII の持ち主を明文化 / `plan.md:122` が「対象は Claude Code が emit する情報を表示する feature」に差し替え済み | **閉** |
| **M-002** 所在 WSL × `Win32Runtime` の未検証仮定に X-1 申し送りが 0 件 | research 申し送り表に 1 行 / AD-025 にも記録 / 断定文言をやめる | `research.md:410` に「ネイティブ Windows プロセスの cwd に UNC パスを与えられるか \| X-1 \| R-1 は**未検証のまま**…可能なら判定表の当該セルを `reachable` / `cross` に改める」/ AD-025 `:279-282` 「### X-1 へ」節 / 文言は `labels.ts:30` 「WSL の中にあるため、Windows のランタイムからは**開けない扱いにしています**」= 断定を回避 | **閉** (3 点すべて実文で確認) |
| **M-003** `.claude/agents/platform-boundary-reviewer.md` の旧表記が追随表にもタスクにも無い | SH-019 の対象を `.claude/agents/` 配下に広げる | `tasks.md:95` 「SH-019 [P] `.specify/spec-gate/reviewers.yml` と **`.claude/agents/` 配下**で Principle の…」`[x]` / `.claude/agents/platform-boundary-reviewer.md` が touched files に含まれ `sha: d2f0ba9` で更新済み | **閉** |

**round inheritance**: resolved from design-gate: **3** / unresolved: **0** / new: **13** (C-001 / H-001〜H-004 / M-001〜M-006 / L-001〜L-003)。

## 検査したが指摘に至らなかったもの

- **AD-023 の 5 レイヤ遵守 / `domain` の I/O 非保持** — `grep -rnE "from ['\"](node:|fs|path|child_process|os|electron)" src/domain/` → **1 件のみ** (`path-api.ts:1` = Principle I の許可ファイル)。`process.` / `Date.now` / `Math.random` / `fetch` / `crypto` → **0 件** (`registry.ts:62` は「乱数源を引数で受け取る」コメント)。`domain-not-to-io` / `domain-not-to-electron` の `reachable: true` と `DOMAIN_PURE_CORE` 10 語の allowlist も妥当 (`path` を入れる根拠が純粋文字列操作であることは `path-api.ts` の実装で確認)。**指摘なし。**
- **Principle I / FR-025** — 標準モジュールの許可が `PATH_API` 1 ファイル、eslint (`files: [PATH_API_FILE]` の override) と depcruise (`from: { pathNot: PATH_API }`) の**両層で同じ 1 ファイル**を指しており境界が一致している。`resolveBrowseTarget` (`folder-service.ts:414-431`) が renderer に合成させない形も FR-025 と整合。
- **Principle II** — `platform-ok` 2 件はいずれも AD-023 が予告した箇所、`const` に受けて同一行注記という AD-024 の書き方に準拠。`PLATFORM_BRANCH_PATTERNS` は分割代入・ブラケット記法・`os.platform()` / `os.type()` / `process.getSystemVersion` まで見ており FR-036 の「等価な API と構文変形」を満たす。
- **Principle VII / IX** — `src/agents/` は `.gitkeep` のみ。`agents-not-to-electron` / `-native` / `-infra` は対象 0 だが `tests/rule-fixtures/a-direct/agents-electron-transitive.ts.fixture` で発火確認済み (native 側の fixture 欠落は convention H-001 の owner 範囲なので重複させない)。`JSON.parse` は `folder-store.ts:95` の設定ファイル 1 件のみ = Principle IX の Exceptions に該当。
- **FR-038 / AD-023 §8** — `electron` import 8 件すべて `src/main/index.ts` / `src/main/app/**` / `src/preload/` = 許可範囲。`infra/secrets/` は空 (X-3 の枠)。`ELECTRON_ALLOWED` / `npmRe` (`node_modules/` 接頭辞) の実測由来の修正も妥当。
- **cross-domain invariant (HostPath / RuntimePath の分離)** — 境界を越えて保たれている。`validate.ts:77` が `unc:` を境界で拒否、`:136` が種別まで完全一致を要求、`wsl-fs.ts:102` が `wsl:<D>` の値を返す、`makeWslUncPath` / `makeRuntimePath` が名前空間識別子を必須引数に取る (`path-types.ts:124-147`)、`isSameDistro` がディストロ成分を取り出す唯一の経路 (AD-025 §2 の要求どおり)。`dto.ts:100` 「namespace は常に所在のもの — `unc:<D>` を境界へ出さない」も実装と一致。`validate.test.ts:119` / `:229` / `:333` が 3 経路を回帰で固定。**指摘なし。**
- **AD-026 の Confirmation** — `electron-builder.yml:21-23` の `asarUnpack` がパッケージ名指定 ✓ / `package.json:24-27` の build スクリプトがすべて `scripts/build/package.mjs` 経由 ✓ / `npmRebuild: false` + `postinstall: electron-builder install-app-deps` が AD-009 / AD-013 と整合 ✓ / CI にインストーラ生成を載せていない (AD-026 「意図的にしていないこと」) ✓。**指摘なし** (`linux.maintainer: electronjs.org` が scaffold 既定のまま残るが linux は非対象プラットフォームであり AD-023 の要修正リストにも無い)。
- **FR-042 / AD-023 公開 ID** — `appId: dev.closta.app` / `productName: Closta` / `win.executableName: closta` / `name: closta` + `private: true` / `publish` 削除 / `index.ts:43` `setAppUserModelId('dev.closta.app')` — **表と完全一致**。
- **AD-024 #1〜#17 の実装追随** — #1/#2 (`agents` ディレクトリ + グラフ検証) / #3/#4 (`allowlists.mjs` の許可リスト + ADR 要件の明記) / #7/#8 (許可ファイル・許可ディレクトリの実名化) / #10/#11 (`theme_baseline_exclusions` + `-e` 修正 + Exceptions 文言) / #12 (Principle XV Exceptions) / #13 (`!== true` + `isAutoModeAllowed` 単一関数) / #14 (Principle I Statement) / #15/#16/#17 — **すべて Constitution 本文と実装の双方で確認できた。** #5 (検証スコープ) だけが未達 = H-003。
- **Principle III / V / X / XII** — III はゲートが I-3 であり R-1 は表明側。`fixedCapabilities` / `beginProbing` / `probeFailed` が `unknown` を `false` に丸めない形で実装され、`isAutoModeAllowed` 単一判定点 + 生の `autoModeSafe` を IPC に流さない (AD-025 §5) を満たす。V は永続化スキーマに秘密フィールド無し (`folder-record.ts` を確認)。X / XII は R-1 に対象なし。
- **意図的に報告しなかったもの**: `GENERATED_FILES` のディレクトリ glob と Principle VI の「ファイル単位除外」の緊張 (= convention M-001 と同一事象、owner 範囲外) / `CSP_DECLARATION_EXEMPT_SUFFIXES` の接尾辞パターン (convention C-002) / `WslAvailability` の glossary 不在 (convention C-005) / `@electron-toolkit/preload` が AD-025 §6 (a) で置き換えたのに dependencies に残る (convention 範囲) / `useFolders.ts` の reject 受け皿 (ux H-001) / フォーカス喪失 (a11y H-002) / coverage 未設定 / 改定手順 step 2 「人間レビュー」の記録が tasks に無いこと (前 round で助言済み) / `vitest.config.ts` の走査漏れ (H-003 に含めた)。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| C-001 | `grep -rnE "調停\|export function create[A-Z]\w+" src/` | 14 (調停クラス **2**) | `src/main/app/runtime-store.ts:21,46` / `src/main/app/folder-service.ts:90` |
| C-001 | `grep -nE "service\|Service\|registry\|Registry\|store\|Store" .dependency-cruiser.js` | **0** | — (ルール不在) |
| C-001 | `grep -nE "service\|Service\|Registry" eslint.config.mjs` | **0** | — (ルール不在) |
| C-001 | `grep -rnE "from ['\"]node:[a-z/]+['\"]" src/` | 7 (調停からの直接 import **1**) | `src/main/app/folder-service.ts:1` (`node:crypto`) / 許可: `protocol.ts:1`, `infra/fs/{wsl,host}-fs.ts`, `infra/settings/folder-store.ts:1`, `domain/runtime/path-api.ts:1` |
| C-001 | `ls tests/rule-fixtures/{a-direct,b-equivalent}/` に services 経路 | **0** / 20 | — (fixture 不在) |
| H-001 | `grep -n "existing_violations" .specify/memory/constitution.md` | 13 (Automated 0 項目は **1**) | `.specify/memory/constitution.md:420` (VIII) |
| H-001 | `grep -rnE "onKeyDown\|key === 'Enter'" src/ \| grep -v isComposing` | **2** | `src/renderer/src/components/assistant-ui/elements/attachment.aui.tsx:171` / `src/renderer/src/components/image.tsx:320` |
| H-001 / M-005 | `grep -rn "isComposing" src/` | **0** | — (ガードは assistant-ui 内部) |
| H-002 | `grep -nE "chat\|Chat\|Thread\|composer" specs/001-*/tasks.md` | **0** | — (タスク不在) |
| H-002 | `grep -rn "3 画面" specs/001-*/ docs/` | 5 (全件 3 画面前提) | `spec.md` Assumptions / `plan.md:96,130` / `_overview.md:49` / `AD-025:261` |
| H-002 | `src/renderer/src/App.tsx` の画面登録 | 4 (未記録 **1**) | `src/renderer/src/App.tsx:18-23` (`chat`) |
| H-003 | `grep -rn "github\|workflow" scripts/` | **0** | — (CI 未走査) |
| H-003 | 走査対象外の実行構成 | **5 種** | `.github/workflows/verify.yml` / `vitest.config.ts` / `pnpm-workspace.yaml` / `components.json` / `tsconfig*.json` |
| H-004 | `grep -n "対象が無" docs/decisions/0024-*.md` | 3 (未追随 **1**) | `docs/decisions/0024-constitution-verification-paths.md:251` |
| H-004 | `grep -rn "17 項目\|18 件" …` | 5 (18 = 1 / 17 = 4) | `AD-024:53` / `constitution.md:55` / `plan.md:190` / `tasks.md:85,415` |
| H-004 | touched files 中の accepted ADR で Decision を改変 | **1** / 5 | `AD-024` (AD-015:217,222 / AD-016:107,114 は Open Question 閉鎖のみ) |
| M-001 | `grep -rnE "process\.platform\|os\.platform\|os\.type" src/` | 3 (実コード **2**) | `src/main/index.ts:95` / `src/main/app/window.ts:31` |
| M-001 | `grep -rn "platform-ok" docs/domains/` | **0** | `docs/domains/_overview.md:123` (例外未記載) |
| M-003 | `grep -rn "from '@domain" src/renderer/` | 17 (builtin 到達 **0**) | 参照先 6 モジュールすべて純粋 ✓ |
| M-003 | `src/domain/**` で `node:path` に到達するモジュール | **4** (ui 不可) | `domain/runtime/path-api.ts:1` / `domain/workspace/resolution.ts:3` (+ テスト 2) |
| M-004 | `grep -nE "v1\.1\.0\|composer" specs/001-*/plan.md` | 2 | `plan.md:100` / `plan.md:113` |
| M-006 | `grep -nE "FolderRuntimeResolution\|VerifiedRunning\|PathDTO" docs/glossary.md` | 1 (canonical **0**) | `docs/glossary.md:57` のみ / Candidate 重複: `:309` |
| L-003 | `grep -rnE "process\.platform\|os\.platform\|os\.type" src/main/infra/` | **0** | `src/main/infra/runtime/win32.ts:15` (無条件生成) |

## Verdict

- **Critical: 1**
- **High: 4**
- **Medium: 6**
- **Low: 3**
- Round inheritance: resolved from design-gate: **3** (M-001 / M-002 / M-003 すべて実文で閉鎖確認) / unresolved: **0** / new: **13**

**caller の 3 つの問いへの直接回答**

1. **AD-023 の 5 レイヤ遵守 / `domain` が I/O を持たないこと** — レイヤ境界・`electron` 限定・`domain` の純粋性・`ui → domain` の範囲はいずれも**適合**しており、二重強制 (eslint + depcruise) の境界定義も一致している。唯一の穴は AD-023 §7 の 5 行目 `services ✗→ I/O モジュール直接` が **ルールとして存在せず、対象は 2 件存在し、違反形が 1 件入っている** こと (C-001)。
2. **v1.2.2 の改定そのものの妥当性** — 「送信経路を `isDisabled: true` で閉じた」は v1.2.1 の「composer が無い」より**事実として正しく、Automated (A) を R-1 に載せない延期根拠としては成立する**。成立しないのは 2 点 — (a) それは Principle VIII の Statement 3 義務のうち (1) にしか答えておらず、(2)(3) は R-1 で生きているのに Automated (B) が延期されている、(b) その状態が Adoption metadata では `existing_violations: 0` = 合格と区別できない形で表されている。**このプロジェクトは同じ問題への解 (`ok` / `violation` / `pending` の 3 状態) を Principle VI で既に採用しているのに、Principle VIII には適用していない** (H-001)。加えて、そもそもこの免除論が必要になった原因は計画外の chat 画面であり (H-002)、**NON-NEGOTIABLE の Verification を 2 度書き換えるより chat 画面を R-3 に送るほうが小さい修正だった** — その選択肢の検討記録がどの SSoT にも無い。
3. **cross-domain invariant (HostPath / RuntimePath の branded type 分離)** — **境界を越えて保たれている。** 型の生成が名前空間識別子を必須引数に取り、`unc:` は `infra/fs` の内側に閉じ、IPC 境界で種別まで完全一致検証され、3 経路が回帰テストで固定されている。指摘なし。`_overview.md` の invariant 表で追随漏れがあるのは Principle II 行のみ (M-001)。

**最小修正セット (推奨順)**: ① C-001 = depcruise 1 ルール + `randomUUID` の注入 + fixture 1 件 ② H-003 = `SCAN_FILES` に CI 定義 1 行 (できれば包含→除外リストへ反転) ③ H-004 = AD-024 `:251` の 1 行訂正 + 項目数統一 ④ H-001 = Principle VIII metadata を `pending` に (PATCH v1.2.3。M-005 の文言修正も同梱) ⑤ H-002 = 人間判断 (chat 画面を R-3 へ送る / charter + spec + tasks に事後記録) ⑥ M-001〜M-006 / L-001〜L-003 = 各 1〜3 行の文書修正。**①②③④⑥ はいずれも実装の作り変えを伴わない。**
