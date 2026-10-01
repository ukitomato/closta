# convention-reviewer Review: X-4 (code-gate iter3)

**Run**: 2026-09-30
**Reviewer**: convention-reviewer
**Spec**: specs/008-session-launch-settings-dialog-and-presets/spec.md
**Round**: 3

## 初回読了 viewpoint

- FR/SC: FR-009 / FR-010 / FR-011 (プリセットの保存・通知・上書き確認)、FR-012 (到達不可の理由ラベル)、FR-005 / FR-007 (forwardKeys の実名集合)、SC-003 / SC-004 / SC-006
- touched files に該当する charter / Confirmation: session charter (Journey 2 のプリセット)、provider charter (env-passthrough の allowlist)、glossary (forwardKeys / Preset)、AD-041 (a) (e)、Constitution check の項目 16 (fixtures と UNDETECTED_NOTES)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当範囲 (項目 16 の regex の網羅性は PB-7 の担当)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当範囲
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:3
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当範囲 (preset-store の永続化の意味論は database-reviewer の担当)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

iter3 の修正を再検証しました。対象は implementer の action log のうち、自分の指摘 L-007 / L-008、invoker が直した L-001、繰越の L-006 です。あわせて、ほかの reviewer の指摘への修正が命名・配置の面で問題を入れていないかも見ました。見たのは db M-101 / L-101 / L-102 (`preset-store.ts` の `PresetStoreFs` と `errorCode`、`preset-service.ts` の warn) と、pb L-101 (fixture 4 本、`expected.mjs`) です。

iter3 の lint-agent の入力では、lint / typecheck / depcruise / check:constitution のすべての detector が exit_code 0 で、`violations[]` は 0 件でした。そのため CONV-1 由来の finding はありません。循環依存も depcruise が 0 件を返したので、CONV-4 のためのツールは実行していません。

Bash は 2 回使いました。どちらも、新しい指摘 L-010 の根拠として HEAD 時点の定義と参照を確かめるための `git show` / `git grep` で、読み取り専用です。CONV-4 のツール実行ではないため、許可された用途の外にあたります。以後は Grep で代えられるように留意します。

`.code-gate-scope.txt` と `touched-files.txt` はどちらも 104 行で、1 行目から 104 行目まで完全に一致しました。並びはパスのバイト順です (`a-direct` → `b-equivalent`、fixture は英字順)。追加の 4 fixture (`nullish-assignment` / `readonly-initializer` / `reflective` / `wrapper-chained`) は両方に 99-103 行として載っています。iter3 で変更された 10 ファイルもすべて scope に入っています。

## 前回指摘の扱い

| ID | 状態 | 根拠 |
|---|---|---|
| L-001 | **resolved** | `src/domain/provider/helper-path.ts:15` と tasks.md:184 は「main/app/provider-service の `helperRuntimePath`」に直った。「infra の」という記述は両ファイルとも 0 件 |
| L-006 | **open** (繰越は code-gate.md の合意どおり) | `src/agents/sdk-agent-session.ts` は 519 行のまま (`:519` が `main()`)。iter3 では触れていない |
| L-007 | **resolved** (推奨の最低限を満たす) | `labels.ts:152-155` に `PRESET_NOTICE_LABELS { saved, overwriteConfirm }` が入った。`overwriteConfirm` は `PRESET_SAVE_FAILURE_LABELS['name-conflict']` から組み立てており (`:154`)、二重に書かれていた文言は解消した。`name-conflict` のエントリにも描画経路ができた。`PresetPanel.tsx:47,127` がこれを参照している。ボタンの文言 (`:77,86,95,112,129,137` の 適用 / 削除 / 保存 / 上書き / やめる) と LaunchDialog の直書きは残っている。ただし iter2 で「別 feature で扱ってよい」とした範囲なので、再指摘しない |
| L-008 | **resolved** | `forward-env.ts:120` が `as const satisfies readonly CredentialEnvName[]` になり、改名・削除はコンパイルエラーで検出される。部分集合の検査テストも `forward-env.test.ts:131-134` に足された |

## Findings

### [Low] `L-006` (繰越): `src/agents/sdk-agent-session.ts` が 519 行 (L-006) (scope: feature)

- **観察**: iter1 から変化していない。code-gate.md で繰越が合意されている。
- **同種事象探索**: scope 内の非テスト TS で 500 行を超えるものは 1 件で、iter2 と同じ。
- **リスク/影響 / 推奨アクション**: iter1 と同じ。launch decoder を `src/agents/launch-decoder.ts` などに分離する。
- **根拠**: CONV-3
- **scope 根拠**: touched files の中で直せる

### [Low] `PresetStoreFs` は `rename` だけの部分的な注入で、既存の store の慣習とも、自身の doc の「provider-store と 1:1」とも合わない (L-009) (scope: feature)

- **観察**:
  - `src/main/infra/settings/preset-store.ts:43-47` の `PresetStoreFs` は `rename` 1 つだけを持つ。同じファイルの `readFile` / `writeFile` / `mkdir` / `rm` は `node:fs/promises` の直 import を使い続けている (`:1`, `:71`, `:79`, `:156`, `:164`, `:169`)。型名は fs 全体の抽象に見えるが、中身は rename 失敗のテスト用の差し替え口だけである。
  - 既存の fs 抽象は `HostFileSystem` / `WslFileSystem` (`src/main/infra/fs/`) で、deps オブジェクトの `hostFs` / `fs` として注入している (`folder-service.ts:87-89`)。`createFolderStore(userDataDir, now)` (`folder-store.ts:54`) と `createProviderStore(userDataDir, now)` (`provider-store.ts:45`) は第 3 引数を持たない。`fs` という引数名も、`folder-service.ts:87` では `WslFileSystem` を指しており、同じ名前が別のものを指している。
  - `preset-store.ts:11` の「`provider-store.ts` と 1:1 の構え」と `:16` の「provider-store と同型」は、iter3 で実態から外れた。preset 側だけが次の点で provider-store と異なる。
    - fs を注入できる
    - rename 失敗時に `rm` で後始末する
    - `read-failed` / `errorCode` を返す (`:81-92`)。provider-store の `:71-73` は読み取りエラーをすべて空として扱う
    - 版の判定を `schema-version-unknown` と `parse-failed` に分けている (`:108-116`)
- **同種事象探索**: `src/main` を `interface \w+Fs|type \w+Fs|export function create\w+Store\(` で Grep した。store に fs を注入しているのは `preset-store.ts:43,55-58` の 1 件だけで、ほかの store (`folder-store.ts:54`, `provider-store.ts:45`, `runtime-store.ts:46`, `safe-storage.ts:22`) は 0 件。
- **リスク/影響**:
  - 「1:1」を頼りに provider-store と見比べると、差分が意図したものか退行かを判別できない。
  - `PresetStoreFs` に操作を足すたびに、直 import と注入のどちらを使うかが揺れる。
  - 振る舞いは正しく、テストもあるので Low とした。
- **推奨アクション**: 最小案は次の 2 点。
  - `preset-store.ts:11,16` の「1:1 / 同型」を「provider-store と同じ退避方針。ただし read-failed の区別 (DB-4 / M-101)、版の判定 (L-101)、rename 失敗時の後始末 (L-102) は preset 側だけ」に書き換える。
  - `PresetStoreFs` を `PresetStoreRename` のように実態どおりの名前にするか、doc (`:42`) に「rename だけ。ほかは直 import」と明記する。
  - provider-store 側に同じ修正を入れるかどうかは database-reviewer の判断に委ねる。
- **根拠**: CONV-3 / CONV-6
- **scope 根拠**: `preset-store.ts` は touched files に含まれる

### [Low] `REACHABILITY_EXCLUDED_LABELS` が `features/provider/labels.ts` と `features/session/labels.ts` に同じ名前・異なる文言で 2 つあり、provider 側は参照 0 件の dead export (L-010) (scope: feature)

- **観察**:
  - `src/renderer/src/features/provider/labels.ts:38-41` の文言は「選んだランタイムからは届きません」と「今は届きません (ディストロを起動して再検出してください)」。
  - `src/renderer/src/features/session/labels.ts:129-132` の文言は「このランタイムからは到達できません」と「ランタイムの準備待ち (停止中・パス変換の取得前など)」。
  - 型はどちらも同じ `Record<'unreachable' | 'blocked', string>` で、同じ理由キーに別の文言を割り当てている。
  - 参照は `LaunchDialog.tsx:36,277` の session 側だけで、provider 側は参照 0 件である。HEAD 時点 (X-3) でも provider 側は定義だけで参照は無く、X-4 の起動 UI のために用意されていたものと読める。
  - iter2 の L-004 では、`EFFORT_LABELS` を provider/labels に 1 つだけ置き、session から import する形に揃えた。このラベルだけがその方針から外れて複製されている。iter2 で見落としていた。
- **同種事象探索**:
  - `src` を `REACHABILITY_EXCLUDED_LABELS` で Grep すると 4 件。定義が 2 件 (`provider/labels.ts:38`, `session/labels.ts:129`)、参照が 2 件 (`LaunchDialog.tsx:36,277`)。
  - `git grep HEAD` では、HEAD 時点は定義 1 件 (`provider/labels.ts:29`) で参照は 0 件だった。
  - ほかの `*_LABELS` で、feature をまたいで同じ名前が定義されているのは `BOUNDARY_LABELS` (`workspace-folders/labels.ts:56`, `session-list/labels.ts:185`) の 1 組だけで、これは本 PR の範囲外。
- **リスク/影響**:
  - 同じ理由キーに対し、画面によって別の説明が出る余地がある。provider 側を後で使い始めると、文言が食い違う。
  - dead export が残り、どちらが正本かが名前からは分からない。
  - 現時点で描画されているのは 1 つだけなので Low とした。
- **推奨アクション**: 次のいずれかにする。
  - L-004 と同じ形にする。provider/labels.ts の定義を正本にし、文言を session 側のものに合わせる。session/labels.ts の定義は削除し、`LaunchDialog.tsx:36` は `@/features/provider/labels` から import する。
  - provider 側を X-3 の遺物として削除する。
- **根拠**: CONV-5 (dead code) / CONV-6 / iter2 L-004 と同じ方針
- **scope 根拠**: 両 labels.ts と LaunchDialog.tsx は touched files に含まれる

### 確認したが問題が見つからなかった点 (finding ではない)

- `PRESET_NOTICE_LABELS` は、既存の `*_LABELS` の命名 (SCREAMING_SNAKE と `_LABELS` の接尾辞、`as const` のオブジェクト) に従っている。`LAUNCH_AXIS_LABELS` / `LAUNCH_EMPTY_STATE_LABELS` と同じ形である。確認文言は単独の定数 `PROVIDER_RESET_CONFIRMATION` (`labels.ts:135`) という前例もある。ただし通知と確認を 1 つのオブジェクトにまとめることを禁じた規約は無いので、finding にはしない。
- 新しい fixture 4 本は、既存と同じ `b-equivalent/sdk-permission-mode-<variant>.ts.fixture` の形で命名されている。`expected.mjs:311-346` の `target` は `src/agents/__rulecheck__/<同名>.ts` の規則に従い、`what` の末尾に出典 (`X-4 code-gate platform-boundary L-101`) を書く慣習も守っている。`detectors: ['none']` の reflective は、`UNDETECTED_NOTES` のキー (`:533`) が fixture の basename と一致しており、既存のエントリ (`principle-v-unknown-shape-secret` など) と同じ規則である。必須の `why` / `mitigatedBy` / `nextFeature` / `howToClose` もそろっている。
- `errnoCode` (`preset-store.ts:50`) と `errorCode?` (`:34`) は、ファイル内で役割に沿って名前が分かれている。
- `[preset-store]` の log prefix (`preset-service.ts:66`) は、既存の `[launch]` (`composition-root.ts:280`) と同じ `[<topic>]` の形である。

## H (テスト / regression) — Owner 範囲

- L-008: `satisfies` による型の拘束は typecheck (exit 0) で、部分集合であることは `forward-env.test.ts:131-134` で検出できる。
- L-007: 組み立て後の文字列は元の直書きと同じなので、implementer は PresetPanel / LaunchDialog のテストを変えずに通したと報告している。ただし、`name-conflict` のラベルを変えたときに確認文言も追随することを直接検査するテストは無い。定数の参照で追随することは構造上保証されているため、finding にはしない。
- L-009 / L-010: どちらも Low で、振る舞いの退行ではない。検出するテストが無いことは Low の範囲に収まる。
- 既存の振る舞いへの影響: `createPresetStore` の第 3 引数は省略可能で、既定値があり、composition-root の呼び出し (`composition-root.ts:286`) は変わっていない。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-006 | 非テストの 500 行超 (scope 内) | 1 | src/agents/sdk-agent-session.ts (519 行) |
| L-009 | `interface \w+Fs\|type \w+Fs\|export function create\w+Store\(` (src/main) | fs を注入する store は 1 / ほかの store は 0 | src/main/infra/settings/preset-store.ts:43,55-58 (比較: folder-store.ts:54, provider-store.ts:45, runtime-store.ts:46, safe-storage.ts:22) |
| L-010 | `REACHABILITY_EXCLUDED_LABELS` (src) | 定義 2 / 参照 2 | src/renderer/src/features/provider/labels.ts:38, src/renderer/src/features/session/labels.ts:129, src/renderer/src/features/session/LaunchDialog.tsx:36,277 |

<details>
<summary>lint-agent の出力 (iter3。入力として受け取っただけで、本 reviewer は lint を実行していない)</summary>

```json
{"exit_code": 0, "detectors": {"lint": {"exit_code": 0, "files_linted": 266, "violations": 0}, "typecheck": {"exit_code": 0, "projects": ["tsconfig.node.json", "tsconfig.web.json"], "errors": 0}, "depcruise": {"exit_code": 0, "violations": 0}, "check:constitution": {"exit_code": 0, "items": 17, "ok": 16, "violations": 0, "pending": 1}}, "violations": [], "not_run": ["test:rules"]}
```

すべての detector が exit_code 0 で、violations は 0 件です。そのため CONV-1 由来の Critical / High はありません。`test:rules` は実行されていません。reflective fixture が eslint / typecheck / depcruise でも捕まらないこと (`none` の要件) は、implementer も「未検証」と記録しています。これは test:rules を実行する pr-gate / CI で確かめることになります。
</details>

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 3 (L-006 は繰越で open / L-009 と L-010 は new)
- Round inheritance: resolved from 2: 3 (L-001, L-007, L-008) / unresolved: 1 (L-006) / new: 2 (L-009, L-010。L-010 は iter2 で見落としていたもので、iter3 の修正で入ったものではない)

関連ファイル:
- C:\dev\closta\src\renderer\src\features\session\labels.ts
- C:\dev\closta\src\renderer\src\features\session\PresetPanel.tsx
- C:\dev\closta\src\renderer\src\features\session\LaunchDialog.tsx
- C:\dev\closta\src\renderer\src\features\provider\labels.ts
- C:\dev\closta\src\domain\provider\forward-env.ts
- C:\dev\closta\src\domain\provider\forward-env.test.ts
- C:\dev\closta\src\domain\provider\helper-path.ts
- C:\dev\closta\src\main\infra\settings\preset-store.ts
- C:\dev\closta\src\main\infra\settings\provider-store.ts
- C:\dev\closta\src\main\app\preset-service.ts
- C:\dev\closta\tests\rule-fixtures\expected.mjs
- C:\dev\closta\specs\008-session-launch-settings-dialog-and-presets\tasks.md
- C:\dev\closta\specs\008-session-launch-settings-dialog-and-presets\.code-gate-scope.txt
- C:\dev\closta\specs\008-session-launch-settings-dialog-and-presets\touched-files.txt
