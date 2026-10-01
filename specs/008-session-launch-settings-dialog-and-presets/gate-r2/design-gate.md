# Design Gate: 起動設定ダイアログとプリセット (X-4) — round 2

**Run**: 2026-09-30
**Spec**: specs/008-session-launch-settings-dialog-and-presets/spec.md
**Domain**: session
**Charter**: docs/domains/session/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)
**Previous**: [gate-r1/design-gate.md](./gate-r1/design-gate.md)

## Verdict

| Track                      | Critical | High | Medium | Low |
| -------------------------- | -------- | ---- | ------ | --- |
| analyze                    | 0        | 2    | 3      | 5   |
| po-reviewer                | 0        | 0    | 2      | 4   |
| architecture-reviewer      | 0        | 1    | 5      | 3   |
| security-reviewer          | 0        | 1    | 2      | 2   |
| platform-boundary-reviewer | 1        | 1    | 4      | 1   |
| **Total (dedup)**          | **1**    | 3    | 12     | 13  |

|                      | Critical | High |
| -------------------- | -------- | ---- |
| Resolved from prev   | 1        | 11   |
| Unresolved from prev | 0        | 0    |
| New in this run      | 1        | 3    |

**Status**: FIX_REQUIRED
**Next**: C-101 / High 3 件を解消してから `/cl-design --spec-dir specs/008-session-launch-settings-dialog-and-presets --from gate`

## Critical (Total: 1)

### C-101 — WSLENV に載せる「導出キーの実名」に curated base の TEMP / TMP が含まれ、Windows パスが WSL 内 claude の tmpdir になる [origin: platform-boundary C-101, security N-001, analyze B1] [new]

- **Where**: plan.md:160-163、tasks.md:72 (BE-009)、spec.md:227 (FR-013)、SC-007 / src/domain/provider/derive-env.ts:38 (`{ ...curatedBase }`)、provider-service.ts:285、launch-spec.ts:24,47
- **Issue**: `DerivedLaunchEnv.env` は、curated base (`SystemRoot`/`windir`/`TEMP`/`TMP`/`WSL_UTF8`)・extraEnv・方式固有キーを合流済みの 1 枚である。これを「キーの実名で WSLENV」にすると、`TEMP`/`TMP` が変換されずに WSL へ届く。実機でも確認済み: WSL 内 Node の `os.tmpdir()` は `C:\Users\...\Temp` になり、cwd 基準で解決された。つまり利用者の作業フォルダに一時ファイルが書かれる。
- **Action**: 3 点を行う。
  1. WSLENV に載せる集合を**型で分離**する。載せるのは「方式が注入した実名キー + 採用した extraEnv / env-passthrough キー」だけ。curated base のキーと `WSL_UTF8` は決して載せない。
  2. 名前規則に違反するキーは起動拒否にする (fail-closed)。
  3. SC-007 に負の assert (WSLENV に base キー 0) を足し、quickstart に `printenv TMP TEMP` が空であることを足す。

## High (Total: 3)

### H-201 — extraEnv が curated base (SystemRoot / windir / PATH / WSL_UTF8) を上書きでき、実行を乗っ取る env (NODE_OPTIONS / LD_PRELOAD / BASH_ENV / ANTHROPIC_BASE_URL など) も初めて WSL に届く [origin: platform-boundary H-101, security N-001] [new]
- **Where**: validate.ts:246-252、derive-env.ts:44-48、launch-spec.ts:65 (`resolveWslCommand(env.SystemRoot ?? env.windir)`)、sdk-agent-session.ts:176-181
- **Action**: 次の 4 点を行う。
  - extraEnv の KEY に denylist を置く。対象は curated base と同名のキー / `PATH` / 実行を乗っ取る env。validate / provider-record / 起動時の 3 箇所で同じ述語を使う。
  - `resolveWslCommand` には合流前の base env を渡す。
  - agents decoder で WSLENV の形を再検証する。
  - `ANTHROPIC_BASE_URL` のように送信先を変える env を許す場合は、その理由を AD-041 の残存リスクに書く。

### H-202 — AD-041 が X-1 SC-006(b)(c) / 005 contracts C-5 / data-model §7 (最終 env に WSLENV・資格情報 0) を読み替えていない [origin: architecture H-101] [new]
- **Where**: specs/005/spec.md:403-406、contracts/session-launch.md:90-93、data-model.md:180-184、plan.md:228,233、tasks.md:17
- **Action**: AD-041 (b) を SC-006(a)(b)(c) の env 部分まで広げる。SH-001 で C-5 と data-model §7 に pointer を置く。改めるべき X-1 のテストは実名で列挙する。

### H-203 — env-passthrough Provider の値を WSL へ届ける経路が無く、選ぶと distro 既定の資格情報で黙って起動する [origin: analyze B2] [new]
- **Where**: derive-env.ts:85-87、composition-root.ts:285、reachability.ts:29
- **Action**: X-4 で扱いを決め、FR に書く。
  - 案 1: 実装する。varNames の値は app の process.env から採り、hijack denylist を掛け、WSLENV に算入する。
  - 案 2: blocker にして繰り越す。

## Medium (Total: 12)

| ID | 概要 | origin |
|---|---|---|
| M-201 | ダイアログ経路での Provider reset の確認 (FE-001 / FE-004 / FE-005)、US-3 AC3 との食い違い、確認を拒否したときの Then | po M-101 |
| M-202 | 「SDK が起動を拒否」の理由キーと、入力を保って戻るタイミング | po M-102 |
| M-203 | R-01 fallback (b)「`--` + メタ文字なしの assert」は JSON があるので成り立たない。fallback (a) は項目 6 の登録が要る。AD-041 (f) の読み替え対象に AD-015 §2 / AD-036 §3 / 005 data-model §8 を加える | sec N-002, analyze B4, arch M-101 |
| M-204 | helperPath の文字種 allowlist と、helper の実行方式 (シェル経由か) の実機確認 | sec N-003 |
| M-205 | helperPath の分類を差し込む箇所を 3 方式共通にする (`helperRuntimePath`) | analyze B3 |
| M-206 | helperPath の分類を reachability と起動で同じ関数にする (判定と実行の一致) | PB M-101 |
| M-207 | preset 名の述語を domain に置き、checkPreset と preset-record で共有する | analyze B5 |
| M-208 | WSLENV の生成は infra/runtime に置く (domain/session は WSL-free。AD-003) | arch M-103, PB M-103 |
| M-209 | `isValidModelId` / `isValidEffortLevels` / `EffortLevel` は domain/provider に置く (依存方向) | arch M-104 |
| M-210 | provider charter L94 の宛先を X-7 へ、Related Specs に 008 を足す、_overview に X-6 / X-7 を足す | arch M-105 |
| M-211 | `--exec` は許可リストに既にある。項目 2 は launch-spec.ts を走査していない。pin テストと、`--` / `-u` の退行検出を足す | arch M-102, PB M-102, analyze B6, sec N-005 |
| M-212 | SC-007 の負例: base キー / extraEnv による上書きの拒否 / distro 内 `printenv TMP` | PB M-104 |

## Low (Total: 13)

- po L-101: US-4 の優先度の理由を直す
- po L-102: 同名判定の正規化 (trim + NFC) とプリセット件数の上限
- po L-103: 停止中ランタイムを原因とする blocker に、次の一手を示す
- po L-104: 拒否理由キーをログに出す
- sec N-004: 子プロセスへの秘密 env の継承 × dontAsk を残存リスクとして記録する
- analyze B7: fork env の計測点
- analyze B8: `checkProviderDraft` を SC-010 の対象に含める
- analyze A17: SH-004 / SH-005 のタグ
- analyze A18: FR-017 の並び順
- arch L-101: charter の KPI 行に O-3 と注記する
- arch L-102: プリセット共有の持ち主
- arch L-005: AD-041 は節見出しで構成する
- PB L-101: 同一 distro の判定を `isSameDistro` に揃える

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
