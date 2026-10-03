# security-reviewer Review: ui-coverage 対応表の確立 (O-2)

**Run**: 2026-10-03
**Reviewer**: security-reviewer
**Spec**: specs/011-ui-coverage/spec.md
**Round**: 1 (pr-gate)

## 初回読了 viewpoint

- FR/SC: FR-007 (実行中の tool の結果)、FR-008 (Hook / task の許可リストと無害化)、FR-009 (合成と行の作成の制限)、FR-011 (port の経路だけ)、FR-014 (直近の活動の整形と秘密の扱い)、SC-003、SC-004、SC-006
- touched files に該当する charter / Confirmation: AD-043 Decision 2、AD-041 (g)、AD-034 Decision 1、AD-044 (security の範囲外)、session charter、ui charter
- A. 認可 / 認証 / secret 管理 / プロセス境界: Critical:0 High:0 Medium:0 Low:2
- B. 入力検証 / injection / XSS / CSP / 暗号: Critical:0 High:0 Medium:0 Low:1
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: 本 reviewer の担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

scope の 88 files に `src/main/**`、`src/preload/**`、`BrowserWindow`、`ipcMain` は含まれない (SC-004 と一致。新しい依存も無い)。新しい面は (1) agents が tool の結果を埋めた DTO を送り直す経路、(2) Hook / task のシステムメッセージの許可リスト変換、(3) renderer での形の検証、(4) 監視ビューの要点の整形。

確認できたこと: 許可リスト外のフィールドは読まれない (`system-event.ts:96-137`、テスト `system-event.test.ts:44-103`)。`name` / `detail` は `sanitizeBody` + 120 コードポイント (`system-event.ts:34-41`)。行を作れるのは `opens` だけ (`:161`)。renderer は `Object.hasOwn` と prototype の無い表で照合 (`transcript-guard.ts:29-40`)。`SystemEventRow` はテキストノード (`thread.aui.tsx:945-969`、`<img onerror>` のテスト `ChatScreen.o2.test.tsx:182-189`)。送り直しの上限 `RESEND_RESULT_MAX_BYTES` と 256 件。`user` の本文ブロックは返さない。Bash の要点はクォート・`\`・`$`・backtick・`(`・秘密の接頭辞で出さない。Critical / High に当たる実害の経路は見つからなかった。

## Findings

### [Low] `hook_name` は秘密の判定を通さずに表示される。V-4 は未実施 (L-001) (scope: feature)

- **観察**: `system-event.ts:107` は `oneLine(m.hook_name)` をそのまま `name` に。`mayCarrySecret` を通すのは `local_bash` の説明だけ (`:117`)。spec.md:262 の [ASSUMED] は V-4 の結果で切り替えるとするが V-4 は未実施
- **同種事象探索**: `oneLine\(m\.` 5 件、秘密の判定は 1 件
- **リスク/影響**: Hook の設定に `TOKEN=... cmd` の形があり `hook_name` に入ると transcript に出る (CWE-200)。監視ビューには出ない
- **推奨アクション**: `hook_name` にも `mayCarrySecret` を通し、当たれば `''` にして `hook_event` だけで描く。テストを 1 件足す
- **根拠**: CWE-200 / CWE-532、Constitution V、spec.md:262
- **scope 根拠**: touched file

### [Low] `mayCarrySecret` は URL の資格情報・`Bearer`・`-p<pw>` を通す (L-002) (scope: feature)

- **観察**: 判定は (1) `["'\\$`(]` (2) 語の先頭の `NAME=` (3) 既知の接頭辞 の 3 種類 (`system-event.ts:47-51`)。`curl -H Authorization:Bearer abc` / `?access_token=` / `https://user:tok@host` / `mysql -pS3cret` は通る
- **リスク/影響**: Terminal block にはもともとコマンド全体が出るので新たな漏れではない。ただし data-model §2 の「秘密を含みうるなら出さない」を満たしていない
- **推奨アクション**: (a) `local_bash` の説明は常に `''` (最小)、または (b) パターンを足す
- **根拠**: CWE-200、data-model.md:88
- **scope 根拠**: touched file

### [Low] 送り直しの上限は `result` の合計だけを数え、`argsText` と結果だけのメッセージは数えない (L-003) (scope: feature)

- **観察**: `withToolResults` が数えるのは `result` だけ (`tool-result.ts:130-149`)。送り直しには part ごと最大 200KB の `argsText` が全 part 分入る。結果だけのメッセージ (`live-tool-results.ts:123`) は件数・合計の上限が無い
- **リスク/影響**: 送る元は自プロセスの SDK。可用性の上界が data-model §3 の見積もりより大きい (CWE-400)
- **推奨アクション**: data-model §3 に明記するか、送り直し 1 回の総量の上限にする。結果だけのメッセージにも上限
- **根拠**: CWE-400、AD-043 Decision 2
- **scope 根拠**: touched files

### [Low] (H) 上限の切り詰めで後から届いた結果が空になることを固定するテストが無い (L-004) (scope: feature)

- **観察**: `tool-result.ts:137` は合計が 1MB に達すると `budget = 0` にし、後の結果を `''` + `truncated: true` にする。`live-tool-results.test.ts:183-192` は合計が上限以下であることだけを見る
- **リスク/影響**: 利用者から「承認した操作の結果が見えない」に見え、原因を追えない
- **推奨アクション**: テストで固定し、data-model §3 に累積で効くことを書く
- **根拠**: reviewer-base H
- **scope 根拠**: touched files

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `oneLine\(m\.` / `mayCarrySecret` | 5 / 1 | system-event.ts:107, 115, 116, 117 |
| L-002 | `mayCarrySecret` の呼び出し | 1 | system-event.ts:117 |
| L-003 | `RESEND_RESULT_MAX_BYTES` | 2 | tool-result.ts:88, 117 |
| L-004 | `truncated: true` (tool-result.ts) | 1 | tool-result.ts:148 |

(Critical の候補として `dangerouslySetInnerHTML|innerHTML` を `src/renderer/src` (テスト除く) で探し 0 件。preload / ipcMain / BrowserWindow の差分も 0 件。)

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 4
