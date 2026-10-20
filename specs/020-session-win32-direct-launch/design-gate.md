# Design Gate: Win32Runtime の直接起動 (X-8)

**Run**: 2026-10-20T08:03:37+09:00 (round 2)
**Spec**: specs/020-session-win32-direct-launch/spec.md
**Domain**: session
**Charter**: docs/domains/session/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)
**Previous gate**: [design-gate.md.20261020T080329](./design-gate.md.20261020T080329)

## Verdict

| Track                      | Critical | High  | Medium | Low    |
| -------------------------- | -------- | ----- | ------ | ------ |
| analyze                    | 0        | 1     | 7      | 9      |
| po-reviewer                | 0        | 0     | 4      | 3      |
| architecture-reviewer      | 0        | 2     | 2      | 4      |
| security-reviewer          | 0        | 0     | 2      | 1      |
| platform-boundary-reviewer | 0        | 0     | 3      | 3      |
| **Total (dedup)**          | **0**    | **2** | **14** | **15** |

|                      | Critical | High |
| -------------------- | -------- | ---- |
| Resolved from prev   | 1        | 6    |
| Unresolved from prev | 0        | 0    |
| New in this run      | 0        | 2    |

viewpoint coverage: 4 reviewer tracks all A-H present. cascade_enforce demotions: 0 (no Critical declared).

**Status**: PASS
**Next**: status: tasking → implementing 昇格、/cl-implement 起動可能。ただし High 2 件は AD-050 によりこの round で直す (designer に渡してから /cl-implement に進む)。High を確かめるためだけの round は回さない。

## Critical (Total: 0)

なし。前 round の C-001 (`stop.argsBeforePid` の decoder 規則) は analyze / security / platform-boundary の 3 トラックが resolved と確認した。

## High (Total: 2)

### H-001 — Win32 で Provider の `NODE_EXTRA_CA_CERTS` (WSL の POSIX パス) がホストの Windows パスを上書きし、到達可能と出るのに社内 CA が効かない [origin: architecture] [new]

- **Where**: data-model.md:230, :234-238 (§6.1 `WIN32_PROVIDER_OVERRIDABLE_KEYS`), :323 (§8), research.md:133-134, :140-141, AD-058:45 (Decision 5), tasks.md:15 (SH-001), :39 (BE-011), :82-83 (BE-040 / BE-041), :85 (FE-040), plan.md:20, :58, :238; 根拠 src/domain/provider/forward-env.ts:185-187, :213, derive-env.ts:71
- **Issue**: 登録時の検証で extraEnv の値は Windows パスを拒否されるので、保存済みの `NODE_EXTRA_CA_CERTS` は必ず POSIX パス。Win32 の claude.exe はそれを読めず、ホストの正しい値も消える。BE-011 / BE-041 がこの誤りを期待値として固定している。proxy の 3 キーは名前空間に依らないので問題なし
- **Why high**: provider charter KPI「到達可能性判定の正しさ」と FR-009 / US-4 の趣旨に反する (round 1 H-004 の修正が持ち込んだ)
- **Action**: (a 最小案) 上書きしてよいキーを `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` の 3 つにし、`NODE_EXTRA_CA_CERTS` は Win32 の transport キーに戻す (extraEnv に持つ Provider は Win32 で到達不可、理由文言で示す)。(b) Win32 では Provider の値を重ねずホストの値を使う — 「黙って捨てない」(§6.3) に反するので採るなら人の判断が要る。cascade 先を同じ変更で直す

### H-002 — FR-014 / AD-058 Decision 1 は「agents は Windows 固有の値をリテラルで持たない」とするのに、§5.2 の decoder が agents 内に `taskkill.exe` / `.exe` のリテラルを持つ [origin: architecture, analyze(F7)] [new]

- **Where**: spec.md:184 (FR-014), plan.md:80, AD-058:31 (Decision 1), data-model.md:197, :204 (§5.2), §11 の pin の行, contracts/ipc-win32-claude.md:65 (C-4), tasks.md:27 (BE-003), :36-37 (BE-010), :39 (BE-011)
- **Issue**: round 1 の修正で decoder が `stop.command` の basename を `taskkill.exe`、`pathToClaudeCodeExecutable` を `.exe` 終端と比べるようになったが、これは FR-014 (MUST) が禁じる agents 内の Windows 固有リテラル。ADR Decision 1 の中でも自己矛盾。BE-010 の禁止チェックはこれを捕まえない。正本が infra の組み立てと agents の比較文字列に割れる
- **Why high**: 書かれたとおりに作ると FR-014 の文面に反するコードになり、pr-gate で指摘される
- **Action**: `WIN32_TREE_STOP_ARGS` の隣 (`src/domain/session/agent-session.ts`) に `WIN32_TREE_STOP_COMMAND_NAME = 'taskkill.exe'` を置き、§5.1 の組み立てと §5.2 の検査の両方で使う。`.exe` の検査は domain の `classifyClaudeExecutable(raw) === 'exe'` を呼ぶ (arch L-004 / analyze 前回 L-007 も同時に閉じる)。AD-058 Decision 1 の末尾を直す。代案: FR-014 を「組み立てのリテラルを持たない。検査は domain の定数を使う」に言い直す

## Resolved from prev (Critical / High)

| prev ID | 内容 | 確認したトラック |
| ------- | ---- | ---------------- |
| C-001 | `stop.argsBeforePid` の decoder 規則 | analyze, security, platform-boundary |
| H-001 | FR-011 と AD-058 Decision 3 の保証範囲 | po, analyze |
| H-002 | 起動ダイアログの理由と直し方 | po, analyze |
| H-003 | SC-004 の計測と時間条件 | po, analyze |
| H-004 | extraEnv と許可リストのキーの衝突 | architecture, platform-boundary, analyze |
| H-005 | Principle III の自動検査 | analyze |
| H-006 | FR-014 と `windowsHide` | analyze |

## Medium (Total: 14)

AD-050 により gate では直さない。マイルストーン末の棚卸しで扱う。

| ID | 内容 | origin | prev |
| -- | ---- | ------ | ---- |
| M-001 | `runtime-settings.json` が読めないと指定が黙って消え自動探索に戻る (data-model.md:96-102 vs FR-006) | po M-001, analyze F9 | unresolved |
| M-002 | claude.exe が起動直後に終わる場合 (Git Bash 無しなど) の理由と文言が無い (spec.md:198) | po M-002 | unresolved |
| M-003 | プロセス木の停止失敗が stderr 1 行だけで読める場所が不明 (data-model.md:343, US-3 AC4) | po M-003 | unresolved |
| M-004 | 複数 (〜10) セッションを同時に止めるアプリ終了が未検証、dispose の余裕 1 s (plan.md:261 RK-07, data-model §9.3, V-3) | po M-004, analyze F3 | unresolved |
| M-005 | `NoDefaultCurrentDirectoryInExePath` 未設定 (CWE-427) | security M-001 | unresolved |
| M-006 | Windows 固有の実行乗っ取りキー (`PSMODULEPATH` / `MSYS*` / `__COMPAT_LAYER`) を禁止しない (data-model §6.2) | security M-002, analyze S1 | unresolved |
| M-007 | `configDirRuntimePath` を `HostPath \| RuntimePath` に広げ、AD-004 の型の守りと glossary の RuntimePath 定義が崩れる (data-model.md:317) | platform-boundary M-001, architecture M-001 | unresolved |
| M-008 | `distro-mismatch` の条件を緩め BE-012 がそれを固定する (data-model.md:297) | platform-boundary M-002 | unresolved |
| M-009 | M-007 / M-008 の境界を守るテストが無い (BE-012 / BE-040) | platform-boundary M-003 | new |
| M-010 | provider charter と `_overview.md` の帰属の判断根拠に記録が無い (SH-010) | architecture M-002 | unresolved |
| M-011 | §8 / BE-041 は extraEnv 衝突の起動を `invalid-config` とするが、実経路は deriveEnv で `provider-unavailable` になる | analyze F8 | new |
| M-012 | LaunchDialog の `allRuntimesStopped` / `noWslRuntimes` が WSL だけを見る | analyze E1 | unresolved |
| M-013 | FR-013 のモニタ行の「Windows (ホスト)」表示を確かめる task が無い | analyze E2 | unresolved |
| M-014 | `[ASSUMED]` 3 件 (shim の文言・ランタイムの順とラベル・5 s タイムアウト) が未承認 (spec.md:69-71) | analyze B1 | unresolved |

## Low (Total: 15)

| ID | 内容 | origin | prev |
| -- | ---- | ------ | ---- |
| L-001 | V-7 で登録フォルダの下に出ることを確かめない | po L-001 | unresolved |
| L-002 | 日本語と空白を含む作業フォルダの実機確認が無い | po L-002 | unresolved |
| L-003 | 起動ダイアログの `where-to-fix` にランタイム一覧への導線が無い | po L-003 | new |
| L-004 | override が claude.exe 以外の任意の `.exe` を受け付ける | security L-001 | unresolved |
| L-005 | runtime charter の行番号が逆 (plan.md:111, tasks.md:91)、frontmatter 更新が無い | platform-boundary L-001, architecture L-001, analyze L1 | unresolved |
| L-006 | `taskkill` を綴ってよいモジュールの静的規則が無い | platform-boundary L-002 | unresolved (downgraded) |
| L-007 | decoder が `stop.command` のディレクトリを `System32` に固定しない | platform-boundary L-003 | new |
| L-008 | AD-058 Decision 5 に I-1 への申し送りが無い (AD-025「X-1 へ」) | architecture L-002 | unresolved |
| L-009 | FR-008 が許可リストの正本を plan / ADR とするが実際は data-model §6.1 | architecture L-003, analyze L2 | unresolved |
| L-010 | contracts C-1 の `runtimes` の型と `RuntimeListDTO` の食い違い | analyze F4 | unresolved |
| L-011 | data-model.md:86 の fail-closed 既定値に `overridden: false` が無い | analyze F5 | unresolved |
| L-012 | plan の新設ファイル数と構成図の漏れ | analyze U1 | unresolved |
| L-013 | BE-022 の `contracts/runtime-detection.md C-1` に持ち主の spec のパスが無い | analyze U2 | unresolved |
| L-014 | ネットワークドライブの edge case にテストも V-step も無い | analyze E3 | unresolved |
| L-015 | spec.md:43 の ADR の行が古い、§9.4 に「graceful end: 子孫は保証しない」の行が無い | analyze L3 | new |

architecture L-004 (`.exe` の判定を `classifyClaudeExecutable` と別に持つ) は H-002 に統合した。

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
