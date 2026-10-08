# platform-boundary-reviewer Review: 計量と制限の表示 (O-4)

**Run**: 2026-10-09T00:00:00+09:00
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/014-ui-metering-and-limits/spec.md
**Gate**: pr-gate Round 1 (base: main)

## 初回読了 viewpoint

- FR/SC (本 reviewer の担当範囲で影響を受けるもの):
  - FR-003: `meter` は許可リストのフィールドだけを読む。`init` から読むのは `permissionMode` だけ (`src/agents/live-signals.ts:366-370`)。PB-1
  - FR-005: `meters.permissionMode` を `config` / `lastConfig` / プリセットに書き戻さない (`running-session-store.ts:177-178`)。PB-4
  - FR-010 / US-4 AC1a: 隔離の文言は `autoModeStatus` から導く (`CenterBanners.tsx:71-75`、`RunningSessionsProvider.tsx:65-70`)。PB-3
  - FR-015 / AD-047 訂正 #3: 昇格値の綴りは domain (`meter.ts:23-31`) と renderer の文言の表にだけ置く。`src/agents/` には置かない。PB-7 (項目 16)
  - SC-002: 状態通知のフィールドの差分 0。SC-004: `ended` の後の `event` 0 件。SC-006: 境界の変更は ADR のとおり
- 該当する charter / Confirmation:
  - isolation charter `:30-33` (ゲート)、`:41` (可視化ポリシー)、`:101-104`、`:119`、`:145`
  - runtime charter `:113-114` (確かめていないことを丸めない)
  - ui charter `:83-84`
  - Constitution Principle II `:410-413`、III `:450`、VII `:603-610`
  - AD-003 Decision Outcome `:42-46`、AD-004、AD-047 Confirmation `:57-60` と訂正 #3 `:78-79`
  - `.specify/spec-gate/reviewers.yml:153-171` (本 reviewer の起動条件)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲 (`modelId` / `toolUseId` の検証もそちら)
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:1
- G. optional reviewer 範囲: 該当なし: 本 reviewer の担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

(C と H の code-gate からの持ち越しは下の「code-gate から持ち越し」に書き、上の件数には入れていない。)

## スコープ要約

pr-gate の範囲は 116 ファイル。code-gate の 88 ファイルに、次の 2 つが加わった。

- 開発ツールの設定 6 ファイル (`.claude/CLAUDE.md`、`.claude/settings.json`、`.codegraph/.gitignore`、`.mcp.json`、`.serena/*`)
- spec の gate の成果物

本 reviewer が読んだのは次のとおり。
- 新しい agents のモジュール (`live-signals.ts` / `meter-throttle.ts`) と `sdk-agent-session.ts` への配線
- `session-core.ts` の `classifyResultFailure`
- domain の `meter.ts`
- renderer で権限モードと隔離の文言を扱うところ (`CenterBanners` / `RunningSessionsProvider` / `running-sessions-view` / `CenterHeader` / `CenterPane` / `OverviewTab` / `LaunchDialog` / `running-session-store`)
- `eslint.config.mjs` の差分と `GENERATED_FILES` の緩和
- 項目 16 (`scripts/constitution/check.mjs:773-933`)、rule fixture の `expected.mjs`
- `reviewers.yml`
- 開発ツールの設定の差分

code-gate の本 reviewer の指摘 5 件は、HEAD `fc3a5fc` の時点でどれも直っていない (下の持ち越し)。新しく見つけたのは 1 件で、Low。

## Findings

### [Low] platform-boundary-reviewer の起動条件 (reviewers.yml) に、本 PR が足した権限モードと隔離の文言の判定点が含まれていない (L-001) (scope: feature)

- **観察**:
  - 本 reviewer の `auto_invoke_patterns` (`.specify/spec-gate/reviewers.yml:157-168`) は次の 8 つだけ。`src/main/infra/runtime/**` / `src/agents/**` / `src/domain/runtime/**` / `src/main/app/**` / `src/main/index.ts` / `scripts/constitution/**` / eslint / depcruise の設定
  - 本 PR は PB-3 / PB-4 の判定点を、この 8 つの外に新しく置いた。
    - `src/renderer/src/features/shell/CenterBanners.tsx:71-75` (`isolationSentence`。`unavailable` だけを「隔離なし」にする)
    - `src/renderer/src/features/session/RunningSessionsProvider.tsx:65-70` (引けないときは `undetermined` に倒す)
    - `src/renderer/src/features/session/running-sessions-view.ts:29-34` (`runtimeAutoMode` の契約)
    - `src/domain/session/meter.ts:23-31,165-167` (昇格値を含む値域と、その正規化)
  - 前からある Principle III の門も、同じく 8 つの外にある。`src/domain/session/launch-config.ts` (`isSafePermissionMode` / `assertSafePermissionMode`) と `src/renderer/src/features/session/LaunchDialog.tsx:611,616`
  - 本 PR は同じファイルで ui-coverage-reviewer には `meter*.ts` を足した (`reviewers.yml:187-188`)。しかし本 reviewer の起動条件には何も足していない
  - 今回、本 reviewer が起動したのは、同じ PR に `src/agents/**` と `eslint.config.mjs` があったからにすぎない
  - code-gate では security-reviewer も ux-reviewer も起動しない (`.gate-verdict-code.json:432-433`、`reviewers.yml:136`)
- **同種事象探索**: `AutoModeStatus|autoModeStatus|isSafePermissionMode|SAFE_PERMISSION_MODES|assertSafePermissionMode` を `src/` のテスト以外で検索すると 16 ファイル。
  - 起動条件に一致するのは 6 (`src/agents/` 2・`src/main/app/` 2・`src/domain/runtime/` 2)
  - 一致しないのは 10: `shell/CenterBanners.tsx`・`shell/CenterHeader.tsx`・`shell/labels.ts`・`session/RunningSessionsProvider.tsx`・`session/running-sessions-view.ts`・`session/LaunchDialog.tsx`・`test-support/app-shell-harness.tsx`・`domain/session/launch-config.ts`・`runtime-list/labels.ts`・`runtime-list/RuntimeListScreen.tsx`
- **リスク/影響**: 後の PR がこれらのファイルだけを変える場合、次のような PB-3 / PB-4 の退行を、本 reviewer は code-gate でも pr-gate でも見ない。
  - `allowed` を「隔離あり」に丸める
  - 引けないときの倒し先を `allowed` にする
  - 表示に `autoModeAllowed` を読む

  文言の退行は `CenterBanners.test.tsx:479-504` が文字列で検出する。そのため、テストも同時に書き換えた場合に限って素通りする。重さは Low とした。
- **推奨アクション**: `reviewers.yml` の platform-boundary-reviewer の `auto_invoke_patterns` に次を足す (理由のコメントを 1 行付ける。`:155-156` の AD-024 #1 / #6 の注記と同じ形)。
  - `src/domain/session/launch-config.ts`
  - `src/domain/session/meter*.ts`
  - `src/renderer/src/features/shell/CenterBanners.tsx`
  - `src/renderer/src/features/session/RunningSessionsProvider.tsx`
  - `src/renderer/src/features/session/running-sessions-view.ts`
  - `src/renderer/src/features/session/LaunchDialog.tsx`
- **根拠**: PB-7 (検査が評価されない設定)、Constitution Principle III `:450`、runtime charter `:113-114`、isolation charter `:30-33` / `:119`
- **scope 根拠**: `reviewers.yml` は本 PR の touched file で、判定点も本 PR が足した

### code-gate から持ち越し (HEAD `fc3a5fc` で直っていない。重複を避けるため件数に入れない)

- **M-001** (quickstart の形の控え方が、名前空間・`--permission-mode`・`--exec` の 3 点でアプリの起動と揃っていない): `specs/014-ui-metering-and-limits/quickstart.md:43` の字面が code-gate のときのまま (`CLAUDE_CONFIG_DIR|--permission-mode|--exec|wslpath` の一致は :43 と :52 の 2 件で、:52 は控える列の説明)
- **L-001** (C。暫定の隔離の文言のルールが isolation charter に記録されていない): `docs/domains/isolation/charter.md:145` は「未着手」のまま。isolation charter は touched files に入っていない
- **L-002** (PB-7。項目 16 の denylist `allowlists.mjs:435` と `PERMISSION_MODE_KEYS` をつなぐテストが無い): `tests/` で `PERMISSION_MODE_ESCALATION_VALUES` を検索して 0 件
- **L-003** (I-3 への申し送りに、昇格の観測を記録しないことが書かれていない): `docs/roadmap.md:388` の「O-4 から」は (1) と (2) だけ
- **L-004** (H / PB-2。一覧からランタイムが消えた場合のテストが無い): `CenterBanners.test.tsx` で別の id のランタイムを検索して 0 件。この推奨のテスト (別の id だけの一覧) を足すと、「一覧の先頭や既定のランタイムを引く」という単一インスタンスの退行も同時に検出できる。PB-2 の回帰の番人も兼ねる

### 固有観点の確認

- **PB-1**: 該当なし。新しいコードで、パスが型の境界の外へ出る経路は無い。
  - `init` から読むのは `permissionMode` だけ (`live-signals.ts:366-370`)
  - `meter` の値は数・列挙・モデルの id・tool の id (`meter.ts:91-110`)
  - `CenterPane.tsx` が中央のヘッダに渡すのは `runtimeId` の文字列で、パスではない
  - `app-shell-harness.tsx:75-76,99` の PathDTO は名前空間と値が一致し (`wsl:Ubuntu` と `/home/u/proj`)、テストからしか import されない
- **PB-2**: 該当なし。
  - module スコープに新しい可変の状態は 0 件 (`^(let|var) ` で検索して出たのは、既存の `sdk-agent-session.ts:286,289` と既存の renderer の 2 ファイルだけ)
  - `createLiveSignals` は `run()` の closure に作る
  - renderer は `sessionId` と `config.runtimeId` で引く (`RunningSessionsProvider.tsx:65-70`)。消えたインスタンスのテストの穴は持ち越しの L-004
- **PB-3**: 該当なし。
  - ランタイムの capabilities の表明は変えていない
  - 表示に使うのは 3 値の `autoModeStatus` (`capabilities.ts:149,165-169`) だけで、`autoModeAllowed` は読まない。値を食い違わせたテストがある (`CenterBanners.test.tsx:434-436`)
  - `allowed` / `undetermined` / 一覧の読み込み中は「確かめていない」に倒す (`CenterBanners.tsx:71-75`)
  - `unavailable` (Win32、WSL1、依存の欠けた WSL2) を「このランタイムには隔離がありません」と書くのは、表明された能力に合っている
- **PB-4**: 該当なし。
  - 起動の選択肢は `SAFE_PERMISSION_MODES` から作り、変更の受け付けも `isSafePermissionMode` を通す (`LaunchDialog.tsx:611,616-620`)
  - `PERMISSION_MODE_LABELS` は `Record<SafePermissionMode, string>` のまま (`session/labels.ts:325-329`)。昇格値の表示名を足しても、選択肢には入らない
  - 観測した権限モードは `meters` にだけ書く (`running-session-store.ts:177-178`)。書き戻さないことはテストで固定してある (`CenterBanners.test.tsx:528-540`)
  - agents の比較の基準は `SafePermissionMode` の型で受ける (`live-signals.ts:103,156`)
  - `PermissionModeKey` は `buildQueryOptions` の `SafePermissionMode` に代入できない
  - `setPermissionMode` は項目 16 (P3) が締め出している (`allowlists.mjs:421`)
- **PB-5**: 該当なし。パスの変換も docker の endpoint も扱わない
- **PB-6**: 該当なし。
  - アプリのコードは子プロセス・ファイル・volume・環境を作らない。計量は renderer のメモリだけ
  - pr-gate で加わった `.mcp.json` / `.claude/settings.json` (hook) / `.serena/project.yml` / `.codegraph/.gitignore` は開発ツールの設定である。アプリの実行時の振る舞いでも、Principle VI の検証範囲 (アプリ・`scripts/`・ビルド構成。constitution `:562-565`) でもない
- **PB-7**:
  - **domain の値を経由して昇格値を得る経路**: 本 PR は昇格値を含む `PERMISSION_MODE_KEYS` を domain に export した (`meter.ts:23`)。これを agents が import すれば、綴りを書かずに昇格値を得られる。ただし query の options に載せる経路は、すでに次の 2 つで塞がれている。今回の新しい穴とはしない
    - 値位置の `permissionMode:` にはラッパが必要という検査 (`check.mjs:892-916`。fixture `sdk-permission-mode-constant`、`expected.mjs:285-293`)
    - 計算キーなどの迂回 (reflective) は UNDETECTED_NOTES に記録済み (`expected.mjs:821-835`)
    - 今 `src/agents/` で `PERMISSION_MODE_KEYS` を import しているところは 0 件
  - **`eslint.config.mjs` の差分** (`:564-567`): strictness を戻す block にファイルを 1 つ足しただけ。`GENERATED_FILES` の緩和 (`:73-77,530-541`) はレイヤ規則と禁止 import を緩めないので、既存のルールを緩めた箇所は 0 件
  - **新しい agents のモジュールの import**: `meter-throttle.ts` は import が 0。`live-signals.ts` が import するのは domain と同じディレクトリのモジュールだけ。推移で入る domain (`model-catalog` → `@domain/validation`) にも electron とネイティブのモジュールは無い
  - **Principle II の等価な経路**: `navigator.` / `.platform(` / `userAgent` / `isMac` を touched files で検索して 0 件
  - **新しい穴**: L-001 (起動条件) だけ

### H (本 reviewer の範囲のテストと退行)

- L-001 を検出するテストは無い (起動条件を検査するテストは無い)。代わりに、文言の退行そのものは `CenterBanners.test.tsx:479-504` が検出する
- 既存の振る舞いを壊していない根拠は次のとおり。
  - `classifyResult` は変えていない。理由の分類の後も、完了にならないことを固定するテストがある (`session-core.test.ts`)
  - 書き戻さないことのテストがある (`CenterBanners.test.tsx:528-540`)
  - パスや会話の構成を運ばないことは目印の値のテストで確かめている (code-gate の記録 `live-signals.test.ts:861-893` / `tests/meter/meter-through.test.tsx:198`)
- 観測点: 昇格の観測は renderer のメモリにしか残らない。足さない判断は plan RK-14。申し送りに書いていないことは持ち越しの L-003

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `AutoModeStatus\|autoModeStatus\|isSafePermissionMode\|SAFE_PERMISSION_MODES\|assertSafePermissionMode` (src、テスト以外) | 16 | 起動条件の外 10: shell/CenterBanners.tsx:71-75 / shell/CenterHeader.tsx / shell/labels.ts / session/RunningSessionsProvider.tsx:65-70 / session/running-sessions-view.ts:29-34 / session/LaunchDialog.tsx:611,616 / test-support/app-shell-harness.tsx / domain/session/launch-config.ts / runtime-list/labels.ts / runtime-list/RuntimeListScreen.tsx |
| (PB-7 確認) | `PERMISSION_MODE_KEYS` (specs 以外) | 6 | meter.ts:23,32,156 / meter.test.ts:11,143,156 (src/agents では 0) |
| (持ち越し L-002) | `PERMISSION_MODE_ESCALATION_VALUES` (tests/) | 0 | — |
| (持ち越し L-004) | `Debian\|wsl:Other\|id: 'host'` (CenterBanners.test.tsx) | 0 | — |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 1
