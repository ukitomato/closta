# platform-boundary-reviewer Review: 知らせの類・Checkpoints・中身のブロックの表示 (O-12)

**Run**: 2026-10-26
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/022-ui-notices-checkpoints-and-content-blocks/spec.md
**Gate**: pr-gate Round 1 (base: main / head: 4a16540)

## 初回読了 viewpoint

- FR/SC: FR-005 (memory_recall のパスは末尾の要素か host だけ)、FR-006 (files_persisted のファイル名)、FR-007〜FR-012 (agents が domain の `content-blocks.ts` / `notice-rows.ts` を import する)、FR-013 (項目 21 が `node_modules/@anthropic-ai/sdk` の .d.mts を読む)、SC-007 (main / preload / IPC / 権限の経路の差分 0)。これ以外の FR/SC は本 reviewer の担当外。
- touched files に該当する charter / Confirmation:
  - Principle I: 新しい domain ファイルの import は相対 import だけ。`path-tail.ts` は `node:path` を使わない。
  - Principle III: `src/agents/sdk-agent-session.ts:846-868,964-975` の差分は受け取ったメッセージの振り分けだけ。`QUERY_OPTION_KEYS` と `buildQueryOptions` には触れていない。
  - Principle VII: agents → domain の import が増える。electron と main への依存は増えない。
  - AD-004: 会話から来るパス文字列は branding されない表示用の値。
  - runtime / isolation charter の対象ファイルと AD-003 / AD-012 の領域には触れていない。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: scope の 73 ファイルのどれも `src/main/infra/runtime/`・`src/domain/runtime/`・isolation の範囲に入らない。runtime / isolation charter の Out of scope を侵す変更もない
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

本 PR は UI と session の feature で、次の 4 つを行う。
- 知らせの類 12 種類を domain の `toNoticeRow` (`src/domain/session/notice-rows.ts`) 1 つで行にする。`src/agents/live-signals.ts` にあった O-6 / O-10 の組み立てはこの関数に移した。
- `server_tool_use` と結果のブロックを `src/domain/session/content-blocks.ts` で part にする。結果を後から埋める処理は `src/agents/live-tool-results.ts:946-994` の `applyServerResults` が行う。
- 手書きの element 2 件を renderer に足した。
- 項目 21 で B 節を照合する (`scripts/ui-coverage/coverage.mjs`、`scripts/constitution/check.mjs:1345-1378`)。

`eslint.config.mjs:610-612` の差分は、新しい element 2 件を `error` に戻す一覧に足すだけで、lint は強まる方向にしか変わらない。

main・preload・IPC・ランタイム抽象・権限ゲート・docker / WSL の経路には差分がない。diff の追加行を `HostPath|RuntimePath|readFile|fs\.|node:|process\.platform|permissionMode|autoModeSafe|docker|wsl` で検索した。src 側では 0 件で、一致したのは文書と `tests/ui-coverage/*.test.ts` の `readFileSync` / `node:path` だけだった。

### 固有観点の確認結果

- **PB-1 (IPC / 永続化境界でのパス型の消失)**: 該当なし。
  - `src/domain/session/notice-rows.ts:225-232` は `memory.path` を DTO に入れない。https の URL なら host、それ以外は `pathTail` の末尾だけを表示する。
  - `src/domain/session/path-tail.ts:11-18` は `/` と `\` の両方で切る。Windows の絶対パスでもディレクトリの部分は落ちる (FR-005)。
  - `files_persisted` の `filename` (`notice-rows.ts:246-272`) は `nameList` を通して表示する名前の一覧に入るだけ。どちらの値も branding されず、IPC や port の入力に戻らない。
- **PB-2 (ランタイムの単一インスタンス仮定)**: 該当なし。新しく足した `serverMessages` / `serverCallOwner` / `retractedServerCalls` (`live-tool-results.ts:3885-3887` の差分行) は `createLiveToolResultTracker()` の closure の中にあり、セッションごとに作られる。module スコープの状態ではない。上限は `MAX_PENDING_TOOL_MESSAGES` と `addBounded` で縛られている。
- **PB-3 (`capabilities` の虚偽表明)**: 該当なし: capabilities を判定する経路に差分がない。
- **PB-4 (権限ゲートの迂回)**: 該当なし。`sdk-agent-session.ts` の差分は `tool_use_summary` の case と、`default` の中の `active_goal` の型の確認と、`applyServerResults` の呼び出しだけ。`permissionMode` と query の options を組み立てる処理には触れていない。
- **PB-5 (多段パス変換の欠落)**: 該当なし: パスの変換と bind mount に差分がない。
- **PB-6 (実質的な永続環境の構築)**: 該当なし: 状態はメモリ上だけ。docker / WSL / ファイルシステムへの書き込みはない。
- **PB-7 (lint ルール自体の網羅性)**: 該当なし。
  - eslint の差分は `error` に戻す一覧に 2 件を足すだけで、どのルールも緩めていない。
  - 新しい renderer の element 2 件 (`server-tool-call.aui.tsx:3-13`、`unsupported-block-mark.tsx:3-5`) の import は、react / lucide / assistant-ui / `@/features/chat/*` / `@domain/session/*` / 同じディレクトリの相対だけ。`window.*` と IPC は使っていない。
  - 項目 21 は `node_modules/@anthropic-ai/sdk` を固定の相対パスで読む。入力が無ければ必須キーの欠けとして違反になる (`coverage.mjs` の `checkCoverage` の `required` に 4 キーを足した)。import の specifier が変わったときも例外になる (`parseContentBlockTypes`)。どちらも `pending` で黙って通る経路ではない。

## Findings

本 reviewer の担当範囲で指摘はない。

H の確認結果:
- **lint**: 差分は強める方向だけなので、既存の lint で regression は起きない。
- **live-signals の付け替え**: O-6 / O-10 の行の組み立てを `toNoticeRow` に移した。同じ形の行が出ることは `src/agents/live-signals.o6.test.ts` と `src/domain/session/notice-rows.test.ts` の差分で固定されている。code-gate の test-agent は 3953 件を通した。
- **項目 21 の入力が無いとき**: 違反になる。`tests/ui-coverage/coverage.test.ts` と `tests/ui-coverage/item21.test.ts` の fixture で固定されている。違反のメッセージには入力のキー名か理由が出るので、原因を特定できる。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| (なし) | diff の追加行を `HostPath\|RuntimePath\|readFile\|fs\.\|node:\|process\.platform\|permissionMode\|autoModeSafe\|docker\|wsl` (大文字小文字を区別しない) で検索 | src 側 0 | 一致したのは文書と tests/ui-coverage/coverage.test.ts・tests/ui-coverage/item21.test.ts だけ |
| (なし) | `^import\|require\(\|import\(\|process\.` in src/domain/session/notice-rows.ts と content-blocks.ts | 相対 import だけ | notice-rows.ts:1-5, content-blocks.ts:1-4 |
| (なし) | `^import\|from '\|window\.\|ipc` in server-tool-call.aui.tsx と unsupported-block-mark.tsx | IPC / window 0 | server-tool-call.aui.tsx:3-13, unsupported-block-mark.tsx:3-5 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 0
