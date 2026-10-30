# security-reviewer Review: 起動設定の残りの軸 — 追加ディレクトリ・上限・セッション名 (X-6 の 2 本目)

**Run**: 2026-10-30T00:00:00+09:00
**Reviewer**: security-reviewer
**Spec**: specs/024-session-launch-axes/spec.md

Critical は 0 件です。High が 1 件あります。AD-064 の「`additionalDirectories` は読み取りの範囲を広げるだけ」という主張に、SDK の型定義と食い違う箇所があり、実機の確認手順もその点を見ていません。

## 初回読了 viewpoint

- FR/SC: FR-001 / FR-002 / FR-003 (追加ディレクトリ。renderer は folder id だけを持つ、main の再評価と変換、agents の再検査)、FR-005 (上限の 2 段検証)、FR-007 (名前の 2 段検証、名前をログに出さない)、FR-011 (preset の write/read 対称)、FR-012 (再開の `sessionName === null`)、FR-015 (`QUERY_OPTION_KEYS` を 12 から 16 に)。SC-001 / SC-003 / SC-004 / SC-009 (quickstart V-1 / V-6)
- touched files に該当する charter / Confirmation: AD-064 Decision 1 / 2 と Confirmation (pin が 16、起動ゲートの invalid-config、V-1)、AD-041 (g) (escalation-neutral のキーに限る。AD-064 が読み替えている)、AD-040 (settings の射影は変えない)、Constitution Principle III / V / VIII、session charter In scope (起動と軸の解決)
- A. 認可 / 認証 / secret 管理: Critical:0 High:1 Medium:0 Low:0
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:1 Low:1
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当範囲 (AD-041 (g) の読み替えの妥当性のうち、セキュリティの前提だけを A で扱った)
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当範囲
- G. optional reviewer 範囲: 該当なし: security-reviewer の担当外
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

`SessionLaunchConfig` に 4 キーを足します (`additionalDirectoryIds` / `maxTurns` / `maxBudgetUsd` / `sessionName`)。値は SDK の `query()` の options (`additionalDirectories` / `maxTurns` / `maxBudgetUsd` / `title`) で渡し、`presets.json` は版 2 にします。

セキュリティ上の要点は 2 つです。
- **読み取り範囲の拡大**: `additionalDirectories` で、承認なしに読める範囲が広がる。AD-064 Decision 2 は「登録フォルダを main が変換した値に限る」という条件で AD-041 (g) を読み替えている
- **新しい argv**: `--add-dir` / `--max-turns` / `--max-budget-usd` が SDK 経由で argv に載る

既存コードで次を確かめました。
- argv は配列で組まれ、シェル補間されない (`src/agents/session-core.ts:546-565`)
- Win32 は `.exe` の絶対パスでなければ起動しない (`src/main/infra/runtime/win32-launch.ts:157`)
- 再開も同じ `prepareLaunch` を通る (`src/main/app/session-launch-service.ts:502`)
- 拒否のログは理由のキーだけ (`src/main/app/launch-preparation.ts:87-101`)
- `makeHostPath` は UNC を受け付けない (`src/domain/runtime/path-types.ts:85-86`)。SMB 経由で NTLM 資格情報が漏れる経路は塞がれている

renderer がパスを持たない設計 (U-2) なので、SEC-4 のパス改ざん面は main 側の id 解決で閉じています。

## Findings

### [High] AD-064 Decision 2 / research R-02 は「tool の集合・MCP は変わらない」としているが、SDK の型定義は追加ディレクトリで CLAUDE.md・skills・plugins の読み込みと hooks の発火が起きうると書いている。設計も quickstart もこの点を確かめていない (H-001) (scope: feature)

- **観察**:
  - `specs/024-session-launch-axes/research.md:28` は「tool の集合・env・MCP サーバーも変わらない」と書き、この評価を前提に AD-064 Decision 2 (`docs/decisions/0064-launch-config-additional-directories-limits-and-title.md:37`) が「読み取りの範囲」だけを escalation として扱っている。
  - 一方、`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:4509` は作業ディレクトリのルート (`--add-dir` / SDK の `additionalDirectories` で渡したものを含む) を足す処理を「optionally reload CLAUDE.md, skills, and plugins」とし、"registration pipeline" と `DirectoryAdded` hooks (`sdk.d.ts:580-589`) に触れている。
  - Closta は `settingSources` を指定していない。`src/` を Grep して 0 件で、既定は CLI と同じ読み込み (`sdk.d.ts:3055`)。
  - したがって、追加ディレクトリの `.claude/` 配下 (skills の `allowed-tools`、plugins が持つ MCP サーバーや hooks) が tool の集合や承認の経路に効くかどうかは、文書でも quickstart でも確かめられていない。
  - quickstart V-1 (`specs/024-session-launch-axes/quickstart.md:13-21`) が見るのは、読み取りの承認の有無と書き込みの承認だけ。
- **同種事象探索**: `settingSources|CLAUDE_CODE_ADDITIONAL` (src/) で 0 件。`DirectoryAdded|reload CLAUDE` (sdk.d.ts) で 2 箇所 (`sdk.d.ts:580`, `:4509`)。
- **リスク/影響**:
  - 追加ディレクトリの設定が読み込まれる場合、そのフォルダの skill や plugin 由来の hook / MCP が、利用者の意識に無いまま有効になる。作業フォルダとして選んだのではなく「読むだけ」のつもりで足したフォルダが対象になる。
  - これは AD-041 (g) の「権限面・tool 集合・env を変えない」の外にあたり、AD-064 の読み替えの根拠 (読み取りだけが広がる) が成り立たない。
  - 「作業フォルダに選べば同じ設定が効く」という反論は成り立つ。ただし、その場合は Decision 2 の根拠を「読み取り」ではなく「登録フォルダの設定一式を信頼する」に書き直す必要がある。
- **推奨アクション**:
  1. research R-02 に、`--add-dir` で CLAUDE.md / `.claude/settings.json` (hooks) / `.claude/skills` / plugins / `.mcp.json` のどれが読み込まれるかを、SDK 0.3.270 の同梱 CLI の挙動か公式文書で引いて書く。
  2. quickstart V-1 に確認を 1 項目足す。`lib/.claude/skills/<x>/SKILL.md` (`allowed-tools` 付き) と `lib/.claude/settings.json` の hook を置いて起動し、読み込まれるか・承認を迂回するかを記録する。迂回が起きたら RK-02 と同じく利用者に返す。
  3. 読み込まれる場合は、AD-064 Decision 2 の根拠を「登録フォルダの設定一式を作業フォルダと同じく信頼する」に改める (accepted 前であれば本文、そうでなければ後続の ADR)。
- **根拠**: Constitution Principle III、AD-041 (g)、AD-064 Decision 2、CWE-269
- **scope 根拠**: 本 spec の research / ADR / quickstart の記述で直せる

### [Medium] agents の `windows` のパス述語は `makeHostPath` の成功と正規化だけを見ており、`posix` 側にある `.` / `..` の成分の拒否が無い (M-001) (scope: feature)

- **観察**:
  - data-model §5.2 (`specs/024-session-launch-axes/data-model.md:199-202`) の `windows` 行は「`makeHostPath(value)` が成功し、正規化した値が `value` と同じ」だけ。
  - `makeHostPath` (`src/domain/runtime/path-types.ts:80-94`) はドライブレターの大文字化と末尾の区切りの除去しかせず、`..` の成分と、2 文字目より後の `:` (NTFS の代替データストリーム) を拒否しない。
  - 結果として `C:\work\..\..\Windows` や `C:\work\lib:ads` が agents の再検査を通る。
- **同種事象探索**: `isLaunchDirectoryValue` は未実装のため 0 件。data-model §5.2 の 1 箇所が対象。
- **リスク/影響**: 値の出所は main が登録フォルダを変換したもので、いま実害の経路は無い。ただし FR-003 / AD-064 Decision 2 が言う「agents の再検査」は、WSL と Win32 で強さが揃っていない (多層防御の非対称)。
- **推奨アクション**: §5.2 の `windows` 行に「`\` で分けた成分に `.` / `..` が無い」「ドライブの後に `:` が無い」を足す。BE-003 のテストに `C:\a\..\b` と `C:\a\b:s` の負例を足す。
- **根拠**: CWE-22、AD-064 Decision 2
- **scope 根拠**: data-model §5.2 と BE-003 の範囲

### [Medium] main が追加ディレクトリを理由に起動を拒否したとき、ログが既存の `invalid-config` と区別できない (M-002) (scope: feature)

- **観察**:
  - data-model §4.1 / §4.2 (`data-model.md:141-159`) は、`directoryResets` での拒否も変換の失敗 (未登録・到達できない・名前空間の不一致) も `invalid-config` にまとめる。
  - `logRejection` は理由のキーを 1 つ受けるだけ (`src/main/app/launch-preparation.ts:88`, `:99-101`)。
- **同種事象探索**: 該当なし (Medium)。
- **リスク/影響**: 改ざんされた要求の検出 (US-1 AC6) と、ダイアログを閉じた後の登録解除という正当な競合が、ログで見分けられない。値 (パス) をログに出さない方針 (Principle V / CWE-532) は正しいが、理由の細分まで捨てる必要は無い。
- **推奨アクション**: renderer への応答は `invalid-config` のまま、`logRejection` にだけ値を含まない細分キー (例 `invalid-config:additional-directory`) を渡す。BE-011 のテストでそのキーが記録され、パスの目印が 0 件であることを確かめる。
- **根拠**: 観測性 (H)、CWE-778
- **scope 根拠**: BE-011 の範囲

### [Low] `posix` 述語は空の成分 (`//`) と末尾の `/` を規定しておらず、`makeRuntimePath` の正規形と食い違いうる (L-001) (scope: feature)

- **観察**: data-model §5.2 の `posix` 行は「`/` で始まる・`\` なし・`.` / `..` なし・制御文字なし・4096 文字以下」。research R-07 (`research.md:96`) は「`makeRuntimePath` の規則を写す」としているが、`makeRuntimePath` は末尾の区切りを除去する (`path-types.ts:96-104` の docstring)。そのため `/a//b` や `/a/` の扱いが述語の文面から決まらない。
- **同種事象探索**: 該当なし (Low)。
- **リスク/影響**: 実害は無い (`--add-dir` は argv 配列の要素で、`/` 始まりならフラグとして解釈されない)。再検査の述語が正規形を前提にしない点だけが気になる。
- **推奨アクション**: §5.2 に「空の成分と末尾の `/` (ルート以外) を拒否する」を足すか、`makeRuntimePath` の正規化の後の値が一致することを条件にする。
- **根拠**: AD-064 Decision 2
- **scope 根拠**: data-model §5.2

### H の補足 (自分の担当範囲のテストと回帰)

- **検出できるテストがあるか**:
  - H-001 を検出するテストは tasks に無い。単体では検出できず、実機 (quickstart V-1) でしか確かめられないため、推奨アクションの 2 で V-1 に足す。
  - M-001 は BE-003 の負例に `..` が無い。
- **回帰の根拠**:
  - BE-004 / BE-006 / BE-011 / BE-030 に「エラーメッセージやログに値の目印が 0 件」を確かめる観点があり、SH-011 の Grep もある。
  - 再開が同じ `prepareLaunch` を通ることは既存コードで確かめた (`session-launch-service.ts:502`)。
  - `composeClaudeSpawn` の argv 配列とシェル不使用は変わらない (data-model §0)。
  - 回帰の根拠は揃っている。観測性の不足は M-002。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| H-001 | `settingSources\|CLAUDE_CODE_ADDITIONAL` (src/) | 0 | — |
| H-001 | `DirectoryAdded\|reload CLAUDE` (sdk.d.ts) | 2 | node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:580, :4509 |
| M-001 | data-model §5.2 `windows` 行 | 1 | specs/024-session-launch-axes/data-model.md:202 |

## Verdict

- Critical: 0
- High: 1
- Medium: 2
- Low: 1
