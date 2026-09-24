# convention-reviewer Review: セッション列挙 (R-2)

**Run**: 2026-09-23
**Reviewer**: convention-reviewer
**Spec**: specs/002-session-cross-folder-session-enumeration/spec.md
**Gate**: code-gate iteration 1 (convention track)

## 初回読了 viewpoint

**読了**: spec.md (FR-001〜FR-052 / SC-001〜SC-016 / Clarifications 相当の Assumptions / Out of Scope 全文) /
plan.md (Domain Context / Related ADRs / Project Structure / 申し送り 6 件 / 上流 SSoT 追随表) /
tasks.md (Phase 1〜7 全 task) / contracts/session-enumeration.md (C-1〜C-8 + インタフェース) /
contracts/ipc-session-list.md (DTO / 検証表 節 A-C) / data-model.md §1 §2 §3 §4 §6 §7 §8 §10 /
`.specify/memory/constitution.md` (Principle I / II / VII / XIV / XV) /
`docs/domains/session/charter.md` / `docs/domains/runtime/charter.md` / `docs/glossary.md` /
`docs/decisions/0028` `0029` `0030` の Title + Decision Outcome + Confirmation /
`eslint.config.mjs` / `.dependency-cruiser.js` / `scripts/constitution/allowlists.mjs` /
`scripts/constitution/check.mjs` (項目 12〜15) / `tests/rule-fixtures/expected.mjs` /
`.code-gate-scope.txt` の 84 行に対応する実装ファイル

**本 PR で実装/影響される FR / SC (本 reviewer の観点で触るもの)**:

- FR-006 / SC-003 — `wsl.exe` 0 件。検証項目 15 が機械強制 (→ H-001)
- FR-042 / FR-050 — UNC と環境変数の封じ込め。検証項目 12 / 13 + `UNC_LITERAL_MODULES` (→ M-001 / M-002)
- FR-043 / SC-010 — 単一 capability への追加と検証の集約 (`validate.ts` / `session-ipc.ts`) (→ M-008)
- FR-045 — `src/agents/` の非依存。`agents-not-to-electron` / `agents-not-to-native` が実コードで初発火
- FR-046 / FR-047 — 参照キーの訳出を `ui` が持つ (`labels.ts`) (→ M-004)
- FR-048 / Principle XIV — 本 feature の用語を glossary に反映 (→ H-002 / M-006)
- FR-049 / SC-015 — 会話由来文字列の正規化 (`normalize.ts`) (→ M-009)
- FR-051 / FR-052 — `folder` グループの seed と由来候補の常時表示
- SC-011 — DTO フィールド集合の許可リスト一致 (`dto-schema.test.ts`) (→ M-003)
- SC-016 — `env` 組み立ての純粋関数分離 (`buildWorkerEnv`) (→ M-002)

**touched files に該当する charter / Confirmation**:

- `docs/domains/session/charter.md` — In scope「登録の有無によらず config ディレクトリ配下の全件」/ Journey 1 / KPI 留保 / `related_specs`。**追記済みを確認**
- `docs/domains/runtime/charter.md` — `related_specs` に本 spec。**追記済みを確認** (BE-010b がパス API を拡張するため)
- AD-028 Confirmation — 検証項目 12 / 13 の存在と発火 (`unc-literal-outside-allowlist` / `agents-unc-api-call` fixture)。**充足**
- AD-030 Confirmation — 常駐 1 プロセス / 要求ごとの config ディレクトリ受け渡し。**実装と一致** (ただし名前が追随していない → M-002)
- AD-027 Consequences — `services-not-to-io` の `from` に `session-service.ts` 実名追加。**充足** (`service-io-import` fixture で発火継続を確認)
- Constitution Principle XIV — Ubiquitous Language。**glossary 側に定義の反転あり** (→ H-002)

**viewpoint severity 集計**:

- A. 認可 / 認証 / RLS: 該当なし: Owner は `security-reviewer`。本 reviewer は capability の**命名と配置**のみを見た
- B. 入力検証 / injection / 暗号: 該当なし: Owner は `security-reviewer`。制御文字定義の**重複**のみ F として扱った (M-009)
- C. 業務不変条件 / Charter drift: 該当なし: Owner は `architecture-reviewer`。charter 追記は存在確認のみ行った
- D. Constitution / ADR drift: 該当なし: Owner は `architecture-reviewer`。ADR を参照する**許可リスト名の食い違い**は F として扱った (M-001)
- E. User Story 価値 / SC / AC / UX: 該当なし: Owner は `po-reviewer`
- F. 命名 / module 配置 / lint hookup / import order / dead code: Critical:0 High:2 Medium:8 Low:7 (M-008 は H 区分で計上)
- G. DB / API / a11y / perf / OpenAPI / UX state: 該当なし: 本 PR に DB / HTTP API / OpenAPI が無く、optional reviewer の owner 範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0 (M-008。計測経路の**規約**としての側面のみ。テスト内容は `test-agent` の範囲)

## スコープ要約

R-2 は `session` domain の最初の feature であり、`src/domain/session/` (11 モジュール) /
`src/main/infra/session/` (2 モジュール) / `src/agents/` (3 モジュール。`.gitkeep` から初の実体) /
`src/main/app/session-*.ts` + `enumerator-spawner.ts` + `dto-mapper.ts` /
`src/renderer/src/features/session-list/` (6 モジュール) / `stores/sessions.ts` /
`runtime/thread-list-adapter.ts` を新設し、`eslint.config.mjs` に `no-restricted-syntax` 1 件、
`allowlists.mjs` に許可リスト 5 本 (`PROCESS_SPAWN_MODULES` 追記 / `UNC_LITERAL_MODULES` /
`UNC_FORBIDDEN_IN` / `AGENT_SDK_*` / `WSL_FREE_DIRECTORIES`)、`check.mjs` に検証項目 12〜15、
`.dependency-cruiser.js` の `services-not-to-io` に実名 1 件、`tests/rule-fixtures/` に違反サンプル 5 件を足している。

**機械検査はすべて緑である** (下記 `<details>`)。したがって本 reviewer の指摘は
「検査が通らない」ではなく **(a) 規則が書かれているのに対象を取りこぼしている箇所**、
**(b) ADR の訂正を名前と文書が追いきれていない箇所**、
**(c) SSoT (glossary) の定義そのものが反転している箇所**、
**(d) 同一概念が 2 箇所に分かれている箇所** に集中している。

## Findings

### [High] 検証項目 15 (`WSL_FREE_DIRECTORIES`) が R-2 の `app` レイヤを対象にしていない (H-001) (scope: feature)

- **観察**: `scripts/constitution/allowlists.mjs:312-316` の `WSL_FREE_DIRECTORIES` は
  `src/agents/` / `src/main/infra/session/` / `src/domain/session/` の **3 ディレクトリだけ**である。
  `scripts/constitution/check.mjs` の項目 15 は `src/main/app/session-service.ts` /
  `session-enumerator.ts` / `session-ipc.ts` / `dto-mapper.ts` を**一度も見ていない**。
  同項目のコメント自身が発火条件を
  「**プロセス起動 API を持たないファイルに `wsl.exe` の文字列があっても項目 3 には掛からない**」
  と説明しているのに、その隙間に落ちる `session-service.ts` が対象外である。
  `src/main/app/session-service.ts:104` は
  「実行中確認。**R-1 の経路をそのまま使う** (C-7。`wsl.exe` を新たに呼ばない)」と宣言しており、
  **C-7 の「R-2 は新たに呼ばない」を実際に守る責任があるモジュールがそこ**である。
- **同種事象探索**: `grep -rn "wsl-cli|WslCli|wsl\.exe" src/` で **33 件**。
  うち production の実参照は `src/main/app/composition-root.ts:11,67` の 2 件のみで、
  これは R-1 の結線 (正当) である。**現時点の違反は 0 件**であり、本指摘は
  「違反が 0 件」ではなく「**検査対象が 0 件**」の形である。
  項目 15 の対象外かつ spawn-context でもない R-2 モジュールは `src/main/app/` 配下の 4 件
  (`session-service.ts` / `session-ipc.ts` / `dto-mapper.ts` / `session-enumerator.ts`。
  `enumerator-spawner.ts` は `PROCESS_SPAWN_MODULES` にあるため項目 3 が掛かる)。
- **リスク/影響**: SC-003 は「計測経路: プロセス起動レイヤを差し替えた Vitest +
  **検証スクリプトでの呼び出し形の走査**」と定めている。走査側が調停層を見ていないため、
  X-1 / O-1 が `session-service.ts` に `createWslCli()` や `wsl.exe` を持ち込んでも
  **ESLint (app→infra は許可) / dependency-cruiser (app→infra は許可) /
  項目 3 (spawn API なし) / 項目 15 (対象外)** のすべてを素通りする。
  plan.md が SH-091 について書いた「**違反が 0 件なのではなく検査が 0 件になる形であり、
  緑の CI と区別がつかない**」と同型の穴が、同じ feature の別の許可リストに残っている。
- **推奨アクション**: `WSL_FREE_DIRECTORIES` を `services-not-to-io` と同じ**実名列挙方式**に寄せて
  R-2 の `app` モジュールを追加する。`composition-root.ts` は R-1 の結線で `wsl-cli` を
  正当に import するため**含めない**ことを、`services-not-to-io` と同じ形でコメントに明記する。

  ```js
  export const WSL_FREE_DIRECTORIES = [
    'src/agents/',
    'src/main/infra/session/',
    'src/domain/session/',
    // R-2 の調停層。**項目 3 は spawn API を持つファイルしか見ないため、
    // ここは項目 3 と項目 15 の両方の隙間に落ちていた** (code-gate H-001)。
    // `composition-root.ts` は含めない — R-1 の結線として `wsl-cli` を正当に解決する側である。
    'src/main/app/session-service.ts',
    'src/main/app/session-enumerator.ts',
    'src/main/app/session-ipc.ts',
    'src/main/app/dto-mapper.ts'
  ]
  ```

  項目 15 の `exeRe` は**文字列リテラルだけ**を見るため、`session-service.ts:87,148,332,430` の
  コメント内の `wsl.exe` は誤検出にならない (実装を確認済み)。`cliRe` は code 全体に掛かるので
  追加後に `check:constitution` を通し、**違反 0 件のままであること**を確認すること。
  加えて `tests/rule-fixtures/` に `wsl-cli-in-session-layer` と同型の
  `wsl-cli-in-session-service` サンプルを 1 件足し、`expected.mjs` の `#15` に登録して
  **発火で確認する** (AD-027 §1)。
- **根拠**: SC-003 / contracts/session-enumeration.md C-7 / AD-027 (ルールは発火で確認する) /
  Constitution Principle VI の検証経路 (AD-024)
- **scope 根拠**: `scripts/constitution/allowlists.mjs` は本 PR の touched files (`.code-gate-scope.txt:12`) であり、本 PR で直接修正できる

---

### [High] glossary の `CwdOrigin` が「由来 config の所在」との区別を**反転**して定義している (H-002) (scope: feature)

- **観察**: `docs/glossary.md:99-102` の `CwdOrigin（作業ディレクトリの出自）` の Counterexamples:

  > **由来 config ディレクトリの所在と混同しない。** 前者は
  > 「履歴がどこに保存されているか」（アプリが選ぶ）、後者は「セッションがどこで動いたか」
  > （記録された値から判定する）であり、**一致しない**。

  文中で先に現れるのは見出しの `CwdOrigin` であるから 前者 = `CwdOrigin` となり、
  **`CwdOrigin` =「履歴がどこに保存されているか（アプリが選ぶ）」**と読める。これは逆である。
  `specs/002-.../data-model.md:393-394` は正しく書いている —
  `EnumerationTarget.location` = **履歴がどこに保存されているか** (アプリが選ぶ。FR-009)、
  `CwdOrigin` の所在 = **セッションがどこで動いたか** (記録された値から判定する。FR-016)。
  実装も data-model 側に従っている (`src/domain/session/origin.ts` / `cwd-origin.ts` は
  記録された `cwd` の**値の形**から判定し、`target.ts` の `location` は探索側が決める)。
- **同種事象探索**: `grep -rn "履歴がどこに保存|どこで動いたか" docs/ specs/ src/` で **3 件** —
  `docs/glossary.md:100` (**反転**) / `specs/002-.../data-model.md:393` (正) / `:394` (正)。
  反転は **glossary の 1 件のみ**。同じ区別を扱う `src/domain/session/keys.ts:1-17` /
  `origin.ts:6-17` / `docs/decisions/0029-*.md` の本文はいずれも正しい。
- **リスク/影響**: glossary は Ubiquitous Language の **SSoT** (Constitution Principle XIV) であり、
  plan.md §Glossary は「**「由来 config ディレクトリの所在」と「セッションの所在」を同じ語で呼ばない** —
  本 feature で**最も誤りやすい区別**であり、Principle XIV の対象とする」と明示している。
  **その最も誤りやすい区別の正本が逆に書かれている。**
  FR-048 は「本 feature で導入・変更する用語を glossary に反映しなければならない」を要求しており、
  反映はされたが内容が反転しているため要求は満たされていない。
  後続 (R-3 / X-3 / I-1) が glossary を根拠に `CwdOrigin` を「アプリが選ぶ値」として扱うと、
  AD-029 が実測で反証した仮定 (「由来 config の所在の名前空間で書かれている」) に逆戻りする。
- **推奨アクション**: `docs/glossary.md:99-102` を data-model §8 の表と同じ向きに書き直す。
  前者 / 後者 の指示代名詞をやめて**両方を実名で書く**こと (この誤りは指示代名詞が原因である)。

  ```markdown
  - **Counterexamples**: **`EnumerationTarget.location`（由来 config ディレクトリの所在）と混同しない。**
    `EnumerationTarget.location` は「履歴がどこに保存されているか」（アプリが選ぶ。FR-009）、
    `CwdOrigin` の所在は「セッションがどこで動いたか」（記録された値の形から判定する。FR-016）であり、
    **一致しない**。実測でホスト側の 1 つの config ディレクトリに 3 形式
    （Windows / POSIX / UNC）が混在した
  ```

  併せて `EnumerationTarget` の項にも同じ 1 行の相互参照を置き、
  **片方だけを読んだ人が逆に理解できない形**にすること。
- **根拠**: Constitution Principle XIV (Ubiquitous Language) / FR-048 / AD-029 /
  data-model.md §8 / plan.md §Glossary
- **scope 根拠**: `docs/glossary.md` は本 PR の touched files (`.code-gate-scope.txt:9`)

---

### [Medium] 存在しない許可リスト名 (`UNC_MATERIALIZE_MODULES` / `UNC_BRANDING_MODULES` /「materialize の実名リスト」) が contract / plan / tasks / production コメントに残っている (M-001) (scope: feature)

- **観察**: 実装の許可リストは `scripts/constitution/allowlists.mjs:243` の `UNC_LITERAL_MODULES` と
  `:269` の `UNC_FORBIDDEN_IN` の **2 本**であり、AD-028 §3 が
  「**「materialize してよいモジュール」の許可リストは作らない**」
  (`docs/decisions/0028-*.md:116`) と決めた結果である。ところが以下が旧設計のまま残っている。

  | 場所 | 記述 |
  | --- | --- |
  | `contracts/session-enumeration.md:131-135` | 「**UNC 値を文字列として materialize してよいモジュールを実名で列挙する** — 現在は `wsl-fs.ts` と、本 feature が追加する `config-dir.ts` の 2 件」 |
  | `plan.md:113-115` | 「文字列として materialize してよい `infra` のモジュールを実名リストで固定する (`wsl-fs.ts` / `config-dir.ts`)。**リストも 2 本に分ける**」 |
  | `plan.md:210` | 「`config-dir.ts` — UNC 値の materialize (**実名リストの 2 件目**)」 |
  | `plan.md:431-433` | 人間承認項目 5「**SH-084 が固定する UNC の 2 本のリスト (`UNC_BRANDING_MODULES` / `UNC_MATERIALIZE_MODULES`) の確定版**」 |
  | `tasks.md:352` / `:408` / `:410` | SH-093 (**`[x]` 完了済み**) の受け入れ条件が `UNC_BRANDING_MODULES` / `UNC_MATERIALIZE_MODULES` を名指し |
  | `src/domain/session/target.ts:11-12` | **production コメント**「UNC 形式は `infra` の**実名リストに載ったモジュール**だけが文字列として materialize してよい (AD-025 / research R-05 の規則 1)」 |

  `tasks.md:122-127` の BE-020 だけが「**訂正**」として AD-028 §3 を反映しているが、
  同じ tasks.md の SH-093 本文は訂正されていない。
- **同種事象探索**: `grep -rn "materialize"` (node_modules 除く) で **12 件**。
  うち旧設計を現在形で述べているのは **7 件** — `src/domain/session/target.ts:12` /
  `contracts/session-enumeration.md:131` / `plan.md:113` `:210` `:431` / `tasks.md:352` `:408`(+`:410`)。
  `grep -rn "UNC_BRANDING_MODULES|UNC_MATERIALIZE_MODULES"` で **5 件** (すべて specs/ 配下、実装 0 件)。
- **リスク/影響**: (a) SH-093 が `[x]` でありながら受け入れ条件に書かれた成果物が存在しないため、
  **task の完了記録と実装が照合できない**。(b) contract C-2 規則 1 は
  「`services-not-to-io` と同じ**実名リスト方式**を採る」と機械強制を約束しているので、
  後続 feature が `config-dir.ts` 相当のモジュールを足すとき、**実在しないリストに自分を追記しようとする**か、
  「リストが無い = 強制が無い」と読んで独自の 3 本目を作る。どちらも AD-028 §3 が回避した
  「正しい API を使うのに ADR が要る」形に逆戻りする。
  (c) production コメント (`target.ts:12`) が読者を直接そこへ誘導する。
- **推奨アクション**: 7 箇所すべてを AD-028 §3 の決定 (リストは `UNC_LITERAL_MODULES` と
  `UNC_FORBIDDEN_IN` の 2 本。`toUnc()` の**呼び出し**は縛らない) に合わせる。
  1. `src/domain/session/target.ts:11-12` → 「UNC の接頭辞**リテラル**を持てるのは
     `UNC_LITERAL_MODULES` のモジュールに限る (AD-028 §3)。`toUnc()` の呼び出しは縛らない」
  2. `contracts/session-enumeration.md:131-136` の規則 1 を差し替え、
     `UNC_LITERAL_MODULES` / `UNC_FORBIDDEN_IN` の実名と項目 12 / 13 を参照させる
  3. `plan.md:113` `:210` `:431` と `tasks.md:352` `:404-410` に BE-020 と同じ
     「**訂正**: AD-028 §3 がこのリストを作らないと決めた」の 1 行を入れる
     (**削除しない** — 承認項目 5 は人間承認を経た記録であり、訂正の履歴を残す)
- **根拠**: AD-028 §3 (accepted) / AD-027 §1 (ルールは発火で確認する) / SH-093 の受け入れ条件
- **scope 根拠**: `src/domain/session/target.ts` / `contracts/` / `plan.md` / `tasks.md` はいずれも本 PR の成果物

---

### [Medium] `configDirEnvValue` / `envValue` の名前が AD-030 §2 後の実体と食い違う (M-002) (scope: feature)

- **観察**: `src/main/infra/session/config-dir.ts:78` の
  `export function configDirEnvValue(configDir: HostPath | RuntimePath): PathResult<string>` は、
  `src/main/app/session-enumerator.ts:227` で
  `const envValue = configDirEnvValue(request.target.configDir)` として呼ばれ、
  戻り値は `buildRequestLine(...)` の `configDir` フィールド、すなわち
  **要求行の JSON フィールド** (`src/agents/protocol.ts:56`) に載る。**環境変数ではない。**
  同じファイル (`config-dir.ts:36-43`) が自ら
  「**`CLAUDE_CONFIG_DIR` の綴りはここに無い。** AD-030 §2 で config ディレクトリを
  要求ごとに渡す形に変えたため、**起動時の環境変数から外れた**」と宣言しており、
  `session-enumerator.ts:126-128` も「**config ディレクトリは要求に載る** (AD-030 §2)。
  起動時の環境変数から外れたので〜」と書いている。**コメントだけが追随し、名前が残っている。**
  隣に本物の env 組み立て関数 `buildWorkerEnv` (`config-dir.ts:102`) があるため、
  2 つが同じ「env」語彙を共有しつつ一方だけが env に関係しない状態になっている。
- **同種事象探索**: `grep -rn "configDirEnvValue|envValue"` で **9 件** —
  定義 1 (`config-dir.ts:78`) / 呼び出し 3 (`session-enumerator.ts:16,227,228`) /
  テスト 6 (`config-dir.test.ts:15,56,58,64,70,71`)。
  `CLAUDE_CONFIG_DIR` の文字列リテラルは `src/agents/enumerate-sessions.ts:49` の **1 箇所のみ**
  (検証項目 14 / AD-030 §2 のとおり)。**実害は生じていない。**
- **リスク/影響**: FR-014 は「同一プロセス内で環境変数を書き換えて対象 config ディレクトリを
  切り替える方式を採ってはならない」を定め、AD-030 §3 が「直列であることでレースを消す」と
  読み替えている。その境界に立つ関数が `EnvValue` と名乗っていると、
  次の読者が「これは起動時の env に入る値だ」と理解して `buildWorkerEnv` 側へ移す
  (= AD-030 §2 を巻き戻し、常駐 1 プロセスが複数 config ディレクトリを扱えなくなる) 誘導が生まれる。
  `ENUMERATION_TIMEOUT_MS` が 2 箇所にあった件と同型の「名前が実体から遅れた」事象である。
- **推奨アクション**: `configDirEnvValue` → `configDirWireValue` (あるいは
  `configDirForRequest` / `configDirLineValue`) に改名し、呼び出し側の `envValue` も併せて改める。
  JSDoc に「**環境変数ではない。要求行に載る値である** (AD-030 §2)」を 1 行入れる。
  テスト 6 箇所も機械的に追随する。`buildWorkerEnv` は env を作るので名前を変えない。
- **根拠**: AD-030 §2 (accepted) / FR-014 / contracts/session-enumeration.md C-2 の表 1 行目 /
  Constitution Principle XIV (名前が概念を表す)
- **scope 根拠**: `src/main/infra/session/config-dir.ts` / `src/main/app/session-enumerator.ts` は本 PR の touched files

---

### [Medium] `EnumerationOutcome` (domain) と `EnumerationOutcomeDTO` (境界) が別の形を指す (M-003) (scope: feature)

- **観察**: `src/domain/session/target.ts:117-122` の `EnumerationOutcome` は
  `{ location, outcomes: readonly TargetOutcome[], fetchedAt }` という**所在ごとの入れ物**である。
  一方 `src/domain/session/dto.ts:107-116` の `EnumerationOutcomeDTO` は
  `{ location, targetKey, targetLabel, status, reasonKey, count, truncated, fetchedAt }` という
  **1 対象 1 行のフラットな値**であり、対応する domain 型は `TargetOutcome` (`target.ts:102-114`) である。
  写像は `src/main/app/dto-mapper.ts` の `toEnumerationOutcomeDTOs` (**複数形**) が 1 → N で行い、
  `session-service.ts:256` が `outcomes.flatMap(toEnumerationOutcomeDTOs)` と畳んでいる。
  spec.md の Key Entities は
  「**EnumerationOutcome (所在ごとの成否)**: 所在・成功か失敗か・理由キー・取得時刻・件数・打ち切りの有無」
  と定義しており、これは**フラットな行** = コードの `TargetOutcome` と一致する。
  つまり spec の語と code の語が入れ替わっている。
  関数名も対称性が崩れている: `targetOutcome()` (`target.ts:125`) は `TargetOutcome` を返すが、
  隣の `unreachableOutcome()` (`:149`) は同じ命名形なのに `EnumerationOutcome` (入れ物) を返す。
- **同種事象探索**: `grep -rn "^export (function|interface|type|class) "` で抽出した src 配下の
  全 export 名の重複は **0 件**。domain ↔ DTO の対応が崩れているのは
  `EnumerationOutcome` の **1 組のみ**で、他は `SessionSummary`↔`SessionSummaryDTO` /
  `SessionGroup`↔`SessionGroupDTO` / `SessionIndex`↔`SessionIndexDTO` と揃っている。
- **リスク/影響**: SC-011 は「`SessionSummaryDTO` と `SessionGroupDTO` の**各 variant**の
  フィールド集合が許可リストと完全一致する」を求め、`dto-schema.test.ts` が
  `EnumerationOutcomeDTO` の許可フィールド (`dto.ts:158`) も固定している。
  domain 側の同名型が別の形であるため、「DTO と domain の形が一致しているか」という
  レビューの目視が**名前では取れない**。
  `fetchMore` の実装 (`session-service.ts:648-653`) が `outcome.outcomes.map(...)` と
  二重ネストを手で辿っているのはこの非対称の帰結であり、
  R-3 が `targetKey` から列挙対象を引く (contracts C-8) ときに同じ二重ループを書き直す。
- **推奨アクション**: domain 側を spec / glossary の語に寄せる。
  `TargetOutcome` → `EnumerationOutcome` (= DTO と 1:1)、
  現 `EnumerationOutcome` → `LocationOutcomes` (または `EnumerationOutcomeGroup`) に改名し、
  `unreachableOutcome()` を `unreachableLocationOutcomes()` に改める。
  改名しない判断を採る場合は、`target.ts` の両 interface の JSDoc に
  「**`EnumerationOutcomeDTO` に対応するのは `TargetOutcome` である**」の 1 行と、
  spec.md Key Entities 側に対応表を残すこと (どちらかは必須。
  **名前と spec の語が食い違っている事実をどこにも書かない状態にしない**)。
- **根拠**: Constitution Principle XIV / spec.md Key Entities / SC-011 / contracts/ipc-session-list.md の DTO 節
- **scope 根拠**: `src/domain/session/target.ts` / `dto.ts` / `src/main/app/dto-mapper.ts` は本 PR の touched files

---

### [Medium] `BOUNDARY_LABELS` が 2 つの `labels.ts` に同名で存在し、同じ値に別の訳語を当てている (M-004) (scope: feature)

- **観察**: 同名・同型の訳出表が 2 つある。

  | 定義 | `native` | `cross` | `unknown` | 消費者 |
  | --- | --- | --- | --- | --- |
  | `src/renderer/src/features/workspace-folders/labels.ts:56` | 同じファイルシステム | **ファイルシステムをまたぐ** | 未判定 | `ResolutionScreen.tsx:57` |
  | `src/renderer/src/features/session-list/labels.ts:81` | 同じ所在 | **越境** | 未判定 | `SessionListScreen.tsx:105` |

  `docs/glossary.md` の `Cross-boundary` の**日本語表記は「越境」**であり、
  「Detected synonyms」表も `Location` を「所在」に統一すると定めている。
  同一アプリの 2 画面が同じ `Boundary` 値に別の日本語を出している。
  加えて `PendingReason = BlockedReason` (`src/domain/session/keys.ts:35` — **同一の型エイリアス**) に対し、
  訳出表が `workspace-folders/labels.ts:36` の `BLOCKED_LABELS` と
  `session-list/labels.ts:51` の `PENDING_REASON_LABELS` の 2 つあり、`distro-not-running` が
  「ディストロが停止しています。起動して再検出すると〜」と「所在のディストロが停止中です」に分かれている。
- **同種事象探索**: `grep -rhno "^export const [A-Z_]*"` で得た `src/` の全 export const 名のうち
  **重複しているのは `BOUNDARY_LABELS` の 1 件のみ** (2 定義)。
  `grep -rn "Record<PendingReason|Record<BlockedReason" src/` で **2 件** (上記)。
  `grep -rn "distro-not-running" src/renderer/` で **12 件**、うち訳出表の行は **5 件**
  (`session-list/labels.ts:20,30,52` / `workspace-folders/labels.ts:37,71`)。
- **リスク/影響**: FR-046 は「UI のラベル・メッセージは日本語を第一言語とし、内部識別子を
  そのまま提示してはならない」、Principle XIV は用語の一貫使用を求めている。
  同じ状態が画面によって別の語で呼ばれると、利用者は 2 つの異なる状態だと受け取る。
  機械側の担保も無い: 両表は `Record<Boundary, string>` として**型は通る**ため、
  片方だけを直しても lint も typecheck も気付かない。
  `import { BOUNDARY_LABELS } from '../workspace-folders/labels'` と書いても
  ESLint の `boundaries` は `ui → ui` を許すので、**取り違えた import も通る**。
- **推奨アクション**: R-1 / R-2 で共有される参照キー (`Boundary` / `BlockedReason`) の訳出を
  1 箇所に集める。`src/renderer/src/features/` はどちらも feature なので、
  共有分は `src/renderer/src/labels/` (または既存の feature に片寄せ) へ出し、
  **同名 export を 2 つ持たない**形にする。文言は glossary の日本語表記
  (`Cross-boundary` = 越境 / `Location` = 所在) を正とする。
  分けたままにする判断なら、**名前を衝突させない**
  (`FOLDER_BOUNDARY_LABELS` / `SESSION_BOUNDARY_LABELS`) うえで、
  両方の JSDoc に「同じ `Boundary` 値に別の文言を当てている。理由は〜」を書くこと。
- **根拠**: FR-046 / Constitution Principle XIV / `docs/glossary.md` (`Cross-boundary` / Detected synonyms)
- **scope 根拠**: `src/renderer/src/features/session-list/labels.ts` は本 PR の touched files (`.code-gate-scope.txt:65`)。
  `workspace-folders/labels.ts` は R-1 由来だが、同 feature の `WorkspaceFoldersScreen.tsx` が scope に入っており修正可能

---

### [Medium] `src/renderer/src/runtime/` が feature に依存する共有ディレクトリであり、かつ `runtime` domain 語と衝突する (M-005) (scope: feature)

- **観察**: `src/renderer/src/runtime/thread-list-adapter.ts:5` が
  `import type { SessionRow } from '@/features/session-list/rows'` を行っている。
  ディレクトリ階層としては**共有層 (`src/renderer/src/runtime/`) が特定 feature
  (`features/session-list/`) に依存する**逆向きの依存である。
  当該ファイルの唯一の export は `useSessionThreadListAdapter` (hook) であり、
  名前も `Session` に限定されている — つまり実体は session-list feature の一部である。
  加えてディレクトリ名 `runtime` は本プロジェクトで最も負荷の高い domain 語である:
  `src/domain/runtime/` / `docs/domains/runtime/charter.md` /
  `src/renderer/src/features/runtime-list/` / `RuntimeDescriptor` / `AgentRuntime` が同じ語を使い、
  `docs/glossary.md` の Detected synonyms は
  「`AgentRuntime` —「ランタイム」「Runtime」「実行環境」→ canonical: `AgentRuntime` / ランタイム」と
  統一を指示している。ここでの `runtime` は assistant-ui の runtime (会話ランタイム) であり**別概念**である。
- **同種事象探索**: `src/renderer/src/runtime/` 配下は **1 ファイル**のみ。
  `src/renderer/` 内で hook を持つモジュールは **5 件** —
  `features/runtime-list/useRuntimes.ts` / `features/workspace-folders/useFolders.ts` /
  `features/session-list/useSessions.ts` / `features/session-list/useFolderLabels.ts` /
  `runtime/thread-list-adapter.ts`。**前 4 件は `features/<x>/use*.ts` で揃っており、
  本件だけが (a) feature 外 (b) `use*` でないファイル名**である。
  `hooks/` ディレクトリは `GENERATED_FILES` (`eslint.config.mjs:75`) に含まれる CLI 生成物置き場なので受け皿にならない。
- **リスク/影響**: (a)「共有層 → feature」の依存が 1 件でも通ると、
  `ui` 内部の層構造が機械検査 (`boundaries/elements` は `src/renderer` 全体を 1 要素 `ui` として扱う)
  では止まらないまま既成事実になる。R-3 が transcript 用の runtime adapter を足すとき、
  同じディレクトリに `features/chat/` 依存が増え、`runtime/` が feature 間の結節点になる。
  (b) 語の衝突により `import ... from '@/runtime/...'` と
  `import ... from '@domain/runtime/...'` が視覚的に区別できない。
  現に `SessionListScreen.tsx` は両方を import している。
- **推奨アクション**: 当該ファイルを `src/renderer/src/features/session-list/useThreadListAdapter.ts` へ移し、
  既存 4 件と同じ `features/<x>/use*.ts` 規約に揃える (plan.md:237 の配置指定も併せて訂正する)。
  将来 feature 横断の aui runtime が要るなら、ディレクトリ名は `aui-runtime/` のように
  **domain 語と衝突しない綴り**にし、そのとき「共有層は feature を import しない」を
  `boundaries/elements` に `ui-shared` / `ui-feature` として分けて機械強制すること。
- **根拠**: Constitution Principle XIV / `docs/glossary.md` Detected synonyms (`AgentRuntime`) /
  AD-023 §7 (レイヤの依存方向) / 既存 4 件の hook 配置規約
- **scope 根拠**: `src/renderer/src/runtime/thread-list-adapter.ts` は本 PR の新設ファイル (`.code-gate-scope.txt:72`)

---

### [Medium] 「列挙プロセス」の呼称が 4 つに分かれ、`Worker` が glossary に無く、glossary の `supervisor` が `src/agents/` を誤って説明している (M-006) (scope: feature)

- **観察**: 同一の概念 (`src/agents/` で走る `utilityProcess`) が 4 つの語で呼ばれている。

  | 語 | 出現 |
  | --- | --- |
  | 列挙プロセス | contracts C-1 / C-2 / C-5、`enumerate-sessions.ts:16`、`config-dir.ts:46`、data-model |
  | `EnumerationWorker` / `Worker` | `session-enumerator.ts:76,87,165,206`、`enumerator-spawner.ts:6,48`、`config-dir.ts:102` (`buildWorkerEnv`) |
  | `enumerator-spawner` / `Launcher` / `launch` | `enumerator-spawner.ts` (ファイル名)、`session-enumerator.ts:87-88` |
  | `supervisor` | `docs/glossary.md` の canonical 用語 |

  `docs/glossary.md` の `supervisor` は
  「セッションのプロセスとストリームを持つ `utilityProcess`。**実体のディレクトリは `src/agents/`** である」
  と定義している。R-2 が `src/agents/` に置いたのは**セッションのプロセスとストリームを持たない**
  読み取り専用の列挙プロセスであり、この定義に当てはまらない。
  「Detected synonyms」表は既に
  「`supervisor`（役割）/ `src/agents/`（実体のディレクトリ）— 役割名とディレクトリ名が一致しない」
  と警告しているが、R-2 で `src/agents/` の住人が 2 種類 (supervisor 予定 + 列挙プロセス) になった事実は反映されていない。
  `Worker` は glossary に登録されておらず、「Generic words excluded」にも載っていない。
- **同種事象探索**: `grep -rn "EnumerationWorker|Worker" src/` で **30 件** (production 8 / test 22)。
  `grep -n "supervisor" docs/glossary.md` で **1 件** (定義) + Detected synonyms 表 1 行。
  glossary に `EnumerationWorker` / 列挙プロセス の項は **0 件**
  (`EnumerationTarget` / `CwdOrigin` / `SessionSummary` / `Pending match` /
  `Unregistered folder` / `Unknown location` の 6 語は追加済み)。
- **リスク/影響**: FR-048 は「本 feature で導入・変更する用語を glossary に反映しなければならない」
  (Principle XIV) を要求している。列挙プロセスは本 feature の**技術的な核 4 点の 1 つ** (plan.md Summary) であり、
  `src/agents/` の性格を AD-030 で「3 つ目の寿命」に広げた当事者である。
  それが glossary に無く、glossary 側は `src/agents/` を supervisor 専用と説明したままなので、
  X-1 (supervisor 本体) の設計時に「`src/agents/` に既にいるものは何か」が SSoT から読めない。
  `Worker` が未登録のまま 30 箇所に広がると、X-1 が `SupervisorWorker` /
  O-1 が `MonitorWorker` と増やす誘導になる。
- **推奨アクション**:
  1. `docs/glossary.md` に `Enumeration worker（列挙プロセス）` を 1 項追加し、Definition に
     「`src/agents/` に置かれる常駐 `utilityProcess`。Agent SDK の `listSessions()` のみを呼ぶ。
     **supervisor ではない** — セッションのプロセスとストリームを持たない」、Ref に AD-030 / AD-023 §2 を置く
  2. `supervisor` の項の「実体のディレクトリは `src/agents/`」を
     「`src/agents/` に置かれる**役割の 1 つ**である。同ディレクトリには R-2 の列挙プロセスも置かれる (AD-030)」に改める
  3. Detected synonyms 表に「列挙プロセス / `EnumerationWorker` / `enumerator-spawner` →
     canonical: `Enumeration worker`（コード）/ 列挙プロセス（日本語文）」を 1 行足す
     (実装名を変えずに canonical を宣言する形でよい。**30 箇所の改名は求めない**)
- **根拠**: FR-048 / Constitution Principle XIV / `docs/glossary.md` (`supervisor` / Detected synonyms) / AD-030 §4 / AD-023 §2
- **scope 根拠**: `docs/glossary.md` は本 PR の touched files (`.code-gate-scope.txt:9`)

---

### [Medium] `session-service.ts` が 725 行で 10 責務を持ち、`services-not-to-io` は import しか見ない (M-007) (scope: feature)

- **観察**: `src/main/app/session-service.ts` は **725 行**で、`src/` の production モジュール中で最大である
  (次点は `WorkspaceFoldersScreen.tsx` 614、`SessionListScreen.tsx` 592、`folder-service.ts` 454)。
  1 ファイルに以下が同居している:
  (1) 実行中確認の TTL キャッシュ (`verified()` / `verifiedCache` / `verifiedAt`)、
  (2) 列挙対象の保持 (`targets` / `sessionsByTarget`)、
  (3) 対応づけのメモ化 (`resolutionCache` / `resolve()`)、
  (4) グループ分けの再適用 (`regroup()`)、
  (5) 2 相 (探索 / 列挙) のオーケストレーション (`fetchAll()` — 単体で 127 行)、
  (6) 段階描画と計測点 (`step()` / `measuredLocation()` / `measure` 7 種)、
  (7) 候補ごとの行の畳み込み (`collectLocation()`)、
  (8) スナップショットと publish、
  (9) `fetchMore` のマージと `stopped-midway` への差し替え (`rowAfterFetchMore()`)、
  (10) 先頭ページの束ね (`firstPage` / `completing`)。
  `.dependency-cruiser.js` の `services-not-to-io` は本ファイルを実名で対象に加えているが
  (AD-027 Consequences の履行。`from` 節 `:252-255`)、`to` は `dependencyTypes: ['core']` のみ =
  **I/O モジュールの直接 import** だけを見る。同ルールのコメントは自らを
  「**`God Service` への唯一の歯止め**」と称しているが、歯止めが見ているのは
  I/O の入手経路であって責務の集積ではない。
- **同種事象探索**: `find src -name '*.ts*' | xargs wc -l` で 500 行超の production モジュールは
  **3 件** (`session-service.ts` 725 / `WorkspaceFoldersScreen.tsx` 614 / `SessionListScreen.tsx` 592)。
  うち R-2 の新設は 2 件。`services-not-to-io` の `from` に載るのは 3 モジュール
  (`session-service.ts` / `folder-service.ts` / `runtime-store.ts`)。
  **500 行超に対する機械的な閾値検査は 0 件** (`eslint.config.mjs` に `max-lines` / `max-lines-per-function` なし)。
- **リスク/影響**: AD-027 が `services-not-to-io` を「God Service への唯一の歯止め」と位置づけた以上、
  歯止めの空白 (サイズ / 責務数) は次の Service にそのまま継承される。
  X-3 (`ProviderService`) / I-2 (`ContainerService`) は同じテンプレートを写すため、
  ここで境界を引かないと「実名は列挙されているが中身は肥大」が既定になる。
  実務上の影響はすでに出ている: `session-service.test.ts` が **904 行**で `src/` 最大のテストになっており、
  1 つの factory を差し替えるために 7 つの依存を毎回組み立てている。
- **推奨アクション**: 責務を 2〜3 モジュールに割る。境界の候補は本ファイルのコメントが既に示している —
  (a) 実行中確認の TTL キャッシュ (`verified()` / `BROWSE_SESSION_TTL_MS` / `warmUp()`) を
  `src/main/app/verified-cache.ts` へ、(b) 2 相のオーケストレーションと段階描画
  (`fetchAll` / `step` / `measuredLocation` / `collectLocation`) を
  `src/main/app/session-fetch.ts` へ出し、`session-service.ts` はキャッシュと
  `SessionService` インタフェースの実装に絞る。
  分けた 2 件を `services-not-to-io` の `from` に**実名で追記する**
  (AD-025 §9 の実名列挙方式。追記を忘れると歯止めが分割で外れる)。
  分割しない判断を採るなら、`eslint.config.mjs` に `max-lines` / `max-lines-per-function` を
  警告閾値付きで導入して**合意した上限を機械化する** (現在は上限も検査も無い)。
- **根拠**: AD-027 Consequences / AD-023 §5 (調停クラスの責務) / `.dependency-cruiser.js` の `services-not-to-io` コメント
- **scope 根拠**: `src/main/app/session-service.ts` は本 PR の新設ファイル (`.code-gate-scope.txt:51`)

---

### [Medium] 「ハンドラ本体を `electron` 非依存に切り出す」規約が R-2 の 3 メソッドだけに適用され、命名も機械強制も無い (M-008) (scope: feature)

- **観察**: `src/main/app/session-ipc.ts` は
  「`ipc.ts` は `ipcMain` を import するため Vitest の node 環境で読み込めない。
  検証関数だけをテストすると、**ハンドラがその検証関数を呼んでいるか**が検査されないまま残る —
  表の各行を測ったことにならない」(`:6-19`) を理由に、R-2 の 3 メソッド
  (`handleListSessions` / `handleRefreshSessions` / `handleFetchMoreSessions`) の本体を切り出している。
  この理由づけは正しく、SC-010 の計測経路を成立させている。
  しかし **R-1 の 10 メソッド** (`listRuntimes` / `refreshRuntimes` / `probeRuntime` /
  `listFolders` / `beginBrowse` / `browseDirectory` / `registerFolder` / `unregisterFolder` /
  `resolveFolderRuntime` / `pickHostFolder`) の本体は `ipc.ts` にインラインで残っており、
  **同じ理由が同じだけ当てはまるのに切り出されていない**。
  結果として `src/main/app/` には「`ipc.ts` = 登録 + R-1 のハンドラ本体」
  「`session-ipc.ts` = R-2 のハンドラ本体のみ」という**feature 別の非対称な分割**が残る。
  ファイル名 `session-ipc.ts` は役割 (「テスト可能なハンドラ本体」) ではなく
  feature (「session の分」) を表しているため、次の feature は `provider-ipc.ts` を作るか
  `ipc.ts` にインラインで書くかを名前から判断できない。
- **同種事象探索**: `grep -n "handle[A-Z]" src/main/app/ipc.ts src/main/app/session-ipc.ts` の分布 —
  `session-ipc.ts` に `export async function handle*` が **3 件**、
  `ipc.ts` にインラインのハンドラが **10 件**。
  `src/main/app/` に `*-ipc.ts` の綴りを持つファイルは **1 件** (`session-ipc.ts`) のみ。
  ESLint / dependency-cruiser / `check.mjs` に「ハンドラ本体を `electron` 非依存側に置く」ことを
  強制する規則は **0 件**。
- **リスク/影響**: SC-010 が「**検証表の各行**について不正入力が拒否されることが示される。
  行を 3 つだけ列挙する形にしない」と定めた精神に対し、**実装側が feature で線を引いている**。
  R-1 の検証表の行 (送信元 / `distroName` / パス値の共通制約) は `validate.ts` の単体テストでは
  「ハンドラが呼んでいるか」が測れないまま残っており、R-2 だけがその穴を塞いだ。
  X-1 以降が `ipc.ts` にインラインで書き足すと、新しい行は再び測れない側に入る。
  規約が 1 feature の内側にしか無いため、**規約を知らない実装者が正しく外す**ことができる。
- **推奨アクション**: 役割を表す名前に寄せて規約を明示する。
  `session-ipc.ts` → `ipc-handlers.ts` (または `ipc-handlers/session.ts`) とし、
  `ipc.ts` の JSDoc に「**ハンドラ本体は `electron` を import しないモジュールに置く**
  (SC-010 の計測経路。`ipc.ts` は `ipcMain.handle` への登録と送信元検証だけを持つ)」を規約として書く。
  R-1 分の移設は本 PR の範囲外でよいが、`tests/rule-fixtures/` に
  「`ipcMain` を import したファイルにハンドラ本体を書く」形の違反サンプルを足せるか検討し、
  書けないなら `expected.mjs` の `UNDETECTED_NOTES` に `ipc-handler-inline` として
  `why` / `mitigatedBy` / `nextFeature` を登録すること —
  **R-1 の `ui-path-concat` に対して採ったのと同じ扱い**であり、
  残余を台帳に載せずに feature 内部の慣習として残さない。
- **根拠**: SC-010 / FR-043 / AD-027 §1 / `tests/rule-fixtures/expected.mjs` の `UNDETECTED_NOTES` の運用 (R-1 SC-017)
- **scope 根拠**: `src/main/app/session-ipc.ts` / `ipc.ts` / `tests/rule-fixtures/expected.mjs` はいずれも本 PR の touched files

---

### [Medium] 「制御文字」の定義が `domain` に 2 つあり、広さが非対称である (M-009) (scope: feature)

- **観察**: `src/domain/validation.ts:33-41` の `hasControlCharacter()` は
  `code < 0x20 || code === 0x7f || (0x80 <= code <= 0x9f)` を制御文字として**拒否**する。
  `src/domain/session/normalize.ts:38-46` の `isRemovable()` は同じ 3 条件に加えて
  **双方向制御文字** (`U+061C` / `U+200E` / `U+200F` / `U+202A`-`U+202E` / `U+2066`-`U+2069`) を
  **除去**する。同じ `domain` レイヤに「制御文字とは何か」の定義が 2 つあり、後者が真に広い。
  `validation.ts` 自身の JSDoc (`:1-25`) は
  「同じ述語と上限が **IPC 境界 (`app`) と永続化境界 (`infra`) の両方**で要る。
  別々に書くと片方だけが変わり〜 移す前は `hasControlCharacter` が
  `app/validate.ts` と `infra/settings/folder-record.ts` に**同一実装**だった」と、
  **まさにこの重複を解消した経緯**を記録している。R-2 で 2 つ目の定義が生えた。
- **同種事象探索**: `grep -rn "0x20|0x7f|0x9f|202e|2066" src/` で制御文字の判定を持つ production は
  **2 件** (`src/domain/validation.ts:33-41` / `src/domain/session/normalize.ts:38-46`)。
  `grep -rn "hasControlCharacter" src/` で呼び出し **4 件**
  (`src/main/app/validate.ts` / `src/main/infra/settings/folder-record.ts` 系)。
  `isRemovable` は `normalize.ts` 内部のみ (非 export)。
- **リスク/影響**: 非対称が利用者に見える形で残っている。
  `contracts/ipc-session-list.md:217-221` は双方向制御文字の除去理由を
  「`cwdDisplay` に U+202E を仕込むと『未登録フォルダ』の行が登録済みフォルダのパスに見える形に偽装でき、
  **FR-026 の登録導線で利用者に誤った判断をさせられる**」と説明している。
  ところが同じ登録導線の**出口** (R-1 の `registerFolder` が受け取る `displayName`) は
  `hasControlCharacter` で検査され、**双方向制御文字を通す**。
  つまり偽装を防いだ経路の 1 つ隣に同じ偽装面が残る。
  定義が 2 つある限り、どちらを直せばよいかがコードから読めない
  (露出面そのものの評価は `security-reviewer` の owner 範囲であり、本指摘は**定義の重複**に限る)。
- **推奨アクション**: 制御文字の分類を `src/domain/validation.ts` に一本化する。
  `CONTROL_CODE_POINTS` / `BIDI_CODE_POINTS` の 2 述語を `validation.ts` に置き
  (`normalize.ts` の現行実装をそのまま移す)、`normalize.ts` はそれを import して
  「除去する」側の方針だけを持つ。`hasControlCharacter` が bidi を含むべきかは
  R-1 の登録経路の互換性に関わるため**本 PR で変えなくてよい**が、
  一本化した時点で「拒否する集合」と「除去する集合」の差が
  1 ファイル内の 2 定数の差として**見える形**になる。`validation.ts` の JSDoc に差の理由を 1 行残すこと。
- **根拠**: FR-049 / contracts/ipc-session-list.md 節 C / `src/domain/validation.ts:1-25` の自己記述 (同種重複の解消経緯) / AD-023 §7
- **scope 根拠**: `src/domain/validation.ts` / `src/domain/session/normalize.ts` はいずれも本 PR の touched files (`.code-gate-scope.txt:39`, `:35`)

---

### [Low] `SessionServiceDeps.hostHome` が条件型で `HostPath` を遠回しに表している (L-001) (scope: feature)

- **観察**: `src/main/app/session-service.ts:107-109` は
  `readonly hostHome: () => ReturnType<EnumerationTargetFinder['hostTarget']> extends never ? never : Parameters<EnumerationTargetFinder['hostTarget']>[0]`
  と書かれている。`ReturnType<...>` は `Promise<TargetDiscovery>` であり never ではないので、
  この条件型は常に `Parameters<...>[0]` = `HostPath` に評価される。
  同じ `app` レイヤの `src/main/app/dto-mapper.ts:5` は `HostPath` / `RuntimePath` を
  `@domain/runtime/path-types` から**直接 type import している**ので、import できない制約は無い。
  同ファイルは `DiscoveredLocation.discovery` (`:131`) / `measuredLocation` (`:461`) /
  `collectLocation` (`:502`) でも `Awaited<ReturnType<EnumerationTargetFinder['wslTargets']>>` と書いており、
  `src/domain/session/interfaces.ts:20` に `TargetDiscovery` という**名前付きの export がある**のに
  構造から再導出している。
- **同種事象探索**: 型演算からの再導出 (`Awaited<ReturnType<...>>` / `ReturnType<X['m']>` 形) は **6 件**、
  すべて `src/main/app/session-service.ts` (`:107` `:108` `:109` `:131` `:461` `:502`)。
  他のモジュールは名前付き型を import している。
- **リスク/影響**: 型は正しいので実害はない。読み手が `hostHome` が `HostPath` であることを
  2 段の型演算を追って確かめる必要があり、`TargetDiscovery` を grep しても本ファイルが出てこないため
  「この型を使っている場所」の棚卸しが漏れる。
- **推奨アクション**: `HostPath` と `TargetDiscovery` を
  `@domain/runtime/path-types` / `@domain/session/interfaces` から type import し、
  6 箇所を名前付き型に置き換える。
- **根拠**: Constitution Principle XV (可読性) / 同レイヤ `dto-mapper.ts` の既存慣習
- **scope 根拠**: 本 PR の新設ファイル

---

### [Low] `protocol.ts` / `enumerator-spawner.ts` の規則表が AD-030 §5 の訂正前を述べている (L-002) (scope: feature)

- **観察**: `src/agents/protocol.ts:13` の規則表が
  「要求は**標準入力**から 1 行ずつ受ける | AD-030 §1」、`:23` が
  「**`process.parentPort` をここでも本体でも触らない。**」と断定している。
  実際は `src/agents/transport.ts:46-50` が `process.parentPort` を触り、
  Electron 下では `parentPortTransport` が選ばれる (要求は `postMessage` で届く)。
  `contracts/session-enumeration.md:120-127` は
  「**経路を決めるのは子であり、親は 2 つの経路の両方を購読する** (AD-030 §5 の訂正)。
  初版は『要求は `parentPort`、応答は標準出力』と定めていたが**誤りだった**」と訂正済みである。
  `src/main/app/enumerator-spawner.ts:28` も JSDoc の 1 行目が
  「要求は `postMessage`、応答は**標準出力**で受ける (AD-030 §5)」と旧版を述べ、
  `:38-44` で「応答は 2 つの経路の両方で受ける」と自ら訂正している (**見出し行だけが古い**)。
- **同種事象探索**: `parentPort` の出現は **13 件**。実際に触っているのは
  `src/agents/transport.ts:41,43,48,59,84-98` のみで、
  `protocol.ts:23` / `enumerate-sessions.ts:137` / `enumerator-spawner.ts:28,30,39,65` は説明文。
  旧設計を現在形で述べているのは **2 件** (`protocol.ts:13,23` / `enumerator-spawner.ts:28`)。
- **リスク/影響**: `protocol.ts:23` は「触らない」ことを Principle VII の担保として述べているため、
  読み手が `transport.ts` を見ずに「この規則は守られている」と判断する。
  分離の設計 (本体は経路を知らない / 選択は `transport.ts` に閉じる) は妥当なので、表現だけが実体から遅れている。
- **推奨アクション**: `protocol.ts:13` を「要求は **`transport.ts` が選んだ 1 経路**から 1 行ずつ受ける。
  標準入出力が単独起動の経路である (AD-030 §5 / SH-094)」に、`:23` を
  「**本体とプロトコルは `process.parentPort` を触らない。触るのは `transport.ts` の 1 モジュールだけである**」に改める。
  `enumerator-spawner.ts:28` の見出し行を `:38-44` の内容に合わせる。
- **根拠**: AD-030 §5 / contracts/session-enumeration.md C-2 / Constitution Principle VII
- **scope 根拠**: 本 PR の新設ファイル

---

### [Low] 「所在の判別に文字列リテラルを書かない」という規約文と判別子比較が食い違う (L-003) (scope: feature)

- **観察**: `src/main/app/session-enumerator.ts:39` は
  「**所在の判別は `Location` の値で行う。** 文字列リテラルを条件に書かない。」と書き、
  `:116` で `request.target.location.kind === 'windows'` と文字列リテラルで判別している。
  `src/main/infra/session/config-dir.ts:73-74` も
  「所在の判別は **`namespace` の値**で行う。`'wsl'` の文字列リテラルを条件に書かない」と書き、
  `:79` で `configDir.namespace === 'host'` を書いている。
  実際の制約は `scripts/constitution/allowlists.mjs:212-222` が説明するとおり
  「**`PROCESS_SPAWN_MODULES` に載ったファイルに `'wsl'` の文字列リテラルを書かない**
  (検証項目 3 の発火条件が『プロセス起動 API を持つファイル』であるため)」であり、
  判別子との比較そのものは禁じられていない。`config-dir.ts` の表現は正確だが、
  `session-enumerator.ts:39` は範囲を広げすぎている。
- **同種事象探索**: R-2 レイヤ (`src/main/app/` / `src/main/infra/session/` / `src/domain/session/`) の
  判別子比較は **11 件**、うち `'wsl'` リテラルを `PROCESS_SPAWN_MODULES` 対象ファイル
  (`enumerator-spawner.ts`) に書いている箇所は **0 件** (設計どおり)。検証項目 3 は ok。
- **リスク/影響**: 実害なし (検査は通っている)。ただし規約文が過大なため、
  後続が「判別子との比較も禁止」と読んで不要な間接化を入れる、
  あるいは「守られていないから守らなくてよい」と読む。
- **推奨アクション**: `session-enumerator.ts:39` を
  「**`'wsl'` の文字列リテラルを書かない** — `utilityProcess` を持つモジュールでは
  検証項目 3 (裸の `wsl`) が掛かる。判別は `Location` の判別子で行う」に直し、
  `config-dir.ts:73-74` と同じ精度に揃える。
- **根拠**: `scripts/constitution/allowlists.mjs:212-222` / check.mjs 項目 3 / AD-028 §4
- **scope 根拠**: 本 PR の新設ファイル

---

### [Low] `allowlists.mjs` の `UNC_API_NAMES` の JSDoc が宣言から離れ、別の定数に付いている (L-004) (scope: feature)

- **観察**: `scripts/constitution/allowlists.mjs:271` に
  「UNC 値を作る API の名前。項目 13 が `UNC_FORBIDDEN_IN` 配下での呼び出しを禁じる。」の JSDoc があり、
  その**直後 (`:272-277`) に別の JSDoc** (`Agent SDK のパッケージ名`) が続いて
  `:278` の `export const AGENT_SDK_PACKAGE` が宣言されている。
  本来の対象 `UNC_API_NAMES` は **`:318`**、すなわち「項目 15 (`WSL_FREE_DIRECTORIES`)」の節を挟んだ
  47 行下に、「項目 12 / 13」の節見出し (`:225`) の外で宣言されている。
  節構成は `:82` `:157` `:183` `:225` `:323` `:358` `:391` `:407` `:456` のコメント見出しで
  項目ごとに整理されているが、`AGENT_SDK_*` (項目 14) と `WSL_FREE_DIRECTORIES` (項目 15) には
  節見出しが無く、`UNC_API_NAMES` が両者の後に落ちている。
- **同種事象探索**: 同ファイル内で JSDoc と宣言が離れている箇所は **1 件** (上記)。
  節見出しを持たない export 群は **2 件** (項目 14 の `AGENT_SDK_PACKAGE` /
  `AGENT_SDK_IMPORT_DIRECTORIES` / `AGENT_SDK_ALLOWED_CALLS`、項目 15 の `WSL_FREE_DIRECTORIES`)。
- **リスク/影響**: 実害なし。ただし本ファイルは「許可リストの**正本**」であり
  「追加には ADR を要する」(`:5`) 文書でもある。宣言と説明の対応が崩れていると、
  ADR レビュー時に「どの定数がどの項目の正本か」を読み取る手掛かりが失われる。
- **推奨アクション**: `:271` の JSDoc を `:318` の `UNC_API_NAMES` 宣言の直前へ移し、
  `UNC_API_NAMES` を「項目 12 / 13」節 (`:225`-) の中へ戻す。
  `AGENT_SDK_*` と `WSL_FREE_DIRECTORIES` に節見出しを足す (H-001 の修正と同じコミットで行える)。
- **根拠**: `scripts/constitution/allowlists.mjs:1-9` の自己規定 (許可リストの正本 / 追加には ADR)
- **scope 根拠**: 本 PR の touched files (`.code-gate-scope.txt:12`)

---

### [Low] バイト数整形が 2 実装あり、時刻/サイズ整形が画面ファイルにローカルで閉じている (L-005) (scope: feature)

- **観察**: `src/renderer/src/features/session-list/SessionListScreen.tsx:73` の `formatBytes` と
  `src/renderer/src/components/file.tsx:115` の `formatFileSize` が同じ整形を 2 実装持つ。
  後者は `eslint.config.mjs:73-77` の `GENERATED_FILES` (CLI 生成物) に含まれるため
  **上書きされる前提**であり、共有は現実的でない。
  また `formatTime` (`:63`) / `formatBytes` (`:73`) はいずれも非 export でスクリーンファイル内に閉じており、
  `rows.ts:101` の `rowTitleText(title, formatTime)` は**整形関数を引数で受け取る**形になっている
  (依存方向としては妥当だが、`features/session-list/` 内に整形の置き場が無いことの表れである)。
- **同種事象探索**: renderer の整形関数 (test 除く) は **9 箇所**の参照。
  バイト整形の実装は 2 件 (上記)、時刻整形の実装は 1 件
  (`SessionListScreen.tsx:63` — R-1 の 3 画面には時刻整形が無い)。
- **リスク/影響**: 軽微。R-3 が transcript 行に時刻を出すとき 2 つ目の `formatTime` が生える。
  `fileSize` / `createdAt` は FE-048 で Principle XII の表示先割り当てを受けた項目なので、
  整形規則も 1 箇所に置いておくほうが O-2 の `docs/ui-coverage.md` 作成時に辿りやすい。
- **推奨アクション**: `formatTime` / `formatBytes` を
  `src/renderer/src/features/session-list/format.ts` (あるいは renderer 共通の `format.ts`) に
  export として出し、`rows.ts` が引数注入で受ける形は維持する
  (テスト容易性のための注入であり、置き場の問題とは別である)。
  `components/file.tsx` の `formatFileSize` は生成物なので**触らない**ことを移動先の JSDoc に 1 行残す。
- **根拠**: `eslint.config.mjs:64-72` (生成物には体裁ルールを掛けない) / Principle XII (FE-048)
- **scope 根拠**: 本 PR の新設ファイル

---

### [Low] factory 内の helper 宣言が `return` 文の後ろに置かれ、同一ファイル内で不統一である (L-006) (scope: feature)

- **観察**: `src/main/app/session-service.ts` の `createSessionService()` は `:558-691` で
  `return { ... }` しており、その**後**に `countFor()` (`:693`) / `rowAfterFetchMore()` (`:710`) /
  `verifiedFor()` (`:720`) の 3 つの関数宣言が続く。同じ factory 内の他の helper
  (`verified` `:160` / `resolve` `:187` / `detectedDistros` `:199` / `regroup` `:213` /
  `completeInBackground` `:242` / `snapshot` `:253` / `publish` `:262` / `enumerateTarget` `:269` /
  `fetchAll` `:321` / `measuredLocation` `:459` / `commit` `:478` / `collectLocation` `:500`) は
  **すべて `return` の前**にある。巻き上げにより動作するが、同一関数内で 12 件が前・3 件が後に分かれている。
- **同種事象探索**: `src/main/app/` の factory 内 helper は
  `session-service.ts` 15 件 / `session-enumerator.ts` 6 件 / `folder-service.ts` 複数。
  `return` の後に宣言があるのは **`session-service.ts` の 3 件のみ**。
  ESLint に `no-use-before-define` / `func-style` の設定は **0 件**。
- **リスク/影響**: 軽微。ただし本ファイルは 725 行 (M-007) であり、
  「この factory の helper 一覧」を読むのに `return` の前後 2 箇所を見る必要がある。
- **推奨アクション**: 3 件を `return` の前へ移す (M-007 の分割を行うならその作業に含める)。
- **根拠**: 同一ファイル内の既存慣習 (12 対 3)
- **scope 根拠**: 本 PR の新設ファイル

---

### [Low] `resolve` が factory スコープの関数名と Promise コールバック引数で衝突している (L-007) (scope: feature)

- **観察**: `src/main/app/session-service.ts:187` で
  `function resolve(input: ...)` (対応づけ解決のメモ化) を factory スコープに宣言している一方、
  `:588` で `new Promise<void>((resolve) => { reachedFirstRows = resolve })` と
  **同名の引数で覆っている**。
- **同種事象探索**: 当該ファイル内の `resolve` の宣言/束縛は **2 件** (`:187` / `:588`)。
  `src/` 全体で「外側の宣言を覆う `resolve`」は本件 **1 件**。
  ESLint に `no-shadow` / `@typescript-eslint/no-shadow` の設定は **0 件**
  (`eslint.config.mjs` 全文を確認)。
- **リスク/影響**: 軽微。`resolve` は本ファイルで「登録フォルダ × ランタイムの対応づけを解決する」という
  domain 上の意味を持つ名前であり (`:222` で `matchFolder({ ..., resolve })` として注入される)、
  Promise の resolve と混ざると読み手が `:589` を「対応づけの結果を代入している」と誤読しうる。
- **推奨アクション**: factory 側を `resolveFolderRuntimeMemo` (または `resolveCached`) に改名する
  (呼び出しは `:193` `:222` の 2 箇所)。併せて `@typescript-eslint/no-shadow` を入れるかを判断し、
  入れない場合もその判断を記録に残すこと (現状は「検討した記録が無い」状態である)。
- **根拠**: Constitution Principle XV / Principle XIV (名前が概念を表す)
- **scope 根拠**: 本 PR の新設ファイル

## 機械検査の生出力

本 reviewer は lint コマンドの実行を担う。`docs/discovery.md` / `package.json` の
"Build / Test / Lint" から取得した 5 本を実行し、**全件 exit 0** を確認した。

<details>
<summary><code>lint</code> / <code>typecheck</code> / <code>depcruise</code> / <code>check:constitution</code> / <code>test:rules</code> — すべて緑</summary>

```text
$ npm run lint
> eslint --cache .
(指摘なし / exit 0)

$ npm run typecheck
> tsc --noEmit -p tsconfig.node.json --composite false
> tsc --noEmit -p tsconfig.web.json --composite false
(指摘なし / exit 0)

$ npm run depcruise
> depcruise src
✔ no dependency violations found (160 modules, 638 dependencies cruised)

$ npm run check:constitution
Constitution 検証 — 対象 145 ファイル

[ok     ] #1  特権コマンド文字列の不在 (引数配列も捕捉)                 (Principle VI)
[ok     ] #2  `wsl.exe` に渡す引数が許可リスト内                         (Principle VI)
[ok     ] #3  `wsl.exe` を名指せるモジュールの許可リスト                 (Principle VI)
            許可: src/main/infra/runtime/wsl-cli.ts
[ok     ] #4  docker CLI を名指せるモジュールの許可リスト                (Principle VI)
            許可: (なし。R-1 では docker を使わない)
[pending] #5  許可モジュール内にイメージ構築サブコマンドが無い           (Principle VI)
            docker を名指せるモジュールが 0 件なので検査対象が存在しない
[ok     ] #6  ディストロ内スクリプトが定義済みの内容と一致 (3 点検査)    (Principle VI)
[ok     ] #7  プロセス起動 API を使えるモジュールの許可リスト            (Principle VI)
            許可: src/main/infra/runtime/wsl-cli.ts, scripts/rules/run.mjs,
                  scripts/build/package.mjs, src/main/app/enumerator-spawner.ts
[ok     ] #8  注記のないプラットフォーム分岐の不在                       (Principle II)
[ok     ] #9  OS へのプロトコル関連付け API の不在                       (Principle VI)
[ok     ] #10 CSP が FR-040 の directive を満たし禁止形を含まない        (FR-040)
[ok     ] #11 window.open / 遷移の拒否と origin 定数の単一性             (FR-039 / FR-040)
[ok     ] #12 UNC 接頭辞リテラルを持てるモジュールの許可リスト           (AD-028 / FR-042)
            許可: src/domain/runtime/path-types.ts, src/domain/runtime/path-api.ts (テストは除外)
[ok     ] #13 `agents` が UNC のリテラルと API を持たない                (AD-028 / Principle VII)
            対象: src/agents/
[ok     ] #14 Agent SDK の呼び出しが許可リスト内 (許可 1 件以外を禁じる) (Principle IV / C-4)
            許可: listSessions / import 可: src/agents/
[ok     ] #15 R-2 が追加したレイヤが `wsl.exe` と WSL CLI を参照しない   (SC-003 / C-7)
            対象: src/agents/, src/main/infra/session/, src/domain/session/   <-- H-001

項目 15 件: ok 14 / 違反 0 (指摘 0 件) / 検査対象なし 1

$ npm run test:rules
期待表と一致: 26 件 (群 a 13 / 群 b 13。すべて expected == actual)
  a: domain-io-import / agents-electron-transitive / path-module-import /
     unc-literal-outside-allowlist / agents-unc-api-call / platform-branch-unmarked /
     docker-named / namespace-mixup / service-io-import / cycle-a / cycle-b /
     sdk-forbidden-call / wsl-cli-in-session-layer / ui-dto-namespace-literal
  b: require-path / dynamic-import-fs / platform-os-api / platform-destructured /
     wsl-args-array / spawn-outside-allowlist / forge-verified / ui-builtin-via-domain /
     dto-namespace-swap / distro-script-redirect / ui-path-concat (none) /
     reuse-verified-other-distro (none)
機械検証で捕まらない経路: 2 件 (SC-017 の追跡対象)
  - ui-path-concat              -> nextFeature: X-1
  - reuse-verified-other-distro -> nextFeature: I-1
```

**lint 出力 → finding への翻訳**: error 0 / warning 0 / info 0 / suggestion 0。
したがって **lint 由来の Critical / High / Medium / Low はいずれも 0 件**である。
`[pending]` の項目 5 は R-1 の設計どおり (docker を名指せるモジュールが 0 件) であり本 feature の責任範囲外。
R-2 が新設した違反サンプル 5 件 (`sdk-forbidden-call` / `wsl-cli-in-session-layer` /
`ui-dto-namespace-literal` / `agents-unc-api-call` / `unc-literal-outside-allowlist`) は
**いずれも期待どおり発火している** (AD-027 §1 の「ルールは発火で確認する」を充足)。
`exit code` は 5 本すべて 0 であり、本 reviewer の「特殊運用: lint コマンド失敗時の Critical」は発動しない。

</details>

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
| --- | --- | --- | --- |
| H-001 | `wsl-cli\|WslCli\|wsl\.exe` in `src/` | 33 件 (production の実参照 2 件 / **現時点の違反 0 件**) | 正当: `src/main/app/composition-root.ts:11,67` (R-1 の結線)。項目 15 の対象外かつ spawn-context でもない R-2 モジュール **4 件**: `src/main/app/session-service.ts` / `session-ipc.ts` / `dto-mapper.ts` / `session-enumerator.ts` |
| H-002 | `履歴がどこに保存\|どこで動いたか` in `docs/ specs/ src/` | 3 件 (**反転 1 件**) | `docs/glossary.md:100` (**反転**) / `specs/002-.../data-model.md:393` (正) / `:394` (正) |
| M-001 | `materialize` (node_modules 除く) | 12 件 (**旧設計を現在形で述べるもの 7 件**) | `src/domain/session/target.ts:12` / `specs/002-.../contracts/session-enumeration.md:131` / `plan.md:113` / `plan.md:210` / `plan.md:431` / `tasks.md:352` / `tasks.md:408`(+`:410`) |
| M-001 | `UNC_BRANDING_MODULES\|UNC_MATERIALIZE_MODULES` | 5 件 (**実装 0 件**) | `plan.md:431,432` / `tasks.md:352,408,410` (参考: `.gate-verdict-design.json:89`) |
| M-002 | `configDirEnvValue\|envValue` | 9 件 | `src/main/infra/session/config-dir.ts:78` / `src/main/app/session-enumerator.ts:16,227,228` / `src/main/infra/session/config-dir.test.ts:15,56,58,64,70,71` |
| M-002 | `CLAUDE_CONFIG_DIR` (文字列リテラル) in `src/` | 1 件 (設計どおり) | `src/agents/enumerate-sessions.ts:49` |
| M-003 | `^export (function\|interface\|type\|class) <name>` の名前重複 in `src/` | 0 件 | 該当なし。domain ↔ DTO の形の不一致は `EnumerationOutcome` の **1 組のみ** (`src/domain/session/target.ts:117` vs `dto.ts:107`。DTO に対応する domain 型は `target.ts:102` の `TargetOutcome`) |
| M-004 | `^export const [A-Z_]*` の名前重複 in `src/` | **1 件 (2 定義)** | `src/renderer/src/features/workspace-folders/labels.ts:56` / `src/renderer/src/features/session-list/labels.ts:81` (消費者: `ResolutionScreen.tsx:57` / `SessionListScreen.tsx:105`) |
| M-004 | `Record<PendingReason\|Record<BlockedReason` | 2 件 | `src/renderer/src/features/session-list/labels.ts:51` / `src/renderer/src/features/workspace-folders/labels.ts:36` (型は同一。`src/domain/session/keys.ts:35`) |
| M-004 | `distro-not-running` in `src/renderer/` | 12 件 (訳出表の行 5 件) | `session-list/labels.ts:20,30,52` / `workspace-folders/labels.ts:37,71` |
| M-005 | `src/renderer/src/runtime/**` のファイル数 / renderer の hook モジュール | 1 件 / 5 件 | 規約外: `src/renderer/src/runtime/thread-list-adapter.ts:5` (feature へ依存)。規約に合う 4 件: `features/runtime-list/useRuntimes.ts` / `features/workspace-folders/useFolders.ts` / `features/session-list/useSessions.ts` / `features/session-list/useFolderLabels.ts` |
| M-006 | `EnumerationWorker\|Worker` in `src/` | 30 件 (production 8 / test 22) | `src/main/app/session-enumerator.ts:76,87,88,92,165,206,218` / `enumerator-spawner.ts:6,48` / `src/main/infra/session/config-dir.ts:102` |
| M-006 | `supervisor` in `docs/glossary.md` | 1 件 + Detected synonyms 1 行 | `docs/glossary.md` の `supervisor` 項 (「実体のディレクトリは `src/agents/`」)。`Enumeration worker` / 列挙プロセス の項は **0 件** |
| M-007 | 500 行超の production モジュール | 3 件 | `src/main/app/session-service.ts` 725 / `src/renderer/src/features/workspace-folders/WorkspaceFoldersScreen.tsx` 614 / `src/renderer/src/features/session-list/SessionListScreen.tsx` 592。`max-lines` の設定は **0 件** |
| M-008 | `handle[A-Z]` の分布 (`ipc.ts` / `session-ipc.ts`) | 切り出し 3 件 / インライン 10 件 | `src/main/app/session-ipc.ts:39,50,56` vs `src/main/app/ipc.ts` の R-1 10 メソッド。`*-ipc.ts` の綴りは 1 件のみ |
| M-009 | `0x20\|0x7f\|0x9f\|202e\|2066` (制御文字判定) in `src/` | 2 件 | `src/domain/validation.ts:33-41` (`hasControlCharacter`) / `src/domain/session/normalize.ts:38-46` (`isRemovable`。bidi を追加) |
| L-001 | `Awaited<ReturnType\|ReturnType<.*\['` in `src/` | 6 件 (全件 1 ファイル) | `src/main/app/session-service.ts:107,108,109,131,461,502` |
| L-002 | `parentPort` in `src/` | 13 件 (**旧設計を現在形で述べるもの 2 件**) | 旧: `src/agents/protocol.ts:13,23` / `src/main/app/enumerator-spawner.ts:28`。実際に触るのは `src/agents/transport.ts:41,43,48,59,84-98` のみ |
| L-003 | `=== 'windows'\|=== 'host'\|=== 'wsl'` in R-2 レイヤ | 11 件 (**検証項目 3 の違反 0 件**) | `src/main/app/session-enumerator.ts:116` / `src/main/infra/session/config-dir.ts:79` ほか |
| L-004 | `allowlists.mjs` 内で JSDoc と宣言が離れている箇所 | 1 件 | `scripts/constitution/allowlists.mjs:271` (JSDoc) ↔ `:318` (`UNC_API_NAMES`) |
| L-005 | renderer の整形関数 (test 除く) | 9 件 (バイト整形の実装 2 件) | `src/renderer/src/features/session-list/SessionListScreen.tsx:63,73` / `src/renderer/src/components/file.tsx:115` (生成物) |
| L-006 | `return` 文の後ろの関数宣言 in `src/main/app/*.ts` | 3 件 (全件 1 ファイル) | `src/main/app/session-service.ts:693,710,720` (`return` の前にあるのは 12 件) |
| L-007 | `resolve` の宣言/束縛 in `session-service.ts` | 2 件 | `src/main/app/session-service.ts:187` (factory scope) / `:588` (Promise 引数。shadow)。`no-shadow` の設定は **0 件** |

## Verdict

- Critical: 0
- High: 2
- Medium: 9 (F 区分 8 件 + H 区分 1 件 = M-001〜M-009)
- Low: 7

**Critical 0 件の根拠**: 本 reviewer の owner 範囲 (viewpoint F) において
「現時点で観察事実として実害が成立している経路」は無い。
`lint` / `typecheck` / `depcruise` / `check:constitution` / `test:rules` がすべて exit 0 であり、
H-001 は「検査対象の欠落」= 将来経路への防御不足のため
reviewer-base の Severity 判定の禁則により **High が上限**である。
H-002 は SSoT (glossary) の記述誤りであり、実装は data-model 側の正しい定義に従っているため
実害は未成立で High とした。

**approve は行わない。** 上記 18 件 (High 2 / Medium 9 / Low 7) はいずれも本 PR の touched files 内で対処可能である
(scope: feature 18 / system 0 / out-of-scope 0)。
