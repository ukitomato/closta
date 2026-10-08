# convention-reviewer Review: 計量と制限の表示 (O-4)

**Run**: 2026-10-09
**Reviewer**: convention-reviewer
**Spec**: specs/014-ui-metering-and-limits/spec.md
**Round**: 2 (code-gate の iteration 2。status `reviewing` からの再実行。pr-gate R1 の修正コミット 8aed1db の後)

## 初回読了 viewpoint

- FR/SC: この PR は FR-001〜FR-019 をすべて実装している。F の観点で関わるのは次のとおり
  - FR-015 (固定テスト)
  - FR-016 (glossary / Provider の表記)
  - FR-017 (タブのテストの分割)
  - FR-018 (ストアと行の切り出し)
  - FR-019 (`focus-handoff.ts` の新設)
  - SC-002 (通しのテスト `tests/meter/meter-through.test.tsx`)・SC-005・SC-006・SC-007
  - 8aed1db が触ったのは US-4 AC4 (思考の印) と US-4 AC1a / US-2 AC2 (警告の帯・Quota banner) の見た目だけ
- touched files に該当する charter / Confirmation:
  - ui charter: Related Specs の O-4、業務ルール「独自のカラートークンを増やさない」、KPI「自作率」(計測経路が convention-reviewer)
  - AD-047 の Confirmation (SC-001 / SC-002 / SC-006)。8aed1db は AD-047 の訂正節に 1 行足した (:89)
  - AD-045 Decision 2 (文言は `labels.ts`)。8aed1db が足した日本語はコメントの行とテストだけなので、基線の数は変わらない
  - Constitution XIII の Manual (convention-reviewer)、XIV、XV の Code identifiers
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当。この reviewer は命名・配置・lint hookup だけを見る
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当 (glossary の語と識別子の対応は CONV-6 として F の L-004 に入れた)
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当。8aed1db の AD-047:89 (訂正節への追記) の妥当性も同 reviewer の担当。lint-agent の check:constitution は exit 0 (ok 20 / pending 1)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:2 Low:7
- G. optional reviewer 範囲: 該当なし: コントラストの値 (pr-gate H-001 / H-002) は a11y-reviewer の担当。この reviewer は、同じ役割の class の文字列が複製されていることだけを F で見た (L-008)
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1
  - F の指摘を検出できる自動の検査は、iter 1 から変わらず無い。500 行超・未使用の export・tests/ の型検査漏れ・class の文字列の複製は、どの検出器も見ていない
  - 8aed1db の H-001 の修正には class のテストがある (`LivePane.progress.test.tsx:295-305`)。vendored の値の span から `tabular-nums` が消えたら `:304` が落ちるので、子孫の選択子の依存先も固定されている
  - H-002 の修正 (`CenterBanners.tsx:91,158`) には回帰のテストが無い (`CenterBanners.test.tsx` の `toHaveClass` は 0 件)。テストの要否の判断は a11y の担当なので、件数には数えていない
  - FR-018 の切り出しの回帰の根拠は L-007 に書いた

## スコープ要約

- 素材
  - diff は 44ce810..HEAD
  - scope は `.code-gate-scope.txt` の 88 ファイルで、iter 1 と同じ集合
  - diff に入っている dc9ef2e (`.claude/` / `.mcp.json` / `.serena/` / `.codegraph/`) と spec dir の設計文書は scope の外。dc9ef2e の扱いは pr-gate M-001 の持ち物
- iter 1 から変わったのは 8aed1db だけで、触ったのは 4 ファイル (implementer の `pr-gate.md.round1.implementer.json` と一致)
  - `thread.aui.tsx` (`LiveThinkingIndicator` の className と JSDoc の 2 行)
  - `LivePane.progress.test.tsx` (テスト 1 本)
  - `CenterBanners.tsx` (文字色 2 か所と JSDoc の表の 1 行)
  - `docs/decisions/0047-…md:89`
- 8aed1db の命名・配置・import は既存の規約に揃っている
  - import は足していない
  - `thread.aui.tsx` は上流の書式 (double quote・semicolon) のまま
  - テスト名に gate の ID を添える形は既存の 23 ファイル・45 件と同じ
  - vendored の `thinking-indicator.tsx` は触っていないので、reviewers.yml の `exclude_patterns` (`:87,134`) と research R-09:117 の「手を入れないなら除外」は崩れていない
- 循環依存: lint-agent の depcruise が `no-circular` を含めて exit 0。8aed1db は import を足していないので、Bash で madge は走らせていない
- lint-agent の JSON: 5 本 (`lint` / `typecheck` ×2 / `depcruise` / `check:constitution`) すべて `exit_code: 0`、`violations: []`
  - 非ゼロのコマンドは無いので Critical は 0
  - lint の指摘も 0 件
- iter 1 の自分の指摘 9 件は、どれも CONSIDER で auto-fix の対象外だった (code-gate.md:38-50)
  - HEAD で 1 件ずつ確かめ直し、9 件とも残っている
  - 行番号は 8aed1db でずれた分を直した
  - 新規は 1 件 (L-008。8aed1db が生んだ食い違い)

## Findings

### [Medium] 新しい通しのテスト `tests/meter/meter-through.test.tsx` がどの型検査にも入っていない。tests/ の置き場の規則も古いまま (M-001) (scope: feature)

- **観察**:
  - 型検査の対象から外れている
    - `tsconfig.web.json:3-10` の `include` は `tests/setup/**/*` だけで、`tsconfig.node.json:3-11` も `tests/setup/**/*.ts` だけ
    - `docs/discovery.md:144` の型検査はこの 2 project だけを見る。lint-agent の typecheck の 2 本も同じ
    - CI で追加の型検査があるのは `e2e/` と `perf/` だけ (`discovery.md:149,151`)
  - vitest は型を見ずに変換するので、SC-002 の計測経路の型の崩れはどこでも落ちない
  - 置き場の規則も古い
    - `vitest.config.ts:13-14`: 「`tests/` 直下はルール検証用の違反サンプル置き場であり、通常のテストとは別物」
    - `docs/discovery.md:372`: 「`tests/` にあるのは基盤の検証と違反サンプルだけ」
    - この PR は feature の層をまたぐテストを tests/ に足した。src に置けない理由 (boundaries が ui → agents を禁じる) は research R-14 で決まっている
  - HEAD でも変わっていない
- **同種事象探索**: Glob `tests/**/*.{ts,tsx}` を tsconfig の include と突き合わせた
  - 型検査の外は 7 件: `tests/meter/meter-through.test.tsx`・`tests/ui-coverage/{coverage,item21}.test.ts`・`tests/docs/*.test.ts` (3)・`tests/spec-artifacts/*.test.ts` (2)
  - そのうち .tsx で、renderer と agents の両方を import するのは meter-through の 1 件だけ
- **リスク/影響**: `createLiveSignals` の deps・`Harness`・文言の関数の型が変わっても、通しのテストは型では落ちない。SC-002 の根拠が気づかないうちに古くなりうる
- **推奨アクション**:
  1. `tests/tsconfig.json` を新設する (`e2e/` / `perf/` と同じ形。`@/*`・`@domain/*` の paths、jsx、vitest の型)
  2. 上の型検査を discovery.md の表と verify.yml、lint-agent の typecheck に足す
  3. `vitest.config.ts:13-14` と `docs/discovery.md:372` を「層をまたぐ通しのテストは tests/ に置く」に直す
- **根拠**: docs/discovery.md の "Build / Test / Lint"、014 spec SC-002 / research R-14、CONV-1 / CONV-3
- **scope 根拠**: 新しいファイルはこの PR の touched files。tsconfig / discovery は touched の外だが、直すのはこの PR が足したファイルの検査漏れ

### [Medium] 切り出した直後に 588 行だった `running-session-store.ts` が 670 行になり、切り出し前の 650 行を超えた。`session/labels.ts` もこの PR で 500 行を超えた (M-002) (scope: feature)

- **観察**:
  - `src/renderer/src/features/session/running-session-store.ts` は HEAD で 670 行
    - `docs/roadmap.md:275-276` は「切り出した直後」の値として 650 → 588 を記録している
    - 増えた分の大半は `meters` の純関数 3 つ: `withToolElapsed` / `applyMeter` (`:163`) / `clearThinkingOnAssistant` (`:193-197` 付近)
  - roadmap の system-scope の項目 (:270-276) は「O-4 が持った」として閉じている。完了の時点の行数は書いていない
    - 同じ記録の `RunningSessionRow.tsx` 347 も、HEAD では 352
  - `src/renderer/src/features/session/labels.ts` は 486 → 535 行で、この PR で 500 行を超えた
- **同種事象探索**: 行数を Grep の `^` で数えた。touched の非テストのうち 500 行を超えるのは 5 件
  - `running-session-store.ts` 670 (650 → 670)
  - `session/labels.ts` 535 (この PR で超えた)
  - `src/agents/sdk-agent-session.ts` 664 (もともと超えていた)
  - `thread.aui.tsx` 1319 (8aed1db で 1317 → 1319)
  - `tool-fallback.aui.tsx` 781 (scaffold)
- **リスク/影響**: FR-018 で切り出した分を、同じ PR の追加が打ち消した。roadmap は大きさの問題を閉じたように読め、次に store を触る feature に申し送られない
- **推奨アクション**:
  1. 上の 3 つの純関数を `running-session-meters.ts` (`running-session-monitor.ts` と同じ構え) に出す
  2. `docs/roadmap.md:275-276` に完了の時点の行数を書き足す
  3. `session/labels.ts` は、起動ダイアログの節を `launch-labels.ts` に分けるか、500 行超を roadmap に記録する
- **根拠**: CONV-3 (1 ファイル 500 行超は warning)、014 spec FR-018、AD-045 Consequences (切り出しの理由は「ファイルの大きさ・型の依存の向き」)
- **scope 根拠**: どちらのファイルもこの PR の touched files

### [Low] 外から参照されない export がある。テストは境界値を定数でなく数で直書きしている (L-001) (scope: feature)

- **観察**:
  - `src/domain/session/meter.ts` の次の 6 つは export されているが、テストを含めて meter.ts の外からの参照が 0 件
    - `:68` `METER_UPDATE_TYPES` / `:76` `MeterUpdateType` / `:117` `MAX_METER_COST_USD`
    - `:119` `MAX_METER_CONTEXT_WINDOW` / `:121` `MIN_RESETS_AT_SEC` / `:122` `MAX_RESETS_AT_SEC`
  - `running-session-types.ts:27` の `SESSION_ROW_STATUSES` も、使っているのは `:39` の型の導出だけ
  - `meter.test.ts:66,68,75,76,92` は、境界値 (1e6 / 1e8 / 1e9〜1e11) を数で書いている
- **同種事象探索**: 上の 7 名を src と tests に Grep した (定義したファイルを除く)。0 件
- **リスク/影響**: 定数を変えても境界のテストが追随しない。未使用の export を見る検出器は無い (`no-unused-vars` は局所変数だけを見る。depcruise の `no-orphans` はモジュールの単位)
- **推奨アクション**:
  - meter.test.ts で定数を import して境界値を書く
  - それでも使われない `METER_UPDATE_TYPES` / `MeterUpdateType` / `SESSION_ROW_STATUSES` は `export` を外す
- **根拠**: CONV-5
- **scope 根拠**: 新設のファイル

### [Low] 計量の型の import 元が 3 つあり、利用側が混ぜている。純関数のモジュールが hook のモジュールから型を取っている (L-002) (scope: feature)

- **観察**:
  - 正本は `running-session-types.ts`。再 export が `useSessionMeters.ts:6` (3 つの型) と `running-session-store.ts:24,36` (`SessionMeters`) にある
  - テストは 1 つのファイルの中で出所を混ぜている (`UsageTab.test.tsx:9`・`ContextCostMeter.test.tsx:10`・`CenterBanners.test.tsx:21`)
    - `EMPTY_SESSION_METERS` は `running-session-types` から取る
    - `TurnMeter` / `RateLimitMeter` は `useSessionMeters` から取る
  - 純関数の `quota-banner.ts:1` が hook のモジュールから型を取っている
- **同種事象探索**: Grep `import .*\b(SessionMeters|TurnMeter|RateLimitMeter)\b` で 1 行の import が 8 件、複数行の import (`running-session-store.ts:24`) が 1 件
  - 本体: `CenterBanners.tsx:9`・`UsageTab.tsx:5`・`quota-banner.ts:1`
  - テスト: `quota-banner.test.ts:5`・`ContextCostMeter.test.tsx:10`・`CenterBanners.test.tsx:21`・`UsageTab.test.tsx:9`
  - `useSessionMeters.ts:4`
- **リスク/影響**: `running-session-types.ts` の冒頭の「ストアと導出が読む型はここ」の規則が崩れ、次に足す型の置き場の判断がぶれる
- **推奨アクション**: 型は `running-session-types.ts` から import し、`useSessionMeters.ts:6` の再 export を外す
- **根拠**: CONV-3 / CONV-4
- **scope 根拠**: 新設と touched のファイルだけ

### [Low] 数の書式が文言の表 2 か所に重複している (L-003) (scope: feature)

- **観察**: 同じ `new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })` が 2 か所にある
  - `src/renderer/src/features/chat/labels.ts:14`
  - `src/renderer/src/features/shell/labels.ts:172` (`:174` で `formatCount` として公開)
- **同種事象探索**: Grep `new Intl.NumberFormat\('ja-JP'` を src/renderer/src に掛け、3 件。2 件が重複で、残る 1 件は費用の書式 (`shell/labels.ts:162`)
- **リスク/影響**: transcript の数と使用量のタブの数で、桁の書式が別々に変わりうる
- **推奨アクション**: `@/lib/` に `formatCount` を 1 つ置き、両方から使う (chat → shell の import は循環になるので避ける)
- **根拠**: CONV-5
- **scope 根拠**: どちらも touched

### [Low] glossary の英語名と識別子が合っていない。「プロバイダ」の書き残しが 2 件ある (L-004) (scope: feature)

- **観察**:
  - `docs/glossary.md:1068` の canonical な名前は「Unsafe permission mode banner」
    - コードは `UnsafeModeBanner` (`CenterBanners.tsx:59`)・`UnsafeModeBannerOf` (`:79`)・`data-testid="unsafe-mode-banner"` (`:90`)・`UNSAFE_MODE_BANNER_LABELS` (`shell/labels.ts:151`) で、Permission が落ちている
  - 「プロバイダ」の書き残しが 2 件ある: `src/domain/provider/dto.ts:15` と `src/main/app/provider-service.ts:66`
- **同種事象探索**:
  - Grep `Unsafe permission mode banner|UnsafeModeBanner|unsafe-mode-banner`: glossary 2 件・本体 4 か所・テスト 8 件
  - Grep `プロバイダ` を src・e2e・tests に掛け、5 件
    - Closta の Provider を指すのは dto.ts:15 と provider-service.ts:66 の 2 件
    - `secret-scan` の 2 件と `tests/rule-fixtures/expected.mjs:703` は外部サービスの意味なので別
- **リスク/影響**: Principle XIV (code / spec / UI で一貫して使う) に反する。glossary から識別子を Grep で引けない
- **推奨アクション**:
  - glossary の項目に「識別子: `UnsafeModeBanner`」を足すか、識別子を `UnsafePermissionModeBanner` にする
  - 残る 2 件のコメントを「Provider の画面」に直す
- **根拠**: Constitution XIV、CONV-6
- **scope 根拠**: glossary と CenterBanners は touched。dto.ts / provider-service.ts は touched の外

### [Low] `tool-fallback.aui.tsx` は手を入れた element なのに、eslint の厳しさを戻す一覧に入っていない (L-005) (scope: feature)

- **観察**:
  - `tool-fallback.aui.tsx` は closta が手を入れた element で、O-4 も呼び出し側を変えた
  - `reviewers.yml:62,115` は、これを a11y / ux の手書きの element として発火の対象にしている
  - 一方で `eslint.config.mjs:548-621` の、厳しさを戻すどの block にも入っていない (`GENERATED_FILES` の緩和のまま)
  - 方針は `:542-547` の「生成物ディレクトリの手書きコードは緩和対象にしない」
  - HEAD でも変わっていない
- **同種事象探索**: reviewers.yml で手書きとしながら eslint の戻しの一覧に無いものは 2 件: `tool-fallback.aui.tsx` と `surfaces.tsx` (この PR では変えていない)
- **リスク/影響**: 今の害は無い。次に hooks が入ったとき、依存配列の番人が効かない
- **推奨アクション**:
  - hooks だけを戻す block (`eslint.config.mjs:564-567`) に足し、ESLint が 0 件のままか確かめる
  - 上流のコードで落ちるなら、除いた理由を block のコメントに書く
- **根拠**: `eslint.config.mjs:542-547` の方針、CONV-1 の lint hookup、plan「機械強制の変更」
- **scope 根拠**: どちらのファイルも touched

### [Low] Principle XIII の照合: tool の経過時間を自作する前の候補に `useToolCallElapsed` / `ToolFallbackDuration` が記録されていない (L-006) (scope: feature)

- **観察**:
  - `ToolResultMarks` は経過時間を自作の `useLiveToolElapsed` で出している
  - assistant-ui には次の候補がある
    - `useToolCallElapsed()` (`tool-fallback.aui.tsx:14,113`)
    - `ToolFallbackDuration` (`:109-128`、描くのは `:174`)
  - research R-09 の候補の表 (`research.md:101-108`) と照合の結果 (:112-131) に、この 2 つが無い
- **同種事象探索**: Grep `useToolCallElapsed|ToolFallbackDuration` を 014 の md と docs に掛け、0 件 (src は tool-fallback.aui.tsx の 4 件だけ)
- **リスク/影響**:
  - XIII の Manual と、ui charter の KPI「自作率」(計測経路は convention-reviewer) を満たさない
  - 将来 `part.timing` を入れると、書式の違う経過時間が 2 つ並ぶ
- **推奨アクション**: R-09 と PR の説明に、2 つの候補と採らない理由を書く
- **根拠**: Constitution XIII の Verification Manual、ui charter KPI「自作率」
- **scope 根拠**: 新しい自作の表示は touched files にある

### [Low] FR-018 の切り出しを別のコミットにする手当て (plan RK-11) が履歴に無い (L-007) (scope: feature)

- **観察**:
  - plan RK-11 は「切り出しを最初の別のコミットにする」としている
  - 実装は 922f6cc の 1 つに入っており、その後は fc3a5fc (記録) と 8aed1db (pr-gate の修正) だけ
  - 「書き換えずに通った」の根拠は `roadmap.md:274-275` の自己申告だけ
- **同種事象探索**: 既存のテスト 3 本の diff (iter 1 で読んだ) で、本体の書き換えは 0 件、改題が 1 件 (`RunningSessionList.monitor.test.tsx:271`)。8aed1db はこの 3 本を触っていない
- **リスク/影響**: 切り出し単体で振る舞いが変わらないことを、commit の単位で確かめられない
- **推奨アクション**: PR の説明に、切り出しを別コミットにしていないことと、diff 上の根拠を書く
- **根拠**: 014 plan RK-11、spec FR-018 / SC-007
- **scope 根拠**: この PR の記録

### [Low] 警告の帯の class の文字列が 3 か所に複製されていて、8aed1db が 2 か所だけを変えたので食い違った (L-008) (scope: feature)

- **観察**:
  - 8aed1db の後、同じ役割の帯の class が 2 通りになった
    - `CenterBanners.tsx:91` (権限モードの警告の帯) と `:158` (Quota banner の `warning`): `border-destructive/40 bg-destructive/10 text-red-700 dark:text-destructive`
    - `LivePane.tsx:323` (`FailureBanner`): `border-destructive/40 bg-destructive/10 text-destructive`
  - 3 つとも中央に出る、同じ役割 (失敗・警告) の帯で、配置の class も同じ
  - 文字色を変えた理由は `CenterBanners.tsx:57` の JSDoc の 1 か所にしか書かれていない
  - 次の組み合わせでは、2 つの帯が light で違う赤のまま並ぶ
    - レート制限で失敗した `terminal` のセッション
    - `FailureBanner` (`rate-limited`) と Quota banner (`rejected` × `terminal`。warning の見た目) が同時に出る
- **同種事象探索**: Grep `border-destructive/40 bg-destructive/10` を src/renderer/src に掛け、3 件 (`CenterBanners.tsx:91`・`:158`・`LivePane.tsx:323`)
- **リスク/影響**: 次に誰かが帯の色を直すとき、どれを直すべきかがコードから分からない。L-003 と同じ種類の重複である
- **推奨アクション**:
  - 警告の帯の見た目を 1 か所に置き、3 か所から使う (例: `@/lib/` の定数か `cva` の variant)
  - `LivePane.tsx:323` にも同じ文字色を当てるかは a11y の判断 (pr-gate R1 H-002 は system scope とした)。当てない場合は、意図して違うことを `LivePane.tsx:323` か roadmap に書く
- **根拠**: CONV-5 (L-003 と同じ重複の扱い)
- **scope 根拠**: `CenterBanners.tsx` (新設) と `LivePane.tsx` (touched) だけ。コントラストの値の判断はこの reviewer の担当外

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | Glob `tests/**/*.{ts,tsx}` × tsconfig の include | 型検査の外 7 (.tsx で層をまたぐのは 1) | tests/meter/meter-through.test.tsx / tests/ui-coverage/*.test.ts / tests/docs/*.test.ts / tests/spec-artifacts/*.test.ts |
| M-002 | Grep `^` (行数) を touched の非テストに | 500 行超 5 | running-session-store.ts (670) / session/labels.ts (535) / sdk-agent-session.ts (664) / thread.aui.tsx (1319) / tool-fallback.aui.tsx (781) |
| L-001 | Grep `METER_UPDATE_TYPES\|MeterUpdateType\|MAX_METER_COST_USD\|MAX_METER_CONTEXT_WINDOW\|MIN_RESETS_AT_SEC\|MAX_RESETS_AT_SEC\|SESSION_ROW_STATUSES` (定義したファイルの外) | 0 | meter.ts:68,76,117,119,121,122 / running-session-types.ts:27 |
| L-002 | Grep `import .*\b(SessionMeters\|TurnMeter\|RateLimitMeter)\b` | 8 + 複数行の 1 | useSessionMeters.ts:4,6 / quota-banner.ts:1 / CenterBanners.tsx:9 / UsageTab.tsx:5 / テスト 4 / running-session-store.ts:24 |
| L-003 | Grep `new Intl.NumberFormat\('ja-JP'` | 3 (重複 2) | chat/labels.ts:14 / shell/labels.ts:172 |
| L-004 | Grep `Unsafe permission mode banner\|UnsafeModeBanner\|unsafe-mode-banner` / `プロバイダ` | 2 + 4 (+テスト 8) / 2 (該当分) | glossary.md:673,1068 / CenterBanners.tsx:59,79,90 / shell/labels.ts:151 / domain/provider/dto.ts:15 / main/app/provider-service.ts:66 |
| L-005 | reviewers.yml の手書き × eslint の戻しの一覧 | 2 | tool-fallback.aui.tsx / surfaces.tsx |
| L-006 | Grep `useToolCallElapsed\|ToolFallbackDuration` を 014 の md と docs に | 0 | tool-fallback.aui.tsx:14,109-128,174 |
| L-007 | 既存のテスト 3 本の diff の本体の書き換え | 0 (改題 1) | RunningSessionList.monitor.test.tsx:271 |
| L-008 | Grep `border-destructive/40 bg-destructive/10` | 3 | CenterBanners.tsx:91,158 / LivePane.tsx:323 |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 8
- Round inheritance: resolved from 1: 0 / unresolved: 9 (M-001・M-002・L-001〜L-007。どれも CONSIDER で auto-fix の対象外。HEAD で再確認した。severity は据え置き) / new: 1 (L-008)

<details>
<summary>lint-agent の出力 (CONV-1 の入力)</summary>

invoker が渡した JSON (iter 2) は lint-agent.code-gate.md を参照。

CONV-1 で読んだ結果:

- `commands[]` の 5 本とも `exit_code: 0`。非ゼロで終わったコマンドは無いので、Critical になるものは無い
- `violations: []` なので、lint の指摘は 0 件
- 8aed1db の変更ファイルは、それぞれ次の規則の下で 0 件だった
  - `thread.aui.tsx`: hooks の番人を戻した block (`eslint.config.mjs:564-572`)
  - `CenterBanners.tsx`: features/ なので全ての規則
- typecheck の 2 本は、今回も `tests/meter/meter-through.test.tsx` を見ていない (M-001)。e2e / perf を走らせていないのは JSON の notes のとおりで、touched にも入っていない

</details>
