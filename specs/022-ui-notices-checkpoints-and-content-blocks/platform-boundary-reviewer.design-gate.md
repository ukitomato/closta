# platform-boundary-reviewer Review: 知らせの類・Checkpoints・中身のブロックの表示 (O-12)

**Run**: 2026-10-22
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/022-ui-notices-checkpoints-and-content-blocks/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001 (`promptSuggestions` を渡さない, `QUERY_OPTION_KEYS` は変更なし), FR-002〜FR-006 (`toNoticeRow` を domain に移設・新設), FR-005 (`memory_recall` のパスは `pathTail` で末尾だけ), FR-007〜FR-011 (`content-blocks.ts` を domain に新設し agents から import), FR-012 (変換は 1 つの関数を共有), FR-013 (scripts が `node_modules/@anthropic-ai/sdk` を cwd からの相対パスで読む), SC-007 (main / preload / IPC / 権限の経路の差分 0)。他の FR/SC は本 reviewer の担当ではない
- touched files に該当する charter / Confirmation: Principle I (`memory_recall.path` の切り出し), Principle III (query の options と承認の経路は変えない), Principle VII (agents → domain の import が増える。`notice-rows.ts` / `content-blocks.ts`), AD-004 (会話から来るパス文字列は branded path の値ではない)。runtime / isolation charter の対象ファイルには触れない。AD-003 / AD-012 にも触れない
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当 (Sources の URL・`openExternalIfHttp` を含む)
- C. 業務不変条件 / Charter drift: 該当なし: `src/main/infra/runtime/`・`src/domain/runtime/` と isolation の範囲に変更がない (plan のレイヤごとの変更表を確認)。runtime / isolation charter の Out of scope 侵犯もない
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

O-12 では、Claude Code が emit する知らせ 7 種類 (O-6 / O-10 の 5 種類と合わせて計 12 種類) を domain の `toNoticeRow` 1 つでシステムイベントの行にする。あわせて `server_tool_use`・結果のブロック・`document`・まだ表示のないブロックを domain の `content-blocks.ts` で DTO の part にし、renderer で表示する。Constitution 検証の項目 21 で対応表の B 節を SDK の型と機械照合する。main・preload・IPC・ランタイム抽象・権限ゲート・docker / WSL の経路は変えない。本 reviewer の担当で関係するのは (1) 会話から来るパス文字列の扱い (PB-1)、(2) 実行中の対応づけの記憶の置き場 (PB-2)、(3) agents → domain の import 増加に対する Principle VII / I の機械検査の効き (PB-7)。

### 固有観点の確認結果

- **PB-1 IPC / 永続化境界でのパス型の消失**: 該当なし。`memory_recall.memories[].path` (`sdk.d.ts:4929`) は会話から来る文字列で branding されない。`src/domain/session/path-tail.ts:1-18` は本文専用で IPC・port の入力に戻さない (AD-049 Decision 5)。data-model §1.4 も `path` を DTO に入れない。`files_persisted.files[].filename` (`sdk.d.ts:4778`) も表示専用
- **PB-2 ランタイムの単一インスタンス仮定**: 該当なし。`applyServerResults` の記憶 (上限 256) は `createLiveToolResultTracker()` の中 (`src/agents/sdk-agent-session.ts:451` の closure 内)。`createLiveSignals` も `:485` で同じ形。過去ログの id の表は 1 回の変換の中だけ (data-model §2.3)
- **PB-3 `capabilities` の虚偽表明**: 該当なし
- **PB-4 権限ゲートの迂回**: 該当なし。`QUERY_OPTION_KEYS` (12 キー)・`buildQueryOptions`・承認の経路は変わらない
- **PB-5 多段パス変換の欠落**: 該当なし
- **PB-6 実質的な永続環境の構築**: 該当なし。記憶はメモリ上だけ
- **PB-7 lint ルール自体の網羅性**: 該当なし
  - Principle VII: `agents-not-to-*` は `^src/agents/` で推移的に検査 (`.dependency-cruiser.js:180-209`)。`domain-not-to-io` / `domain-not-to-electron` も `^src/domain/` の前方一致 (`:211-270`)。新設ファイルはパターンで自動的に対象
  - Principle I: `no-restricted-imports` は `src/**/*.{ts,tsx}` (`eslint.config.mjs:434-435`)
  - 乱数の移設: 移設元 `src/agents/live-signals.ts:698` の `randomUUID()` は呼び出し元に残し、domain は `fallbackId` を受け取る (BE-010)

  `eslint.config.mjs:589-611` の手書き一覧への追加は convention-reviewer の担当。

## Findings

本 reviewer の担当範囲で指摘はない。

H の確認結果:
- Principle VII の regression は BE-010 の依存グラフの観点と SH-013 で検出できる
- `pathTail` による絶対パス除去は BE-011 で Windows / POSIX 両形式の目印 0 件を固定する
- 権限の境界不変は `QUERY_OPTION_KEYS` の pin テスト (BE-012) と quickstart V-6 の差分 0 で確かめる

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| (なし) | `createLiveToolResultTracker\(\|createLiveSignals\(` | 2 | src/agents/sdk-agent-session.ts:451, :485 |
| (なし) | `randomUUID\|from 'node:` in src/agents/live-signals.ts | 1 | src/agents/live-signals.ts:698 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 0
