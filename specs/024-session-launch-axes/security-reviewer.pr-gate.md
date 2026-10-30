# security-reviewer Review: 起動設定の残りの軸 — 追加ディレクトリ・上限・セッション名 (X-6 の 2 本目)

**Run**: 2026-10-30T00:00:00+09:00
**Reviewer**: security-reviewer
**Spec**: specs/024-session-launch-axes/spec.md
**Round**: 1

Critical 0、High 0、Medium 2、Low 0。2 件の Medium はどちらも design-gate で出した Medium (M-001 / M-002) が未対応のまま実装に入ったもので、新しい観察ではない。新しい入力の 4 キーは IPC (main) と agents の 2 段で検証されている。追加ディレクトリについて renderer が送れるのは folder id だけ。main は改ざん・登録解除・ランタイムの不一致のどれでも `invalid-config` で起動を拒否し、黙って外さない。

## 初回読了 viewpoint

- FR/SC: FR-001 / FR-002 / FR-003 (id だけを送る、main の再評価と id からパスへの変換、agents の再検査)、FR-005 (上限の 2 段検証)、FR-007 (名前の 2 段検証、ログに出さない)、FR-008 (registry の名前の初期値)、FR-011 (preset の書き込みと読み込みに同じ述語)、FR-012 (再開は `sessionName === null`)、FR-015 (`QUERY_OPTION_KEYS` を 16 に)。SC-001 / SC-003 / SC-004
- touched files に該当する charter / Confirmation: AD-064 Decision 1 / 2 (登録フォルダを main が変換した値に限る) / 4 (presets 版 2) / 5 (再開で title を渡さない)、AD-041 (g)、AD-059 (resume の UUID 検査は変更なし)、Constitution Principle III (安全 3 値は変更なし) / V (値をログに出さない)、session charter の起動と軸の解決
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:0 Low:0
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:1 Low:0
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当範囲
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲
- G. optional reviewer 範囲: 該当なし: security-reviewer の担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

`SessionLaunchConfig` は 4 キーが増えて 10 キーになった (`additionalDirectoryIds` / `maxTurns` / `maxBudgetUsd` / `sessionName`)。値の経路は次のとおり。
- renderer → IPC `checkLaunchConfig` (`isValidLaunchConfig`。キーの allowlist、id の形、0〜10 件、重複なし、作業フォルダ自身を含まない、上限の範囲、名前の規則)
- → main `prepareLaunch` (`directoryResets` が 1 件でもあれば拒否し、`resolveAdditionalDirectories` で id をパスに変換)
- → agents の decoder と `buildQueryOptions` (`isValidAdditionalDirectories` と上限・名前の述語を再検査)
- → SDK の `additionalDirectories` / `maxTurns` / `maxBudgetUsd` / `title`

確かめた事実:
- argv の組み立てとシェル不使用は変わらない
- diff に `dangerouslySetInnerHTML` / `innerHTML` / `openExternal` / `shell: true` / `exec(` は無い (Grep で 0 件)
- 名前は 023 の `normalizeSessionName` を通る (`\p{Cc}` / U+2028 / U+2029 を拒否し、1〜100 文字。`src/domain/session/live-settings.ts:95-108`)
- エラーメッセージに入るのはキーの名前だけ (`src/agents/session-core.ts` の `buildQueryOptions`)
- preset の読み込み側は版ごとに allowlist のキーだけで組み直す (`src/main/infra/settings/preset-record.ts`)
- 再開の要求で名前が null でなければ拒否する (`src/main/app/validate.ts` の `checkResumeRequest`)
- renderer だけが渡す `unreachableFolderIds` は main では使っていない。main は `resolveFolderRuntime` で到達性を取り直す
- preload / BrowserWindow / ipcMain の登録は変わっていない

## Findings

### [Medium] agents の `windows` のパス述語が `..` の成分と、ドライブの後の `:` (NTFS の代替データストリーム) を拒否しない。design-gate M-001 が直っていない (M-001) (scope: feature)

- **観察**: `src/domain/session/agent-session.ts:257-267` の `isLaunchDirectoryValue('windows', v)` が見るのは `makeHostPath(v)` が成功し、値が変わらないことだけ。`makeHostPath` (`src/domain/runtime/path-types.ts:80-94`) が拒否するのは制御文字、ドライブの無い形、UNC だけで、`..` と 3 文字目より後の `:` は通る。したがって `C:\work\..\..\Windows` と `C:\work\lib:ads` は agents の再検査を通る。`posix` 側は `.` / `..` を拒否している (同じファイルの 266 行目)。テストも `windows` の負例に `..` / `:` が無い (`src/domain/session/agent-session.test.ts:362-375`)。
- **同種事象探索**: `isLaunchDirectoryValue` の Grep で定義 1 件 (`agent-session.ts:257`)、呼び出し 1 件 (`session-core.ts:210`)。
- **リスク/影響**: 値の出所は main が登録フォルダから変換したパスなので、いま実害の経路は無い。ただし FR-003 / AD-064 Decision 2 が言う「agents の再検査」は、WSL と Win32 で強さが揃っていない (多層防御の非対称)。
- **推奨アクション**: `windows` の分岐に次の 2 つを足す。
  - `value.slice(3).split('\\')` に `.` / `..` が無いこと
  - `value.indexOf(':', 2) === -1`

  あわせて負例のテストに `C:\a\..\b`、`C:\a\.\b`、`C:\a\b:s` を足す。
- **根拠**: CWE-22、AD-064 Decision 2、design-gate security M-001
- **scope 根拠**: 本 PR の touched files (`agent-session.ts` / `agent-session.test.ts`) で直せる

### [Medium] 追加ディレクトリを理由にした起動の拒否が、ログで既存の `invalid-config` と区別できない。design-gate M-002 が直っていない (M-002) (scope: feature)

- **観察**: `src/main/app/launch-preparation.ts` の追加分 (diff の 5341-5342 / 5356 / 5374-5375 / 5389 行目に当たる箇所) では、`directoryResets` での拒否も `resolveAdditionalDirectories` の変換失敗も、どちらも `reject('invalid-config')` を呼ぶ。`logRejection` が受ける理由のキーは 1 つだけ。
- **同種事象探索**: 該当なし (Medium)。
- **リスク/影響**: US-1 AC6 の改ざんされた要求と、ダイアログの後に登録が解除された正当な競合とが、ログで見分けられない。障害時に原因を特定する観測点が欠けている。
- **推奨アクション**: renderer への応答は `invalid-config` のまま変えない。`logRejection` にだけ、値を含まない細分キー (例 `invalid-config:additional-directory`) を渡す。テストでは、そのキーが記録され、パスの目印が 0 件であることを確かめる。
- **根拠**: CWE-778、Principle V (値はログに出さない。細分のキーは値ではない)、design-gate security M-002
- **scope 根拠**: `launch-preparation.ts` と同じファイルのテストで直せる

## H の補足 (担当範囲のテストと回帰)

- **検出できるテストがあるか**
  - M-001 を検出するテストは無い (windows の負例の不足)
  - 改ざんの経路は単体テストで押さえられている: 11 件、重複、作業フォルダ自身、未登録、別のディストロ、PathMapping の外 (`launch-preparation.test.ts`、diff の 5216 / 5232 / 5239 行目)、範囲外・NaN・Infinity・文字列 (`launch-config.test.ts` と `session-core.test.ts` の it.each)、sessionName を持つ preset (`validate.test.ts` / `preset-store.test.ts`)
- **既存の振る舞いを壊していない根拠**
  - `QUERY_OPTION_KEYS` の pin テストが 16 キーに更新されている
  - 4 キーが無ければ options は今と同じ部分集合のまま (`session-core.test.ts`、diff の 3941 行目)
  - 版 1 の preset はキー 6 個だけを受け付け、昇格モードを拒否する (`preset-record.test.ts`、diff の 5872 / 5878 行目)
- **観測点**
  - 名前と上限がログに出ないことはテストで確かめている (diff の 5266 / 5581 行目)
  - 拒否の理由の細分が無い点が M-002

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `isLaunchDirectoryValue` (src/) | 2 (定義 1 / 呼び出し 1) | src/domain/session/agent-session.ts:257, src/agents/session-core.ts:210 |
| (全体) | `dangerouslySetInnerHTML\|innerHTML\|openExternal\|shell:\s*true\|exec\(` (.pr-gate.diff) | 0 | — |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 0
