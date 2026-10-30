# Design Gate: 起動設定の残りの軸 — 追加ディレクトリ・上限・セッション名 (X-6 の 2 本目)

**Run**: 2026-10-30T00:00:00+09:00
**Spec**: specs/024-session-launch-axes/spec.md
**Domain**: session
**Charter**: docs/domains/session/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)

## Verdict

| Track                      | Critical | High | Medium | Low |
| -------------------------- | -------- | ---- | ------ | --- |
| analyze                    | 0        | 1    | 3      | 8   |
| po-reviewer                | 0        | 1    | 9      | 2   |
| architecture-reviewer      | 0        | 2    | 3      | 4   |
| security-reviewer          | 0        | 1    | 2      | 1   |
| platform-boundary-reviewer | 0        | 1    | 2      | 3   |
| **Total (dedup)**          | **0**    | 5    | 14     | 14  |

**Status**: PASS
**Next**: status: tasking → implementing 昇格、/cl-implement 起動可能。ただし High 5 件は AD-050 に従い本 round で直す (designer の修正のあと再 gate は不要。High を確かめるためだけの round は回さない)

## Critical (Total: 0)

なし。

## High (Total: 5, dedup)

### H-001 — FR-003 の「残った folder id を変換」が AD-064 Decision 2 の「1 つでも外れれば拒否」と食い違う [origin: analyze F1, architecture H-002] [new]

- **Where**: spec.md:188 (FR-003); 対照 data-model.md:142, research R-06, docs/decisions/0064 Decision 2, contracts/launch-config-v2.md:27, tasks.md:48 (BE-011), spec US-1 AC6
- **Issue**: FR-003 の文面は「main も黙って外して起動を続ける」と読める。他の文書はすべて `directoryResets.length > 0` → `invalid-config` で拒否
- **Action**: FR-003 を「外れる項目が 1 つでもあれば `invalid-config` で拒否 (黙って外さない)。全件が通れば変換して agents に渡す」に直す。「作業フォルダ (cwd) と同じ経路」の文言も M-002 (PathMapping) に合わせて直す

### H-002 — glossary / charter の更新一覧が、024 後に事実と食い違う 5 か所を漏らしている [origin: architecture H-001] [new]

- **Where**: data-model §10, tasks SH-001 / SH-010; docs/glossary.md:546 (Launch axis), :949 (Resume), :960 (Resume dialog), :586 (LaunchInput), docs/domains/session/charter.md:142 (プリセット)
- **Issue**: 軸の数 (6→9)、再開で選び直せる軸 (3→6)、LaunchInput の options、プリセットの型 (`PresetLaunchConfig`) が glossary / charter に反映されない (Principle XIV)
- **Action**: data-model §10 と SH-001 / SH-010 に上記 5 か所の更新を足す

### H-003 — `lastConfig` からダイアログを戻すとき、上限と名前の入力欄の初期化が定義されていない [origin: po H-001] [new]

- **Where**: plan.md:235, :238; data-model.md:88, :261 (§7.1), §9; tasks.md:78, :89, :91, :92 (FE-020 / FE-030); src/renderer/src/features/session/LaunchDialog.tsx:204-213
- **Issue**: 拒否・やり直す・開き直しの経路で `maxTurnsInput` / `maxBudgetInput` / `sessionNameInput` の初期値が決まっておらず、上限が黙って「上限なし」に戻りうる
- **Action**: data-model §9 に入力文字列の初期化規則を足し、FE-020 / FE-030 に拒否後・やり直し後の初期値テスト、US-2 に AC を足す

### H-004 — `additionalDirectories` で追加ディレクトリの CLAUDE.md / skills / plugins / hooks が読み込まれうる点を、AD-064 Decision 2 と quickstart が確かめていない [origin: security H-001] [new]

- **Where**: research.md:28 (R-02); docs/decisions/0064-…md:37; quickstart.md:13-21 (V-1); node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:580-589, :4509
- **Issue**: 「読み取りの範囲だけが広がる」という読み替えの根拠が、SDK の型定義の記述 (設定・skills・plugins の再読み込み、`DirectoryAdded` hooks) と食い違いうる
- **Action**: R-02 に `--add-dir` で読み込まれる設定を書き、V-1 に skills / hooks を置いた確認を足す。読み込まれる場合は Decision 2 の根拠を「登録フォルダの設定一式を信頼する」に改める

### H-005 — `buildQueryOptions` の追加ディレクトリの再検査が「どちらかの形」か `kind` 別かで文書が食い違い、deps に種類の欄がない [origin: platform-boundary H-001] [new]

- **Where**: research.md:98 (R-07), data-model.md:207, :215 (§5.3 / §5.4), tasks.md:30 (BE-004); src/agents/session-core.ts:154-168
- **Issue**: BE-004 の負例 (WSL 起動に Windows のパス) を 2 段目で検出するには deps にランタイムの種類が要るが、設計にない
- **Action**: `BuildQueryOptionsDeps` に `launchDirectoryKind` を足す (`isWin32LaunchSpec(spec)` から決める)。R-07 の「どちらかの形」を「`kind` に合う形」に直し、§5.4 と BE-004 に書く

## Medium (Total: 14, dedup)

- M-001 — `invalid-config` の拒否ログが追加ディレクトリの原因を区別できない [origin: po M-009, security M-002, architecture L-004] (Where: data-model §4.1/§4.2, BE-011, src/main/app/launch-preparation.ts:88, :99-101)
- M-002 — 「cwd が通れば PathMapping は確定」の前提が WSL では事実でない / PathMapping の入手経路が未指定 [origin: analyze F3, architecture M-001, platform-boundary L-002] (Where: data-model.md:161 §4.2, research R-06, BE-011; composition-root.ts:558-559, resolution.ts:140-151)
- M-003 — agents の POSIX パス述語が `makeRuntimePath` の規則を写し、正規化の扱いも Windows 側と揃わない [origin: analyze F4, platform-boundary M-001, architecture M-002, security L-001] (Where: data-model §5.2, research R-07, BE-003; src/domain/runtime/path-types.ts:60, :106-121)
- M-004 — 依存解決の reset 通知が charter KPI の計測経路 (E2E) に載らない [origin: po M-008, architecture M-003] (Where: tasks.md:54, :67, :80, :93; charter.md:214)
- M-005 — data-model §2.3 と research P-4 / BE-010 で、未選択時に評価を飛ばす規則が食い違う [origin: analyze F2]
- M-006 — main 拒否時の `invalid-config` 文言が追加ディレクトリに触れない [origin: po M-001]
- M-007 — 費用の小数 3 桁・全角数字の不正に対する文言が原因を伝えない [origin: po M-002]
- M-008 — 追加ディレクトリの選択肢をランタイムで絞らず、選んだ直後に外れる [origin: po M-003]
- M-009 — `unregistered` の通知がフォルダ名を出せない [origin: po M-004]
- M-010 — 追加ディレクトリの選択肢 0 件 (empty state) が未定義 [origin: po M-005]
- M-011 — 上限で止まった後の流れの記述が今の分類 (終端の失敗) と食い違う [origin: po M-006]
- M-012 — 追加ディレクトリ内の読み取りが承認なしで通ることをダイアログで知らせない [origin: po M-007]
- M-013 — agents の `windows` パス述語に `..` 成分と ADS の `:` の拒否がない [origin: security M-001]
- M-014 — 書き込みが承認を経ることの確認が手動 V-1 だけ [origin: platform-boundary M-002]

## Low (Total: 14, dedup)

- L-001 — 軸とキーの数え方の用語の揺れ [analyze F5]
- L-002 — glossary の行番号が古い [analyze F6]
- L-003 — research ヘッダの P-1〜P-12 [analyze F7]
- L-004 — `same-as-folder` の通知文言が spec に無く data-model の表があいまい [analyze F8, po L-001]
- L-005 — SC-006 と BE-030 のテストファイル名の食い違い [analyze F9]
- L-006 — spec に「plan で決める」が残る [analyze F10]
- L-007 — `ui-path-concat` を AD-041 (h) に帰属させる引用の精度 [analyze F11]
- L-008 — 上限到達の表示の自動テストが無い [analyze F12]
- L-009 — US-1 の中心価値が実機確認だけで確かめられる [po L-002]
- L-010 — plan の基準コミットが古く AD-065 が Related ADRs に無い [architecture L-001]
- L-011 — AD-064 に I-3 昇格モードの前方注記が無い (out-of-scope) [architecture L-002]
- L-012 — `DirectoryReset` / `PresetLaunchConfig` が glossary の独立した項でない [architecture L-003]
- L-013 — data-model §4.2 の引数型 `RuntimeDTO` は `RuntimeDescriptor` の誤り [platform-boundary L-001]
- L-014 — `resolveFolderRuntime` IPC の「成功したが null」の扱いが未定義 [platform-boundary L-003]

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
