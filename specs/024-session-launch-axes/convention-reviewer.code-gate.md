# convention-reviewer Review: 起動設定の残りの軸 — 追加ディレクトリ・上限・セッション名 (024-session-launch-axes)

**Run**: 2026-10-30
**Reviewer**: convention-reviewer
**Spec**: specs/024-session-launch-axes/spec.md
**Round**: code-gate iter 2 (pr-gate round 1 の修正後の再実行)

## lint-agent JSON の受け取り (CONV-1)

JSON を受け取った。自分では lint を実行していない。
- `exit_code` は全体 0。`commands[]` 5 本 (eslint / tsc node / tsc web / dependency-cruiser / constitution check) はすべて 0。exit_code 由来の Critical は 0 件。
- `violations[]` は空 (error 0 / warning 0 / info 0)。
- prettier/prettier warning 20 件はすべて touched-file scope の外 (elicitation 関連。本 spec の対象外)。finding にしない。
- `check:constitution` の `pending: 1` は exit 0 で、finding にしない。

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-017 / SC-001〜SC-009。F で効くのは FR-015、FR-017、新設 2 ファイル。
- charter / Confirmation: session charter の「SessionLaunchConfig の解決・プリセット・起動」。命名規約に抵触する差分なし。
- A. 認可 / 認証 / secret 管理: 該当なし: convention-reviewer の owner 外 (security-reviewer)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: convention-reviewer の owner 外 (security-reviewer)
- C. 業務不変条件 / Charter drift: 該当なし: convention-reviewer の owner 外 (architecture-reviewer)
- D. Constitution / ADR drift: 該当なし: convention-reviewer の owner 外 (architecture-reviewer)。dependency-cruiser は exit 0
- E. User Story / SC / AC / UX: 該当なし: convention-reviewer の owner 外 (po-reviewer)
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:1 Low:3
- G. optional reviewer 範囲: 該当なし: convention-reviewer の owner 外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

diff は 80 ファイル。新設は `src/renderer/src/features/session/LaunchExtraAxes.tsx` (Pascal・コンポーネント) と `launch-extra-axes.ts` (kebab・ロジック)。同 dir の既存慣習と一致。配置は plan の「Structure Decision」どおり。plan / data-model の識別子は実装に一致し、リネーム漏れなし。新規 export に孤立したものなし。

## Findings

### [Medium] LaunchDialog.tsx が 500 行警告を超え、本 spec でさらに 230 行増えた (M-001) (scope: feature)

- **観察**: `src/renderer/src/features/session/LaunchDialog.tsx` は base 895 行 → HEAD 1125 行 (+230)。軸の state・hook・押せない条件・通知の配線が `LaunchDialog` に残る。
- **同種事象探索**: 500 行超の非テスト変更ファイル 7 件 (running-session-store.ts 1364 / LaunchDialog.tsx 1125 / sdk-agent-session.ts 1115 / e2e-capability.ts 799 / labels.ts 749 / session-core.ts 739 / session-launch-service.ts 734)。本 spec で大きく増えたのは `LaunchDialog.tsx` だけ。
- **リスク/影響**: 保守性。正しさには影響しない。
- **推奨アクション**: gate では直さない (AD-050)。棚卸しで `useLaunchExtraAxes` への切り出しを扱う。
- **根拠**: CONV-3

### [Low] LaunchExtraAxes.tsx の冒頭 doc コメントが実装と食い違う (L-001) (scope: feature)

- **観察**: `LaunchExtraAxes.tsx:6` に「いまは追加ディレクトリだけ (上限と名前は US-2 / US-3)」とあるが、`:49-125` で上限とセッション名も描いている。
- **同種事象探索**: `いまは|US-2 / US-3` を `src/renderer` で 1 件。
- **推奨アクション**: コメントを現状に直す。
- **根拠**: CONV-6

### [Low] session-ipc.ts の「6 軸」コメントが 10 キーの現状と合わない (L-002) (scope: feature)

- **観察**: `src/main/app/session-ipc.ts:178` の「6 軸」。`SessionLaunchConfig` は 10 キー。
- **同種事象探索**: `6 軸|前 6|12 キー` を `src` (非テスト) で 8 件、古い記述は `session-ipc.ts:178` のみ。
- **推奨アクション**: 「起動設定 10 キー」に直す。
- **根拠**: CONV-6 / FR-015

### [Low] LaunchExtraAxes.tsx に同一の class 定数が 2 つある (L-003) (scope: feature)

- **観察**: `LaunchExtraAxes.tsx:12` の `selectClass` と `:47` の `inputClass` が同じ文字列。
- **同種事象探索**: 同文字列は `src/renderer` でこのファイル内 2 件のみ。
- **推奨アクション**: 1 つにまとめる。
- **根拠**: CONV-3 / CONV-5

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | wc -l (非テスト変更ファイル 500 行超) | 7 | 上記 |
| L-001 | `いまは\|US-2 / US-3` | 1 | LaunchExtraAxes.tsx:6 |
| L-002 | `6 軸\|前 6\|12 キー` | 8 (古い記述 1) | session-ipc.ts:178 |
| L-003 | class 文字列の重複 | 2 | LaunchExtraAxes.tsx:12, :47 |

## H の実質記入

- `launch-extra-axes.ts` は `launch-extra-axes.test.ts`、`LaunchExtraAxes.tsx` は `LaunchDialog.test.tsx` でカバー。
- `QUERY_OPTION_KEYS` 16 / `LAUNCH_CONFIG_KEYS` 10 / `PRESET_CONFIG_KEYS` 9 の pin テストあり。
- lint・両 tsc・depcruise・constitution check がすべて exit 0。

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 3
- Round inheritance: new: 4 (Medium 1 / Low 3)。いずれも gate で直さない (AD-050)。
