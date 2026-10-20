# database-reviewer Review: Win32Runtime の直接起動 (X-8)

**Run**: 2026-10-21
**Reviewer**: database-reviewer
**Spec**: specs/020-session-win32-direct-launch/spec.md
**Gate**: code-gate (iter 1)

## 初回読了 viewpoint

- FR/SC: FR-006 (場所の指定の永続化、資格情報を含まない、指定の誤りを隠さない)、FR-004 (検出のとき 1 回解決)、FR-015、SC-002。永続化に触れるのは FR-006 だけ。
- touched files に該当する charter / Confirmation: runtime charter の設定・検出。永続化の実体は `src/main/infra/settings/runtime-settings-store.ts` (新設) と、その結線の `src/main/app/composition-root.ts:108-135` と `:357-372`。`win32-claude-path-service.ts` が保存側の入口。data-model §3 が契約の正本。
- SQL migration は存在しない。DB-7 は 該当なし。
- A. 認可 / 認証 / secret 管理: 該当なし: secret の流れは security-reviewer の担当。器の確認 (DB-1) は問題なし。永続化する型は `{schemaVersion, win32ClaudePath}` の 2 キーで、資格情報を置ける袋 (`Record<string,string>` など) はない (`runtime-settings-store.ts:27-44`, `:147-153`)。env や Provider は永続化していない。
- B. 入力検証 / injection / CSP / 暗号: 該当なし: 入力検証は security-reviewer の担当。永続化の入口の検証 (load で長さ・制御文字、保存前に `classifyClaudeExecutable`) の整合は確認した。
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当。
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当。
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当。
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当。
- G. optional reviewer 範囲 (永続化スキーマ): Critical:0 High:2 Medium:1 Low:0
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

永続化の新設は `runtime-settings.json` の 1 ファイルだけ。内容は `schemaVersion: 1` と `win32ClaudePath: string | null` で、userData 配下に temp file + rename で書く。形は `launch-usage-store.ts` と同じ。

- DB-1: secret を置ける場所はなく、問題なし。
- DB-2 / DB-3: 初版なので旧形式の移行は不要。`schemaVersion` はあり、将来版は退避して扱う。
- DB-4: 書き込みは temp + rename で原子的。所在は `app.getPath('userData')` 配下で、`electron` は import していない。
- DB-5: `claudeOverridden` と `claudeStatus` は locator が導出する値で、永続化していない。指定先のファイルが消えたときは `override-invalid` として利用者に出る。孤児は生まない。
- DB-6: key 名 `win32ClaudePath` と `classifyClaudeExecutable` により、名前空間は読み取り側で判別できる。

## Findings

### [High] 設定ファイルの読み込みが失敗すると、指定が黙って捨てられ、別の claude.exe を採る (H-001) (scope: feature)

- **観察**: `src/main/app/composition-root.ts:121-133` の `override()` は、`loaded` 以外 (`newer-version` / `read-failed` / `backup-failed`) では `console.warn` だけして `null` を返す。`loaded` で `parse-failed` のときも `win32ClaudePath: null` を返す (`runtime-settings-store.ts:122-142`)。`createWin32ClaudeLocator` (`win32-claude.ts:44-53`) は `null` を「指定なし」と見て自動探索に進み、`found` + `overridden: false` を返す。
- **結果**: 一時的な `EBUSY` / `EACCES` や破損のときに、利用者が指定した claude.exe ではなく自動探索で見つかった別の claude.exe が descriptor に入る。`claudeOverridden: false` と出るので UI から気づけない。FR-006 の「指定の誤りを黙って隠さない」と DB-4 に当たる。
- **同種事象探索**: `rg "reasonKeys|console.warn\(\`\[runtime-settings\]"` で 1 経路 (`composition-root.ts:121-133`)。
- **リスク/影響**: 利用者が意図しない版の claude.exe で起動する。原文は `.bak` に残る。
- **推奨アクション**: load が `loaded` でない / `parse-failed` のときは locator に「指定の状態が読めない」を渡し `override-invalid` にする。自動探索に戻すのは ENOENT のときだけ。結線の分岐をテストする。
- **根拠**: spec FR-006、data-model §3 の表 (「読めない → 指定なし」は表の記述どおりだが FR-006 との整合が取れていない。仕様側の判断が要る)。

### [High] 将来版ファイルは「書き込まない」契約なのに、保存の経路にガードがない (H-002) (scope: feature)

- **観察**: data-model §3 (`data-model.md:100`)、`runtime-settings-store.ts:18`、tasks.md:56 は `newer-version` のとき書き込まないと定めている。`saveWin32ClaudePath` (`runtime-settings-store.ts:147-163`) は無条件で上書きする。呼び出し側 `win32-claude-path-service.ts:27-36` と `composition-root.ts:366` も `load()` の結果を見ない。
- **結果**: 新しい版のアプリが書いたファイルを旧版で保存/解除すると将来のキーごと上書きされる (DB-3)。
- **同種事象探索**: `rg "newer-version"` (src) で 3 か所。保存側で参照する箇所は 0 件。
- **推奨アクション**: 保存前に現在のファイルの `schemaVersion` を確かめ、将来版なら `save-failed` を返す。「将来版のあとに save → 拒否」のテストを足す。
- **根拠**: data-model §3、AD-023、DB-3。

### [Medium] 破損 / 将来版のファイルが直らないまま、検出のたびに新しい `.bak` が増える (M-001)

- `load()` が検出のたびに呼ばれ、`parse-failed` / `newer-version` で毎回 `.bak` を新規に書く (`runtime-settings-store.ts:86-101`, `:122-142`)。

### [Medium] store の復旧経路と結線のテストが穴 (M-002)

- newer-version 後の save、backup-failed、composition-root の override 分岐、.bak の重複のテストがない。

### [Low] 保存ストアは未知のキーを黙って落とす (L-001)

- `runtime-settings-store.ts:149-153`。今は対処不要。

## 同種事象探索 cascade summary

Critical は 0 件のため該当なし。

## Verdict

- Critical: 0
- High: 2
- Medium: 2
- Low: 1
