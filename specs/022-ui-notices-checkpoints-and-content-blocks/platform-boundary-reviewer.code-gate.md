# platform-boundary-reviewer Review: 知らせの類・Checkpoints・中身のブロックの表示 (O-12)

**Run**: 2026-10-23
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/022-ui-notices-checkpoints-and-content-blocks/spec.md
**Gate**: code-gate iteration 1 (起動理由: eslint.config.mjs の変更)

## 初回読了 viewpoint

- FR/SC: FR-005 (`memory_recall` のパスは末尾の要素か host だけ表示する)、FR-007〜FR-012 (domain の `content-blocks.ts` を agents から import する)、FR-013 (項目 21 が `node_modules/@anthropic-ai/sdk` の型を読む)、SC-007 (main / preload / IPC / 権限の経路の差分 0)。これ以外の FR/SC は本 reviewer の担当外。
- touched files に該当する charter / Confirmation: Principle I (`eslint.config.mjs:434-435` の `no-restricted-imports` と、renderer の namespace リテラル禁止 `:486-502`)、Principle III (`sdk-agent-session.ts` の差分は `run()` の中のメッセージの振り分けだけで、`QUERY_OPTION_KEYS` と `buildQueryOptions` には触れていない)、Principle VII (agents → domain の import が増える)、AD-004 (会話から来るパス文字列は branding されない表示用の値)。runtime / isolation charter の対象ファイルには触れていない。AD-003 / AD-012 にも触れていない。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当 (`webSourceUrl` を含む)
- C. 業務不変条件 / Charter drift: 該当なし: scope file 54 件のどれも `src/main/infra/runtime/`・`src/domain/runtime/`・isolation の範囲に入らない。runtime / isolation charter の Out of scope を侵す変更もない
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

本 reviewer を起動した `eslint.config.mjs` の差分 (`:610-612`) は、手書きの element 2 件 (`server-tool-call.aui.tsx`・`unsupported-block-mark.tsx`) を、緩めたルールを `error` に戻す一覧に足すだけである。lint は強まる方向にしか変わらない。

`scripts/constitution/check.mjs:1345-1378` は、項目 21 の入力に `@anthropic-ai/sdk` の型定義 2 件と `package.json` を足している。

コード側の差分は次の 3 つ:
- domain に `notice-rows.ts` と `content-blocks.ts` を新設した
- `live-tool-results.ts` に `applyServerResults` を足した
- `sdk-agent-session.ts` の振り分けに `tool_use_summary` / `active_goal` を足した

### 固有観点の確認結果

- **PB-1 (IPC / 永続化境界でのパス型の消失)**: 該当なし。`src/domain/session/notice-rows.ts:225-232` は `memory.path` を DTO に入れていない。https の URL なら host、それ以外は `pathTail` の末尾だけを表示する。`:246-272` の `filename` も表示する名前の一覧に使うだけ。どちらも branding されず、IPC や port の入力に戻らない。`content-blocks.ts` が扱うのは URL (`:120-141`) だけで、ホストやランタイムのパスは扱わない。
- **PB-2 (ランタイムの単一インスタンス仮定)**: 該当なし。`src/agents/live-*.ts` と、新設・変更した domain のファイルには、module スコープに置いた `let` や `new Map` / `new Set` が 0 件だった。`applyServerResults` の記憶は tracker の closure の中にある (`sdk-agent-session.ts:846-868` の `toolResults` 経由)。
- **PB-3 (`capabilities` の虚偽表明)**: 該当なし: capabilities を判定する経路に差分がない。
- **PB-4 (権限ゲートの迂回)**: 該当なし。`sdk-agent-session.ts` の差分 (`:846-868`・`:964-975`) は受け取ったメッセージの振り分けだけで、`permissionMode` や query の options を組み立てる処理には触れていない。
- **PB-5 (多段パス変換の欠落)**: 該当なし: パスの変換と bind mount に差分がない。
- **PB-6 (実質的な永続環境の構築)**: 該当なし: 状態はメモリ上だけ。docker / WSL / ファイルシステムへの書き込みはない。
- **PB-7 (lint ルール自体の網羅性)**: 該当なし。
  - `GENERATED_FILES` (`eslint.config.mjs:73-77`) の緩和ブロック (`:532-543`) が切るのは、整形・return type・react-hooks・`no-empty` だけである。`no-restricted-imports` (Principle I/II/VII の文字列の層) と renderer の namespace リテラル禁止は切らない。だから新しい 2 ファイルは、緩和ゾーンに置かれても Principle のルールの対象のまま。
  - 新設の domain ファイルの import は、どれも同じディレクトリの相対 import (`./meter`・`./path-tail` など) で、Node の標準モジュールや electron は 0 件。
  - 項目 21 は `@anthropic-ai/sdk` を cwd からの相対パスで読む。この SDK は直接の依存ではなく、Agent SDK の peer である (`package.json:30` は claude-agent-sdk だけ)。`pnpm-workspace.yaml:10` の `nodeLinker: hoisted` のおかげで、`node_modules/@anthropic-ai/sdk/package.json` が実在することを確かめた。配置が変わると入力が無いという違反で落ちる (pending ではない。`check.mjs:1335`、plan RK-03)。import の specifier が変わったときも違反になる (`coverage.mjs:336-338`)。どちらも検査が気づかないうちに通るようになる経路ではない。

## Findings

本 reviewer の担当範囲で指摘はない。

H の確認結果:
- lint の差分は強める方向なので、既存の regression は起きない。Principle の import 禁止は `GENERATED_FILES` の緩和で切られないことを config の本文で確かめた。
- 項目 21 の入力が無いときの違反は、`tests/ui-coverage/coverage.test.ts` と `tests/ui-coverage/item21.test.ts` に fixture を足す計画である (research 41-43 行・spec FR-013)。見つかったときは、どの入力が無いかがファイル名で 1 行ずつ出る (`check.mjs:1335` の方針)。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| (なし) | `^(let\|const\|var) \w+\s*=\s*new (Map\|Set)\|^let ` in src/agents/live-*.ts と domain の新設・変更ファイル | 0 | - |
| (なし) | `^import\|require\(\|import\(` in src/domain/session の新設・変更ファイル | 相対 import のみ | src/domain/session/content-blocks.ts:1-4, notice-rows.ts:1-5, live-message.ts:1-4 |
| (なし) | `anthropic-ai` in package.json | 1 (claude-agent-sdk のみ) | package.json:30 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 0
