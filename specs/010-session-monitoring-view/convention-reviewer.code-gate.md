# convention-reviewer レビュー: セッション監視ビュー (O-1)

**実行日時**: 2026-10-02T00:00:00+09:00
**Reviewer**: convention-reviewer
**Spec**: specs/010-session-monitoring-view/spec.md
**Gate**: code-gate iteration 1 (convention track)

## 初回読了 viewpoint

- FR/SC (本 PR で実装または影響を受けるもの):
  - FR-001〜FR-004: `RunningSessionList.tsx` / `SessionNavBadge.tsx` / `SessionAttentionAnnouncer.tsx` / `App.tsx`
  - FR-005 / FR-006 / FR-007: `session-view.ts` / `useSessionClock.ts` / `running-session-store.ts`
  - FR-008 / FR-009: `thread-list.aui.tsx` / `RunningSessionList.tsx` / store の `setDensity`
  - FR-010 / SC-006: `src/main` / `preload` / `agents` / `domain` の差分は 0
  - FR-011 / SC-004: `e2e/multi-session.spec.ts` / `e2e/support/input-probe.ts`
  - FR-012 / SC-005: `perf/real-sessions.spec.ts` / `playwright.perf.config.ts` / `perf/tsconfig.json` / verify.yml
  - FR-013: glossary、各 charter、roadmap、discovery
  - SC-001 / SC-002 / SC-003: `*.monitor.test.*` / `useSessionClock.test.tsx` / `SessionScreen.test.tsx`
- touched files に該当する charter / Confirmation:
  - session charter、ui charter
  - AD-038 D2 の Confirmation に当たる eslint ignores、depcruise の `not-to-test`、tsconfig の分離
  - AD-023 §7 (循環禁止。depcruise の `no-circular` は exit 0)
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当範囲
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当範囲
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当範囲
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当範囲
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:3 Low:7
- G. optional reviewer 範囲: 該当なし: a11y / ux reviewer の担当範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (内容は「H の所見」節)

## スコープ要約

X-5 の稼働中セッション一覧を renderer の中だけで監視ビューに拡張する feature で、対象は 32 ファイル。

**CONV-1 (lint 結果)**: `lint-agent.code-gate.json` を受け取った。7 つの検出器はすべて `exit_code` 0 で、`violations[]` は 0 件。lint 由来の finding は 0 件で、exit code による Critical もない。

## Findings

### [Medium] 新しいテストファイル名の形式 `*.monitor.test.*` に前例がなく、tasks.md に書いたテストファイル名とも一致しない (M-001) (scope: feature)

- **観察**: `session-view.monitor.test.ts` / `running-session-store.monitor.test.ts` / `RunningSessionList.monitor.test.tsx` の 3 本は、リポジトリで唯一の 2 つ目のドットを挟む形式。tasks.md (SH-003 / SH-004 / FE-003) が書くファイル名と一致しない。`SessionAttentionAnnouncer.test.tsx` / `SessionNavBadge.test.tsx` は存在せず、両コンポーネントのテストは `RunningSessionList.monitor.test.tsx` に同居している
- **同種事象探索**: Glob `src/**/*.*.test.{ts,tsx}` で 3 件。Grep `monitor\.test` で 5 件 (tasks.md には 0 件)
- **リスク/影響**: vitest の include には合致するので実行は漏れない。ただし 1 つのモジュールのテストが 2 ファイルに分かれ、Announcer とナビのバッジは名前からテストを辿れない。tasks.md と実体がずれている
- **推奨アクション**: (a) 既存の `<module>.test.ts(x)` に統合し、Announcer とバッジのテストは専用ファイルに切り出す、または (b) 分割を残すなら tasks.md の SH-003 / SH-004 / FE-003 に「実装時の変更」を 1 行ずつ足す (最小案)
- **根拠**: CONV-2、CONV-6、`vitest.config.ts:13`
- **scope 根拠**: touched files の中で直せる

### [Medium] `running-session-store.ts` が本 feature で 500 行を超えた (M-002) (scope: feature)

- **観察**: 587 行。変更前の約 460 行から、監視ビューの派生値 (`writeActivity` / `armActivity` / `scheduleActivity` / `trackDerived` と `activityTimers`) で超えた。`RunningSessionList.tsx` は 483 行で閾値に近い
- **同種事象探索**: `features/session` 配下で 500 行を超えるのは 4 件 (本 feature で超えたのは `running-session-store.ts` だけ)
- **リスク/影響**: ストアの責務に間引きのタイマ管理が混ざり、O-2 で派生値が増えるたびに肥大化する
- **推奨アクション**: 追跡と間引きを `running-session-monitor.ts` のような小さなモジュールに切り出し、store からは `trackDerived(ids)` / `dispose(id)` だけを呼ぶ。見送るなら理由を tasks.md の SH-004 に 1 行残す
- **根拠**: CONV-3、AD-023 §5
- **scope 根拠**: touched file の中で直せる

### [Medium] `e2e/` と `perf/` は ESLint の対象から丸ごと外れており、「後で別途 lint する」というコメントが古くなっている (M-003) (scope: system)

- **観察**: `eslint.config.mjs` の ignores に `e2e/**` / `playwright.config.ts` / `perf/**` / `playwright.perf.config.ts`。`:170` のコメントは「`@playwright/test` 導入後に別途 lint する」だが、`@playwright/test` は導入済みで、e2e/perf の ESLint 設定は無い。perf の「子プロセスを起こさない」はレビューだけで守られている
- **同種事象探索**: e2e/perf を lint 対象にする設定は 0 件。roadmap に登録済みの死角は check.mjs の `SCAN_ROOTS` だけ
- **リスク/影響**: perf/ と e2e/ には `no-restricted-imports` も `no-unused-vars` も掛からない
- **推奨アクション**: 最小案は `:170` のコメントを現状に合わせ、roadmap の項目に「ESLint も e2e/ と perf/ を見ていない」を足す。本格対応は e2e/perf 専用の flat config ブロックを足す別 feature
- **根拠**: CONV-1 / CONV-5、AD-038 D2、Principle VI
- **scope 根拠**: ignores の方針は X-2 由来のリポジトリ全体の構成

### [Low] `Elapsed` 型が `session-view.ts` と `labels.ts` に二重に定義されている (L-001)

- `labels.ts` の `elapsedLabel` の引数が同じ union を inline で書き写している。`Elapsed` を `labels.ts` に置き、`session-view.ts` から `import type` する

### [Low] 使われていない export がある (L-002)

- `ACTIVITY_SCAN_BUDGET` / `ANNOUNCE_FOLDER_FALLBACK` / `Elapsed` / `ThreadListRowDensity`。テストで使うか `export` を外す (`ThreadListRowDensity` は element の公開 API として残すなら注記)

### [Low] `RowStatus` コンポーネントと `rowStatus` 関数が同じファイルにあり、型は `SessionRowStatus` ではなく `ReturnType<typeof rowStatus>` (L-003)

- props の型を `SessionRowStatus` にし、コンポーネント名を `RowStatusBadge` などにする

### [Low] 直近の活動の前置きの後ろの `:` が JSX に直書きされている (L-004)

- `ACTIVITY_PREFIX_LABELS` の値に区切りを含めるか、`activityPrefix(kind)` を `labels.ts` に置く (Principle XV)

### [Low] `perf/real-sessions.spec.ts` の import 順が std → 3rd party になっていない (L-005)

- `node:path` を `@playwright/test` より先に。`e2e/support/launch.ts` も変更前から同じ逆順

### [Low] data-model が `SessionRowStatus` の定義場所を誤っており、型定義モジュールが UI 文言モジュールに依存している (L-006)

- `data-model.md:3` は `session-view.ts` と書くが、定義は `labels.ts:95`。data-model の 1 行を直す。型の移動は X-5 由来の構造で別 feature

### [Low] 返り値と名前の意味が合っていない関数が 2 つある: `announcements` (単数を返す) と `formatElapsed` (文字列を返さない) (L-007)

- data-model の命名どおりなので spec と一致はしている。改名するなら data-model と同時に。現状維持でもよい

## H の所見

- perf/ の分離: `tsc:perf/tsconfig.json` exit 0、depcruise の `not-to-test` を含めて exit 0、verify.yml の `typecheck (perf)` step があり `playwright.perf` の実行は 0 件。ESLint は e2e/perf を見ていない (M-003)
- `thread-list.aui.tsx`: R-2 の一覧は `density` / `renderTooltip` を渡さないので、既定値で従来の分岐に入る
- テストの発見性: `SessionAttentionAnnouncer` / `SessionNavBadge` は名前から対応するテストファイルが無い (M-001)。カバレッジの欠落ではない
- `badge.tsx`: 生成物の扱い (`GENERATED_FILES` / `.prettierignore`) に入っており、既存の `components/ui/*.tsx` と同じ形

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | Glob `src/**/*.*.test.{ts,tsx}` / Grep `monitor\.test` | 3 / 5 | 3 本の `*.monitor.test.*` / `quickstart-results.md` / `touched-files.txt` |
| M-002 | `features/session` で 500 行超 | 4 | `running-session-store.ts` (587。本 feature で超えた) ほか 3 件は変更前から |
| M-003 | Grep `e2e\|perf\|playwright` (lint/depcruise/tsconfig/allowlists) | 8 (e2e/perf を lint する設定は 0) | `eslint.config.mjs:169-181` / `.dependency-cruiser.js:139-142` / `roadmap.md:133-139` |
| L-001 | Grep `\bElapsed\b` | 2 | `session-view.ts` / `labels.ts:181-186` |
| L-002 | 4 symbols | 定義ファイルの中だけ | `session-view.ts` / `labels.ts:198` / `thread-list.aui.tsx:80` |
| L-003 | Grep `ReturnType<typeof rowStatus>` | 1 | `RunningSessionList.tsx:262` |
| L-004 | 新規・変更した renderer ファイルの全文確認 | 1 | `RunningSessionList.tsx:324` |
| L-005 | Grep `^import` (`e2e/`、`perf/`) | 2 | `perf/real-sessions.spec.ts:1-2` / `e2e/support/launch.ts:1-2` |
| L-006 | Grep `SessionRowStatus\b` | 5 | `labels.ts:95` ほか |
| L-007 | Grep `announcements\(\|formatElapsed\(` | 定義 + 呼び出し | `session-view.ts` ほか |

## Verdict

- Critical: 0
- High: 0
- Medium: 3 (feature 2 件: M-001 / M-002、system 1 件: M-003)
- Low: 7
