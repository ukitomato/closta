# convention-reviewer Review: 計量と制限の表示 (O-4)

**Run**: 2026-10-09T00:00:00+09:00
**Reviewer**: convention-reviewer
**Spec**: specs/014-ui-metering-and-limits/spec.md
**Gate**: code-gate iteration 1

## 初回読了 viewpoint

- FR/SC: この PR は FR-001〜FR-019 をすべて実装している。F の観点で関わるのは FR-015 (固定テスト)、FR-016 (glossary / Provider の表記)、FR-017 (タブのテストの分割)、FR-018 (ストアと行の切り出し)、FR-019 (`focus-handoff.ts` の新設)、SC-002 (通しのテスト `tests/meter/meter-through.test.tsx`)、SC-005 / SC-006 / SC-007
- touched files に該当する charter / Confirmation: ui charter (Related Specs O-4・面の状態)、session charter (U-1)、AD-047 の Confirmation (SC-001 / SC-002 / SC-006 と状態通知の全フィールドの走査)、AD-045 Decision 2 (文言は `labels.ts`)、AD-023 のレイヤ (eslint boundaries / depcruise)、Constitution XIII の Manual (convention-reviewer)、Constitution XIV / XV の Code identifiers
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当。この reviewer は命名・配置・lint hookup だけを見る
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当 (glossary の用語と識別子の対応は CONV-6 として F の L-004 に入れた)
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当。lint-agent の check:constitution は exit 0 (ok 20 / pending 1)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:2 Low:6
- G. optional reviewer 範囲: 該当なし: a11y / ux / ui-coverage / database の判断は各 optional reviewer の担当。reviewers.yml の発火条件のつなぎ込みだけは F で見た (L-005)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1。F の指摘を検出できる自動検査は無い (500 行超・未使用の export・tests/ の型検査漏れは、どの検出器も見ていない)。FR-018 の切り出しの回帰の根拠は L-007 に書いた。既存のテストの diff は 3 本を確かめ、追加だけだった (running-session-store.test.ts・RunningSessionList.test.tsx・RunningSessionList.monitor.test.tsx。monitor は既存のテスト 1 本の改題を含む)

## スコープ要約

- diff は 44ce810..HEAD で、scope は 88 ファイル (コード 77・md 10・yml 1)
- 新設のモジュール
  - domain: `meter.ts`
  - agents: `live-signals.ts`・`meter-throttle.ts`
  - renderer: `running-session-monitor.ts`・`RunningSessionRow.tsx`・`focus-handoff.ts`・`useSessionMeters.ts`・`quota-banner.ts`・`CenterBanners.tsx`・`ContextCostMeter.tsx`・`UsageTab.tsx`・`thinking-indicator.tsx` (registry)・`test-support/app-shell-harness.tsx`
  - tests: `tests/meter/meter-through.test.tsx`
- 規則の変更: `eslint.config.mjs` に `tool-result-marks.tsx` を足した。`reviewers.yml` には `meter*.ts` と `thinking-indicator.tsx` の除外を足した
- 命名は既存の規則に揃っている。モジュールは kebab-case、コンポーネントは PascalCase、hook は `useX.ts`、側面別のテストは `X.aspect.test.tsx`
- import の順 (外部 → `@domain` → `@/` → 相対) も揃っている
- 循環依存は lint-agent の depcruise が `no-circular` を確かめて 0 件。この設定は `tsPreCompilationDeps: true` で型だけの import も見ているので、Bash で madge は走らせていない
- lint-agent の JSON は 5 本すべて `exit_code: 0`、`violations: []` なので、lint の指摘は 0 件

## Findings

### [Medium] 新しい通しのテスト `tests/meter/meter-through.test.tsx` がどの型検査にも入っていない。tests/ の置き場の規則も古いまま (M-001) (scope: feature)

- **観察**:
  - `tsconfig.web.json:3-10` の `include` は `tests/setup/**/*` だけで、`tsconfig.node.json:3-11` も `tests/setup/**/*.ts` だけ。`package.json:12-14` の typecheck は、この 2 つの project しか見ない
  - CI (`.github/workflows/verify.yml:66-67,149-155`) が追加で型検査するのは `e2e/` と `perf/` だけで、`tests/` 用の tsconfig は無い
  - vitest は esbuild で変換するだけで型を見ない。このため、SC-002 の計測経路である通しのテストの型の崩れはどこでも落ちない
  - `quickstart-results.md:10` は「型検査 3 本とも 0 件」と書き、`:16` は通しのテスト 3 件を合格に数えている。読み手には、型検査がこのファイルも見たように読める
  - 置き場の規則も古い。`vitest.config.ts:13-14` は「`tests/` 直下はルール検証用の違反サンプル置き場であり、通常のテストとは別物」、`docs/discovery.md:372` は「`tests/` にあるのは基盤の検証と違反サンプルだけ」と書いている。この PR は feature 単位で層をまたぐテストをここに足した。boundaries が ui → agents を禁じるので src の下に置けない、という理由は妥当で、plan で決まっている
- **同種事象探索**: Glob `tests/**/*.{ts,tsx}` で 12 件。型検査の外は `tests/meter/meter-through.test.tsx`・`tests/ui-coverage/{coverage,item21}.test.ts`・`tests/docs/*.test.ts` (3 件)・`tests/spec-artifacts/*.test.ts` (2 件)。このうち .tsx で、renderer と agents の両方を import するのは meter-through の 1 件だけ
- **リスク/影響**: `createLiveSignals` の deps・`Harness`・文言の関数などの型が変わっても通しのテストは型では落ちず、SC-002 の根拠が気づかないうちに古くなりうる。もう一つは、tests/ に何を置いてよいかの規則が事実と食い違っていること
- **推奨アクション**:
  1. `tests/tsconfig.json` を新設する (`e2e/` と `perf/` と同じ形。`@/*` と `@domain/*` の paths、jsx、vitest の型)。`docs/discovery.md` の Build / Test / Lint の表と verify.yml に `tsc --noEmit -p tests/tsconfig.json` を足し、lint-agent の typecheck にも入れる
  2. `vitest.config.ts:13-14` と `docs/discovery.md:372` を、「層をまたぐ通しのテストは tests/ に置く (boundaries の外)」に直す
- **根拠**: docs/discovery.md の "Build / Test / Lint" (agent 用の列が検証の正本)、014 spec SC-002、CONV-1 / CONV-3
- **scope 根拠**: 新しいファイルはこの PR の touched files。tsconfig と discovery は touched の外だが、直すのはこの PR が足したファイルの検査漏れ

### [Medium] 切り出した直後に 588 行だった `running-session-store.ts` が 670 行になり、切り出し前の 650 行を超えた。`session/labels.ts` もこの PR で 500 行を超えた (M-002) (scope: feature)

- **観察**:
  - `running-session-store.ts` (`src/renderer/src/features/session/running-session-store.ts`) は今 670 行。FR-018 の切り出しの直後は 588 行で (`tasks.md:31`、`docs/roadmap.md:275-276`)、base は 650 行だった。差分の最後の hunk は `@@ -636,7 +656,7 @@` で、base より +20 行
  - 増えた分の大半は `meters` を扱う純関数の `withToolElapsed` (`:147`)・`applyMeter` (`:163`)・`clearThinkingOnAssistant` (`:193`) で、計 57 行ほど
  - roadmap の system-scope の項目 (`docs/roadmap.md:248-276`) は、切り出しの理由を「ファイルの大きさと型の依存の向き」(:255-256) としている。それでも「O-4 が持った」として閉じ、行数は切り出した直後の値しか書いていない
  - `src/renderer/src/features/session/labels.ts` は 486 行から 535 行になり、この PR で 500 行を超えた (最後の hunk は `@@ -310,7 +359,7 @@`)
- **同種事象探索**: Grep `^` (行数) を src の非テストのファイルに掛け、touched のうち 500 行を超えるものは 5 件
  - `running-session-store.ts:670` (650 → 670)
  - `session/labels.ts:535` (486 → 535。この PR で超えた)
  - `src/agents/sdk-agent-session.ts:664` (612 → 664。もともと超えていた)
  - `thread.aui.tsx:1317` と `tool-fallback.aui.tsx:781` (scaffold。もともと超えていた)
- **リスク/影響**: FR-018 で切り出した分を、同じ PR の追加が打ち消した。roadmap は大きさの問題を閉じたように読め、次に store を触る feature に申し送られない
- **推奨アクション**:
  1. 上の 3 つの純関数を `running-session-meters.ts` (`running-session-monitor.ts` と同じ構え) に出し、store は `applyMeter` を呼ぶだけにする
  2. `docs/roadmap.md:275-276` に完了の時点の行数 (store 670 または切り出した後の値、labels 535) を書き足す
  3. `session/labels.ts` は、起動ダイアログの節 (`/* ── 起動設定ダイアログ` 以降) を `launch-labels.ts` に分けるか、500 行超を roadmap に記録する
- **根拠**: CONV-3 (1 ファイル 500 行超は warning)、014 spec FR-018、roadmap の system-scope の記録
- **scope 根拠**: どちらのファイルもこの PR の touched files

### [Low] 外から参照されない export がある。テストは境界値を定数でなく数で直書きしている (L-001) (scope: feature)

- **観察**:
  - `src/domain/session/meter.ts` の 6 つ (`:68` `METER_UPDATE_TYPES`・`:76` `MeterUpdateType`・`:117` `MAX_METER_COST_USD`・`:119` `MAX_METER_CONTEXT_WINDOW`・`:121` `MIN_RESETS_AT_SEC`・`:122` `MAX_RESETS_AT_SEC`) は export されているが、テストを含めて meter.ts の外からの参照が 0 件
  - `src/renderer/src/features/session/running-session-types.ts:27` の `SESSION_ROW_STATUSES` も、使っているのは `:39` の型の導出だけ
  - `meter.test.ts:66` (`toCostUsd(1e6)`) と `:75` (`toContextWindow(1e8)`) は、境界値を定数を import せずに数で書いている
- **同種事象探索**: Grep で上の名前を src と tests に掛け (meter.ts を除く)、0 件。`SESSION_ROW_STATUSES` は running-session-types.ts の中の 2 件だけ
- **リスク/影響**: 定数を変えても境界のテストが追随しない。未使用の export を見る検出器は無い。`@typescript-eslint/no-unused-vars` は局所変数しか見ず、depcruise の `no-orphans` はモジュール単位でしか見ない (もとからの穴)
- **推奨アクション**: meter.test.ts で定数を import して境界値を書く (`MAX_METER_COST_USD`・`MAX_METER_CONTEXT_WINDOW`・`MIN_RESETS_AT_SEC`/`MAX_RESETS_AT_SEC`)。それでも使われない `METER_UPDATE_TYPES` / `MeterUpdateType` / `SESSION_ROW_STATUSES` は `export` を外す
- **根拠**: CONV-5
- **scope 根拠**: 新設のファイル

### [Low] 計量の型の import 元が 3 つあり、利用側が混ぜている。純関数のモジュールが hook のモジュールから型を取っている (L-002) (scope: feature)

- **観察**:
  - `SessionMeters` / `TurnMeter` / `RateLimitMeter` の import 元が 3 つある。正本は `running-session-types.ts`、再 export が `useSessionMeters.ts:6` (3 つとも) と `running-session-store.ts:31-37` (`SessionMeters`)
  - 同じファイルで出所を混ぜている。`UsageTab.test.tsx:8-9`・`ContextCostMeter.test.tsx:9-10`・`CenterBanners.test.tsx:20-21` は、`EMPTY_SESSION_METERS` を `running-session-types` から、`TurnMeter` / `RateLimitMeter` を `useSessionMeters` から取っている
  - 純関数の `quota-banner.ts:1` が hook のモジュール (`useSessionMeters`) から型を取っている
- **同種事象探索**: Grep `import .*\b(SessionMeters|TurnMeter|RateLimitMeter)\b` で 9 件 (`CenterBanners.tsx:9`・`UsageTab.tsx:5`・`quota-banner.ts:1`・テスト 5・`running-session-store.ts:24`)
- **リスク/影響**: 型の置き場を「ストアと導出の両方が読む型はここ」とした `running-session-types.ts` の冒頭の規則が崩れ、次に足す型の置き場の判断がぶれる
- **推奨アクション**: 型は `running-session-types.ts` から import し、`useSessionMeters.ts:6` の再 export を外す (store 側の再 export は既存のテストのためなので残してよい)
- **根拠**: CONV-3 / CONV-4
- **scope 根拠**: 新設と touched のファイルだけ

### [Low] 数の書式が文言の表 2 か所に重複している (L-003) (scope: feature)

- **観察**: `src/renderer/src/features/chat/labels.ts:14` と `src/renderer/src/features/shell/labels.ts:172` に、同じ `new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })` がある (shell は `formatCount` (:174) として公開している)
- **同種事象探索**: Grep `new Intl.NumberFormat\('ja-JP'` を src/renderer/src に掛け、3 件。2 件が重複で、残る 1 件は費用の書式 (shell/labels.ts:162)
- **リスク/影響**: transcript (task の進み具合・思考) と使用量のタブで、桁の書式が別々に変わりうる
- **推奨アクション**: `@/lib/` に `formatCount` を 1 つ置き、両方から使う。chat → shell の import は shell/labels → session/labels → chat/labels の循環になるので避ける
- **根拠**: CONV-5
- **scope 根拠**: どちらも touched

### [Low] glossary の英語名と識別子が合っていない。「プロバイダ」の書き残しが 2 件ある (L-004) (scope: feature)

- **観察**:
  - `docs/glossary.md:1068` の canonical な英語名は「Unsafe permission mode banner」だが、コードは `UnsafeModeBanner` (`CenterBanners.tsx:58,78`)・`UNSAFE_MODE_BANNER_LABELS` (`shell/labels.ts:151`)・`data-testid="unsafe-mode-banner"` (`CenterBanners.tsx:89`) で、Permission が落ちている
  - この PR は `useProviders.ts:153` のコメントの「プロバイダ画面」を「Provider の画面」に直した。一方で同じ語が `src/domain/provider/dto.ts:15` と `src/main/app/provider-service.ts:66` に残っている。glossary (`:1124`) は「O-4 で UI の文言と docs を英字に揃える」と書いている
- **同種事象探索**:
  - Grep `Unsafe permission mode banner|unsafe-mode-banner|function UnsafeModeBanner` で、glossary 2 件・コード 3 か所 (+テスト 8)
  - Grep `プロバイダ` を src・e2e・tests に掛け、5 件。Closta の Provider を指すのは dto.ts:15 と provider-service.ts:66 の 2 件。`secret-scan` の「既知プロバイダ」は外部サービスの意味なので別
- **リスク/影響**: Principle XIV の「code / spec / UI で一貫使用」。glossary から識別子を Grep で引けない
- **推奨アクション**: glossary の項目に「識別子: `UnsafeModeBanner`」の 1 行を足すか、識別子を `UnsafePermissionModeBanner` にする。残る 2 件のコメントを「Provider の画面」に直す (touched の外なので、直さないなら roadmap の Provider の項目に残す)
- **根拠**: Constitution XIV、CONV-6
- **scope 根拠**: glossary は touched。dto.ts と provider-service.ts は touched の外 (system)

### [Low] `tool-fallback.aui.tsx` は手を入れた element なのに、eslint の厳しさを戻す一覧に入っていない (L-005) (scope: feature)

- **観察**:
  - `src/renderer/src/components/assistant-ui/elements/tool-fallback.aui.tsx` は closta が手を入れた element である。手書きの印は `:675` と `:719`、O-4 も `:689` と `:723-724` に手を入れた
  - `reviewers.yml:62,115` は、これを a11y / ux の手書きの element として発火の対象にしている
  - 一方 `eslint.config.mjs:557-621` の、厳しさを戻すどの block にも入っておらず、`GENERATED_FILES` の緩和 (`react-hooks/exhaustive-deps`・`react-hooks/refs`・`no-empty` が off) のままである
  - `eslint.config.mjs:542-547` は「生成物ディレクトリに置いた手書きコードは緩和対象にしない」と定めている。O-3 は手を入れた `conversation-search.tsx` / `command-palette.tsx` を同じ PR で一覧に足している (:606-620)
- **同種事象探索**: Glob `src/renderer/src/components/assistant-ui/elements/*` のうち、reviewers.yml で手書きとし、かつ eslint の戻しの一覧に無いものは 2 件。`tool-fallback.aui.tsx` と `surfaces.tsx` (この PR では変えていない)
- **リスク/影響**: O-4 の変更は props を渡すだけで hooks を足していないので、今の害は無い。ただ、次にこのファイルに手書きの hooks が入ったとき、依存配列の番人が効かない
- **推奨アクション**: `tool-result-marks.tsx` と同じ hooks だけを戻す block (`eslint.config.mjs:564-567`) に足し、ESLint が 0 件のままか確かめる。上流のコードで落ちるなら、除いた理由を block のコメントに書く
- **根拠**: eslint.config.mjs:542-547 の方針、CONV-1 の lint hookup、plan「機械強制の変更」
- **scope 根拠**: tool-fallback.aui.tsx も eslint.config.mjs もこの PR の touched

### [Low] Principle XIII の照合: tool の経過時間を自作する前の候補に `useToolCallElapsed` / `ToolFallbackDuration` が記録されていない (L-006) (scope: feature)

- **観察**:
  - `ToolResultMarks` (`tool-result-marks.tsx:46-60`) が経過時間を自作の `useLiveToolElapsed` (`transcript-context.ts:56`) で出している
  - assistant-ui には `useToolCallElapsed()` (`part.timing` を読み、毎秒更新。`.claude/skills/tools/references/tool-ui.md:218`) があり、registry の ToolFallback は `ToolFallbackDuration` (`tool-fallback.aui.tsx:109-128`、描くのは `:174`) でそれを出している
  - research R-09 の候補の表 (`research.md:101-108`) と、対応表の F 節に、この 2 つが無い
  - 今は src のどこも `timing` を設定していないので、`ToolFallbackDuration` は何も描かず、二重の表示にはなっていない
- **同種事象探索**: Grep `useToolCallElapsed|ToolFallbackDuration` を specs と docs に掛け、0 件。Grep `timing` を src に掛け、0 件
- **リスク/影響**: XIII の Manual (自作するときに、照合した候補名と合わない理由を記録する) を満たさない。将来 `part.timing` を入れる feature があると、ToolFallback のヘッダに書式の違う経過時間が 2 つ並ぶ (`4.2s` と `4秒`。`:174` と `:722-727`)
- **推奨アクション**: R-09 と PR の説明に、候補 `useToolCallElapsed` / `ToolFallbackDuration` と合わない理由 (例: part に timing を書くと `sessions` の参照が変わって Thread を描き直し、data-model §2 に反する。SDK の経過時間は `tool_progress` で届く) を書く
- **根拠**: Constitution XIII の Verification Manual (convention-reviewer / ux-reviewer)
- **scope 根拠**: 新しく自作した表示は、この PR の touched files にある

### [Low] FR-018 の切り出しを別のコミットにする手当て (plan RK-11) が履歴に無い (L-007) (scope: feature)

- **観察**:
  - plan RK-11 は「切り出しを最初の別のコミットにし、既存のテストを書き換えずに通す」とした
  - ところが `quickstart-results.md:27` は SH-014 (最後の task) の時点で「変更はまだコミットしていない」と書いており、実装は 1 つの commit (922f6cc) に入っている
  - 「書き換えずに通った」の根拠は、`tasks.md:31` と `docs/roadmap.md:274-275` の自己申告だけになる
  - 合わせて読んだ diff では、既存のテストの変更は追加だけだった (`running-session-store.test.ts:650-` は追加のみ、`RunningSessionList.test.tsx` は import 1 つと新しい describe)。`RunningSessionList.monitor.test.tsx:271` は既存のテストの改題 (「同じ状態通知のバッチの 2 本は 1 つの文」→「理由が無い失敗は理由を添えない」) と追加で、FE-011 によるもの
- **同種事象探索**: 既存のテスト 3 本の diff を読み、本体の書き換えは 0 件 (改題が 1 件)
- **リスク/影響**: pr-gate や後から読む人が、切り出し単体で振る舞いが変わらないことを、commit の単位で確かめられない
- **推奨アクション**: PR の説明に「切り出しは別のコミットにしていない。根拠は diff の上で既存のテストが追加だけであること」と書く。commit を分け直せるなら、切り出しだけの commit を先頭に置く
- **根拠**: 014 plan RK-11、spec SC-007
- **scope 根拠**: この PR の記録

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | Glob `tests/**/*.{ts,tsx}` × tsconfig の include | 12 (型検査の外は 7。.tsx で層をまたぐのは 1) | tests/meter/meter-through.test.tsx / tests/ui-coverage/*.test.ts / tests/docs/*.test.ts / tests/spec-artifacts/*.test.ts |
| M-002 | Grep `^` (行数) を src の非テストに | touched のうち 500 行超は 5 | running-session-store.ts:670 / session/labels.ts:535 / sdk-agent-session.ts:664 / thread.aui.tsx:1317 / tool-fallback.aui.tsx:781 |
| L-001 | Grep `METER_UPDATE_TYPES\|MeterUpdateType\|MAX_METER_COST_USD\|MAX_METER_CONTEXT_WINDOW\|MIN_RESETS_AT_SEC\|MAX_RESETS_AT_SEC\|SESSION_ROW_STATUSES` (定義したファイルの外) | 0 | meter.ts:68,76,117,119,121,122 / running-session-types.ts:27 |
| L-002 | Grep `import .*\b(SessionMeters\|TurnMeter\|RateLimitMeter)\b` | 9 | useSessionMeters.ts:6 / quota-banner.ts:1 / CenterBanners.tsx:9 / UsageTab.tsx:5 / テスト 5 |
| L-003 | Grep `new Intl.NumberFormat\('ja-JP'` | 3 (重複 2) | chat/labels.ts:14 / shell/labels.ts:172 |
| L-004 | Grep `Unsafe permission mode banner\|unsafe-mode-banner` / `プロバイダ` | 2 + 3 / 2 (該当分) | glossary.md:1068 / CenterBanners.tsx:58,78,89 / domain/provider/dto.ts:15 / main/app/provider-service.ts:66 |
| L-005 | reviewers.yml の手書き × eslint の戻しの一覧 | 2 | tool-fallback.aui.tsx / surfaces.tsx |
| L-006 | Grep `useToolCallElapsed\|ToolFallbackDuration` を specs と docs に / `timing` を src に | 0 / 0 | tool-fallback.aui.tsx:109-128,174 |
| L-007 | 既存のテスト 3 本の diff の本体の書き換え | 0 (改題 1) | RunningSessionList.monitor.test.tsx:271 |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 7

<details>
<summary>lint-agent の出力 (CONV-1 の入力)</summary>

lint-agent の JSON は `specs/014-ui-metering-and-limits/lint-agent.code-gate.md` に保存済み (invoker が渡した JSON と同一)。

lint の結果の読み方 (CONV-1):

- 5 本とも `exit_code: 0` で `violations: []`。Critical になるコマンドは無く、lint の指摘は 0 件
- 抑止済みの 1 件 (`thread.aui.tsx:365` の `eslint-disable-next-line react-hooks/incompatible-library`) は、この PR の diff に無い (Grep で diff に 0 件)。R-3 の頃からあり、理由は直前のコメント (`:363-364`) に書いてある。`-- 理由` の形 (`components/file.tsx:166`) ではないが、指摘には数えていない
- typecheck の 2 本は `tests/meter/meter-through.test.tsx` を見ていない (M-001)

</details>
