# security-reviewer Review: 会話の時間と活動の可視化 (O-9)

**Run**: 2026-10-16
**Reviewer**: security-reviewer
**Spec**: specs/017-ui-conversation-time-and-activity/spec.md

## 初回読了 viewpoint

- FR/SC:
  - FR-001 / FR-004: 過去ログで型に無い `timestamp` を untrusted として検査する (入口の検証。SEC-4 / SEC-6 に当たる)
  - FR-002 / FR-003: 実行中は受信時刻と送信時刻を使う (生成元は信頼できる時計)
  - FR-005 / SC-005: IPC・preload・main・Agent SDK の許可リスト・query options に差分を出さない (SEC-2 / SEC-3 / SEC-4 / SEC-7 の面は増えない)
  - FR-006 / FR-009 / FR-013: 時刻・入力の先頭・区間名を描画する (renderer の injection の面。SEC-6)
  - Principle XIII の照合 (SH-002): registry の element を取り込む (SEC-6 の CSP、SEC-8 の依存)
- touched files に該当する charter / Confirmation:
  - ui charter の「長大スレッドは仮想化する」と表示網羅
  - AD-051 Decision 4 (未信頼として検査し、domain の純関数 1 つで行う)
  - AD-034 (取得の経路は変えない。地図は取得し直さない)
  - Constitution IV (SDK 経由) と V (長期資格情報を持たない。N/A)
- A. 認可 / 認証 / secret 管理 / プロセス境界の hardening: Critical:0 High:0 Medium:0 Low:0
- B. 入力検証 / injection / XSS / CSP / 暗号: Critical:0 High:0 Medium:1 Low:1
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の範囲
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲: 該当なし: optional reviewer (a11y / ux / ui-coverage) の範囲
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

時刻は 3 か所から入る。過去ログの `getSessionMessages` の返りにある、型に無い `timestamp`。実行中の `SDKAssistantMessage.timestamp`。受信時刻と送信時刻。どれも `createdAt: number | null` として、既存の DTO の形のまま supervisor → main → renderer を流れる。renderer ではターンの導出・会話の地図・活動の帯を、表示の状態として組む。

IPC・preload・main・BrowserWindow・`shell.openExternal`・子プロセスはどれも変わらない (FR-005 / SC-005。`git diff` が 0 であることを quickstart V-1 で確かめる)。新しく信頼できない入力になるのは `timestamp` の文字列だけである。

その検査 (data-model.md:22-38) の手順は次のとおり。
1. 型を確かめる
2. 40 文字を上限にする
3. アンカー付きの線形の正規表現に当てる
4. `Date.parse` の NaN と存在しない日付を捨てる
5. 範囲で捨てる

正規表現は入れ子の量指定子を持たず、長さの上限も先に当てるので、ReDoS は成立しない。描画するのは React の text と属性だけである (data-model.md:113)。`dangerouslySetInnerHTML` の経路は設計に無い。入力の先頭は、変換の `sanitizeBody` (src/domain/session/sanitize-body.ts:53) で不可視文字を除いた本文を切り詰めたものである。

## Findings

### [Medium] renderer は `createdAt` を有限かどうかでしか検査せず、`Date` の範囲外の値で描画が例外になる (M-001) (scope: feature)

- **観察**: `readMessageTime` の検査は「`Number.isFinite` でない値は `null`」だけである (data-model.md:61、tasks.md:39 FE-010)。境界の guard も `typeof value.createdAt === 'number'` しか見ていない (src/renderer/src/features/chat/transcript-guard.ts:102)。
  - `MessageTimeLabel` は `<time dateTime={ISO}>` を描き (data-model.md:183)、書式は `Intl.DateTimeFormat` を使う (data-model.md:159)。
  - 有限でも ±8.64e15 を超える数を渡すと、`new Date(ms).toISOString()` も `Intl.DateTimeFormat#format` も `RangeError` を投げる。
  - 生成元は `parseMessageTime` (範囲検査あり) と `Date.now()` / `clock.now()` だけなので、今の設計で実害が出る経路は無い。
- **同種事象探索**: `createdAt` を src で検索して 2 件 (src/renderer/src/features/chat/convert.ts:171 `new Date(dto.createdAt)`、src/renderer/src/features/chat/transcript-guard.ts:102)。renderer が範囲を検査している箇所は 0 件。
- **リスク/影響**: supervisor の不具合や将来の経路の追加で範囲外の数が届くと、transcript の描画全体が例外で落ちる。「読めない値は `null` にして今の表示に戻る」という AD-051 Consequences の性質が renderer 側で崩れる。
- **推奨アクション**: `readMessageTime` に 2 つの方法のどちらかを入れる。
  - `parseMessageTime` と同じ下限 (`1577836800000`) と上限 (`Date` の最大値。8.64e15) で `null` に倒す。
  - `new Date(ms)` の `getTime()` が NaN なら `null` にする。

  あわせて FE-010 のテストに `1e20` → `null` を足す。
- **根拠**: CWE-20 (入力の検証が不十分)、AD-051 Decision 4
- **scope 根拠**: FE-010 の touched file (`features/chat/message-time.ts`) で直せる

### [Medium] SH-002 で registry の element を取り込んだ後に、依存と lockfile の差分が 0 であることを確かめる手順が無い (M-002) (scope: feature)

- **観察**: plan.md:20 は「新しい npm の依存は足さない」と言い、SH-002 (tasks.md:16) は「新しい npm の依存が要る」を不採用の条件にしている。一方、検証の SH-013 (tasks.md:82) と quickstart V-1 の `git diff` が見るのは `src/main` / `src/preload` だけで、`package.json` と lockfile は見ていない。
  - registry の取り込みに使う CLI は、依存を自動で入れたり `package.json` を書き換えたりすることがある。
- **同種事象探索**: tasks.md で `package.json|lock` を検索して 0 件 (SH-013 の検証項目に無い)。
- **リスク/影響**: 照合の副作用で、`postinstall` を持つ依存や推移的な依存が気づかれずに入りうる (SEC-8)。
- **推奨アクション**: SH-013 / quickstart V-1 に `git diff main --stat -- package.json pnpm-lock.yaml` (実際の lockfile 名に合わせる) が空であることを足す。取り込んだ element が外部 URL を参照していないことの確認 (SH-002 の「外部への取得がある」) を PR の説明に書く項目にする。
- **根拠**: plan.md:20 の制約、SEC-8
- **scope 根拠**: tasks.md の SH-002 / SH-013 で直せる

### [Low] 正規表現はオフセットの値の範囲 (`+99:99` など) を検査せず、`Date.parse` の挙動に任せている (L-001) (scope: feature)

- **観察**: data-model.md:30 の正規表現は `[+-]\d{2}:\d{2}` で、どの 2 桁でも受ける。data-model.md:37 は日付の一致を検査する手順を書いているが、オフセットが範囲外のときの扱い (NaN になるか) は明記していない。
- **同種事象探索**: data-model.md の fixture (:38) に範囲外のオフセットの例は 0 件。
- **リスク/影響**: エンジンによってはオフセットとして受けて時刻がずれるかもしれない。表示だけに使う値なので害は小さい。
- **推奨アクション**: BE-001 の fixture に `2026-10-16T01:23:45+99:99` → `null` を足す。
- **根拠**: AD-051 Decision 4 (厳密な ISO 8601)
- **scope 根拠**: BE-001 で直せる

## H (テスト / regression) について

- M-001 を検出できるテストは、今の FE-010 の観点に無い (`null` と既定値「今」を拾わないことだけを見ている)。上の推奨のとおり 1 件足せば検出できる。
- 境界を広げないこと (FR-005) の regression の根拠は SC-005 の固定テストと `git diff` で、IPC・preload の面が増えないことを機械的に確かめられる。ただし依存 (SEC-8) は対象の外 (M-002)。
- 検査 (`parseMessageTime`) が捨てた値は、観測点 (log) を持たずに静かに `null` に倒れる。AD-051 の Confirmation は実機の目視 (quickstart V-3) と SDK を上げたときの手順で拾う設計で、表示だけの値なので log が無くても許容範囲である。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `createdAt` (src、テストを除く。renderer の `new Date` / guard) | 2 | src/renderer/src/features/chat/convert.ts:171, src/renderer/src/features/chat/transcript-guard.ts:102 |
| M-002 | `package.json\|lock` (tasks.md) | 0 | - |
| L-001 | 範囲外のオフセットの fixture (data-model.md) | 0 | - |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 1
