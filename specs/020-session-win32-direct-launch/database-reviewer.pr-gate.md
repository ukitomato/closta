# database-reviewer Review: Win32Runtime の直接起動 (X-8)

**Run**: 2026-10-21
**Reviewer**: database-reviewer
**Spec**: specs/020-session-win32-direct-launch/spec.md
**Round**: 1 (pr-gate)

## 初回読了 viewpoint

- FR/SC: FR-006 (場所の指定の永続化。資格情報を含まない。指定の誤りを隠さない)、FR-004、FR-015、SC-002。永続化に触れるのは FR-006 だけ。
- touched files に該当する charter / Confirmation: runtime charter の設定・検出。永続化の実体は `src/main/infra/settings/runtime-settings-store.ts` (新設)。結線は `src/main/app/composition-root.ts:108-137`。保存の入口は `src/main/app/win32-claude-path-service.ts:27-36`。契約の正本は `data-model.md` §3。
- SQL migration は存在しない。DB-7 は 該当なし。
- code-gate (iter 1) で出した High 2 件は、HEAD 7e5e1ba で解消されていることを現行コードで確認した (下の「code-gate 指摘の再確認」)。
- A. 認可 / 認証 / secret 管理: 該当なし: secret の流れは security-reviewer の担当。器 (DB-1) は問題なし。永続化する型は `{schemaVersion, win32ClaudePath}` の 2 キーだけで、`Record<string,string>` のような何でも入る袋も資格情報の実体を持つ欄もない (`runtime-settings-store.ts:147-176`)。
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当。永続化の入口の検証 (load: 長さ・制御文字・型、save: 保存前に `classifyClaudeExecutable`) は整合している。
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当。
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当。
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当。
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当。
- G. optional reviewer 範囲 (永続化スキーマ): Critical:0 High:0 Medium:1 Low:1
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

永続化の新設は `runtime-settings.json` の 1 ファイルだけ。内容は `schemaVersion: 1` と `win32ClaudePath: string | null` で、userData 配下に temp file + rename で書く。形は `launch-usage-store.ts` と同じ。

- DB-1: secret を置ける場所はなく、問題なし。env や Provider は永続化していない。
- DB-2 / DB-3: 初版なので旧形式の移行は不要。`schemaVersion` はあり、将来版は `.bak` に退避して `newer-version` として扱う。保存側も将来版を上書きしない。
- DB-4: 書き込みは temp + rename で、失敗時は temp を消す。所在は `app.getPath('userData')` 配下で、`electron` は import していない。parse 失敗でも黙って「指定なし」にはならない (後述)。
- DB-5: `claudeOverridden` / `claudeStatus` は locator が導出する値で、永続化していない。指定先のファイルが消えたときは `override-invalid` として利用者に出る。孤児は生まない。
- DB-6: key 名 `win32ClaudePath` と `classifyClaudeExecutable` (絶対 `.exe` だけを通す) により、名前空間は読み取り側で判別できる。

### code-gate 指摘の再確認

- H-001 (読めない設定を「指定なし」に倒す) は解消した。`composition-root.ts:121-135` の `override()` は、`loaded` でも `reasonKeys` が空でなければ throw する。`loaded` 以外でも throw する。`win32-claude.ts:44-50` は throw を `override-invalid` (`overridden: true`) に変える。自動探索に戻るのは ENOENT だけ。テストは `win32-claude.test.ts:76-88`。
- H-002 (将来版の上書き) は解消した。`runtime-settings-store.ts:147-170` は保存前に現在のファイルを読み、`schemaVersion` が将来版なら throw する。`win32-claude-path-service.ts:30-32` がこれを `save-failed` にする。テストは `runtime-settings-store.test.ts:100` 付近。

## Findings

### [Medium] 破損 / 将来版のファイルが直らないかぎり、検出のたびに新しい `.bak` が増える (M-001) (scope: feature)

- **観察**: `runtime-settings-store.ts:86-101` の `backupThen` は、`parse-failed` / `newer-version` のたびに `${FILE_NAME}.${now()}.bak` を新規に書く。`load()` は `composition-root.ts:122` の `override()` から検出のたびに呼ばれる。再検出 (一覧の再読み込み、`pick` / `clear` 後の `refresh`) ごとにファイルが増える。H-001 の解消で破損ファイルが `override-invalid` として残り続けるようになったため、増える条件が成立しやすくなった。
- **リスク/影響**: userData に同内容の `.bak` が際限なく溜まる。データ損失ではない。上限か重複の判定が無いので Medium。
- **推奨アクション**: マイルストーン末の棚卸しで扱う。直す場合は、同じ内容の `.bak` が既にあれば書かない (内容のハッシュを名前に入れる)。または、プロセスごとに 1 回だけ退避する。
- **根拠**: DB-4。AD-050 により gate では直さない。

### [Medium] composition-root の `override()` 分岐にテストが無い (M-002) (scope: feature)

- **観察**: `composition-root.ts:121-135` の分岐は FR-006 の核心 (読めない設定を `override-invalid` にする) である。locator 側 (`win32-claude.test.ts:76-88`) と store 側 (`runtime-settings-store.test.ts`) は個別にテストされている。しかし、`reasonKeys` が空でないときや `newer-version` / `read-failed` のときに throw する結線を確かめるテストはない。`src/main/app/*.test.ts` に `runtime-settings` を直接参照するテストは 0 件。
- **リスク/影響**: 結線の if を 1 つ外しても、store と locator の単体テストは通る。H-001 と同じ退行が静かに戻りうる。
- **推奨アクション**: `override()` の分岐を composition-root から小さな関数に切り出し (`electron` に依存しない)、`loaded` + `reasonKeys` / `newer-version` / `read-failed` の 3 ケースの throw をテストする。
- **根拠**: viewpoint H。

### [Low] 将来版のファイルがあると、指定の選び直し・解除が `save-failed` で行き止まりになる (L-001) (scope: feature)

- **観察**: 将来版のファイルでは `load()` が `newer-version` を返して locator が `override-invalid` を出し、UI は「選び直すか指定を解除してください」と案内する。しかし `saveWin32ClaudePath` は将来版のファイルを拒否する (`runtime-settings-store.ts:163-169`) ため、pick / clear はどちらも `save-failed` になり、利用者は自力では抜けられない。
- **リスク/影響**: ダウングレードして使う利用者だけが当たる。既存データは守られているので実害は小さい。
- **推奨アクション**: 対処は不要。
- **根拠**: DB-3。

### [Low] 保存ストアは未知のキーを黙って落とす (L-002) (scope: feature)

- `runtime-settings-store.ts:171-175` は現行の 2 キーだけを書く。同じ版に未知キーを書く別の書き手がいないので対処不要。

## 同種事象探索 cascade summary

Critical は 0 件のため該当なし。

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 2
- Round inheritance: resolved from code-gate: 2 (H-001, H-002) / unresolved: 0 / new: 0
