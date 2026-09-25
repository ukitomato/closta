# pr-gate Round 2 (re-verify): security-reviewer (R-4 Tier A tool 表示)

**Run**: 2026-09-25 · Read-only · **Round**: 2

## Verdict

security-reviewer: Critical 0 / High 0 / Medium 0 / Low 1  (UNRESOLVED + NEW のみ計上)

Round 1 の全指摘 (H-001 / M-001 / L-001 / M-002) は解消。新規 Critical/High/Medium なし。Low を 1 件だけ観察 (到達経路なしの defense-in-depth 観察 — gate をブロックしない)。

Round inheritance: resolved from Round 1: 4 (H-001, M-001, L-001, M-002) / unresolved: 0 / new: 1 (Low, 情報提供)

## 初回読了 viewpoint

- FR/SC: FR-002/004/005/012/017、SC-002/004/005 (Tier A 表示、subagent 入れ子、argsText sanitize、切り詰め表示)
- touched files に該当する charter/Confirmation: docs/domains/ui/charter.md (transcript 表示は read-only)、AD-034 (取得プロセス↔renderer の port2 直通、main 非経路) 維持
- A. 認可/認証/secret 管理: Critical:0 High:0 Medium:0 Low:0 (新規 IPC/spawn/secret 経路なし、children は port2 フレーム内で main 非経路)
- B. 入力検証/injection/XSS/CSP/暗号: Critical:0 High:0 Medium:0 Low:1 (`__subagentChildren`/`__truncated` injection は strip+override で閉塞。L-NEW-1 は到達経路なしの二重防御 gap)
- C. 業務不変条件/Charter drift: 該当なし: architecture-reviewer owner
- D. Constitution/ADR drift: 該当なし: architecture-reviewer owner (AD-034 の main 非経路は維持と観察)
- E. User Story/SC/AC/UX: 該当なし: po-reviewer owner
- F. 命名/module/lint hookup: 該当なし: convention-reviewer owner
- G. optional reviewer 範囲: 該当なし: 本 reviewer owner 外
- H. テスト/coverage/observability/regression: Critical:0 High:0 Medium:0 Low:0 — injection 3 経路 (偽 children / malformed / 偽 truncated) に negative test あり (`ChatScreen.test.tsx:495-545`)、byte cap / bidi の end-to-end 回帰あり。

## Resolved

### H-001 (High→解消): `__subagentChildren` injection 完全閉塞
- **strip**: `convert.ts:33-39` `stripInternalKeys` が untrusted argsText parse から **すべての `__` prefix キー**を除去 (`Object.entries` を fresh `{}` に写す)。
- **always-override**: `convert.ts:54-58` で spread の**後**に `__subagentChildren: part.children` を明示設定。順序が正しく、strip と override の二重防御。
- `part.children` は trusted 経路 — `transcript.ts:222` で全 tool-call part に `children: []` を初期化。
- 追加防御: `subagent.aui.tsx:43-47` `extractChildren` が `raw.filter(isValidChild)` で malformed item を落とす。
- 検証テスト: `ChatScreen.test.tsx:496-519` — argsText に偽 `__subagentChildren` を注入し real children 空でも「捏造された子作業」が描画されないことを確認。

### L-001 (Low→解消): `__truncated` spoof 閉塞
- 同一機構。`convert.ts:57` が `__truncated: part.truncated` (trusted boolean) を常時設定、argsText 由来 `__truncated` は strip 済み。`code-diff.aui.tsx:106-109` は trusted 値を読む。
- 検証テスト: `ChatScreen.test.tsx:532-544`。

### M-001 (Medium→解消): subagent breadth 上限
- `subagent.aui.tsx:28` `VISUAL_MAX_CHILDREN=50`、`:113` `slice(0, VISUAL_MAX_CHILDREN)`、`:127-129` で省略表示。`VISUAL_MAX_DEPTH=3` と併せ render tree が有界化。
- 検証テスト: Round 2 で breadth 打ち切りの unit test も追加 (`ChatScreen.test.tsx` の 51 件→省略)。

### M-002 (Medium→解消): injection 経路のテスト追加
- `ChatScreen.test.tsx:495-545` に 3 本の negative test (偽 children / malformed / 偽 truncated)。

### 継続確認 (Round 1 clean 項目の維持)
- design-gate H-1 (argsText sanitize + byte cap) 維持: `transcript.ts:213` `sanitizeBody(safeStringify(b.input), TOOL_RESULT_MAX_BYTES)`。
- plain-text 描画維持: `dangerouslySetInnerHTML|innerHTML|outerHTML` は elements 配下 0 件。
- 新規攻撃面なし: 変更で新規 IPC / spawn / console / logger / secret 経路の追加なし。`stripInternalKeys` は fresh `{}` へ写し `__proto__` も除去するため prototype pollution なし。

## Unresolved / New

### [Low] `isValidChild` は message shape のみ検証し `parts` 各要素は未検証 (L-NEW-1) (scope: feature) — **修正済み (invoker 適用)**
- **Where**: `subagent.aui.tsx:31-35` `isValidChild` は `id: string` と `Array.isArray(parts)` のみ確認。`SubagentPart` の tool-call 分岐が `part.children.length` を無条件参照。
- **Issue**: malformed part (`children` 欠落) で TypeError → 描画クラッシュしうる。ただし injection は `convert.ts` で閉塞済みで children の唯一供給源は trusted domain DTO のため**到達経路なし**。将来の domain 破損に対する二重防御としてのみ意味を持つため Low。gate をブロックしない。
- **適用した Fix**: `subagent.aui.tsx:83` を `Array.isArray(part.children) && part.children.length > 0` にガード。extractChildren の per-item guard の再帰描画側の対を閉じた。

## 同種事象探索 cascade summary
| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| (Critical なし) | — | — | Critical 申告なしのため cascade 必須要件は非該当 |
| 参考: injection marker read 面 | `__subagentChildren\|__truncated` | write は convert.ts:56-57 のみ / read は subagent.aui.tsx:45, code-diff.aui.tsx:109 のみ | いずれも args 最上位・trusted 値 |
| 参考: raw HTML 描画面 | `dangerouslySetInnerHTML\|innerHTML\|outerHTML` | elements 配下 0 件 | plain-text 描画のみ |
