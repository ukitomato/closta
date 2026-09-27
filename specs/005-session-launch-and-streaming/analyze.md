# Track A — analyze (機械的 consistency)

**Run**: 2026-09-25 · **Gate**: design · **Verdict counts**: Critical 0 / High 0 / Medium 4 / Low 4

対象: spec / plan / tasks / data-model / contracts / research / quickstart。read-only。

## Findings

| ID | Category | Severity | Location | 説明 | 推奨アクション |
|----|----------|----------|----------|------|----------------|
| C1 | Coverage Gap | Medium | tasks.md 制御系 BE / contracts C-1 | control plane 5 メソッドのうち `session.sendPrompt` の main 側検証済み IPC ハンドラ実装タスクが無い。FE-002 / BE-001 はあるが renderer→main→agents の受け口が欠落。SH-020 の計測経路には現れるが実装タスクが無い | `session.sendPrompt` IPC ハンドラのタスクを追加 (送信元 + sessionId 検証、text 正規化、agents へ postMessage) |
| C2 | Coverage Gap | Medium | plan §B-6 / tasks.md Shared | 上流申し送り B-6 (`src/agents/` の新モジュールを discovery / directory map に反映) の対応タスクが tasks.md に無い (SH-004=glossary / SH-005=charter のみ)。convention-reviewer が code-gate で drift として拾う | discovery.md の directory map 更新を Shared タスクとして追加 (または SH-005 に併合) |
| C3 | Coverage / Traceability | Medium | spec FR-004 / FR-019 | FR-004 (agents 単独起動可) と FR-019 (単一セッション 6 状態機械) を明示的に引くタスクが無い。plan Constitution Check VII / AD-030 §Consequences が要求する「単独起動テスト」が独立タスクとして無い | FR-004 の単独起動テストをタスク化 (または SH-020 に明記)。FR-019 を SH-003/FE 系に紐づけ |
| I1 | Inconsistency (naming) | Medium | spec Key Entities `SessionControl` vs contracts C-1 / data-model §5 | 制御要求の識別子が割れている。spec は `send-prompt / grant / deny / interrupt / kill` (launch 含まず)、contracts/data-model は `respondPermission {outcome}` + `launch` 込み | 正本 (contracts C-1 / data-model §5) に spec Key Entities を追随。grant/deny は outcome 値と明記 |
| I2 | Inconsistency | Low | data-model §1 vs AD-023 §3 | data-model §1 は「AD-023 §3 をそのまま採る」と書くが実際は 5 メソッドに拡張 (respondPermission / sendPrompt 追加、start 引数変更) | 「AD-023 §3 を拡張」と訂正し 3 アーティファクトの AgentSession 面を統一 |
| F1 | Coverage / Traceability | Low | plan §B-1 / §B-5 | B-1 (Streamdown 採否) と B-5 (UNC を DTO に出さない) がタスク ID へ明示紐づけされていない | B-1 の結論を FE-001 注記に、B-5 を BE-005 に明示紐づけ |
| D1 | Constitution Check 網羅 | Low | plan Constitution Check 表 | Check 表に Principle I / XII / XV が無い | I / XII / XV の該否を 1 行ずつ追記 (延期なら延期先を明記) |
| P1 | [P] marker | Low | tasks.md BE-012 | BE-012 `[P]` は BE-010 と同じ `sdk-agent-session.ts` を触る可能性があり [P] 前提が崩れうる | BE-012 が別ファイルに閉じるか確認、共有なら [P] を外す |

## 観点別サマリ

- FR/SC/AS/KeyEntity/US 相互カバレッジ: SC は全件 FR/AS に対応し孤立無し。ギャップは C1 / C3。
- identifier 整合: SessionRunState 6 値・FailureReason 7 キー・SessionEvent 6 kind は一致。ドリフトは I1 / I2。
- Constitution Principle 参照: 引用した III/IV/V/VI/VII/VIII/IX/XI/XIII/XIV/XV はすべて実在・内容一致。誤引用なし。
- ADR 引用: AD-018/023/020/034/030/002/011/035 の節番号・決定内容ともに正しい。誤引用なし。
- 上流申し送り: A-1〜A-5 / B-2/B-3/B-4/B-7 割当済み。**B-6 割当欠 (C2)**、B-1/B-5 紐づけ弱 (F1)。
- EARS 完全性: `[NEEDS CLARIFICATION]`/TODO/TBD の残存なし。測定経路の無い SC なし。
- US 見出し数: 4 = spec User Story 4、一致。[P] は P1 のみ要確認。

## Metrics

- FR 20 / SC 10 / Key Entities 6 / tasks 30
- FR coverage: 18/20 明示 (90%)、20/20 機能的 (100%) · SC coverage 10/10
- Ambiguity 0 / Duplication 0
- **Critical 0 / High 0 / Medium 4 / Low 4**

## 判定

Critical 0 / High 0。機械的 consistency の観点で実装を止める指摘は無い。Medium 4 件 (C1 sendPrompt / C2 discovery / C3 FR-004・FR-019 明示 / I1 control 要求名) は実装着手前に tasks.md へ反映を推奨。
