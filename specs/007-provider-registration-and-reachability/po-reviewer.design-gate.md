# po-reviewer Review: Provider 登録と到達可能性判定 (X-3)

**Run**: 2026-09-29 · **Reviewer**: po-reviewer · **Round**: 2

## 初回読了 viewpoint

- FR/SC: FR-001..014 / SC-001..010 の計測可能性と AC への 1:1 落とし込み。US-1〜US-4 の Why / Independent Test / Acceptance。
- touched charter / Confirmation: provider charter Mission / Journey 1-3 / KPI 4 件 / 業務ルール。AD-040 Confirmation (SC-006 2 キー assert)。AD-039 §2/§3。
- A. secret 管理: 該当なし: security-reviewer owner
- B. 入力検証: 該当なし: security-reviewer owner
- C. Charter drift: 該当なし: architecture-reviewer owner
- D. Constitution/ADR drift: 該当なし: architecture-reviewer owner
- E. User Story/SC/AC/UX: Critical:0 High:0 Medium:2 Low:2
- F. 命名/lint: 該当なし: convention-reviewer owner
- G. optional: 該当なし
- H. テスト/coverage/observability: Low:1

## スコープ要約

Round 1 の po 指摘 (H-001/002/003, M-001〜005, L-001/002) と analyze 由来 M-12 を更新後 bundle で検証。**Round 1 の po 指摘は全件 resolved / unresolved 0**。新規に M-101 (awsCredentialExport 化ブランチが FR-013/US-3/SC-008 を条件付きに変える spec 内テンション)、M-102 (SC-009 fake 計測が実スキャン網羅を測れない)、Low 3。**Critical=0**。gate-blocker 無し。

## Findings

### [Medium] FR-013/US-3/SC-008 は「アプリが期限監視する」を無条件 must とするが R-02 (awsCredentialExport 化) の未決ブランチが無効化しうる (M-101) (scope: feature)

- **観察**: FR-013 は無条件 must で期限監視を規定し US-3/SC-008/SC-005 が同前提。一方 Assumptions と research R-02 は「awsCredentialExport 化して期限監視を Claude Code に寄せる選択肢の採否は plan/実装で判断」と残し、tasks BE-020 は task レベルで条件付きを認識。
- **リスク/影響**: awsCredentialExport 化を採ると aws-assume-role の期限監視責務が消え FR-013 must / US-3 主体 / SC-008 bar が消滅。SC-008 の計測可能性が未決分岐に条件付き。
- **推奨アクション**: FR-013/US-3/SC-008 を「直接 AssumeRole ブランチの場合」に明示スコープするか、「awsCredentialExport 化を採る場合は US-3/SC-008 は N/A」の 1 行を FR-013/Assumptions に足す。
- **根拠**: PO-2 / PO-4。charter Journey 3 / AD-039 D4・Open Question。
- **scope 根拠**: feature (spec.md FR-013/US-3/SC-008)。

### [Medium] SC-009 の自動計測経路 (fake 検出レイヤ Vitest) は「実スキャンの取りこぼし 0」を測れない (M-102) (scope: feature)

- **観察**: fake で検出レイヤを差し替えると「期待集合」も fake が定義するため、Vitest は normalize/重複/継続を検証するのみで、実ホストの実スキャンが取りこぼさないか (KPI 本旨) は測れない。実スキャン網羅は quickstart SH-022 (手動) のみ。
- **リスク/影響**: SC-009 文面「Vitest で取りこぼし 0」が実測定対象を上回って主張。
- **推奨アクション**: SC-009 の計測経路を (a) normalize/破損スキップ = Vitest、(b) 実スキャン網羅 = quickstart SH-022 (手動) の 2 段に分けて正直化。
- **根拠**: PO-2。charter KPI 計測経路 (手動検証)。
- **scope 根拠**: feature (spec.md SC-009)。

### [Low] Assumptions の「推奨方式を登録 UI で提示することで委譲率向上に寄与」を裏づける FR/AC/task が無い (L-101) (scope: feature)

- **観察**: FE-001 は候補一覧 + 登録フォームまでで、推奨方式 (api-key-helper / aws-credential-export) の優先提示の観測可能な振る舞いが未定義。
- **推奨アクション**: (a) 主張を落として運用計測 KPI とだけ述べる、または (b) FE-001 に「推奨方式を優先提示」の観測可能条件を 1 行足す。
- **scope 根拠**: feature (spec.md Assumptions / tasks.md FE-001)。

### [Low] 検出の I/O 読み取り失敗 (権限不足・I/O エラー) が negative scenario に無い — 破損 parse 失敗のみ扱う (L-102) (scope: feature)

- **観察**: Edge Cases は破損/解析不能 (parse 失敗) をスキップ継続すると規定するが、config dir / `~/.aws/config` 自体が読めない (permission denied / I/O) 経路は明示なし。
- **推奨アクション**: Edge Cases の破損項目に「読み取り不能 (権限不足・I/O エラー) も同様にスキップし他候補を継続」を含める。
- **scope 根拠**: feature (spec.md Edge Cases)。

## H. テスト / coverage / observability / regression

- **[Low] AC-5/AC-6 が SH-020 の負例列挙にも専用 SC にも現れず計測経路 binding が弱い (L-103)**: Round 1 M-002/M-003 は US-1 AC-5/AC-6 追加で testable 化されたが、SH-020 の enumerated 負例に重複導線 0 / safeStorage 不可拒否が明示されていない。gate-blocker ではない (normalizeDetectedCandidate テスト + contracts C-3 reason key + BE-003 が担保) が、SH-020 に「(xiv) 既登録重複で二重登録導線 0」「(xv) safeStorage 不可で理由付き拒否」を足すと計測経路が閉じる。
- **observability (良好)**: FR-007 + contracts C-2/C-3 で理由キー・Provider id・sessionId のメタのみの構造化エラー (safestorage-unavailable / extraenv-secret-detected / unreachable / assume-role-failed / temp-cred-expired)。原因特定点が揃う。
- **regression (概ね良好・1 点弱)**: C-001 の settings 昇格再導入は check.mjs 項目 16 更新 + SH-001b の 3 キー目 fixture でガード (AD-040)。検出沈黙失敗は SC-009 破損入力負例でガード。ただし M-102 のとおり実スキャン位置欠落回帰は自動で捕まらず quickstart 手動のみ。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-101 | `期限監視\|awsCredentialExport 化` | 期限監視=13 / 化 branch=3 | spec.md:277,345,375-377 · research.md:16-28 · tasks.md:104 |
| M-102 | `網羅\|取りこぼ` | 1 SC + 1 task (fake) | spec.md:349-352 · tasks.md(SH-020 xi) · charter.md:96 |
| L-101 | `推奨方式\|api-key-helper` | 0 件 (FE-001 に提示挙動なし) | spec.md Assumptions · tasks.md FE-001 |

(Critical 0 のため cascade 必須対象なし。裏取り証跡。)

## Verdict

- Critical: 0 · High: 0 · Medium: 2 (M-101, M-102) · Low: 3 (L-101, L-102, L-103)
- Round inheritance: **resolved from R1: 10** (H-001/H-002/H-003 + M-001〜M-005 + L-001/L-002)。**unresolved: 0**。**new: 5**。

E owner 観点で design-gate をブロックする Critical/High は無い。M-101/M-102 は implementing 前に spec で 1〜2 行 reconcile を推奨するが gate-blocker ではない。
