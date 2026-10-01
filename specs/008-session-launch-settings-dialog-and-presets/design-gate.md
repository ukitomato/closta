# Design Gate: 起動設定ダイアログとプリセット (X-4) — round 3

**Run**: 2026-09-30
**Spec**: specs/008-session-launch-settings-dialog-and-presets/spec.md
**Domain**: session
**Charter**: docs/domains/session/charter.md
**Tracks**: analyze, po-reviewer, architecture-reviewer, security-reviewer, platform-boundary-reviewer (parallel clean-context subagents)
**Previous**: [gate-r2/design-gate.md](./gate-r2/design-gate.md) / [gate-r1/design-gate.md](./gate-r1/design-gate.md)

## Verdict

| Track                      | Critical | High | Medium | Low |
| -------------------------- | -------- | ---- | ------ | --- |
| analyze                    | 0        | 0    | 7      | 9   |
| po-reviewer                | 0        | 0    | 1      | 3   |
| architecture-reviewer      | 0        | 1    | 3      | 4   |
| security-reviewer          | 0        | 1    | 1      | 2   |
| platform-boundary-reviewer | 0        | 0    | 3      | 1   |
| **Total (dedup)**          | **0**    | 2    | 11     | 18  |

|                      | Critical | High |
| -------------------- | -------- | ---- |
| Resolved from prev   | 1        | 3    |
| Unresolved from prev | 0        | 0    |
| New in this run      | 0        | 2    |

**Status**: PASS
**Next**: status tasking → implementing。High 2 件は実装前に解消する (SH-001 の AD-041 起票時に取り込む)

## Critical (Total: 0)

なし。

## High (Total: 2)

### H-301 — 転送禁止キーに Claude Code の実行系 env (`CLAUDE_CODE_SHELL_PREFIX` など) と導出が制御するキー (`CLAUDE_CONFIG_DIR` / `CLAUDE_CODE_USE_BEDROCK`) が無い [origin: security N-101, analyze B12]

- **Where**: spec.md FR-013、plan.md forward-env.ts、tasks.md SH-005 / BE-009 / BE-032 / derive-env.ts:32,46、detector.ts:27
- **Action**: 次の 3 点を行う。
  - 転送禁止キーに以下を加え、許可は実名で持つ。
    - `CLAUDE_CODE_*` / `ANTHROPIC_*` の prefix を deny する。例外として、方式固有キーは導出経路からのみ注入し、`ANTHROPIC_BASE_URL` は明示的に許可する。
    - `CLAUDE_CONFIG_DIR` を deny する。
  - `DERIVATION_CONTROLLED_KEYS` の締め出しは維持する。
  - 負例テストを追加する。

### H-302 — env-passthrough の転送は X-3 FR-009 / 007 contracts C-5 を覆すのに、AD-041 の読み替え対象に入っていない。FR-016 と自己矛盾する [origin: architecture H-201, analyze B14]

- **Where**: spec.md FR-013 / FR-016 / Assumptions、007 spec.md:260-265、007 contracts/provider-registration.md:55-57、glossary DerivedLaunchEnv、derive-env.ts:86、AD-039 §3
- **Action**: 次の 2 点を行う。
  - AD-041 (e) で X-3 FR-009 (a)(b) を読み替え、追随対象を列挙する。
  - FR-016 に「例外」を明記する。
  - あわせて、varNames に実名の allowlist を掛けるかを判断する (security N-102)。

## Medium (Total: 11)

| ID | 概要 | origin |
|---|---|---|
| M-301 | 「起動の確立 = 最初の応答」を X-1 の起動の流れ (プロンプト送信で起動) に合わせて定義する。ダイアログの閉じ方と、応答が無いときの扱いも決める | po M-201 |
| M-302 | `-u root` の違反 fixture に対応する検出器が無い。fixture を削って pin テストに一本化するか、UNDETECTED_NOTES に登録する | PB M-102 |
| M-303 | SH-000 が不成立のときの代替 (項目 6 への登録) は、現行の項目 6 の検査と噛み合わない。代替を採るなら項目 6 の改修も分岐に含める | PB M-201, arch L-202 |
| M-304 | 転送禁止キーに `TMPDIR` を加える。passthrough / extraEnv の値が Windows パスの形なら拒否する | PB M-203 |
| M-305 | env-passthrough の varNames に、実名の allowlist と登録時の検証を掛ける | sec N-102, analyze B9 |
| M-306 | 転送禁止キーの照合を case-insensitive にする (`SYSTEMROOT` / `WINDIR`) | analyze B10, PB L-201, sec N-103 |
| M-307 | denylist の SSoT: curated base の集合は infra から注入するか pin で固定する。2 つの denylist の役割分担を AD-041 (e) に書く | analyze B11, arch M-203 |
| M-308 | agents decoder の WSLENV 検査が plan と食い違っている (WSL-free との関係) | analyze B13 |
| M-309 | read 側の検証を強めると既存の providers.json が消える。互換方針を明記する | analyze B15, sec N-104 |
| M-310 | 005 contracts C-5 / data-model §7 §8 と `agent-session.ts:86` に pointer を置く。書き換える X-1 テストを実名で挙げる | arch M-201, analyze B20 |
| M-311 | glossary の DerivedLaunchEnv / RuntimeLaunchSpec を追随させ、forwardKeys / 転送禁止キーを登録する | arch M-202 |

## Low (Total: 18)

- po L-201 (理由キー対応表の 2 行) / L-202 (プリセット上限・無効 config の保存) / L-203 (再評価ボタンと上限のテスト)
- sec N-104 (禁止集合の pin テスト)
- analyze B16 (classify の reason) / B17 (UNC の扱い) / B18 (資格情報 denylist の skip と reject の差) / B19 (SC-010 に checkProviderDraft) / B21 (Constitution Check II/X/XII) / B22 (plan.md の文の連結) / A17 / A18
- arch L-201 (preset-service と WSL_FREE_DIRECTORIES) / L-202 (項目 6 の無条件記述。M-303 に統合) / L-203 (SH-015 の版と根拠) / L-204 (varNames と `'--'` fixture のテスト)

## Post-PASS 反映 (2026-09-30, USER 決定「実名 allowlist で実装」)

gate の再実行は行わず、次の修正を spec / plan / tasks に反映した。

### High

- **H-301**: 転送禁止キーを拡張した。
  - 追加したキー: `CLAUDE_CODE_*` / `ANTHROPIC_*` の prefix (`ANTHROPIC_BASE_URL` のみ例外)、`CLAUDE_CONFIG_DIR`、`TMPDIR`。
  - 照合は case-insensitive にした。
  - transport 固有のキーは infra から注入する。
  - `DERIVATION_CONTROLLED_KEYS` は維持する。
- **H-302**: env-passthrough の varNames を実名 allowlist (`PASSTHROUGH_VAR_ALLOWLIST`) に限った。
  - AD-041 (e) で X-3 FR-009 / 007 C-5 / AD-039 §3 を読み替える。
  - FR-016 に、この読み替えを例外として明記した。

### Medium

| ID | 反映内容 |
|---|---|
| M-301 | 確立 = `system/init`。確立前に失敗・中断したら、ダイアログを開き直す |
| M-302 | fixture を削除し、pin テストに一本化した |
| M-303 | 項目 6 の改修を AD-041 (f) の分岐に含めた |
| M-304 | `TMPDIR` を追加し、Windows パス値を拒否する |
| M-305 | varNames を allowlist にし、登録時に検証する |
| M-306 | case-insensitive にした |
| M-307 | 禁止集合は注入とし、pin で固定した |
| M-308 | agents decoder では WSLENV を解釈しない |
| M-309 | 既存レコードは退避し、`invalid-record` にする |
| M-310 | 005 C-4 / C-5 / §7 / §8、007 C-5、`agent-session.ts:86` に pointer を置き、X-1 テストを実名で挙げた |
| M-311 | glossary の DerivedLaunchEnv / RuntimeLaunchSpec を更新し、新しい見出しを追加した |

### Low

po L-201 / L-202 / L-203、sec N-104、analyze B17 / B18 / B19 / B21、arch L-201 / L-202 / L-203 / L-204 を反映した。

残した Low は B16 (classify の reason。BE-031 の実装で決める)、B22、A17、A18。

## Track raw outputs

- [analyze.md](./analyze.md)
- [po-reviewer.design-gate.md](./po-reviewer.design-gate.md)
- [architecture-reviewer.design-gate.md](./architecture-reviewer.design-gate.md)
- [security-reviewer.design-gate.md](./security-reviewer.design-gate.md)
- [platform-boundary-reviewer.design-gate.md](./platform-boundary-reviewer.design-gate.md)
