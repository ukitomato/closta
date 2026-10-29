# Implementation Plan: 起動設定の残りの軸 — 追加ディレクトリ・上限・セッション名 (X-6 の 2 本目)

**Branch**: `024-session-launch-axes` (main 7f6ef94 の上) | **Date**: 2026-10-29 (`/cl-plan`) | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md) (U-1〜U-9 は 2026-10-29 の夜間の規則で推奨案を採用)

本 plan は spec / [research.md](./research.md) / [data-model.md](./data-model.md) / [contracts/launch-config-v2.md](./contracts/launch-config-v2.md) / [quickstart.md](./quickstart.md) を正本として参照し、規則を書き写さない。本 plan が足すのは、2026-10-29 の作業ツリー (main 7f6ef94) と突き合わせて決めた**置き場所と手順** (下の「実装方針」) と、上流からの申し送りの棚卸しである。

## 判断の承認

- **U-1〜U-9 は 2026-10-29 の夜間の規則 (承認の要る判断は推奨案で採用して進む) で採用した** (spec の「判断の一覧」)。plan の段の実装の選択 P-1〜P-11 (research の各節) も同じ規則で採用した。利用者の判断を待って止める点は無い (`.needs-input.md` は作っていない)
- AGENTS.md の gated 確定事項 (domain の分解・Constitution Principle の採否) に当たるものは無い。domain は spec の `domain_selected_by: user` (session)。Constitution は改めない
- **AD-064 を起こし、accepted にした** ([docs/decisions/0064-…](../../docs/decisions/0064-launch-config-additional-directories-limits-and-title.md))。2026-10-29 に夜間の規則で推奨案を採用した (覆ったときの範囲は RK-01)

## Summary

- **追加ディレクトリ (US-1)**: `SessionLaunchConfig.additionalDirectoryIds` (folder id の 0〜10 件)。renderer は登録フォルダから選び、依存解決 (`resolveLaunchAxes`) が項目ごとに「未登録・作業フォルダと同じ・このランタイムから届かない」を外して `directoryResets` で通知する (data-model §2)。main の起動ゲートは再評価して外す項目があれば拒否し、各 id を `resolveFolderRuntime` で選択ランタイムのパスに変換する (§4)。agents は WSL / Win32 ごとのパスの形を再検査して `additionalDirectories` に載せる (§5)
- **上限 (US-2)**: `maxTurns` (1〜1000 の整数) と `maxBudgetUsd` (0.01〜1000・小数 2 桁まで)。null は「上限なし」でキーを載せない。止まったときの表示は O-4 の `max-turns` / `max-budget` のまま (§0)
- **セッション名 (US-3)**: `sessionName` を `SessionLaunchConfig` に持ち (research R-03)、`title` で渡す。023 の `normalizeSessionName` を通った値に限る。起動に成功したら main の registry と renderer のストアの `name` をこの値で初期化する (§8)
- **プリセットと再開 (US-4)**: プリセットの config は名前を除いた 9 キー (`PresetLaunchConfig`)。`presets.json` を版 2 にし、版 1 は新しい軸を既定で補って読む (§6)。再開の形は選び直せる軸を 6 つに広げ、名前を出さず `sessionName: null` を送る (§7)
- **ADR と機械強制**: `QUERY_OPTION_KEYS` 12 → 16 (AD-064 Decision 1)。AD-041 (g) の escalation-neutral を `additionalDirectories` の分だけ「登録フォルダの main の変換値」の条件つきで読み替える (Decision 2)

## Technical Context

**Language/Version**: TypeScript 5.9 (strict)。React 19 / Electron 39

**Primary Dependencies**: `@anthropic-ai/claude-agent-sdk` 0.3.270 (`Options.additionalDirectories` / `maxTurns` / `maxBudgetUsd` / `title`。research R-01)。新しい依存は足さない

**Storage**: `presets.json` (版 2。data-model §6)。名前は永続化しない (Principle X)。`launch-usage.json` は変えない

**Testing**: Vitest 5 (node / renderer の 2 project)、vitest-axe、Playwright の E2E (偽の capability)、Constitution 検証 (`node scripts/constitution/check.mjs`)、rule fixtures。コマンドは `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列

**Target Platform**: Windows 11 のデスクトップ (Electron)。セッションは WSL と Win32 の両方

**Project Type**: desktop-app (main / preload / renderer / agents / domain)

**Performance Goals**: 新しいプロセスを起こさない。追加ディレクトリの解決結果 DTO は今の `resolveFolderRuntime` の IPC (main のメモリだけを見る) を項目の数だけ呼ぶ (最大 10。research R-11)

**Constraints**: data-model §0 の「変えないもの」。`QUERY_OPTION_KEYS` は 16。IPC の channel・`SessionControl`・`SessionEvent`・`LAUNCH_FAILURE_REASONS` は変えない

**Scale/Scope**: FR 17 / SC 9。新設のモジュールは renderer の 2 つ (`LaunchExtraAxes.tsx` / `launch-extra-axes.ts`) だけ

### レイヤごとの変更 (2026-10-29 の作業ツリー = main 7f6ef94 で確かめた)

| レイヤ | ファイル | 変更 | 起点 |
|---|---|---|---|
| domain | `src/domain/session/launch-config.ts` | 4 キー・`PresetLaunchConfig`・定数と述語・`toPresetConfig` (data-model §1) | `LAUNCH_CONFIG_KEYS`・`isValidLaunchConfig` `:81-92` |
| domain | `src/domain/session/launch-resolution.ts` | `LaunchDraft` の 3 キー・`unreachableFolderIds`・`DirectoryReset`・`toLaunchConfig(resolution, sessionName)`・`toLaunchDraft` (§2) | `resolveLaunchAxes` `:82-163` |
| domain | `src/domain/session/preset.ts` / `resume.ts` | `Preset.config` を `PresetLaunchConfig` に・「6 軸」の記述 (FR-015) | `resume.ts:16` |
| domain | `src/domain/session/agent-session.ts` | `LaunchQueryOptions` の 4 キー・`isLaunchDirectoryValue` (§5.1 / §5.2) | `LaunchQueryOptions` `:128` |
| agents | `src/agents/sdk-agent-session.ts` | `decodeLaunchOptions` の 4 キー (§5.3) | `:309-329`・`decodeLaunch` `:336`・`buildQueryOptions` の呼び出し `:841-852` |
| agents | `src/agents/session-core.ts` / `session-core.test.ts` | `QUERY_OPTION_KEYS` 16・`buildQueryOptions` の assert と spread (§5.4)・pin テスト | `:68-84`・`:183-208`・テスト `:209-234` |
| main (app) | `src/main/app/validate.ts` | `checkResumeRequest` の `sessionName === null`・`checkPreset` の述語 (§3) | `checkLaunchConfig` `:468`・`checkResumeRequest` `:482`・`checkPreset` `:517` |
| main (app) | `src/main/app/launch-preparation.ts` | `directoryResets` の拒否・`resolveAdditionalDirectories`・options の 4 キー (§4) | `prepareWin32` `:108-188` (options `:180-185`)・WSL `:190-291` (options `:281-286`) |
| main (app) | `src/main/app/session-launch-service.ts` | `startSession` の `name: config.sessionName` (§8) | `:445-457` (`name: null` `:454`) |
| main (app) | `src/main/app/e2e-capability.ts` | 偽の `savePreset` の config の形・起動の値 (SC-007) | `:673` |
| main (infra) | `src/main/infra/settings/preset-record.ts` / `preset-store.ts` | 版 2・版 1 の読み替え (§6) | `RECORD_KEYS` `:18`・`toPresetRecord`・store の版の判定 `:113-121` |
| renderer | `src/renderer/src/features/session/LaunchExtraAxes.tsx` (新設) / `launch-extra-axes.ts` (新設) | 3 つの軸の部品・入力の解釈 (§9) | `LaunchDialog.tsx` の軸の並び |
| renderer | `src/renderer/src/features/session/LaunchDialog.tsx` | 入力の文字列・追加ディレクトリの DTO の hook・押せない条件・通知・再開の形 (§7 / §9) | `useFolderRuntimeResolution` `:163-193`・`update`・`applyPreset`・再開の config `:394-409` |
| renderer | `src/renderer/src/features/session/running-session-types.ts` / `running-session-store.ts` / `resume-action.ts` | `ResumeDialogState.initial` の 6 つ (§7.1)・起動の受け付けの `name` (§8) | `:206`・`resume-action.ts:46-62` |
| renderer | `src/renderer/src/features/session/labels.ts` / `PresetPanel` の保存 | 文言 (§9.3)・保存の前の `toPresetConfig` | `AXIS_RESET_LABELS` |
| renderer | `src/renderer/src/features/shell/OverviewTab.tsx` | 3 行 (§9.4) | `:125` |
| tests / 記録 | `tests/rule-fixtures/expected.mjs`・`docs/glossary.md`・`docs/domains/session/charter.md`・`docs/roadmap.md` | §10 | `ui-path-concat` `:791-804` |

テストの fixture で起動設定を組む箇所 (起動・再開・プリセット・E2E) は 4 キーを足す必要がある (RK-06)。

**未確定の技術事項**: なし。実機で確かめる事項 (追加ディレクトリの読み取りの承認の有無・上限の数え方・`title` が過去の一覧に出るか) は、どの結果でも契約を変えない形にしてあり、quickstart V-1〜V-5 で記録する

## Constitution Check

*GATE: Phase 0 の前に通し、Phase 1 の後に見直した (下の「設計後の見直し」)。* `.specify/memory/constitution.md` に基づく。

**NON-NEGOTIABLE**

- [x] **I. パス操作は `domain` のパス API 経由** — 追加ディレクトリのパスは main が `resolveFolderRuntime` (domain/workspace) で作る。agents の形の検査は `makeHostPath` (domain) と POSIX の値の規則 (data-model §5.2)。renderer はパスを作らない (FR-001)
- [x] **II. プラットフォーム分岐は `src/main/infra/runtime/` の内側** — WSL / Win32 の違いはランタイムの種類 (DTO) と launch spec の種類で分かれる。`process.platform` の分岐を足さない
- [x] **III. 権限モードは capability に従う** — 権限モードは安全 3 値のまま。追加ディレクトリは読み取りの範囲を広げ、そのフォルダの skills を読み込ませるが、登録フォルダの main の変換値に限る (登録フォルダの設定一式を作業フォルダと同じく信頼する。AD-064 Decision 2 と訂正節・research R-02 / R-02a・spec U-10)。書き込みは今どおり権限モードと `canUseTool`
- [x] **IV. 通信は Agent SDK 経由** — `query()` の options の 4 キーだけ。CLI の引数を自前で組まない (SDK が `--add-dir` などに変える)
- [x] **V. 長期資格情報を永続化しない** — プリセットに足すのは folder id と数だけ
- [x] **VI. 永続環境を構築・変更しない** — 利用者の環境を変えない。`presets.json` (アプリのデータ) の版を上げるだけ
- [x] **VII. supervisor (`src/agents/`) は Electron / ネイティブモジュールに非依存** — agents の変更は decoder と options の組み立てだけ。新しい import は domain の述語
- [x] **VIII. 日本語環境で破綻しない** — 名前は `title` で stdin の JSON に載り argv を通らない (research R-01)。日本語・空白を含むフォルダのパスの `--add-dir` は quickstart V-1 の 5 で確かめる。名前の入力は IME の変換中の Enter で起動しない (§9)

**Standard**

- [x] **IX. main process をブロックしない** — 変換は main のメモリの値を見るだけ。新しい I/O は無い
- [x] **X. セッションの正本はアプリ外** — 名前の正本は transcript の custom-title。registry の名前はキャッシュ。プリセットは名前を持たない
- [x] **XI. 垂直スライス** — US-1〜US-4 はどれも起動ダイアログと稼働中の行・概要のタブで観測できる。実機は quickstart V-1〜V-6
- [x] **XII. 未表示情報を残さない** — 起動の値を概要のタブに出す (FR-013)。対応表 (`docs/ui-coverage.md`) の行は増えない (SDK の型の表示の対象を足さない)
- [x] **XIII. assistant-ui の element と design system を優先** — 起動の設定の部品に当たる element は無い (023 で照合済み。research R-11)。今の起動ダイアログと同じ form 部品と `Button`
- [x] **XIV. Ubiquitous Language** — SessionLaunchConfig・Preset・Session name・Concurrency limit の項を直す (data-model §10)
- [x] **XV. 多言語規約** — 文言は `features/session/labels.ts` (data-model §9.3)

**Domain charter の整合**

- [x] 本 feature の domain (`session`) の In scope の「`SessionLaunchConfig` の解決と、軸どうしの依存関係の解決」(`charter.md:68-69`)・「プリセットの保存・適用」(`:70`)・「セッションの起動 … 再開」(`:67`) の延長に収まる。業務ルール「上流の軸を変更したとき、無効になった下流の値は既定に戻し、UI で通知する」(`:191`) を追加ディレクトリに当てる (§2)
- [x] Out of scope に踏み込まない。パスの変換は runtime の domain の `resolveFolderRuntime` を呼ぶだけ (`:84`)

## Domain Context

### Charter reference

- Domain: `session` ([docs/domains/session/charter.md](../../docs/domains/session/charter.md))
- Mission: 複数フォルダ・複数ランタイムにまたがって存在する Claude Code のセッションを、一箇所から走査・起動・監視・差配できるようにする (`:50-53`)
- Scope (本 feature が触れる部分): 起動・再開 (`:67`)・`SessionLaunchConfig` の解決と軸の依存解決 (`:68-69`)・プリセットの保存と適用 (`:70`)・Journey 2 の手順 3 (`:110`「上限を選ぶ (X-4 時点で上限は未対応。X-6 が扱う)」を実装する)・Journey 2 の手順 5 (`:112`。プリセットに新しい軸)・Journey 4 の手順 2 (`:133-134`「上限は選び直せる」を実装する)
- 触れる他の domain: `workspace` / `runtime` — `resolveFolderRuntime` と登録フォルダの一覧を読むだけ。`ui` — 概要のタブ (`OverviewTab.tsx`) に行を足す (シェルの面の状態は変えない)
- session charter の Journey 2 の手順 3・Journey 4・Related ADRs (`:263` の後に AD-064)・Related Specs (`:352-354` の後に 024)・frontmatter の `related_adrs` / `related_specs` を完了の PR で直す (FR-017・data-model §10)

### Related ADRs

- [AD-064](../../docs/decisions/0064-launch-config-additional-directories-limits-and-title.md) — 起動設定の追加ディレクトリ・上限・名前と `QUERY_OPTION_KEYS` 16: **accepted** (本 feature で起こした。2026-10-29 夜間の規則で推奨案を採用)
- [AD-041](../../docs/decisions/0041-x4-launch-config-on-x1-launch-gate.md) — X-4 の起動設定・(g) `QUERY_OPTION_KEYS` は escalation-neutral だけ・(h) X-6 への指名: accepted。AD-064 が (g) を `additionalDirectories` の分だけ読み替える
- [AD-042](../../docs/decisions/0042-provider-type-refinement-and-d4-lapse.md) — Decision 4 の今後の規則 (store の形を変える feature は版を上げる・読み替えは store の内側): accepted。本 feature が当たる (§6)
- [AD-059](../../docs/decisions/0059-session-resume-query-option-and-conversation-id.md) — 再開の `resume` と引き継ぐ 3 軸: accepted (変えない。再開の要求の値の形が広がる)
- [AD-062](../../docs/decisions/0062-live-session-permission-mode-model-and-rename.md) — 改名と registry の名前の欄: accepted (名前の欄を起動の値で初期化する)
- [AD-047](../../docs/decisions/0047-session-meter-and-failure-reasons.md) — 失敗の理由 `max-turns` / `max-budget`: accepted (変えない)
- [AD-016](../../docs/decisions/0016-cross-filesystem-performance-cliff.md) — 越境の警告: accepted (追加ディレクトリにも同じ警告)
- [AD-040](../../docs/decisions/0040-provider-settings-constrained-projection.md) — settings の 2 キーの射影: accepted (変えない。追加ディレクトリを settings に載せない)
- [AD-007](../../docs/decisions/0007-session-source-of-truth-is-claude-code.md) — セッションの正本は Claude Code: accepted (Principle X の根拠)

### Glossary excerpt

- **SessionLaunchConfig** (`glossary.md:1093-1102`): 起動の軸。「前 6 軸」「X-6 が扱う」「6 軸の形は変えない」を 10 キーと再開の 3 軸の記述に直す (§10)
- **Preset** (`:807-813`): 名前付きの起動設定。版 2・名前を持たないことを足す
- **Session name** (`:1036-1042`): 023 の改名。起動のときの名前 (本 feature) を足し、Counterexample (`:1041`) を直す
- **Concurrency limit** (`:211-218`): 同時実行数の上限。Counterexample (`:217`) の「上限 (ターン数・費用) は X-6」を 024 に直す (別物であることは変えない)
- **Axis resolution**: 上流の軸を変えたら無効の下流を既定に戻して通知する。追加ディレクトリは項目ごとに外す (§2)

## 上流からの申し送り

```text
# 2026-10-29 に Grep ツール (rg) で実行。範囲は docs/ .specify/ tests/ specs/、拡張子 md / mjs / js / yaml / yml
# 1) spec_id
rg -n "024-session-launch-axes" docs .specify tests specs -g "*.{md,mjs,js,yaml,yml}"
#    → 3 行 / 2 ファイル (plan を書く前)
# 2) feature ID
rg -n "\bX-6\b" docs .specify tests -g "*.{md,mjs,js,yaml,yml}"
#    → 67 行 / 13 ファイル (plan を書く前)
rg -n "\bX-6\b" specs -g "*.{md,mjs,js,yaml,yml}"
#    → 502 行 / 153 ファイル (plan を書く前。spec / plan / data-model / research に絞ると 200 行 / 34 ファイル)
# 3) 変更のモジュール名を実名リスト方式のルールで
rg -n "launch-preparation|preset-record|preset-store|preset-service|launch-config|launch-resolution|LaunchDialog|session-core|sdk-agent-session" .dependency-cruiser.js eslint.config.mjs scripts/constitution/allowlists.mjs .specify/spec-gate/reviewers.yml
#    → WSL_FREE_DIRECTORIES (allowlists.mjs:560-591) と services-not-to-io (.dependency-cruiser.js:254) に既存の名前が当たる。新しい名前は無い
```

### 1) spec_id の 3 行

| # | 出所 | 件数 | 処理 |
|---|---|---:|---|
| 1 | `specs/024/spec.md:2`, `:16` | 2 | **当たらない** — 本 spec の frontmatter と見出し |
| 2 | `docs/roadmap.md:355` (X-6 の行の「024 の範囲」) | 1 | **受ける** — 範囲の正本。spec の「義務の扱い」の表に全部割り当てた。完了の PR で結論を書く (FR-017) |

### 2) feature ID (`X-6`) — docs / .specify / tests の 67 行

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 3 | `docs/roadmap.md:355` | X-6 の行 | **受ける** — #2 と同じ |
| 4 | `docs/roadmap.md:200`, `:210`, `:383`, `:385`, `:386`, `:399` | composer の持ち主・O-5 の記録・X-8 / X-9 の行・順の振り直し | **当たらない** — どれも閉じたか別の feature の記録。本 feature は composer・Win32 の起動の形・再開の照合に触れない |
| 5 | `docs/ui-coverage.md:86`, `:219`, `:220`, `:222`, `:284`, `:302`, `:333`, `:338`, `:352`, `:359` | `new_conversation_id`・E 節の 023 の書き換え・Model selector など・fork / branch | **当たらない** — E 節と element の照合は 023 で閉じた。fork と /clear の後の id は X-6 の後続。本 feature は SDK の型の表示の対象を足さないので行は増えない |
| 6 | `docs/domains/_overview.md:58` | X-6 の feature の一覧の行 | **受ける** — 完了の PR で 024 の記録を足す。`:72`, `:73` (X-8 / X-9)・`:185` (項目 21 の記録) は **当たらない** |
| 7 | `docs/domains/session/charter.md:110` | Journey 2 の手順 3 の「上限は X-6」 | **受ける** — FR-017 / data-model §10 |
| 8 | `docs/domains/session/charter.md:130` | Journey 4 の分岐は X-6 | **当たらない** — 分岐 (`forkSession`) は X-6 の後続。同じ節の手順 2 (`:133-134`。X-6 の綴りは無い) の「上限は選び直せる」は本 feature が受ける (FR-012) |
| 9 | `docs/domains/session/charter.md:174` | /clear の後の id は X-6 | **当たらない** — X-6 の後続 |
| 10 | `docs/domains/session/charter.md:241` | 対応表の `後続: X-6` の行 | **当たらない** — 023 で書き換えた。本 feature は対応表を変えない |
| 11 | `docs/domains/session/charter.md:263`, `:352`, `:354` | Related ADRs (AD-062)・Related Specs の X-6 の最初の分割 | **受ける** — AD-064 と 024 を足す (FR-017) |
| 12 | `docs/domains/session/charter.md:356`, `:357`, `:361`, `:363` | X-8 / X-9 の切り出しの記録 | **当たらない** — 記録 |
| 13 | `docs/glossary.md:217` | Concurrency limit の Counterexample「ターン数・費用の上限は X-6」 | **受ける** — §10 |
| 14 | `docs/glossary.md:944`, `:954` | 分岐 (fork) の項 | **当たらない** — X-6 の後続 |
| 15 | `docs/glossary.md:1041` | Session name の Counterexample (起動のときの名前は X-6) | **受ける** — §10 |
| 16 | `docs/glossary.md:1099` | SessionLaunchConfig の「X-6 が扱う」 | **受ける** — §10 |
| 17 | `.specify/memory/constitution.md:57` | 2026-10-03 の項目 21 の件数の記録 | **当たらない** — 時点の記録 |
| 18 | `docs/decisions/0041-…md:135` | (h) の X-6 への指名 (追加ディレクトリのパス入力・上限・名前の軸) | **受ける** — AD-064「読み替える箇所」。accepted の本文は直さない (AD-031) |
| 19 | `docs/decisions/0041-…md:180` | probe の claudePath の判定 | **当たらない** — X-6 の後続 |
| 20 | `docs/decisions/0042-…md:60` | store の形を変える feature (X-6) は schemaVersion を上げる | **受ける** — `presets.json` 版 2 (AD-064 Decision 4・research R-08)。023 では当たらなかった (store に触れない) |
| 21 | `docs/decisions/0042-…md:57`, `:66` | 退避の UI | **当たらない** — X-6 の後続 (spec の「義務の扱い」) |
| 22 | `docs/decisions/0043-…md:76`・`0058-…md:43` | Worker の異常終了の孤児の観測 | **当たらない** — X-6 の後続 |
| 23 | `docs/decisions/0059-…md` (6 行) | resume の切り出し・fork / tag / delete・/clear の後の id | **当たらない** — 記録か X-6 の後続。再開の引き継ぐ 3 軸は変えない |
| 24 | `docs/decisions/0062-…md` (3 行) | 023 の範囲と残り | **当たらない** — 記録。Consequences の「`SessionLaunchConfig` は変わらない」(`:45`。X-6 の綴りの行ではない) は AD-064「読み替える箇所」に挙げた (research R-13) |
| 25 | `tests/rule-fixtures/expected.mjs:791-804` (`ui-path-concat`。4 行) | 追加ディレクトリのパス入力を足す X-6 で強制する | **受ける (当たらないことを記録)** — `howToClose` に 024 の 1 文を足し、`nextFeature` は X-6 のまま (research R-12・FR-016) |
| 26 | `tests/rule-fixtures/expected.mjs:838`, `:841` (`sdk-nonliteral-specifier`) | SDK の呼び出しを増やす X-6 の後続 | **当たらない** — 本 feature は SDK の呼び出しを足さない (`query()` の options だけ) |
| 27 | `tests/rule-fixtures/expected.mjs:870`, `:872`, `:887`, `:889` (項目 18 の 2 つ) | 調停役スレッドの import が増える X-6 | **当たらない** — 調停役スレッドに触れない |
| 28 | `tests/rule-fixtures/expected.mjs:913`, `:915` (`worker-env-via-expression`) | Worker の起こし方が増える X-6 | **当たらない** — Worker を足さない |

(#25〜#28 は 13 行。#26〜#28 には 023 と同じく `howToClose` に 1 文を足さない — 024 で当たる可能性のある変更を含まないため。#25 だけが本 feature の軸を名指す)

### 2') feature ID (`X-6`) — specs/ の 502 行

| # | 出所 | 処理 |
|---|---|---|
| 29 | `specs/024/` (spec) | **当たらない** — 本 feature の成果物 |
| 30 | `specs/021-session-resume/spec.md:255` (「起動設定の上限の軸は X-6 が持つ」) | **受ける** — FR-012 (再開で上限を選び直せる)。021 の文書は直さない |
| 31 | `specs/023-…/spec.md:67`, `:248`・`research.md:92` (起動のときの名前・追加ディレクトリ・上限を X-6 の後続に残した記録) | **受ける** — 本 feature の範囲そのもの |
| 32 | `specs/008-…/spec.md:309`, `:413`・`plan.md:126` (追加ディレクトリ・上限の繰り越し・`ui-path-concat`) | **受ける** — #25 と同じ |
| 33 | `specs/020-…/spec.md:226` (Win32 の起動に起動設定の残りの軸を渡すのは X-6) | **受ける** — Win32 の起動の段にも 4 キーを載せる (data-model §4) |
| 34 | `specs/010-…/spec.md:279` (「上限の設定変更 → X-6」) | **当たらない** — 同時実行数の上限 (Concurrency limit) の話で、本 feature の上限と別物 |
| 35 | `specs/012-…/spec.md:359` (Command palette からのセッションの操作) | **当たらない** — X-6 の後続 (spec の「義務の扱い」) |
| 36 | `specs/012-…/data-model.md:258` (`.bak` の重複抑止) | **当たらない** — X-6 の後続 |
| 37 | `specs/018-…/spec.md:289` (model picker) | **当たらない** — 023 で閉じた |
| 38 | `specs/016-…` / `specs/021-…` の /clear の後の id | **当たらない** — X-6 の後続 |
| 39 | 過去の feature の gate の記録 (`*-reviewer.*.md`・`design-gate.md`・`code-gate.md`・`pr-gate.md`・`analyze*.md`) と残りの spec / plan / research / tasks / quickstart(-results) / data-model | **当たらない** — 指摘の時点の記録。X-6 に送った項目は roadmap の X-6 の行 (#2) に集まっていて、正本はそちら。本 feature の範囲外の項目は spec の「義務の扱い」で X-6 の後続に残した |

### 3) 実名リスト方式のルール

| # | 出所 | 内容 | 処理 |
|---|---|---|---|
| 40 | `scripts/constitution/allowlists.mjs:560-591` (`WSL_FREE_DIRECTORIES`) | `wsl.exe` を名指さないモジュールの実名の列 | **当たらない** — 新しい main / agents のモジュールを足さない。`launch-preparation.ts` は既存の列のまま |
| 41 | `.dependency-cruiser.js:254` (`services-not-to-io`) | 状態を持つ service の実名の列 | **当たらない** — service を足さない。`preset-service` は変えない (版の判定は infra の record / store) |
| 42 | `PROCESS_SPAWN_MODULES` | 子プロセスを起こすモジュール | **当たらない** — プロセスを起こさない |
| 43 | `.specify/spec-gate/reviewers.yml` | reviewer の glob | **当たらない** — `src/renderer/src/features/session/**/*.tsx` などの既存の glob が新しい 2 ファイルを含む |
| 44 | `src/agents/session-core.test.ts:209-234` (`QUERY_OPTION_KEYS` の pin) | 集合を変えるには ADR | **受ける** — 16 にする (AD-064 Decision 1) |

## 実装方針

規則の正本は data-model。ここには 2026-10-29 のソースと突き合わせて決めた置き場所と順序だけを書く。行番号は main 7f6ef94 のもの。

### domain (先に型を広げる)

- `launch-config.ts` の 4 キーは必須にする。tsc が fixture と組み立ての箇所を全部落とすので、それを手がかりに直す (RK-06)。テストの既定は `DEFAULT_EXTRA_AXES` と `sessionName: null` を spread する
- `isValidPresetConfig` と `isValidLaunchConfig` は同じ 9 キーの検査を共有し、後者が `sessionName` を足す形にする (重複させない)
- `resolveLaunchAxes` の追加ディレクトリの段は、今の model / effort の段の後に置く (作業フォルダ・ランタイムの判定の結果を使う)。表のテストは data-model §2.3 の行ごと (SC-002)

### agents

- `decodeLaunchOptions` の 4 キーは `resume` の検査 (`:309-329`) と同じ形で足す。WSL / Win32 の判定は `decodeLaunch` が spec を decode した後に `kind` を渡す
- `buildQueryOptions` の assert は 4 キーそれぞれ 1 つの関数にし、エラーの文言はキーの名前だけ (data-model §5.4)

### main

- `launch-preparation.ts` の WSL と Win32 の 2 つの段で、依存解決の再評価の直後に `directoryResets` の拒否、options の組み立ての直前に `resolveAdditionalDirectories` を置く。options の組み立ては今の 2 箇所 (`:180-185` / `:281-286`) に同じ 4 キーの条件つきの spread を足す (共通の関数にしてよい。名前は tasks)
- `validate.ts` の `checkResumeRequest` は `checkLaunchConfig` を通した後に `sessionName` を見る
- `preset-record.ts` は `toPresetRecord(value, version)` にし、store はファイルの版を渡す。版 1 のファイルを読んだ後の最初の `save` で版 2 になることを store のテストで確かめる

### renderer

- `LaunchDialog.tsx` は入力の文字列 (`maxTurnsInput` / `maxBudgetInput` / `sessionNameInput`) を state に持ち、`launch-extra-axes.ts` の解釈の結果で下書きの数の値と押せない条件を決める。名前は下書きに入れず、起動のときに `toLaunchConfig(resolution, sessionName)` に渡す
- 追加ディレクトリの DTO は今の `useFolderRuntimeResolution` を配列に広げた hook で取り、`unreachable` / `probe-failed` の id を facts の `unreachableFolderIds` に、取得中と `capabilities-not-probed` を起動の保留に使う
- プリセットの保存は `toPresetConfig(config)` を通す。適用は `toLaunchDraft(preset.config)` のまま (名前の入力の state に触れない)
- 再開の形の `initial` の 6 つは、上限の入力の文字列の初期値にも写す (数を文字列にする)
- 入力の文字列 3 つの初期値は、下書きの初期値と同じ時点・同じ元 (`lastConfig` / `resume.initial` / 既定) から 1 回だけ決める。拒否・失敗・「やり直す」で開き直したときに上限が黙って「上限なし」に戻らない (data-model §9.2.1。2026-10-30 design-gate H-003)

### 実装の順

1. domain (`launch-config.ts`・`launch-resolution.ts`・`preset.ts`・`resume.ts`・`agent-session.ts`) と表のテスト (SC-001 / SC-002)
2. agents (`decodeLaunchOptions`・`buildQueryOptions`・`QUERY_OPTION_KEYS` と pin) (SC-003)
3. main の infra (`preset-record.ts` / `preset-store.ts`) (SC-004)
4. main の app (`validate.ts`・`launch-preparation.ts`・`session-launch-service.ts`・`e2e-capability.ts`) (SC-003 / SC-006)
5. renderer (`launch-extra-axes.ts`・`LaunchExtraAxes.tsx`・`LaunchDialog.tsx`・ストアと再開・概要のタブ・文言) (SC-005 / SC-006)
6. E2E (SC-007)
7. 記録 (`expected.mjs` の `howToClose`・glossary・session charter・`_overview.md`・roadmap) (FR-016 / FR-017)
8. 実機 (quickstart V-0〜V-6)。行えなければ「未実施」と書いてマージする (spec の「合否の扱い」)

## 機械強制の変更

- **固定テスト**: `QUERY_OPTION_KEYS` 16 (`session-core.test.ts`)、`LAUNCH_CONFIG_KEYS` 10 と `PRESET_CONFIG_KEYS` 9 の並び (`launch-config.test.ts`)、`PRESET_SCHEMA_VERSION` 2
- **往復**: main の述語を通った起動設定の値が agents の decoder を通り、範囲外・形の外・WSL の起動の Windows のパス・名前の制御文字が main と agents のどちらでも拒否される (SC-001 / SC-003)
- **単体**: data-model §1.2 (述語の境界の表)・§2.3 (依存解決の表)・§4.2 (変換の表。WSL / Win32 / 未登録 / 届かない / 名前空間の不一致)・§6.1 (版の表)・§8 (registry の名前)・§9.2 (入力の解釈の表)
- **component**: 起動ダイアログの 3 つの軸・押せない形と文言・通知・再開の形 (SC-005)。概要のタブの 3 行 (SC-006)。vitest-axe の違反 0
- **E2E**: 偽の capability で 3 つの軸を選んで起動し、稼働中の行と概要のタブ・プリセットの往復を確かめる (SC-007)
- **Constitution 検証 / lint**: 変わる規則は無い (実名の列に足すものが無い)。rule fixture は `ui-path-concat` の `howToClose` の文だけ

## ADR

- **AD-064 を起こした (accepted。2026-10-29 夜間の規則で推奨案を採用)。** `QUERY_OPTION_KEYS` 12 → 16 (Decision 1)・`additionalDirectories` の条件 (Decision 2)・`SessionLaunchConfig` 10 キー (Decision 3)・`presets.json` 版 2 (Decision 4)・再開と名前 (Decision 5) を 1 つにまとめた。理由: どれも「起動設定の軸を足す」1 つの判断で、軸ごとに分けると `SessionLaunchConfig` と版の変更が ADR をまたぐ
- 読み替えは AD-041 (g) / (h)・AD-041 の 6 軸・AD-059 の再開の要求の形・AD-062 Consequences・AD-042 Decision 4。どれも accepted の本文は直さない (AD-031)
- 利用者が後で覆したときの範囲は RK-01。session charter への記録は完了の PR で行う (FR-017)

## Risks / 未確定

| ID | リスク | 手当て |
|---|---|---|
| RK-01 | 夜間の規則で採用した U-1〜U-9・P-1〜P-11・AD-064 を利用者が後で覆す | 覆ったときの範囲: U-2 / AD-064 Decision 2 (追加ディレクトリ) → data-model §2 の段・§4.2・§5.2・`QUERY_OPTION_KEYS` を 15 に。U-7 (版 2) → §6 だけ。R-03 (名前を config に) → §1 の `sessionName` と §3 / §7 / §8 を別の欄に。design-gate の結果を捨てて `/cl-design --from plan` から回し直す |
| RK-02 | 追加ディレクトリの中の読み取りでも承認カードが出る・逆に書き込みが承認なしで通る・追加ディレクトリの hooks / `.mcp.json` が読み込まれる (research R-02a と違う) | 前者は契約を変えない (V-1 の 2 で記録)。後の 2 つは Principle III に当たるので利用者に返し、`additionalDirectories` を外す (RK-01 の範囲)。skills の読み込みは契約どおり (spec U-10。V-1 の 8 / 9 で記録) |
| RK-03 | `maxTurns` / `maxBudgetUsd` がプロンプトごとに数えられ、セッションを通した上限にならない・再開で前の費用を含む | 表示は「上限」とだけ言い数え方を約束しない (spec Assumptions)。V-2 / V-4 / V-5 で記録し、数え方の注記を足すかを利用者に返す |
| RK-04 | `title` が `system/init` の前に効かない・過去の一覧に出ない (023 RK-06 と同じ) | registry の名前は起動の値で出る (§8)。過去の一覧に出なければ V-3 の 2 で記録し利用者に返す |
| RK-05 | 日本語・空白を含むパスの `--add-dir` が `wsl.exe --exec` で割れる | cwd の `--cd` と同じ経路で実績がある (research R-01)。V-1 の 5 で確かめ、割れたら利用者に返す |
| RK-06 | 4 キーを必須にしたため、テストの fixture の起動設定の書き換えが多い | tsc が全部を落とすので漏れない。既定は `DEFAULT_EXTRA_AXES` の spread で 1 行にする。振る舞いを変えない書き換えは同じ節の task にまとめる |
| RK-07 | 版 2 の `presets.json` を前の版のアプリが読むと退避される (ダウングレード) | 今の規則 (`schema-version-unknown` と退避) で黙って欠けない。退避の UI は X-6 の後続 |

## Project Structure

### Documentation (this feature)

```text
specs/024-session-launch-axes/
├── spec.md                       # status を planning に
├── plan.md                       # 本ファイル
├── research.md                   # Phase 0 (R-01〜R-14)
├── data-model.md                 # Phase 1 (§0〜§10。規則の正本)
├── contracts/
│   └── launch-config-v2.md       # Phase 1 (C-1〜C-7)
├── quickstart.md                 # Phase 1 (V-0〜V-6)
└── tasks.md                      # Phase 2 (/cl-tasks)
docs/decisions/0064-launch-config-additional-directories-limits-and-title.md   # accepted (2026-10-29)
```

### Source Code (repository root)

```text
src/domain/session/{launch-config.ts, launch-resolution.ts, preset.ts, resume.ts, agent-session.ts}
src/agents/{session-core.ts, sdk-agent-session.ts}
src/main/app/{validate.ts, launch-preparation.ts, session-launch-service.ts, e2e-capability.ts}
src/main/infra/settings/{preset-record.ts, preset-store.ts}
src/renderer/src/features/session/
├── LaunchExtraAxes.tsx       # 新設
├── launch-extra-axes.ts      # 新設
├── LaunchDialog.tsx / labels.ts / resume-action.ts
└── running-session-types.ts / running-session-store.ts
src/renderer/src/features/shell/OverviewTab.tsx
tests/rule-fixtures/expected.mjs
docs/glossary.md / docs/domains/session/charter.md / docs/domains/_overview.md / docs/roadmap.md
```

**Structure Decision**: 既存のレイヤ (domain / agents / main / renderer) に置く。新しいディレクトリは作らない。新設は renderer の 2 ファイルだけで、main と agents のモジュールは増えない (実名の列に足すものが無い)。

## 設計後の見直し (Constitution Check の再確認)

- Phase 1 の成果物をソースと SDK と突き合わせて、spec との食い違いが 2 つ見つかり、spec を直した:
  1. **Assumptions の 3 つ目と Edge Cases の名前の日本語**: `title` は CLI の引数ではなく、stdin の初期化の control request で届く (`sdk.mjs:221`)。argv を通るのは `--add-dir` / `--max-turns` / `--max-budget-usd` (`sdk.mjs:121`)。前提を「名前は argv を通らない・日本語と空白を含む追加ディレクトリのパスが argv を通る」に直した (research R-01)
  2. **「判断の一覧」の ADR の行の「AD-059 の「6 軸の形は変えない」」**: AD-059 の本文に無い。出所は glossary の SessionLaunchConfig (`:1100`) と `resume.ts:16` のコメントで、出所の記述を直した (research R-13)
- spec が plan に預けた 2 点は次のとおり決めた:
  - 名前は `SessionLaunchConfig` に入れ、プリセットは名前を除いた型を持つ (research R-03)
  - `ui-path-concat` の `nextFeature` は X-6 のまま (X-6 の後続の退避ファイルの UI。research R-12)
- Principle III (追加ディレクトリの 2 つの条件)・VIII (名前は argv を通らない)・X (名前を永続化しない) の判断を上の Check に書いた
- 違反は 0 件。Complexity Tracking は空

## Complexity Tracking

なし
