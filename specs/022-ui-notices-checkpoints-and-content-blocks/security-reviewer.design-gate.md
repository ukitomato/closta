# security-reviewer Review: 知らせの類・Checkpoints・中身のブロックの表示 (O-12)

**Run**: 2026-10-22
**Reviewer**: security-reviewer
**Spec**: specs/022-ui-notices-checkpoints-and-content-blocks/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001 (`promptSuggestions` を渡さない)、FR-004 / FR-005 (伏せ字、memory の本文と絶対パスを出さない)、FR-006 (`file_id` を出さない)、FR-007 / FR-008 (server_tool_use の無害化、`encrypted_content` を運ばない)、FR-009 (http(s) だけを `openExternalIfHttp` で開く、URL を取得しない)、FR-010 (文書の中身を運ばない)、FR-011 (知らないブロックの中身を運ばない)、FR-012 (過去ログを同じ変換に通す)。SC-001 / SC-002 / SC-003 / SC-007
- touched files に該当する charter / Confirmation: AD-049 Decision 3 / Decision 5。AD-034 (markdown の XSS 境界)。AD-023 / FR-039 の window hardening (`src/main/app/window.ts`。本 feature では差分 0)。ui charter に security 固有の記述は無い
- A. 認可 / 認証 / secret 管理 / プロセス境界の hardening: Critical:0 High:0 Medium:1 Low:0
- B. 入力検証 / injection / XSS / CSP / 暗号: Critical:0 High:0 Medium:0 Low:2
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当範囲
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲
- G. optional reviewer 範囲: 該当なし: 対応表・a11y は optional reviewer の担当範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

main / preload / IPC / BrowserWindow / CSP は差分 0 (data-model §0、SC-007)。`src/main/app/window.ts:44-81` は `sandbox: true` / `contextIsolation: true` / `nodeIntegration: false`、`setWindowOpenHandler` は deny + `openExternalIfHttp`、`will-navigate` は全拒否。`src/main/app/protocol.ts:52-61` の CSP は `default-src 'none'`、`img-src 'self' data:`、`connect-src 'none'` (本番)。新しくなるのは (1) 会話由来の通知本文の redactSecrets + 切り詰め (`src/domain/session/system-event.ts:50-62`)、(2) Web 検索結果の URL を `<a target="_blank">` にすること、(3) server_tool_use の args を tool-call の名前空間に載せ `__serverTool` で振り分けること (偽装防止は `stripInternalKeys`、`src/renderer/src/features/chat/convert.ts:36-60`。FE-030 に負例あり)、(4) 過去ログの system の記録を判別子で行に変換すること。Sources の外部取得の懸念は FE-001 の照合項目と CSP で塞がる。Critical / High に当たる観察事実は無い。

## Findings

### [Medium] `files_persisted` のファイル名に `pathTail` を通さず、U-3 の「絶対パスはユーザー名を含むので末尾だけ」と食い違う (M-001) (scope: feature)

- **観察**: `data-model.md:81` では `memory_recall` の名前の列は `pathTail(path)` で末尾だけ (`:83`、FR-005)。`data-model.md:87` の `files_persisted` は `files[].filename` → `failed[].filename` をそのまま `redactedBodyLine` に通すだけ。SDK の型 (`sdk.d.ts:4774-4788`) の `filename: string` に相対/絶対の制約は無い。spec U-3 (`spec.md:80`) の理由は memory_recall にしか適用されていない。BE-011 のテスト (`tasks.md:28`) も絶対パスの目印検査を memory_recall にしか持たない
- **同種事象探索**: data-model.md で `pathTail|絶対パス` 3 件 (`:71`、`:81`、`:83`)、すべて memory_recall。`files_persisted` / `failed[].filename` / `document` の `source.filename` (`:144`) には適用が無い
- **リスク/影響**: OS のユーザー名が transcript の DOM に出る経路が spec の自己規則と不一致。既存の tool args でも絶対パスは出ているので深刻さは低い
- **推奨アクション**: data-model §1.5 で `files[].filename` / `failed[].filename` を `pathTail` → `redactedBodyLine` の順に通す。§2.2 の `document` の `source.filename` も同様。または「filename は相対名」の根拠を research に書く。BE-011 / BE-020 に絶対パスの目印を足す
- **根拠**: spec U-3 / FR-005、AD-049 Decision 5、CWE-359
- **scope 根拠**: data-model §1.5 / §2.2 と BE-011 / BE-020

### [Low] Sources の `url` を伏せ字なしで DTO と `href` に運ぶ (L-001) (scope: feature)

- **観察**: `data-model.md:150-153` §2.2.1 は URL に長さ・制御文字・scheme の検査だけ。既存の WebTool は見出しを host だけにする (`web-tool-heading.test.ts:8-11`)。Sources は完全な URL を `href` に入れる
- **リスク/影響**: 公開ページなので実害は小さいが、署名付き URL の token が DOM 属性に残りうる
- **推奨アクション**: research に「検索結果の URL は伏せ字を当てない (リンク成立を優先、表示は host だけ)」と理由を書く
- **根拠**: AD-049 Decision 3

### [Low] renderer の guard は `server-tool-call` の URL / `errorCode` / `blockType` の形を再検査しない (L-002) (scope: feature)

- **観察**: `data-model.md:133` の `filterPart` の `server-tool-call` case は `sources` 20 件以内と `kind` だけを見る。既存 default 経路 (`transcript-guard.ts:93-95`) も domain の無害化を信頼する設計。リンク化時の `https?://` 検査 (§2.5) と `openExternalIfHttp` (`window.ts:31-39`) が最終防御
- **リスク/影響**: 多層防御の厚みの問題のみ
- **推奨アクション**: 任意。guard で `url` の型と長さ ≤ 2048、`errorCode` / `blockType` の型を検査
- **根拠**: CWE-20

### [Low] リンクのクリックが main の `setWindowOpenHandler` に届くことを Sources の経路では固定していない (L-003) (scope: feature) [H]

- **観察**: FE-030 (`tasks.md:57-58`) は `target` / `rel` と http(s) 以外の非リンク化を固定する。`target="_blank"` が外れると `will-navigate` が拒否し「開かない」だけで検出されない
- **リスク/影響**: 機能後退を捕まえられない (安全側)
- **推奨アクション**: FE-030 で `target="_blank"` を必須として assert すると明記
- **根拠**: regression 防止

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `pathTail\|絶対パス` in data-model.md | 3 | data-model.md:71, :81, :83 |
| L-001 | `webFetchHeading` in src/renderer | 4 | web-tool-heading.ts:14, web-tool.aui.tsx:17/:36, web-tool-heading.test.ts:3 |
| L-002 | `case '` in transcript-guard.ts filterPart | 2 | transcript-guard.ts:80, :82 |
| L-003 | `target=` in src/renderer/src | 1 | features/session/ElicitationCard.tsx:305 |

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 3
